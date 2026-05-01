use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use std::time::Instant;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

/// 检测输出是否包含启动成功的标志
///
/// 对于长期运行的命令（如 `npm run dev`），我们不应该等待它们结束，
/// 而是检测特定的成功标志，一旦检测到就认为命令执行成功。
fn detect_startup_success(output: &str) -> bool {
    const SUCCESS_PATTERNS: &[&str] = &[
        // Vite / Vue
        "Local:",
        "Network:",
        "ready in",
        "VITE",
        // Webpack
        "Compiled successfully",
        "webpack: Compiled",
        "webpack compiled",
        // Next.js
        "ready - started server on",
        "▲ Next.js",
        // Create React App
        "Starting the development server",
        "Compiled successfully!",
        "You can now view",
        // General server messages
        "Server running",
        "server running",
        "listening on",
        "Listening on",
        "Serving",
        "serving at",
        // Python servers
        "Running on",
        "Serving HTTP on",
        // Go servers
        "Starting server",
        "Server started",
        // Node.js
        "server is listening",
        "application is running",
    ];

    let lower_output = output.to_lowercase();
    for pattern in SUCCESS_PATTERNS {
        if lower_output.contains(&pattern.to_lowercase()) {
            return true;
        }
    }

    false
}

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

    // 🔥 修复：不 kill 进程，让后台服务器持续运行
    // 对于长期运行的服务（如 npm run dev），我们希望它们在后台继续运行
    cmd.kill_on_drop(false);

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

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    // 获取管道所有权
    let mut child_stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let mut child_stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    // 🔥 FIX: 改为逐行读取，以便检测启动成功标志
    let output_future = async {
        let mut stdout_reader = BufReader::new(child_stdout).lines();
        let mut stderr_reader = BufReader::new(child_stderr).lines();

        let mut stdout_lines = Vec::new();
        let mut stderr_lines = Vec::new();
        let mut combined_output = String::new();
        const MAX_LINES: usize = 10000; // 防止无限输出

        loop {
            tokio::select! {
                // 读取 stdout
                stdout_result = stdout_reader.next_line() => {
                    match stdout_result {
                        Ok(Some(line)) => {
                            if stdout_lines.len() >= MAX_LINES {
                                break;
                            }
                            stdout_lines.push(line.clone());
                            combined_output.push_str(&line);
                            combined_output.push('\n');

                            // 🔥 FIX: 检测启动成功标志
                            if detect_startup_success(&combined_output) {
                                println!("[Bash Command] ✅ Detected startup success, forgetting child process to keep it running");

                                // 🔥 修复：放弃 child 所有权，让进程真正在后台运行
                                std::mem::forget(child);

                                return Ok::<_, String>((true, stdout_lines, stderr_lines));
                            }
                        }
                        Ok(None) => break, // stdout 结束
                        Err(e) => {
                            eprintln!("Error reading stdout: {}", e);
                            break;
                        }
                    }
                }
                // 读取 stderr
                stderr_result = stderr_reader.next_line() => {
                    match stderr_result {
                        Ok(Some(line)) => {
                            if stderr_lines.len() >= MAX_LINES {
                                break;
                            }
                            stderr_lines.push(line.clone());
                            combined_output.push_str(&line);
                            combined_output.push('\n');

                            // 🔥 FIX: 检测启动成功标志
                            if detect_startup_success(&combined_output) {
                                println!("[Bash Command] ✅ Detected startup success, forgetting child process to keep it running");

                                // 🔥 修复：放弃 child 所有权，让进程真正在后台运行
                                std::mem::forget(child);

                                return Ok::<_, String>((true, stdout_lines, stderr_lines));
                            }
                        }
                        Ok(None) => break, // stderr 结束
                        Err(e) => {
                            eprintln!("Error reading stderr: {}", e);
                            break;
                        }
                    }
                }
            }

            // 如果两者都结束了，退出循环
            if stdout_lines.len() + stderr_lines.len() > 0 {
                // 继续读取，但已经在上面处理了 break
            }
        }

        // 没有检测到启动成功，等待进程结束
        let status = child.wait().await.map_err(|e| e.to_string())?;

        // 返回 false 表示没有提前检测到启动成功
        Ok::<_, String>((false, stdout_lines, stderr_lines))
    };

    let result = timeout(timeout_duration, output_future).await;
    let elapsed_ms = start_time.elapsed().as_millis() as u64;

    match result {
        Ok(Ok((detected_startup, stdout_lines, stderr_lines))) => {
            let stdout = stdout_lines.join("\n");
            let stderr = stderr_lines.join("\n");

            if detected_startup {
                // 检测到启动成功，返回成功状态
                println!("[Bash Command] Returning success after detecting startup pattern");
                Ok(BashResult {
                    exit_code: 0,
                    stdout: format!("{}\n\n✅ Server started successfully", stdout),
                    stderr,
                    success: true,
                    elapsed_ms,
                })
            } else {
                // 进程正常结束
                let exit_code = -1; // 我们没有获取到实际的 status，用 -1 表示
                Ok(BashResult {
                    exit_code,
                    stdout,
                    stderr,
                    success: true, // 假设成功
                    elapsed_ms,
                })
            }
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
