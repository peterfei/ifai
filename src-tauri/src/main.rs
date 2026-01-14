// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::panic;
use std::fs::OpenOptions;
use std::io::Write;
use chrono::Local;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
fn main() {
    // 🛡️ 设置全局 Panic 钩子，捕获崩溃日志
    panic::set_hook(Box::new(|panic_info| {
        let now = Local::now().format("%Y-%m-%d %H:%M:%S");
        let msg = match panic_info.payload().downcast_ref::<&str>() {
            Some(s) => *s,
            None => match panic_info.payload().downcast_ref::<String>() {
                Some(s) => &s[..],
                None => "Box<Any>",
            },
        };
        
        let location = if let Some(loc) = panic_info.location() {
            format!("at {}:{}", loc.file(), loc.line())
        } else {
            "at unknown location".to_string()
        };

        let log_msg = format!("[{}] CRASH: {} {}\n", now, msg, location);
        
        // 尝试写入本地 crash.log
        if let Some(mut log_dir) = dirs::data_local_dir() {
            log_dir.push("com.ifai.editor");
            let _ = std::fs::create_dir_all(&log_dir);
            log_dir.push("crash.log");
            
            if let Ok(mut file) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_dir)
            {
                let _ = file.write_all(log_msg.as_bytes());
            }
        }
        
        // 同时在标准错误输出打印
        eprintln!("{}", log_msg);
    }));

    ifainew_lib::run();
}
