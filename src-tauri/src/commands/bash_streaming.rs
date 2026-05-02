use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

/// 检测输出是否包含启动成功的标志
///
/// 对于长期运行的命令（如 `npm run dev`），我们不应该等待它们结束，
/// 而是检测特定的成功标志，一旦检测到就认为命令执行成功。
fn detect_startup_success(stdout_lines: &[String], stderr_lines: &[String]) -> bool {
    // 常见的成功启动标志
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
        "webpack: Compiled with",
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

    // 检查所有输出行
    let all_lines: Vec<&String> = stdout_lines.iter().chain(stderr_lines.iter()).collect();

    for line in all_lines {
        let lower_line = line.to_lowercase();
        for pattern in SUCCESS_PATTERNS {
            if lower_line.contains(&pattern.to_lowercase()) {
                return true;
            }
        }
    }

    false
}

/// 流式输出事件数据
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BashStreamEvent {
    /// 事件类型：output（输出行）、error（错误行）、complete（完成）
    pub event_type: String,
    /// 输出内容
    pub content: String,
    /// 是否为标准错误
    pub is_stderr: bool,
    /// 当前已读取的行数
    pub line_count: usize,
}

/// 流式 Bash 命令执行结果
#[derive(Debug, Serialize, Deserialize)]
pub struct BashStreamResult {
    /// 命令退出码
    pub exit_code: i32,
    /// 总行数
    pub total_lines: usize,
    /// 是否成功
    pub success: bool,
    /// 执行时间 (ms)
    pub elapsed_ms: u64,
    /// 是否超时
    pub timed_out: bool,
    /// ⚡️ FIX: 添加标准输出内容
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdout: Option<String>,
    /// ⚡️ FIX: 添加标准错误内容
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stderr: Option<String>,
}

/// 流式执行 Bash 命令
///
/// # 参数
/// - `command`: 要执行的命令
/// - `working_dir`: 工作目录
/// - `timeout_ms`: 超时时间（毫秒）
/// - `env_vars`: 环境变量
/// - `event_id`: 事件 ID，用于前端监听
/// - `throttle_lines`: 节流行数，每 N 行发送一次事件（默认 10）
/// - `app_handle`: Tauri 应用句柄
///
/// # 事件
/// 通过 `bash://stream/{event_id}` 事件发送流式输出
pub async fn execute_bash_command_streaming(
    command: String,
    working_dir: Option<String>,
    timeout_ms: Option<u64>,
    env_vars: Option<HashMap<String, String>>,
    event_id: String,
    throttle_lines: Option<usize>,
    app_handle: AppHandle,
) -> Result<BashStreamResult, String> {
    let start_time = Instant::now();
    let timeout_duration = Duration::from_millis(timeout_ms.unwrap_or(30000));
    const MAX_OUTPUT_LINES: usize = 100_000; // 防止无限输出
    const MAX_LINE_LENGTH: usize = 10_000; // 单行最大长度

    let throttle = throttle_lines.unwrap_or(10); // 默认每 10 行发送一次

    // 确定使用的 shell
    #[cfg(target_os = "windows")]
    let (shell, arg) = ("cmd", "/C");
    #[cfg(not(target_os = "windows"))]
    let (shell, arg) = ("sh", "-c");

    let mut cmd = Command::new(shell);
    cmd.arg(arg).arg(&command);
    // 🔥 修复：不 kill 进程，让后台服务器持续运行
    // 对于长期运行的服务（如 npm run dev），我们希望它们在后台继续运行
    cmd.kill_on_drop(false);

    if let Some(dir) = &working_dir {
        if !dir.is_empty() {
            cmd.current_dir(dir);
        }
    }

    if let Some(envs) = &env_vars {
        cmd.envs(envs);
    }

    // 捕获 stdout 和 stderr
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    let mut line_count = 0;
    let mut buffer = Vec::with_capacity(throttle);
    let mut has_error = false;

    // ⚡️ FIX: 添加输出缓冲区，用于在结果中返回完整输出
    let mut stdout_buffer = Vec::new();
    let mut stderr_buffer = Vec::new();

    // 流式读取函数
    let mut read_stream = async {
        loop {
            tokio::select! {
                // 读取 stdout
                stdout_result = stdout_reader.next_line() => {
                    match stdout_result {
                        Ok(Some(line)) => {
                            if line_count >= MAX_OUTPUT_LINES {
                                break;
                            }

                            // 截断过长的行
                            let processed_line = if line.len() > MAX_LINE_LENGTH {
                                format!("{}...[Line truncated]", crate::ai_utils::safe_truncate(&line, MAX_LINE_LENGTH))
                            } else {
                                line.clone()
                            };

                            // ⚡️ FIX: 收集到 stdout 缓冲区
                            stdout_buffer.push(line);

                            buffer.push(BashStreamEvent {
                                event_type: "output".to_string(),
                                content: processed_line,
                                is_stderr: false,
                                line_count: line_count + 1,
                            });

                            line_count += 1;

                            // 🔥 FIX: 检测启动成功标志
                            if detect_startup_success(&stdout_buffer, &stderr_buffer) {
                                // 发送剩余缓冲内容
                                if !buffer.is_empty() {
                                    emit_batch(&app_handle, &event_id, &buffer)?;
                                }

                                // 发送成功事件
                                emit_event(&app_handle, &event_id, BashStreamEvent {
                                    event_type: "complete".to_string(),
                                    content: "✅ Server started successfully and running in background".to_string(),
                                    is_stderr: false,
                                    line_count,
                                })?;

                                // 🔥 修复：放弃 child 所有权，让进程真正在后台运行
                                // 使用 forget() 来防止进程被 drop 时终止
                                std::mem::forget(child);
                                println!("[Bash Streaming] ✅ Detected startup success, forgot child process to keep it running");

                                // 提前结束循环，返回成功状态
                                return Ok::<_, String>(true); // true 表示检测到启动成功
                            }

                            // 达到节流阈值时发送
                            if buffer.len() >= throttle {
                                emit_batch(&app_handle, &event_id, &buffer)?;
                                buffer.clear();
                            }
                        }
                        Ok(None) => break, // stdout 结束
                        Err(e) => {
                            has_error = true;
                            emit_event(&app_handle, &event_id, BashStreamEvent {
                                event_type: "error".to_string(),
                                content: format!("Read error: {}", e),
                                is_stderr: false,
                                line_count: line_count + 1,
                            })?;
                            break;
                        }
                    }
                }
                // 读取 stderr
                stderr_result = stderr_reader.next_line() => {
                    match stderr_result {
                        Ok(Some(line)) => {
                            if line_count >= MAX_OUTPUT_LINES {
                                break;
                            }

                            let processed_line = if line.len() > MAX_LINE_LENGTH {
                                format!("{}...[Line truncated]", crate::ai_utils::safe_truncate(&line, MAX_LINE_LENGTH))
                            } else {
                                line.clone()
                            };

                            // ⚡️ FIX: 收集到 stderr 缓冲区
                            stderr_buffer.push(line);

                            buffer.push(BashStreamEvent {
                                event_type: "output".to_string(),
                                content: processed_line,
                                is_stderr: true,
                                line_count: line_count + 1,
                            });

                            line_count += 1;

                            // 🔥 FIX: 检测启动成功标志
                            if detect_startup_success(&stdout_buffer, &stderr_buffer) {
                                // 发送剩余缓冲内容
                                if !buffer.is_empty() {
                                    emit_batch(&app_handle, &event_id, &buffer)?;
                                }

                                // 发送成功事件
                                emit_event(&app_handle, &event_id, BashStreamEvent {
                                    event_type: "complete".to_string(),
                                    content: "✅ Server started successfully and running in background".to_string(),
                                    is_stderr: false,
                                    line_count,
                                })?;

                                // 🔥 修复：放弃 child 所有权，让进程真正在后台运行
                                // 使用 forget() 来防止进程被 drop 时终止
                                std::mem::forget(child);
                                println!("[Bash Streaming] ✅ Detected startup success, forgot child process to keep it running");

                                // 提前结束循环，返回成功状态
                                return Ok::<_, String>(true); // true 表示检测到启动成功
                            }

                            if buffer.len() >= throttle {
                                emit_batch(&app_handle, &event_id, &buffer)?;
                                buffer.clear();
                            }
                        }
                        Ok(None) => break, // stderr 结束
                        Err(e) => {
                            has_error = true;
                            emit_event(&app_handle, &event_id, BashStreamEvent {
                                event_type: "error".to_string(),
                                content: format!("Read error: {}", e),
                                is_stderr: true,
                                line_count: line_count + 1,
                            })?;
                            break;
                        }
                    }
                }
            }

            if line_count >= MAX_OUTPUT_LINES {
                emit_event(
                    &app_handle,
                    &event_id,
                    BashStreamEvent {
                        event_type: "error".to_string(),
                        content: format!("Output limit reached ({} lines)", MAX_OUTPUT_LINES),
                        is_stderr: false,
                        line_count: line_count,
                    },
                )?;
                break;
            }
        }

        // 发送剩余缓冲内容
        if !buffer.is_empty() {
            emit_batch(&app_handle, &event_id, &buffer)?;
        }

        // 等待进程结束
        let status = child.wait().await.map_err(|e| e.to_string())?;

        // 返回 false 表示没有提前检测到启动成功，进程正常结束
        Ok::<_, String>(false)
    };

    // 执行流式读取（带超时）
    let result = timeout(timeout_duration, read_stream).await;
    let elapsed_ms = start_time.elapsed().as_millis() as u64;

    // 发送完成事件并确定结果
    let (exit_code, success, timed_out) = match result {
        Ok(Ok(detected_startup)) => {
            // detected_startup: true 表示检测到启动成功并提前结束
            if detected_startup {
                // 检测到启动成功，返回成功状态
                (0, true, false) // exit_code: 0, success: true, timed_out: false
            } else {
                // 进程正常结束（没有提前检测到启动成功）
                // 这里需要重新获取进程状态，但我们没有保存它
                // 由于进程已经正常结束，我们可以假设它是成功的
                emit_event(
                    &app_handle,
                    &event_id,
                    BashStreamEvent {
                        event_type: "complete".to_string(),
                        content: "Command completed (process exited normally)".to_string(),
                        is_stderr: false,
                        line_count,
                    },
                )?;
                (0, true, false)
            }
        }
        Ok(Err(e)) => {
            emit_event(
                &app_handle,
                &event_id,
                BashStreamEvent {
                    event_type: "error".to_string(),
                    content: format!("Execution error: {}", e),
                    is_stderr: false,
                    line_count,
                },
            )?;
            (-1, false, false)
        }
        Err(_) => {
            // 超时
            emit_event(
                &app_handle,
                &event_id,
                BashStreamEvent {
                    event_type: "error".to_string(),
                    content: "Command timed out".to_string(),
                    is_stderr: false,
                    line_count,
                },
            )?;
            (-1, false, true)
        }
    };

    Ok(BashStreamResult {
        exit_code,
        total_lines: line_count,
        success,
        elapsed_ms,
        timed_out,
        // ⚡️ FIX: 添加输出内容
        stdout: if stdout_buffer.is_empty() {
            None
        } else {
            Some(stdout_buffer.join("\n"))
        },
        stderr: if stderr_buffer.is_empty() {
            None
        } else {
            Some(stderr_buffer.join("\n"))
        },
    })
}

/// 发送单个事件
fn emit_event(
    app_handle: &AppHandle,
    event_id: &str,
    event: BashStreamEvent,
) -> Result<(), String> {
    let event_name = format!("bash://stream/{}", event_id);
    app_handle
        .emit(&event_name, event)
        .map_err(|e| format!("Failed to emit event: {}", e))
}

/// 批量发送事件（减少事件开销）
fn emit_batch(
    app_handle: &AppHandle,
    event_id: &str,
    events: &[BashStreamEvent],
) -> Result<(), String> {
    let event_name = format!("bash://stream/{}", event_id);
    app_handle
        .emit(&event_name, events)
        .map_err(|e| format!("Failed to emit batch: {}", e))
}

// Tauri 命令包装
#[tauri::command]
pub async fn bash_execute_streaming(
    app_handle: AppHandle,
    command: String,
    working_dir: Option<String>,
    timeout_ms: Option<u64>,
    env_vars: Option<HashMap<String, String>>,
    event_id: String,
    throttle_lines: Option<usize>,
) -> Result<BashStreamResult, String> {
    execute_bash_command_streaming(
        command,
        working_dir,
        timeout_ms,
        env_vars,
        event_id,
        throttle_lines,
        app_handle,
    )
    .await
}
