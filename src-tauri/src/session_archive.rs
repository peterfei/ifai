//! 会话归档（冷记忆存储）
//!
//! 共享模块，TUI 和 GUI 共用。
//! 将会话摘要保存到 `~/.ifai/sessions/` 目录。

use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};

/// 会话归档器
pub struct SessionArchiver {
    sessions_dir: PathBuf,
}

impl SessionArchiver {
    /// 创建归档器（自动创建目录）
    pub fn new() -> Result<Self, String> {
        let home = std::env::var("HOME")
            .map_err(|_| "Could not determine HOME directory".to_string())?;
        let sessions_dir = PathBuf::from(home).join(".ifai").join("sessions");
        fs::create_dir_all(&sessions_dir)
            .map_err(|e| format!("Failed to create sessions directory: {}", e))?;
        Ok(Self { sessions_dir })
    }

    /// 保存会话摘要为 Markdown
    ///
    /// 参数均为简单类型，不依赖任何特定的 Message struct。
    pub fn save_session_summary(
        &self,
        provider: &str,
        model: &str,
        input_tokens: u32,
        output_tokens: u32,
        conversation_pairs: &[(/*role*/ &str, /*text*/ &str)],
    ) -> Result<PathBuf, String> {
        let now = Utc::now();
        let date_str = now.format("%Y-%m-%d").to_string();
        let timestamp_ns = now.timestamp_nanos_opt().unwrap_or(0);
        let process_id = std::process::id();
        let unique_id = format!("{:x}{:x}", timestamp_ns.abs(), process_id);
        let short_id = &unique_id[..unique_id.len().min(10)];
        let filename = format!("{}-{}.md", date_str, short_id);
        let filepath = self.sessions_dir.join(&filename);

        let mut md = String::new();
        md.push_str("# Session Summary\n\n");
        md.push_str(&format!(
            "**Date**: {}\n",
            now.format("%Y-%m-%d %H:%M:%S UTC")
        ));
        md.push_str(&format!("**Model**: {}/{}\n", provider, model));
        md.push_str(&format!(
            "**Tokens**: {} input + {} output = {} total\n\n",
            input_tokens,
            output_tokens,
            input_tokens + output_tokens
        ));
        md.push_str("## Conversation\n\n");

        for (role, text) in conversation_pairs {
            match *role {
                "user" => md.push_str("### 👤 User\n\n"),
                "assistant" => md.push_str("### 🤖 Assistant\n\n"),
                _ => continue,
            }
            let truncated = if text.len() > 500 {
                let mut end = 500;
                while !text.is_char_boundary(end) && end > 0 {
                    end -= 1;
                }
                format!("{}...\n\n*[truncated]*", &text[..end])
            } else {
                text.to_string()
            };
            md.push_str(&truncated);
            md.push_str("\n\n");
        }

        md.push_str("---\n\n*Auto-generated session archive.*\n");

        fs::write(&filepath, md)
            .map_err(|e| format!("Failed to write session summary: {}", e))?;
        Ok(filepath)
    }
}

/// 从对话中提取用户消息作为摘要文本（供记忆提取使用）
///
/// 接受 `&(role: &str, text: &str)` pairs，返回拼接的用户消息文本。
pub fn build_user_summary(conversation_pairs: &[(/*role*/ &str, /*text*/ &str)]) -> String {
    conversation_pairs
        .iter()
        .filter(|(role, _)| *role == "user")
        .map(|(_, text)| *text)
        .collect::<Vec<_>>()
        .join("\n")
}
