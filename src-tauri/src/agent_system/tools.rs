use ifainew_core::agent;
use serde_json::Value;

/// Convert snake_case to camelCase (e.g., "rel_path" -> "relPath")
fn to_camel_case(snake: &str) -> String {
    let parts: Vec<&str> = snake.split('_').collect();
    if parts.is_empty() {
        return String::new();
    }
    let mut result = parts[0].to_string();
    for part in &parts[1..] {
        let mut chars = part.chars();
        if let Some(c) = chars.next() {
            result.extend(c.to_uppercase());
            result.extend(chars);
        }
    }
    result
}

/// Get argument value trying both snake_case and camelCase keys
/// AI models may return parameters in either format (e.g., rel_path or relPath)
fn get_arg_str<'a>(args: &'a Value, snake_key: &str, default: &'a str) -> &'a str {
    // Try snake_case first (e.g., rel_path)
    if let Some(s) = args[snake_key].as_str() {
        return s;
    }
    // Convert to camelCase (e.g., relPath) and try again
    let camel_key = to_camel_case(snake_key);
    args[camel_key].as_str().unwrap_or(default)
}

/// Get optional argument value trying both snake_case and camelCase keys
fn get_arg_opt_str(args: &Value, snake_key: &str) -> Option<String> {
    // Try snake_case first
    if let Some(s) = args[snake_key].as_str() {
        return Some(s.to_string());
    }
    // Try camelCase
    let camel_key = to_camel_case(snake_key);
    args[camel_key].as_str().map(|s| s.to_string())
}

/// Get optional argument as u64 trying both snake_case and camelCase keys
fn get_arg_opt_u64(args: &Value, snake_key: &str) -> Option<u64> {
    // Try snake_case first
    if let Some(v) = args[snake_key].as_u64() {
        return Some(v);
    }
    // Try camelCase
    let camel_key = to_camel_case(snake_key);
    args[camel_key].as_u64()
}

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
            let rel_path = get_arg_str(args, "rel_path", "");
            agent::agent_read_file(project_root.to_string(), rel_path.to_string()).await
        },
        "agent_list_dir" => {
            let rel_path = get_arg_str(args, "rel_path", ".");
            let result = agent::agent_list_dir(project_root.to_string(), rel_path.to_string()).await?;
            Ok(result.join("\n"))
        },
        "agent_write_file" => {
            let rel_path = get_arg_str(args, "rel_path", "");
            let content = get_arg_str(args, "content", "");

            // Fix: Unescape escape sequences in content (\\n -> \n, \\t -> \t, etc.)
            // The JSON from AI contains escaped newlines as \\n which need to be converted to actual \n
            let unescaped_content = unescape_string(content);

            println!("[AgentTools] Writing file: {} (content length: {})", rel_path, unescaped_content.len());
            agent::agent_write_file(project_root.to_string(), rel_path.to_string(), unescaped_content).await
        },
        "agent_batch_read" => {
            // Extract paths array from arguments - check both snake_case and camelCase
            let paths_array = args["paths"].as_array()
                .or_else(|| args["Paths"].as_array())
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
            let rel_path = get_arg_str(args, "rel_path", ".");
            let pattern = get_arg_opt_str(args, "pattern");
            let max_depth = get_arg_opt_u64(args, "max_depth").map(|v| v as usize);
            let max_files = get_arg_opt_u64(args, "max_files").map(|v| v as usize);

            println!("[AgentTools] Scanning directory: {} (pattern: {:?})", rel_path, pattern);

            crate::commands::core_wrappers::agent_scan_directory(
                project_root.to_string(),
                rel_path.to_string(),
                pattern,
                max_depth,
                max_files
            ).await
        },
        _ => Err(format!("Tool {} not implemented or allowed in Agent System", tool_name))
    }
}
