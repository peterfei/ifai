use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

#[derive(Debug, Serialize, Deserialize)]
pub struct BashResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

#[tauri::command]
pub async fn execute_bash_command(
    command: String,
    working_dir: Option<String>,
    timeout_ms: Option<u64>,
    env_vars: Option<HashMap<String, String>>,
) -> Result<BashResult, String> {
    let timeout_duration = Duration::from_millis(timeout_ms.unwrap_or(30000));

    // Determine the shell to use based on the OS
    #[cfg(target_os = "windows")]
    let (shell, arg) = ("cmd", "/C");
    #[cfg(not(target_os = "windows"))]
    let (shell, arg) = ("sh", "-c");

    let mut cmd = Command::new(shell);
    cmd.arg(arg).arg(&command);
    // 启用 kill_on_drop，当 Child 被丢弃（如超时）时自动杀掉进程
    cmd.kill_on_drop(true);

    if let Some(dir) = working_dir {
        cmd.current_dir(dir);
    }

    if let Some(envs) = env_vars {
        cmd.envs(envs);
    }

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let child = cmd.spawn().map_err(|e| format!("Failed to spawn command: {}", e))?;

    let result = timeout(timeout_duration, child.wait_with_output()).await;

    match result {
        Ok(Ok(output)) => {
            let exit_code = output.status.code().unwrap_or(-1);
            Ok(BashResult {
                exit_code,
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                success: output.status.success(),
            })
        }
        Ok(Err(e)) => Err(format!("Command execution failed: {}", e)),
        Err(_) => {
            // 超时时，wait_with_output 未来被丢弃，由于设置了 kill_on_drop，子进程会被自动杀死
            Ok(BashResult {
                exit_code: -1,
                stdout: "".to_string(),
                stderr: "Command timed out".to_string(),
                success: false,
            })
        }
    }
}
