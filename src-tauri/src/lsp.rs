use std::collections::HashMap;
use std::process::Stdio;
use std::str;
use std::sync::Arc;
use tauri::{command, AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, Command};
use tokio::sync::Mutex;

// Manage multiple LSP sessions
pub struct LspManager {
    // Map language_id -> Child Process Stdin
    // We only keep stdin to write. Stdout is consumed by a background task.
    // Use tokio::sync::Mutex for async compatibility
    processes: Arc<Mutex<HashMap<String, ChildStdin>>>,
}

impl LspManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[command]
pub async fn start_lsp(
    app: AppHandle,
    state: State<'_, LspManager>,
    language_id: String,
    cmd: String,
    args: Vec<String>,
) -> Result<(), String> {
    println!("Starting LSP for {}: {} {:?}", language_id, cmd, args);

    let mut child = Command::new(cmd)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped()) // Capture stderr for debugging
        .spawn()
        .map_err(|e| format!("Failed to spawn LSP: {}", e))?;

    let stdin = child.stdin.take().ok_or("Failed to open stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    state
        .processes
        .lock()
        .await
        .insert(language_id.clone(), stdin);

    // Spawn stdout reader
    let app_handle = app.clone();
    let lang_id = language_id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut buffer = Vec::new();
        let mut content_length: Option<usize> = None;

        // Simple state machine for LSP header parsing
        // This is a simplified implementation. Production should handle buffer more robustly.
        loop {
            let mut chunk = [0; 1024];
            match reader.read(&mut chunk).await {
                Ok(0) => break, // EOF
                Ok(n) => {
                    buffer.extend_from_slice(&chunk[..n]);

                    // Process buffer
                    loop {
                        if let Some(len) = content_length {
                            // We are waiting for body
                            if buffer.len() >= len {
                                // Extract body
                                let body_bytes: Vec<u8> = buffer.drain(0..len).collect();
                                if let Ok(msg) = str::from_utf8(&body_bytes) {
                                    // println!("LSP < {}: {}", lang_id, msg); // Verbose log
                                    app_handle
                                        .emit(&format!("lsp-msg-{}", lang_id), msg)
                                        .unwrap_or(());
                                }
                                content_length = None;
                            } else {
                                break; // Not enough data
                            }
                        } else {
                            // We are looking for headers (ended by \r\n\r\n)
                            // Find double CRLF
                            if let Some(pos) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
                                let header_bytes: Vec<u8> = buffer.drain(0..pos + 4).collect();
                                let header_str = String::from_utf8_lossy(&header_bytes);

                                // Parse Content-Length
                                for line in header_str.lines() {
                                    if line.to_lowercase().starts_with("content-length:") {
                                        if let Some(val) = line.split(':').nth(1) {
                                            if let Ok(len) = val.trim().parse::<usize>() {
                                                content_length = Some(len);
                                            }
                                        }
                                    }
                                }

                                if content_length.is_none() {
                                    // Header without Content-Length? Invalid or unknown.
                                    println!("LSP Error: Missing Content-Length in header");
                                    // Drop buffer to avoid loop? Or keep trying?
                                    // For robustness, maybe just continue, but we might get stuck.
                                }
                            } else {
                                break; // Header incomplete
                            }
                        }
                    }
                }
                Err(e) => {
                    println!("LSP Stdout Error: {}", e);
                    break;
                }
            }
        }
        println!("LSP {} stdout closed", lang_id);
    });

    // Spawn stderr reader (for logging)
    let lang_id_err = language_id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(_) => {
                    println!("LSP ERR [{}]: {}", lang_id_err, line.trim());
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}

#[command]
pub async fn send_lsp_message(
    state: State<'_, LspManager>,
    language_id: String,
    message: String,
) -> Result<(), String> {
    let mut processes = state.processes.lock().await;
    if let Some(stdin) = processes.get_mut(&language_id) {
        // Format LSP message: Header + Body
        let content = message.as_bytes();
        let header = format!("Content-Length: {}\r\n\r\n", content.len());

        // println!("LSP > {}: {}", language_id, message); // Verbose log

        stdin
            .write_all(header.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        stdin.write_all(content).await.map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())?;

        Ok(())
    } else {
        Err(format!("No LSP running for {}", language_id))
    }
}

#[command]
pub async fn kill_lsp(state: State<'_, LspManager>, language_id: String) -> Result<(), String> {
    let mut processes = state.processes.lock().await;
    if let Some(stdin) = processes.remove(&language_id) {
        drop(stdin); // Close stdin
        Ok(())
    } else {
        Ok(()) // Already dead
    }
}
