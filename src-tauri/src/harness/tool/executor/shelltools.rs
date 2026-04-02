//! Shell 命令执行器
//!
//! 实现 Bash 和 PowerShell 命令执行工具。

use serde_json::Value;
use std::collections::HashSet;
use std::process::Command;

use super::super::{ToolError, ToolExecutor};

/// Shell 命令执行器
pub struct ShellToolsExecutor {
    allowed_tools: HashSet<String>,
}

impl ShellToolsExecutor {
    /// 创建新的 Shell 工具执行器
    pub fn new() -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("bash".to_string());
        allowed_tools.insert("PowerShell".to_string());

        Self { allowed_tools }
    }

    /// 处理 bash 工具调用
    fn handle_bash(&self, input: &Value) -> Result<String, ToolError> {
        let command = input
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                ToolError::InvalidInput("Missing 'command' parameter".to_string())
            })?;

        // 检测操作系统
        #[cfg(target_os = "windows")]
        let shell = "cmd";
        #[cfg(target_os = "windows")]
        let shell_arg = "/C";

        #[cfg(not(target_os = "windows"))]
        let shell = "bash";
        #[cfg(not(target_os = "windows"))]
        let shell_arg = "-c";

        // 执行命令
        let output = Command::new(shell)
            .arg(shell_arg)
            .arg(command)
            .output()
            .map_err(|e| {
                ToolError::Execution(format!("Failed to execute command: {}", e))
            })?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        // 构建结果
        let mut result = format!("💻 Command: {}\n", command);

        if !stdout.is_empty() {
            result.push_str(&format!("📤 Output:\n{}\n", stdout));
        }

        if !stderr.is_empty() {
            result.push_str(&format!("⚠️  Stderr:\n{}\n", stderr));
        }

        result.push_str(&format!("📊 Exit code: {}", output.status.code().unwrap_or(-1)));

        Ok(result)
    }

    /// 处理 PowerShell 工具调用（Windows）
    fn handle_powershell(&self, input: &Value) -> Result<String, ToolError> {
        let command = input
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                ToolError::InvalidInput("Missing 'command' parameter".to_string())
            })?;

        // 执行 PowerShell 命令
        let output = Command::new("powershell")
            .arg("-Command")
            .arg(command)
            .output()
            .map_err(|e| {
                ToolError::Execution(format!("Failed to execute PowerShell command: {}", e))
            })?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        // 构建结果
        let mut result = format!("💻 PowerShell: {}\n", command);

        if !stdout.is_empty() {
            result.push_str(&format!("📤 Output:\n{}\n", stdout));
        }

        if !stderr.is_empty() {
            result.push_str(&format!("⚠️  Stderr:\n{}\n", stderr));
        }

        result.push_str(&format!("📊 Exit code: {}", output.status.code().unwrap_or(-1)));

        Ok(result)
    }
}

impl ToolExecutor for ShellToolsExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "bash" => self.handle_bash(input),
            "PowerShell" => self.handle_powershell(input),
            _ => Err(ToolError::NotFound {
                name: name.to_string(),
            }),
        }
    }

    fn is_available(&self, name: &str) -> bool {
        self.allowed_tools.contains(name)
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

impl Default for ShellToolsExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bash_echo() {
        let mut executor = ShellToolsExecutor::new();
        let input = serde_json::json!({
            "command": "echo 'Hello, World!'"
        });

        let result = executor.execute("bash", &input);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.contains("Hello, World!"));
        assert!(output.contains("Exit code: 0"));
    }

    #[test]
    fn test_bash_list_files() {
        let mut executor = ShellToolsExecutor::new();
        let input = serde_json::json!({
            "command": "ls"
        });

        let result = executor.execute("bash", &input);
        assert!(result.is_ok());
    }

    #[test]
    fn test_bash_missing_command() {
        let mut executor = ShellToolsExecutor::new();
        let input = serde_json::json!({});

        let result = executor.execute("bash", &input);
        assert!(matches!(result, Err(ToolError::InvalidInput { .. })));
    }

    #[test]
    fn test_allowed_tools() {
        let mut executor = ShellToolsExecutor::new();
        assert!(executor.is_available("bash"));
        assert!(executor.is_available("PowerShell"));
        assert!(!executor.is_available("read_file"));
    }

    #[test]
    fn test_execute_unknown_tool() {
        let mut executor = ShellToolsExecutor::new();
        let input = serde_json::json!({});

        let result = executor.execute("unknown_tool", &input);
        assert!(matches!(result, Err(ToolError::NotFound { .. })));
    }
}
