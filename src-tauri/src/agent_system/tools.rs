use ifainew_core::agent;
use serde_json::Value;

/// Unescape escape sequences in a string (e.g., "\\n" -> "\n", "\\t" -> "\t")
/// This is needed because JSON from AI contains escaped characters as literals
fn unescape_string(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars();
    let mut escape = false;

    while let Some(c) = chars.next() {
        if escape {
            match c {
                'n' => result.push('\n'),
                'r' => result.push('\r'),
                't' => result.push('\t'),
                '\\' => result.push('\\'),
                '"' => result.push('"'),
                '\'' => result.push('\''),
                '0' => result.push('\0'),
                _ => {
                    // Unknown escape, keep as-is
                    result.push('\\');
                    result.push(c);
                }
            }
            escape = false;
        } else if c == '\\' {
            escape = true;
        } else {
            result.push(c);
        }
    }

    // Handle trailing backslash
    if escape {
        result.push('\\');
    }

    result
}

pub async fn execute_tool_internal(
    tool_name: &str,
    args: &Value,
    project_root: &str,
) -> Result<String, String> {
    println!("[AgentTools] Executing tool: {} with args: {}", tool_name, args);

    match tool_name {
        "agent_read_file" => {
            let rel_path = args["rel_path"].as_str()
                .or_else(|| args["file_path"].as_str()) // Handle common alias
                .unwrap_or("")
                .to_string();
            agent::agent_read_file(project_root.to_string(), rel_path).await
        },
        "agent_list_dir" => {
            let rel_path = args["rel_path"].as_str()
                .or_else(|| args["dir_path"].as_str())
                .unwrap_or(".")
                .to_string();
            let result = agent::agent_list_dir(project_root.to_string(), rel_path).await?;
            Ok(result.join("\n"))
        },
        "agent_write_file" => {
            // For now, let's allow writing in sub-agents if requested,
            // but we might want to add a manual approval step later.
            let rel_path = args["rel_path"].as_str().unwrap_or("").to_string();
            let content = args["content"].as_str().unwrap_or("").to_string();

            // Fix: Unescape escape sequences in content (\\n -> \n, \\t -> \t, etc.)
            // The JSON from AI contains escaped newlines as \\n which need to be converted to actual \n
            let unescaped_content = unescape_string(&content);

            println!("[AgentTools] Writing file: {} (content length: {})", rel_path, unescaped_content.len());
            agent::agent_write_file(project_root.to_string(), rel_path, unescaped_content).await
        },
        "agent_batch_read" => {
            // Extract paths array from arguments
            let paths_array = args["paths"].as_array()
                .ok_or("Missing 'paths' array in arguments")?;

            let paths: Vec<String> = paths_array.iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.to_string())
                .collect();

            if paths.is_empty() {
                return Err("No paths provided for batch read".to_string());
            }

            println!("[AgentTools] Batch reading {} files", paths.len());

            // Call the batch_read function
            crate::commands::core_wrappers::agent_batch_read(project_root.to_string(), paths).await
        },
        "agent_scan_directory" => {
            let rel_path = args["rel_path"].as_str().or_else(|| args["path"].as_str()).unwrap_or(".").to_string();
            let pattern = args["pattern"].as_str().map(|s| s.to_string());
            let max_depth = args["max_depth"].as_u64().map(|v| v as usize);
            let max_files = args["max_files"].as_u64().map(|v| v as usize);

            println!("[AgentTools] Scanning directory: {} (pattern: {:?})", rel_path, pattern);

            crate::commands::core_wrappers::agent_scan_directory(
                project_root.to_string(),
                rel_path,
                pattern,
                max_depth,
                max_files
            ).await
        },
        _ => Err(format!("Tool {} not implemented or allowed in Agent System", tool_name))
    }
}
