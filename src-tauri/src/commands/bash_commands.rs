use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use tokio::process::Command;
use tokio::time::{timeout, Duration};
use tokio::io::AsyncReadExt;
use std::time::Instant;

#[derive(Debug, Serialize, Deserialize)]
pub struct BashResult {
    /// 命令退出码
    pub exit_code: i32,
    /// 标准输出
    pub stdout: String,
    /// 标准错误
    pub stderr: String,
    /// 是否成功
    pub success: bool,
    /// 执行时间 (ms)
    pub elapsed_ms: u64,
}

#[tauri::command]
pub async fn execute_bash_command(
    command: String,
    working_dir: Option<String>,
    timeout_ms: Option<u64>,
    env_vars: Option<HashMap<String, String>>,
) -> Result<BashResult, String> {
    let start_time = Instant::now();
    let timeout_duration = Duration::from_millis(timeout_ms.unwrap_or(30000));
    const MAX_OUTPUT_SIZE: u64 = 10 * 1024 * 1024; // 10MB limit

    // Determine the shell to use based on the OS
    #[cfg(target_os = "windows")]
    let (shell, arg) = ("cmd", "/C");
    #[cfg(not(target_os = "windows"))]
    let (shell, arg) = ("sh", "-c");

    let mut cmd = Command::new(shell);
    cmd.arg(arg).arg(&command);
    
    // 设置 kill_on_drop 确保超时或丢弃时清理进程
    cmd.kill_on_drop(true);

    if let Some(dir) = working_dir {
        if !dir.is_empty() {
            cmd.current_dir(dir);
        }
    }

    if let Some(envs) = env_vars {
        cmd.envs(envs);
    }

    // 捕获输出
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn command: {}", e))?;
    
    // 获取管道所有权
    let mut child_stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let mut child_stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    // 手动异步读取并限制大小
    let output_future = async {
        let mut stdout_vec = Vec::new();
        let mut stderr_vec = Vec::new();
        
        // 分别读取 stdout 和 stderr，带 10MB 限制
        let read_stdout = child_stdout.read_to_end(&mut stdout_vec);
        let read_stderr = child_stderr.read_to_end(&mut stderr_vec);
        
        // 这里为了简单和安全，我们使用带有限制的读取
        // 注意：read_to_end 本身不限制大小，所以我们使用 take
        let mut stdout_handle = child_stdout.take(MAX_OUTPUT_SIZE);
        let mut stderr_handle = child_stderr.take(MAX_OUTPUT_SIZE);
        
        let mut final_stdout = Vec::new();
        let mut final_stderr = Vec::new();
        
        let (res1, res2) = tokio::join!(
            stdout_handle.read_to_end(&mut final_stdout),
            stderr_handle.read_to_end(&mut final_stderr)
        );
        
        res1.map_err(|e| e.to_string())?;
        res2.map_err(|e| e.to_string())?;

        // 检查是否截断
        if final_stdout.len() as u64 == MAX_OUTPUT_SIZE {
            final_stdout.extend_from_slice(b"\n...[Output Truncated (Limit 10MB)]...");
        }
        if final_stderr.len() as u64 == MAX_OUTPUT_SIZE {
            final_stderr.extend_from_slice(b"\n...[Error Truncated (Limit 10MB)]...");
        }

        let status = child.wait().await.map_err(|e| e.to_string())?;
        
        Ok::<_, String>((status, final_stdout, final_stderr))
    };

    let result = timeout(timeout_duration, output_future).await;

    let elapsed_ms = start_time.elapsed().as_millis() as u64;

    match result {
        Ok(Ok((status, stdout, stderr))) => {
            let exit_code = status.code().unwrap_or(-1);
            Ok(BashResult {
                exit_code,
                stdout: String::from_utf8_lossy(&stdout).to_string(),
                stderr: String::from_utf8_lossy(&stderr).to_string(),
                success: status.success(),
                elapsed_ms,
            })
        }
        Ok(Err(e)) => Err(format!("Command execution failed: {}", e)),
        Err(_) => {
            // 超时处理
            Ok(BashResult {
                exit_code: -1,
                stdout: "".to_string(),
                stderr: "Command timed out".to_string(),
                success: false,
                elapsed_ms,
            })
        }
    }
}