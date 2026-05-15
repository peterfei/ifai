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
            .ok_or_else(|| ToolError::InvalidInput("Missing 'command' parameter".to_string()))?;

        // 🔥 FIX: 获取工作目录参数
        let working_dir = input.get("working_dir").and_then(|v| v.as_str());

        // 检测操作系统
        #[cfg(target_os = "windows")]
        let shell = "cmd";
        #[cfg(target_os = "windows")]
        let shell_arg = "/C";

        #[cfg(not(target_os = "windows"))]
        let shell = "bash";
        #[cfg(not(target_os = "windows"))]
        let shell_arg = "-c";

        // 🔥 FIX: 执行命令时设置工作目录
        let mut cmd = Command::new(shell);
        cmd.arg(shell_arg).arg(command);

        // 如果指定了工作目录，设置它
        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }

        let output = cmd
            .output()
            .map_err(|e| ToolError::Execution(format!("Failed to execute command: {}", e)))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);

        // 构建结果 - 专业格式
        let mut result = format!("> {}\n", command);

        if !stdout.is_empty() {
            result.push_str(&stdout);
            // 确保以换行结尾
            if !stdout.ends_with('\n') {
                result.push('\n');
            }
        }

        if !stderr.is_empty() {
            result.push_str(&format!("Error: {}", stderr));
        }

        // 只在非零退出码时显示
        if exit_code != 0 {
            result.push_str(&format!("Exit code: {}", exit_code));
        }

        Ok(result)
    }

    /// 处理 PowerShell 工具调用（Windows）
    fn handle_powershell(&self, input: &Value) -> Result<String, ToolError> {
        let command = input
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'command' parameter".to_string()))?;

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
        let exit_code = output.status.code().unwrap_or(-1);

        // 构建结果 - 专业格式
        let mut result = format!("> {}\n", command);

        if !stdout.is_empty() {
            result.push_str(&stdout);
            if !stdout.ends_with('\n') {
                result.push('\n');
            }
        }

        if !stderr.is_empty() {
            result.push_str(&format!("Error: {}", stderr));
        }

        if exit_code != 0 {
            result.push_str(&format!("Exit code: {}", exit_code));
        }

        Ok(result)
    }
}

impl ToolExecutor for ShellToolsExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "bash" => self.handle_bash(input),
            "PowerShell" => {
                // 🔥 FIX: 仅在 Windows 上执行 PowerShell
                #[cfg(target_os = "windows")]
                return self.handle_powershell(input);

                #[cfg(not(target_os = "windows"))]
                return Err(ToolError::Execution(
                    "PowerShell is only available on Windows".to_string(),
                ));
            }
            _ => Err(ToolError::NotFound {
                name: name.to_string(),
            }),
        }
    }

    fn is_available(&self, name: &str) -> bool {
        // 🔥 FIX: PowerShell 仅在 Windows 上可用
        if name == "PowerShell" {
            #[cfg(target_os = "windows")]
            return self.allowed_tools.contains(name);
            #[cfg(not(target_os = "windows"))]
            return false;
        }
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
        // 注意：成功命令不显示 "Exit code: 0"（仅错误时显示）
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

        // PowerShell 仅在 Windows 上可用
        #[cfg(target_os = "windows")]
        assert!(executor.is_available("PowerShell"));
        #[cfg(not(target_os = "windows"))]
        assert!(!executor.is_available("PowerShell"));

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
