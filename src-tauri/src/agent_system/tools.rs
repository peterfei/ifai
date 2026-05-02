// 🔥 P4: 移除对 ifainew_core::agent 的依赖，改用本地实现
// use ifainew_core::agent;
use crate::harness::task::TaskStore;
use crate::harness::tool::executor::todoutil::TodoWriteExecutor;
use crate::harness::tool::executor::ToolExecutor;
use serde_json::Value;
use std::path::Path;

// 🆕 全局 TaskStore 单例
use std::sync::OnceLock;

static GLOBAL_TASK_STORE: OnceLock<TaskStore> = OnceLock::new();

fn get_global_task_store() -> &'static TaskStore {
    GLOBAL_TASK_STORE.get_or_init(|| TaskStore::new())
}

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

    // 🔥 Special case for 'command' to handle AI hallucinations
    if snake_key == "command" {
        if let Some(s) = args["cmd"].as_str() {
            return s;
        }
        if let Some(s) = args["args"].as_str() {
            return s;
        }
        if let Some(s) = args["script"].as_str() {
            return s;
        }
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

/// Calibrate project root path
/// If the path points to 'src-tauri' (common dev environment issue), jump up to the parent directory.
fn calibrate_project_root(raw_root: &str) -> String {
    let mut base_path = std::path::PathBuf::from(raw_root);
    if base_path.ends_with("src-tauri") {
        println!("[AgentTools] Root calibration: Detected 'src-tauri', jumping to parent.");
        if let Some(parent) = base_path.parent() {
            base_path = parent.to_path_buf();
        }
    }
    base_path.to_string_lossy().to_string()
}

/// Check if a path is forbidden for AI agent operations
fn is_path_forbidden(rel_path: &str) -> bool {
    let path = rel_path.to_lowercase().replace('\\', "/");
    let forbidden_prefixes = [
        ".git/",
        ".env",
        ".ifai/",
        "node_modules/",
        "dist/",
        "target/",
    ];

    // 1. 直接前缀匹配
    if forbidden_prefixes
        .iter()
        .any(|prefix| path.starts_with(prefix))
    {
        return true;
    }

    // 2. 精确匹配敏感文件
    let forbidden_files = [
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "tauri.conf.json",
    ];
    if forbidden_files.iter().any(|file| path == *file) {
        return true;
    }

    // 3. 简单的路径遍历检测
    if path.contains("../") {
        return true;
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_path_forbidden() {
        assert!(is_path_forbidden(".git/config"));
        assert!(is_path_forbidden(".env"));
        assert!(is_path_forbidden(".env.local"));
        assert!(is_path_forbidden("node_modules/lodash/index.js"));
        assert!(is_path_forbidden("package-lock.json"));
        assert!(is_path_forbidden("src/../.git/config")); // Path traversal

        assert!(!is_path_forbidden("src/main.rs"));
        assert!(!is_path_forbidden("README.md"));
        assert!(!is_path_forbidden("docs/index.md"));
    }
}

pub async fn execute_tool_internal(
    tool_name: &str,
    args: &Value,
    project_root: &str,
) -> Result<String, String> {
    // 1. Calibrate the project root globally for ALL tools
    let calibrated_root = calibrate_project_root(project_root);

    // 🔥 Security Sandbox: Check for forbidden paths
    let rel_path = get_arg_opt_str(args, "rel_path")
        .or_else(|| get_arg_opt_str(args, "path"))
        .unwrap_or_default();

    if !rel_path.is_empty() && is_path_forbidden(&rel_path) {
        // Allow ONLY reading of non-critical parts if necessary, but for now, block all writes/deletes
        if tool_name.contains("write")
            || tool_name.contains("delete")
            || tool_name.contains("replace")
        {
            println!(
                "[AgentTools] 🛡️ Security Sandbox: Blocked {} on forbidden path: {}",
                tool_name, rel_path
            );
            return Err(format!("Security Error: Access to '{}' is strictly forbidden for AI safety. Please modify other parts of the project.", rel_path));
        }
    }

    // Only log if calibration actually changed the path
    if calibrated_root != project_root {
        println!(
            "[AgentTools] Executing tool: {} | Root Calibrated: '{}' -> '{}'",
            tool_name, project_root, calibrated_root
        );
    } else {
        println!(
            "[AgentTools] Executing tool: {} with args: {}",
            tool_name, args
        );
    }

    match tool_name {
        "agent_read_file" => {
            let rel_path = get_arg_str(args, "rel_path", "");
            // 🔥 P4: 使用本地实现替代 ifainew_core::agent
            let path = Path::new(&calibrated_root).join(rel_path);
            tokio::fs::read_to_string(&path)
                .await
                .map_err(|e| format!("Failed to read file: {}", e))
        }
        "agent_list_dir" => {
            let rel_path = get_arg_str(args, "rel_path", ".");
            // 🔥 P4: 使用本地实现替代 ifainew_core::agent
            let path = Path::new(&calibrated_root).join(rel_path);
            let mut entries = tokio::fs::read_dir(&path)
                .await
                .map_err(|e| format!("Failed to list directory: {}", e))?;

            let mut result = Vec::new();
            while let Some(entry) = entries
                .next_entry()
                .await
                .map_err(|e| format!("Failed to read directory entry: {}", e))?
            {
                let name = entry.file_name().to_string_lossy().to_string();
                result.push(name);
            }
            result.sort();
            Ok(result.join("\n"))
        }
        "agent_write_file" => {
            let rel_path = get_arg_str(args, "rel_path", "");
            let content = get_arg_str(args, "content", "");

            // Fix: Unescape escape sequences in content (\\n -> \n, \\t -> \t, etc.)
            let unescaped_content = unescape_string(content);

            println!(
                "[AgentTools] Writing file: {} (content length: {})",
                rel_path,
                unescaped_content.len()
            );

            // 🔥 P4: 使用本地实现替代 ifainew_core::agent
            let path = Path::new(&calibrated_root).join(rel_path);

            // Ensure parent directory exists
            if let Some(parent) = path.parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("Failed to create directory: {}", e))?;
            }

            tokio::fs::write(&path, unescaped_content)
                .await
                .map_err(|e| format!("Failed to write file: {}", e))?;

            Ok(format!("File written: {}", rel_path))
        }
        "agent_batch_read" => {
            let paths_array = args["paths"]
                .as_array()
                .or_else(|| args["Paths"].as_array())
                .ok_or("Missing 'paths' array in arguments")?;

            let paths: Vec<String> = paths_array
                .iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.to_string())
                .collect();

            if paths.is_empty() {
                return Err("No paths provided for batch read".to_string());
            }

            println!("[AgentTools] Batch reading {} files", paths.len());
            crate::commands::core_wrappers::agent_batch_read(calibrated_root, paths).await
        }
        "agent_scan_directory" => {
            let rel_path = get_arg_str(args, "rel_path", ".");
            let pattern = get_arg_opt_str(args, "pattern");
            let max_depth = get_arg_opt_u64(args, "max_depth").map(|v| v as usize);
            let max_files = get_arg_opt_u64(args, "max_files").map(|v| v as usize);

            println!(
                "[AgentTools] Scanning directory: {} (pattern: {:?})",
                rel_path, pattern
            );

            crate::commands::core_wrappers::agent_scan_directory(
                calibrated_root,
                rel_path.to_string(),
                pattern,
                max_depth,
                max_files,
            )
            .await
        }
        "agent_bash" | "bash" | "agent_run_shell_command" | "agent_execute_command" => {
            let command = get_arg_str(args, "command", "");
            let working_dir_arg = get_arg_opt_str(args, "working_dir");
            let timeout = get_arg_opt_u64(args, "timeout");

            // 🔥 FIX v0.3.9: 严防将工具名误作为命令执行 ( Hallucination Prevention )
            if command.trim() == "agent_bash" || command.trim() == "bash" {
                println!("[AgentTools] ❌ Hallucination detected: AI tried to execute tool name as command.");
                return Err(format!("Error: '{}' is a tool name, not a valid shell command. Please provide a real command (e.g., 'ls -la').", command));
            }

            // Sanitize working directory to be relative to project root
            let final_working_dir = match working_dir_arg {
                Some(dir) => {
                    let clean_dir = dir.trim_start_matches(|c| c == '/' || c == '\\');
                    if clean_dir.is_empty() || clean_dir == "." {
                        calibrated_root.clone()
                    } else {
                        std::path::Path::new(&calibrated_root)
                            .join(clean_dir)
                            .to_string_lossy()
                            .to_string()
                    }
                }
                None => calibrated_root.clone(),
            };

            // Resolve to absolute canonical path for debugging
            let canonical_path = std::fs::canonicalize(&final_working_dir)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|e| format!("(Failed to resolve: {})", e));

            println!("[AgentTools] BASH EXECUTION START:");
            println!("  - Requested tool: {}", tool_name);
            println!("  - Command: {}", command);
            println!("  - Calibrated Root: {}", calibrated_root);
            println!("  - Calculated Directory: {}", final_working_dir);
            println!("  - Canonical Directory: {}", canonical_path);

            match crate::commands::bash_commands::execute_bash_command(
                command.to_string(),
                Some(final_working_dir.clone()),
                timeout,
                None, // env_vars
            )
            .await
            {
                Ok(result) => {
                    // Format the result in a more AI-friendly way.
                    // IMPORTANT: Include stderr even on success, because many tools (like npm/git)
                    // output progress or status to stderr. This prevents the AI from thinking
                    // nothing happened and looping.
                    let formatted = if result.success {
                        let mut output = format!(
                            "Command '{}' executed successfully in {}.\n",
                            command, final_working_dir
                        );
                        if !result.stdout.trim().is_empty() {
                            output.push_str(&format!("stdout:\n{}\n", result.stdout));
                        }
                        if !result.stderr.trim().is_empty() {
                            output.push_str(&format!("stderr/logs:\n{}\n", result.stderr));
                        }
                        if result.stdout.trim().is_empty() && result.stderr.trim().is_empty() {
                            output.push_str("(No output produced)");
                        }
                        output
                    } else {
                        format!(
                            "Command '{}' failed with exit code {} in {}.\nstdout: {}\nstderr: {}",
                            command,
                            result.exit_code,
                            final_working_dir,
                            result.stdout,
                            result.stderr
                        )
                    };

                    println!(
                        "[AgentTools] BASH SUCCESS: exit_code={}, success={}, output_len={}",
                        result.exit_code,
                        result.success,
                        formatted.len()
                    );
                    Ok(formatted)
                }
                Err(e) => {
                    println!("[AgentTools] BASH ERROR: {}", e);
                    Err(e)
                }
            }
        }
        "TodoWrite" => {
            println!("[AgentTools] Executing TodoWrite with args: {}", args);

            // 提取 todos 数组
            let todos_array = args
                .get("todos")
                .and_then(|v| v.as_array())
                .ok_or("Missing or invalid 'todos' array in TodoWrite arguments")?;

            // 创建 TodoWriteExecutor 并执行
            let store = get_global_task_store();
            let mut executor = TodoWriteExecutor::new(store.clone());

            match executor.execute("TodoWrite", args) {
                Ok(result) => {
                    println!("[AgentTools] TodoWrite SUCCESS: {}", result);
                    Ok(result)
                }
                Err(e) => {
                    println!("[AgentTools] TodoWrite ERROR: {:?}", e);
                    Err(format!("TodoWrite failed: {:?}", e))
                }
            }
        }
        _ => Err(format!(
            "Tool {} not implemented or allowed in Agent System",
            tool_name
        )),
    }
}
