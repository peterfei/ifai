use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{async_runtime, command, AppHandle, Emitter, Manager};

pub struct TerminalSession {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
}

// Store PTY sessions
type PtySessions = Arc<Mutex<HashMap<u32, TerminalSession>>>;

pub struct TerminalManager {
    pty_sessions: PtySessions,
    pty_system: NativePtySystem,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            pty_sessions: Arc::new(Mutex::new(HashMap::new())),
            pty_system: NativePtySystem::default(),
        }
    }
}

// Global PTY counter for unique IDs
static NEXT_PTY_ID: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

#[command]
pub async fn create_pty(
    app_handle: AppHandle,
    manager: tauri::State<'_, TerminalManager>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<u32, String> {
    let pty_id = NEXT_PTY_ID.fetch_add(1, std::sync::atomic::Ordering::SeqCst);

    // Default shell
    #[cfg(target_os = "windows")]
    let program = "powershell.exe";
    #[cfg(not(target_os = "windows"))]
    let program = "bash";

    let mut command = CommandBuilder::new(program);

    if let Some(dir) = cwd {
        command.cwd(PathBuf::from(dir));
    } else {
        // Fallback to app data dir or home dir
        if let Ok(path) = app_handle.path().app_data_dir() {
            command.cwd(path);
        }
    }

    let pty_pair = manager
        .pty_system
        .openpty(PtySize {
            cols,
            rows,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // Need to spawn the command on the slave side
    let mut child = pty_pair
        .slave
        .spawn_command(command)
        .map_err(|e| e.to_string())?;

    // We can only take the reader/writer once from the pair if they consume ownership,
    // but PtyPair usually gives us access.
    // portable-pty MasterPty has try_clone_reader and take_writer.

    let mut reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;
    let writer = pty_pair.master.take_writer().map_err(|e| e.to_string())?;

    let event_name = format!("pty-output-{}", pty_id);

    // Spawn a thread to read PTY output and emit to frontend
    async_runtime::spawn(async move {
        let mut buf = [0; 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF, child process exited
                    let _ = app_handle.emit(&format!("pty-exit-{}", pty_id), pty_id);
                    break;
                }
                Ok(bytes_read) => {
                    let output = String::from_utf8_lossy(&buf[..bytes_read]);
                    let _ = app_handle.emit(&event_name, output.to_string());
                }
                Err(e) => {
                    // Error reading from PTY, child process might have exited
                    eprintln!("Error reading from PTY: {}", e);
                    let _ = app_handle.emit(&format!("pty-error-{}", pty_id), e.to_string());
                    break;
                }
            }
        }
        let _ = child.wait(); // Wait for child to ensure resources are cleaned
    });

    manager.pty_sessions.lock().unwrap().insert(
        pty_id,
        TerminalSession {
            master: pty_pair.master,
            writer,
        },
    );

    Ok(pty_id)
}

#[command]
pub async fn write_pty(
    manager: tauri::State<'_, TerminalManager>,
    pty_id: u32,
    data: String,
) -> Result<(), String> {
    let mut sessions = manager.pty_sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&pty_id) {
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("PTY session {} not found", pty_id))
    }
}

#[command]
pub async fn resize_pty(
    manager: tauri::State<'_, TerminalManager>,
    pty_id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut sessions = manager.pty_sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&pty_id) {
        session
            .master
            .resize(PtySize {
                cols,
                rows,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("PTY session {} not found", pty_id))
    }
}

#[command]
pub async fn kill_pty(
    manager: tauri::State<'_, TerminalManager>,
    pty_id: u32,
) -> Result<(), String> {
    let mut sessions = manager.pty_sessions.lock().unwrap();
    if let Some(session) = sessions.remove(&pty_id) {
        // Drop session (master + writer), which signals child to exit
        drop(session);
        Ok(())
    } else {
        Err(format!("PTY session {} not found", pty_id))
    }
}
