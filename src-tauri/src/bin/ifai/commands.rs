//! Declarative Command Registry
//!
//! 🏛️ 元编程：spec 即 handler，单一数据源驱动所有功能
//!
//! CommandSpec 静态数组同时驱动：
//! - 命令发现和补全
//! - 帮助生成
//! - Dispatch 路由
//! - 权限检查

use super::render::RESET;
use super::session::Session;

// ============================================================================
// Types
// ============================================================================

/// 命令执行结果
pub type CommandResult = Result<Option<String>, String>;

/// 🔥 命令 Handler 函数指针类型（支持 Session 访问）
pub type Handler = fn(&mut Session, Option<&str>) -> CommandResult;

/// 权限级别（预留接口）
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum PermissionMode {
    /// 无限制
    None = 0,
    /// 需要配置
    Config = 1,
    /// 需要认证
    Auth = 2,
    /// 管理员
    Admin = 3,
}

/// 命令规格（spec + handler 合一）
pub struct CommandSpec {
    /// 命令名称（不带 / 前缀）
    pub name: &'static str,
    /// 简短描述
    pub summary: &'static str,
    /// 参数提示（可选）
    pub arg_hint: Option<&'static str>,
    /// 最低权限要求
    pub min_permission: PermissionMode,
    /// Handler 函数指针（spec 的核心 - spec 即 handler）
    pub handler: Handler,
}

// ============================================================================
// Command Registry (Static Array - Single Source of Truth)
// ============================================================================

/// 🏛️ 元编程：静态命令注册表（单一数据源，驱动弹出框过滤/帮助生成/dispatch）
/// 所有命令定义在此，新增命令只需添加一个条目
pub const COMMAND_SPECS: &[CommandSpec] = &[
    CommandSpec {
        name: "help",
        summary: "显示帮助信息",
        arg_hint: None,
        min_permission: PermissionMode::None,
        handler: cmd_help,
    },
    CommandSpec {
        name: "clear",
        summary: "清空对话历史",
        arg_hint: None,
        min_permission: PermissionMode::None,
        handler: cmd_clear,
    },
    CommandSpec {
        name: "compact",
        summary: "压缩对话历史（自动摘要）",
        arg_hint: None,
        min_permission: PermissionMode::Config,
        handler: cmd_compact,
    },
    CommandSpec {
        name: "cost",
        summary: "显示 token 使用和成本统计",
        arg_hint: None,
        min_permission: PermissionMode::Config,
        handler: cmd_cost,
    },
    CommandSpec {
        name: "provider",
        summary: "切换或显示当前 AI 提供商",
        arg_hint: Some("[name]"),
        min_permission: PermissionMode::Config,
        handler: cmd_provider,
    },
    CommandSpec {
        name: "model",
        summary: "切换或显示当前模型",
        arg_hint: Some("[name]"),
        min_permission: PermissionMode::Config,
        handler: cmd_model,
    },
    CommandSpec {
        name: "permissions",
        summary: "显示当前权限级别",
        arg_hint: None,
        min_permission: PermissionMode::None,
        handler: cmd_permissions,
    },
    CommandSpec {
        name: "save",
        summary: "保存当前会话",
        arg_hint: Some("<name>"),
        min_permission: PermissionMode::Config,
        handler: cmd_save,
    },
    CommandSpec {
        name: "resume",
        summary: "恢复或列出已保存的会话",
        arg_hint: Some("[<name> | list]"),
        min_permission: PermissionMode::Config,
        handler: cmd_resume,
    },
    CommandSpec {
        name: "export",
        summary: "导出对话历史为 Markdown",
        arg_hint: Some("<file>"),
        min_permission: PermissionMode::Config,
        handler: cmd_export,
    },
    CommandSpec {
        name: "undo",
        summary: "撤销上一轮对话",
        arg_hint: None,
        min_permission: PermissionMode::None,
        handler: cmd_undo,
    },
    CommandSpec {
        name: "config",
        summary: "显示或初始化配置",
        arg_hint: Some("[init|show]"),
        min_permission: PermissionMode::Config,
        handler: cmd_config,
    },
    CommandSpec {
        name: "exit",
        summary: "退出交互模式",
        arg_hint: None,
        min_permission: PermissionMode::None,
        handler: cmd_exit,
    },
    CommandSpec {
        name: "status",
        summary: "显示会话状态统计",
        arg_hint: None,
        min_permission: PermissionMode::None,
        handler: cmd_status,
    },
    CommandSpec {
        name: "view",
        summary: "切换备用屏幕视图（固定底部状态栏）",
        arg_hint: None,
        min_permission: PermissionMode::None,
        handler: cmd_view,
    },
    CommandSpec {
        name: "glob",
        summary: "智能文件搜索（自动防止上下文爆炸）",
        arg_hint: Some("<pattern>"),
        min_permission: PermissionMode::None,
        handler: cmd_glob,
    },
    CommandSpec {
        name: "task",
        summary: "显示当前任务列表",
        arg_hint: Some("[clear]"),
        min_permission: PermissionMode::None,
        handler: cmd_task,
    },
    CommandSpec {
        name: "thread",
        summary: "线程管理（创建/列表/切换/关闭/重命名）",
        arg_hint: Some("[list|switch <N>|close|rename <name>]"),
        min_permission: PermissionMode::None,
        handler: cmd_thread_stub,
    },
    CommandSpec {
        name: "workflow",
        summary: "执行工作流（YAML）",
        arg_hint: Some("[run <模板名|file.yaml>|templates]"),
        min_permission: PermissionMode::None,
        handler: cmd_workflow,
    },
    CommandSpec {
        name: "agent",
        summary: "启动专用智能体",
        arg_hint: Some("<explore|review|refactor|test|doc> <task>"),
        min_permission: PermissionMode::None,
        handler: cmd_agent,
    },
    CommandSpec {
        name: "note",
        summary: "查看/导出会话笔记",
        arg_hint: Some("[export]"),
        min_permission: PermissionMode::None,
        handler: cmd_note,
    },
    CommandSpec {
        name: "cleanup-sessions",
        summary: "清理过期快照和归档日志",
        arg_hint: None,
        min_permission: PermissionMode::None,
        handler: cmd_cleanup_sessions,
    },
];

// ============================================================================
// Command Dispatch
// ============================================================================

/// 从名称查找命令 spec
pub fn find_command(name: &str) -> Option<&'static CommandSpec> {
    COMMAND_SPECS.iter().find(|spec| spec.name == name)
}

/// 🔥 Dispatch 命令到 handler（支持 Session 参数）
pub fn dispatch_command(session: &mut Session, name: &str, arg: Option<&str>) -> CommandResult {
    let spec = find_command(name).ok_or_else(|| unknown_command_error(name))?;

    // 权限检查（预留接口，当前总是通过）
    // TODO: 集成 permission 系统

    // 调用 handler（spec 的核心 - spec 即 handler）
    (spec.handler)(session, arg)
}

/// 生成未知命令错误消息（包含建议）
fn unknown_command_error(name: &str) -> String {
    let suggestions: Vec<_> = COMMAND_SPECS.iter().map(|s| s.name).collect();

    format!(
        "unknown command: /{}. Available: {}",
        name,
        suggestions.join(", ")
    )
}

/// 生成帮助文本（从 COMMAND_SPECS 自动生成）
pub fn render_help() -> String {
    let mut help = String::from("可用命令：\n\n");

    for spec in COMMAND_SPECS {
        help.push_str(&format!("  /{}", spec.name));

        if let Some(hint) = spec.arg_hint {
            help.push_str(&format!(" {}", hint));
        }

        help.push_str(&format!(" - {}\n", spec.summary));
    }

    help.push_str("\n使用 /help <command> 查看详细帮助\n");
    help
}

// ============================================================================
// Command Handlers (Placeholder Implementations)
// ============================================================================

fn cmd_help(_session: &mut Session, _arg: Option<&str>) -> CommandResult {
    Ok(Some(render_help()))
}

fn cmd_clear(_session: &mut Session, _arg: Option<&str>) -> CommandResult {
    Ok(Some("✅ 对话历史已清空".to_string()))
}

fn cmd_compact(session: &mut Session, _arg: Option<&str>) -> CommandResult {
    use super::render::{default_theme, RESET};
    use super::session::perform_compaction_fallback;

    let theme = default_theme();

    // 模型感知阈值检查
    let threshold = super::token::display::compute_compress_threshold(&session.model);
    let current_tokens = super::token::estimate_tokens(&session.default_ctx.messages);

    // 🔥 检查是否需要压缩（使用 token 阈值或消息数检查）
    let keep_last_n = 30; // Manual 模式保留 30 条
    if session.default_ctx.messages.len() <= keep_last_n + 2 && current_tokens < threshold {
        return Ok(Some(format!(
            "{}对话无需压缩（{} 条消息 < {} 条阈值，{} tokens < {} tokens 阈值）。使用 /clear 清空所有对话。{}",
            theme.muted,
            session.default_ctx.messages.len(),
            keep_last_n + 2,
            current_tokens,
            threshold,
            RESET
        )));
    }

    let before_count = session.default_ctx.messages.len();
    let before_tokens = current_tokens;

    println!("{}🔄 压缩对话...{}", theme.heading, RESET);
    println!(
        "{}压缩前：{} 条消息，约 {} tokens{}",
        theme.muted, before_count, before_tokens, RESET
    );

    // 🔥 使用统一压缩入口的 fallback 版本（同步）
    // Manual 模式保留 30 条消息
    let system_prompt = ""; // /compact 不使用 system_prompt
    session.default_ctx.messages =
        perform_compaction_fallback(&session.default_ctx.messages, system_prompt, keep_last_n);

    let after_count = session.default_ctx.messages.len();
    let after_tokens = super::token::estimate_tokens(&session.default_ctx.messages);

    println!(
        "{}压缩后：{} 条消息，约 {} tokens{}",
        theme.success, after_count, after_tokens, RESET
    );
    println!(
        "{}减少了：{} 条消息，约 {} tokens{}",
        theme.brand,
        before_count - after_count,
        before_tokens.saturating_sub(after_tokens),
        RESET
    );

    Ok(Some(format!(
        "{}✓ 对话已压缩（保留最近 {} 条消息）{}",
        theme.success, keep_last_n, RESET
    )))
}

/// 🔥 显示 token 使用和成本统计（复用 GUI 端定价数据）
fn cmd_cost(session: &mut Session, _arg: Option<&str>) -> CommandResult {
    use super::render::{default_theme, RESET};
    use super::token;

    let theme = default_theme();

    // 🔥 使用 token display 模块格式化输出（包含进度条）
    let cost_display = if session.default_ctx.cumulative_input_tokens == 0
        && session.default_ctx.cumulative_output_tokens == 0
    {
        format!("{}No token usage recorded yet.{}", theme.muted, RESET)
    } else {
        // 🔥 显示成本 + Token 进度条
        let cost_line = token::format_cost(
            &session.default_ctx.messages,
            &session.model,
            session.default_ctx.cumulative_input_tokens,
            session.default_ctx.cumulative_output_tokens,
            &theme,
        );

        let token_warning =
            token::format_token_warning(&session.default_ctx.messages, &session.model, &theme);

        format!("{}\n{}", cost_line, token_warning)
    };

    Ok(Some(cost_display))
}

fn cmd_provider(_session: &mut Session, arg: Option<&str>) -> CommandResult {
    match arg {
        Some(name) => {
            // 验证 provider 是否存在
            crate::provider::resolve_provider(name)?;
            Ok(Some(format!("✅ Provider 切换为: {}", name)))
        }
        None => Ok(Some("当前 Provider: deepseek".to_string())),
    }
}

fn cmd_model(session: &mut Session, arg: Option<&str>) -> CommandResult {
    match arg {
        Some(name) => Ok(Some(format!("✅ Model 切换为: {}", name))),
        None => Ok(Some("当前 Model: deepseek-chat".to_string())),
    }
}

fn cmd_permissions(_session: &mut Session, _arg: Option<&str>) -> CommandResult {
    Ok(Some("当前权限: None (无限制)".to_string()))
}

/// 🔥 保存当前会话
fn cmd_save(session: &mut Session, arg: Option<&str>) -> CommandResult {
    use super::persistence::{SessionPersistence, SessionSnapshot};
    use super::render::{default_theme, RESET};

    let name = arg.ok_or("用法: /save <name>".to_string())?;

    let theme = default_theme();

    // 🔥 创建会话快照
    let snapshot = SessionSnapshot {
        version: 1,
        name: name.to_string(),
        saved_at: chrono::Utc::now().to_rfc3339(),
        provider: session.provider.clone(),
        model: session.model.clone(),
        messages: session.default_ctx.messages.clone(),
        cumulative_input_tokens: session.default_ctx.cumulative_input_tokens,
        cumulative_output_tokens: session.default_ctx.cumulative_output_tokens,
    };

    // 🔥 保存会话
    let persistence = SessionPersistence::new()
        .map_err(|e| format!("Failed to initialize persistence: {}", e))?;

    let filepath = persistence
        .save_session(name, snapshot)
        .map_err(|e| format!("Failed to save session: {}", e))?;

    Ok(Some(format!(
        "{}✓ 会话已保存到：{}{} ({} 条消息)",
        theme.success,
        filepath.display(),
        RESET,
        session.default_ctx.messages.len()
    )))
}

fn cmd_resume(session: &mut Session, arg: Option<&str>) -> CommandResult {
    use super::persistence::{SessionPersistence, SessionSnapshot};
    use super::render::{default_theme, RESET};

    let theme = default_theme();

    match arg {
        Some("list") | None => {
            // 🔥 Phase 5.1: 无参数时默认列出所有会话（符合 CLI 惯例）
            let mut output = format!(
                "{}📋 可恢复的会话{}{}\n",
                theme.heading,
                RESET,
                RESET
            );

            // 1. 手动保存的会话
            if let Ok(manual_sessions) = list_saved_sessions() {
                if !manual_sessions.is_empty() {
                    output.push_str(&format!(
                        "\n{}手动保存（{}）：{}\n",
                        theme.brand,
                        manual_sessions.len(),
                        RESET
                    ));
                    for (i, meta) in manual_sessions.iter().enumerate() {
                        output.push_str(&format!(
                            "  {}. {}{}{} - {} 条消息 - {} - {}{}{}\n",
                            i + 1,
                            theme.brand,
                            meta.name,
                            RESET,
                            meta.message_count,
                            meta.model,
                            RESET,
                            format_time_ago(meta.saved_at.clone()),
                            RESET
                        ));
                    }
                }
            }

            // 2. 自动快照
            if let Ok(auto_snapshots) = list_auto_snapshots() {
                if !auto_snapshots.is_empty() {
                    output.push_str(&format!(
                        "\n{}[auto] 自动快照（{}）：{}\n",
                        theme.brand,
                        auto_snapshots.len(),
                        RESET
                    ));
                    for (i, snapshot) in auto_snapshots.iter().enumerate() {
                        let time_ago = format_timestamp_secs(snapshot.timestamp);
                        output.push_str(&format!(
                            "  {}. {}[auto]{} {} - {} 条消息 - {}{}{}\n",
                            i + 1,
                            theme.muted,
                            RESET,
                            snapshot.session_id,
                            snapshot.message_count,
                            RESET,
                            time_ago,
                            RESET
                        ));
                    }
                }
            }

            // 3. 增量日志
            if let Ok(live_sessions) = list_live_sessions() {
                if !live_sessions.is_empty() {
                    output.push_str(&format!(
                        "\n{}[live] 增量日志（{}）：{}\n",
                        theme.brand,
                        live_sessions.len(),
                        RESET
                    ));
                    for (i, session_id) in live_sessions.iter().enumerate() {
                        output.push_str(&format!(
                            "  {}. {}[live]{} {} - 使用 /resume {} 恢复{}{}\n",
                            i + 1,
                            theme.success,
                            RESET,
                            session_id,
                            session_id,
                            RESET,
                            RESET
                        ));
                    }
                }
            }

            if output.ends_with("\n\n") {
                output.push_str(&format!(
                    "{}未找到可恢复的会话。开始新对话将自动创建增量日志。{}",
                    theme.muted, RESET
                ));
            }

            Ok(Some(output))
        }
        Some(name) => {
            // 🔥 Phase 5.1.4: 支持从增量日志恢复
            if name.starts_with("session-") || name.starts_with("live-") {
                return resume_from_live_session(session, name);
            }

            // 从手动保存的会话恢复
            let persistence = SessionPersistence::new()
                .map_err(|e| format!("Failed to initialize persistence: {}", e))?;

            let snapshot = persistence
                .load_session(name)
                .map_err(|e| format!("Failed to load session '{}': {}", name, e))?;

            session.default_ctx.messages = snapshot.messages;
            session.provider = snapshot.provider;
            session.model = snapshot.model;
            session.default_ctx.cumulative_input_tokens = snapshot.cumulative_input_tokens;
            session.default_ctx.cumulative_output_tokens = snapshot.cumulative_output_tokens;

            Ok(Some(format!(
                "{}✓ 会话已恢复：{}{}（{} 条消息）",
                theme.success,
                name,
                RESET,
                session.default_ctx.messages.len()
            )))
        }
    }
}

/// 🔥 格式化时间差（如 "5分钟前"）
fn format_time_ago(timestamp: String) -> String {
    // 解析 RFC3339 格式的时间戳
    let saved_at = chrono::DateTime::parse_from_rfc3339(&timestamp)
        .map_err(|_| "Invalid timestamp format".to_string())
        .unwrap();

    let now = chrono::Utc::now();
    let duration = now.signed_duration_since(saved_at);

    if duration.num_seconds() < 60 {
        format!("{}秒前", duration.num_seconds())
    } else if duration.num_minutes() < 60 {
        format!("{}分钟前", duration.num_minutes())
    } else if duration.num_hours() < 24 {
        format!("{}小时前", duration.num_hours())
    } else if duration.num_days() < 7 {
        format!("{}天前", duration.num_days())
    } else {
        format!("{}", saved_at.format("%Y-%m-%d"))
    }
}

/// 🔥 Phase 5: 格式化 Unix 时间戳（秒）
fn format_timestamp_secs(timestamp: u64) -> String {
    let now = chrono::Utc::now().timestamp() as u64;
    let diff = now.saturating_sub(timestamp);

    if diff < 60 {
        format!("{}秒前", diff)
    } else if diff < 3600 {
        format!("{}分钟前", diff / 60)
    } else if diff < 86400 {
        format!("{}小时前", diff / 3600)
    } else if diff < 604800 {
        format!("{}天前", diff / 86400)
    } else {
        // 格式化为日期
        let datetime = chrono::DateTime::from_timestamp(timestamp as i64, 0)
            .unwrap_or_else(|| chrono::Utc::now());
        format!("{}", datetime.format("%Y-%m-%d"))
    }
}

/// 🔥 Phase 5.1: 列出手动保存的会话
fn list_saved_sessions() -> Result<Vec<crate::persistence::SessionMetadata>, String> {
    use crate::persistence::SessionPersistence;
    SessionPersistence::new()
        .and_then(|p| p.list_sessions())
        .map_err(|e| format!("Failed to list sessions: {}", e))
}

/// 🔥 Phase 5.1: 列出自动快照
fn list_auto_snapshots() -> Result<Vec<crate::session_snapshot::SessionSnapshot>, String> {
    use std::fs;
    use std::path::PathBuf;

    let snapshots_dir = dirs::home_dir()
        .map(|home| home.join(".ifai").join("sessions").join("auto"))
        .unwrap_or_else(|| PathBuf::from("/tmp/ifai/sessions/auto"));

    if !snapshots_dir.exists() {
        return Ok(Vec::new());
    }

    let mut snapshots = Vec::new();

    for entry in fs::read_dir(&snapshots_dir)
        .map_err(|e| format!("Failed to read snapshots directory: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            // 读取快照文件
            let content = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read snapshot file: {}", e))?;

            // 解析 JSON
            let value: serde_json::Value = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse snapshot JSON: {}", e))?;

            // 转换为 SessionSnapshot
            let snapshot = crate::session_snapshot::SessionSnapshot::from_json_value(value)
                .map_err(|e| format!("Failed to parse snapshot: {}", e))?;

            snapshots.push(snapshot);
        }
    }

    // 按时间戳降序排序
    snapshots.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    Ok(snapshots)
}

/// 🔥 Phase 5.1: 列出增量日志会话
fn list_live_sessions() -> Result<Vec<String>, String> {
    use std::fs;
    use std::path::PathBuf;

    let live_dir = dirs::home_dir()
        .map(|home| home.join(".ifai").join("sessions").join("live"))
        .unwrap_or_else(|| PathBuf::from("/tmp/ifai/sessions/live"));

    if !live_dir.exists() {
        return Ok(Vec::new());
    }

    let mut sessions = Vec::new();

    for entry in fs::read_dir(&live_dir)
        .map_err(|e| format!("Failed to read live directory: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
            if let Some(file_name) = path.file_stem().and_then(|s| s.to_str()) {
                sessions.push(file_name.to_string());
            }
        }
    }

    sessions.sort();
    sessions.reverse(); // 最新的在前

    Ok(sessions)
}

/// 🔥 Phase 5.2: 收集所有可恢复的会话条目（用于 ResumePicker）
pub fn collect_resume_entries() -> Vec<crate::resume_picker::ResumeEntry> {
    let mut entries = Vec::new();

    // 手动保存的会话
    if let Ok(saved) = list_saved_sessions() {
        for meta in saved {
            // saved_at 是 RFC3339 格式，直接使用
            let time_ago = meta.saved_at.clone();
            entries.push(crate::resume_picker::ResumeEntry::Saved {
                name: meta.name.clone(),
                message_count: meta.message_count,
                model: meta.model.clone(),
                time_ago,
            });
        }
    }

    // 自动快照
    if let Ok(snapshots) = list_auto_snapshots() {
        for snap in snapshots {
            let session_id = snap.session_id.clone();
            entries.push(crate::resume_picker::ResumeEntry::Auto {
                session_id,
                message_count: snap.messages.len(),
                time_ago: format_timestamp_secs(snap.timestamp),
            });
        }
    }

    // 增量日志
    if let Ok(live_ids) = list_live_sessions() {
        for id in live_ids {
            entries.push(crate::resume_picker::ResumeEntry::Live {
                session_id: id,
            });
        }
    }

    entries
}

/// 🔥 Phase 5.1.4: 从增量日志恢复会话
fn resume_from_live_session(session: &mut Session, session_id: &str) -> CommandResult {
    use crate::render::{default_theme, RESET};
    use std::fs;
    use std::path::PathBuf;

    let theme = default_theme();

    let live_dir = dirs::home_dir()
        .map(|home| home.join(".ifai").join("sessions").join("live"))
        .unwrap_or_else(|| PathBuf::from("/tmp/ifai/sessions/live"));

    let jsonl_path = live_dir.join(format!("{}.jsonl", session_id));

    if !jsonl_path.exists() {
        return Ok(Some(format!(
            "{}❌ 未找到增量日志：{}{}",
            theme.error, session_id, RESET
        )));
    }

    // 读取增量日志
    let content = fs::read_to_string(&jsonl_path)
        .map_err(|e| format!("Failed to read live session: {}", e))?;

    // 解析事件
    let mut events = Vec::new();
    for line in content.lines() {
        if let Ok(event) = serde_json::from_str::<crate::session_event::SessionEvent>(line) {
            events.push(event);
        }
    }

    if events.is_empty() {
        return Ok(Some(format!(
            "{}⚠️  增量日志为空：{}{}",
            theme.warning, session_id, RESET
        )));
    }

    // 🔥 Phase 5.1.5: 从事件重构会话
    let snapshot = crate::session_snapshot::SessionSnapshot::from_events(
        session_id.to_string(),
        &events,
    );

    // 转换为 Session 格式
    use ifainew_lib::harness::api::types::{Message, MessageContent, MessageRole};

    let messages: Vec<Message> = snapshot
        .messages
        .into_iter()
        .map(|msg| {
            let role = match msg.role.as_str() {
                "user" => MessageRole::User,
                "assistant" => MessageRole::Assistant,
                "system" => MessageRole::System,
                "tool" => MessageRole::Tool,
                _ => MessageRole::User,
            };

            let tool_calls = if let Some(calls) = msg.tool_calls {
                let calls: Vec<ifainew_lib::harness::api::types::ToolCall> = calls
                    .into_iter()
                    .map(|tc| ifainew_lib::harness::api::types::ToolCall {
                        id: tc.id,
                        call_type: tc.call_type,
                        function: ifainew_lib::harness::api::types::ToolCallFunction {
                            name: tc.function.name,
                            arguments: tc.function.arguments,
                        },
                    })
                    .collect();
                Some(calls)
            } else {
                None
            };

            Message {
                role,
                content: MessageContent::Text(msg.content),
                tool_calls,
                tool_call_id: msg.tool_call_id,
            }
        })
        .collect();

    // 恢复会话状态
    session.default_ctx.messages = messages;

    // 🔥 Phase 5.1.4: 构建包含历史消息的输出，让 TUI 显示恢复的内容
    let mut output = format!(
        "{}✓ 会话已恢复：{}{}（{} 条消息，来自增量日志）",
        theme.success,
        session_id,
        RESET,
        session.default_ctx.messages.len()
    );

    // 输出恢复的历史消息（用户和 AI 消息）
    for msg in &session.default_ctx.messages {
        use ifainew_lib::harness::api::types::MessageRole;

        let role_label = match msg.role {
            MessageRole::User => format!("\n{}👤 You{}", theme.brand, RESET),
            MessageRole::Assistant => format!("\n{}🤖 AI{}", theme.success, RESET),
            MessageRole::System | MessageRole::Tool => continue,
        };

        let content = match &msg.content {
            ifainew_lib::harness::api::types::MessageContent::Text(text) => text.clone(),
            _ => continue,
        };

        // 截断过长的消息
        let preview = if content.len() > 500 {
            format!("{}...", &content[..500])
        } else {
            content
        };

        if !preview.trim().is_empty() {
            output.push_str(&format!("{}: {}", role_label, preview));
        }
    }

    Ok(Some(output))
}

fn cmd_export(session: &mut Session, arg: Option<&str>) -> CommandResult {
    use super::render::{default_theme, RESET};

    let theme = default_theme();

    // 检查文件名参数
    let filename = match arg {
        Some(path) if !path.is_empty() => path,
        _ => {
            return Ok(Some(format!(
                "{}Usage: /export <file>{}{}",
                theme.muted, theme.brand, RESET
            )))
        }
    };

    // 🔥 序列化消息为 Markdown 格式
    let mut markdown = String::new();
    markdown.push_str("# Conversation Export\n\n");
    markdown.push_str(&format!("**Provider:** {}\n", session.provider));
    markdown.push_str(&format!("**Model:** {}\n\n", session.model));
    markdown.push_str("---\n\n");

    for message in &session.default_ctx.messages {
        use ifainew_lib::harness::api::types::MessageRole;

        let role_name = match message.role {
            MessageRole::User => "User",
            MessageRole::Assistant => "Assistant",
            MessageRole::System => "System",
            MessageRole::Tool => "Tool",
        };

        markdown.push_str(&format!("## {}\n", role_name));

        // 添加内容
        match &message.content {
            ifainew_lib::harness::api::types::MessageContent::Text(text) => {
                markdown.push_str(text);
                markdown.push('\n');
            }
            ifainew_lib::harness::api::types::MessageContent::MultiModal(parts) => {
                // 多模态内容：显示每个部分
                for part in parts {
                    if part.part_type == "text" {
                        if let Some(text) = &part.text {
                            markdown.push_str(text);
                        }
                    } else if part.part_type == "image_url" {
                        if let Some(img) = &part.image_url {
                            markdown.push_str(&format!("\n[Image: {}]\n", img.url));
                        }
                    }
                }
                markdown.push('\n');
            }
        }

        // 添加工具调用信息
        if let Some(tool_calls) = &message.tool_calls {
            markdown.push_str("\n**Tool Calls:**\n");
            for tool in tool_calls {
                markdown.push_str(&format!(
                    "- `{}`({})\n",
                    tool.function.name, tool.function.arguments
                ));
            }
        }

        markdown.push_str("\n---\n\n");
    }

    // 🔥 写入文件
    std::fs::write(filename, markdown)
        .map_err(|e| format!("Failed to write export file: {}", e))?;

    // 返回成功消息
    Ok(Some(format!(
        "{}✓ Exported {} message{} to {}{}",
        theme.success,
        session.default_ctx.messages.len(),
        if session.default_ctx.messages.len() == 1 {
            ""
        } else {
            "s"
        },
        filename,
        RESET
    )))
}

fn cmd_undo(session: &mut Session, _arg: Option<&str>) -> CommandResult {
    use super::render::{default_theme, RESET};
    use ifainew_lib::harness::api::types::MessageRole;

    let theme = default_theme();

    // 🔥 查找最后一个用户消息的索引
    let last_user_index = session
        .default_ctx
        .messages
        .iter()
        .rposition(|m| matches!(m.role, MessageRole::User));

    match last_user_index {
        None => {
            // 没有用户消息，无法撤销
            Ok(Some(format!(
                "{}No conversation to undo. Start chatting first.{}",
                theme.muted, RESET
            )))
        }
        Some(index) => {
            // 记录删除前的消息数
            let before_count = session.default_ctx.messages.len();

            // 🔥 删除从最后一个用户消息开始的所有消息
            // 这会删除：User + Assistant + Tool（整个轮次）
            session.default_ctx.messages.truncate(index);

            let removed_count = before_count - session.default_ctx.messages.len();

            Ok(Some(format!(
                "{}✓ Removed last turn ({} message{}){}",
                theme.success,
                removed_count,
                if removed_count > 1 { "s" } else { "" },
                RESET
            )))
        }
    }
}

fn cmd_config(_session: &mut Session, arg: Option<&str>) -> CommandResult {
    use super::render::{default_theme, RESET};
    let theme = default_theme();

    match arg {
        Some("init") => {
            match crate::config::init_config_file() {
                Ok(path) => Ok(Some(format!(
                    "{}✅ 配置模板已生成: {}{}",
                    theme.success, path.display(), RESET
                ))),
                Err(e) => Ok(Some(format!(
                    "{}⚠ {}{}", theme.warning, e, RESET
                ))),
            }
        }
        Some("show") | None => {
            let ep_config = crate::config::read_event_persistence_config();
            let mut output = String::new();
            output.push_str(&format!("{}⚙ Configuration{}\n", theme.brand, RESET));
            output.push_str(&format!("  Event Persistence:\n"));
            output.push_str(&format!("    enabled: {}\n", if ep_config.enabled { "true" } else { "false" }));
            output.push_str(&format!("    snapshot_interval_minutes: {}\n", ep_config.snapshot_interval_minutes));
            output.push_str(&format!("    snapshot_event_count: {}\n", ep_config.snapshot_event_count));
            output.push_str(&format!("    max_snapshots: {}", ep_config.max_snapshots));
            Ok(Some(output))
        }
        Some(_) => Ok(Some("用法: /config <init|show>".to_string())),
    }
}

fn cmd_exit(_session: &mut Session, _arg: Option<&str>) -> CommandResult {
    Ok(Some("👋 再见！".to_string()))
}

/// 🔥 显示会话状态统计
fn cmd_status(session: &mut Session, _arg: Option<&str>) -> CommandResult {
    use super::render::{default_theme, RESET};
    use super::token;

    let theme = default_theme();

    // 🔥 统计轮次（用户消息数）
    let user_message_count = session
        .default_ctx
        .messages
        .iter()
        .filter(|m| matches!(m.role, ifainew_lib::harness::api::types::MessageRole::User))
        .count();

    // 🔥 估算总 token 数
    let total_tokens =
        session.default_ctx.cumulative_input_tokens + session.default_ctx.cumulative_output_tokens;

    // 🔥 格式化输出
    let mut output = String::new();

    output.push_str(&format!(
        "{}╭─────────────────────────────────────{}\n",
        theme.table_border, RESET
    ));
    output.push_str(&format!(
        "{}│{} Session Status{}\n",
        theme.table_border, theme.brand, RESET
    ));
    output.push_str(&format!(
        "{}├─────────────────────────────────────{}\n",
        theme.table_border, RESET
    ));

    output.push_str(&format!(
        "{}│{} Provider: {}{}{}\n",
        theme.table_border, RESET, theme.brand, session.provider, RESET
    ));
    output.push_str(&format!(
        "{}│{} Model: {}{}{}\n",
        theme.table_border, RESET, theme.brand, session.model, RESET
    ));
    output.push_str(&format!(
        "{}│{} Messages: {}{}{}\n",
        theme.table_border,
        RESET,
        theme.brand,
        session.default_ctx.messages.len(),
        RESET
    ));
    output.push_str(&format!(
        "{}│{} User Turns: {}{}{}\n",
        theme.table_border, RESET, theme.brand, user_message_count, RESET
    ));

    // Token 统计
    if total_tokens > 0 {
        let token_count = token::estimate_tokens(&session.default_ctx.messages);
        let max_tokens = token::get_model_max_tokens(&session.model);
        let percentage = (token_count * 100 / max_tokens.max(1)) as u32;

        output.push_str(&format!(
            "{}│{} Est. Tokens: {}{} ({}% of {}){}\n",
            theme.table_border, RESET, theme.brand, token_count, percentage, max_tokens, RESET
        ));
        output.push_str(&format!(
            "{}│{} Input: {}{} | Output: {}{}{}\n",
            theme.table_border,
            RESET,
            theme.muted,
            session.default_ctx.cumulative_input_tokens,
            theme.muted,
            session.default_ctx.cumulative_output_tokens,
            RESET
        ));
    } else {
        output.push_str(&format!(
            "{}│{} Tokens: {}No usage recorded{}\n",
            theme.table_border, RESET, theme.muted, RESET
        ));
    }

    output.push_str(&format!(
        "{}╰─────────────────────────────────────{}\n",
        theme.table_border, RESET
    ));

    Ok(Some(output))
}

/// 🔥 切换备用屏幕视图（固定底部状态栏）
fn cmd_view(session: &mut Session, _arg: Option<&str>) -> CommandResult {
    session.toggle_alt_view();
    Ok(Some("✅ 已切换视图".to_string()))
}

/// 🔥 智能 Glob 搜索（元编程架构：防止上下文爆炸）
fn cmd_glob(_session: &mut Session, arg: Option<&str>) -> CommandResult {
    use crate::render::default_theme;
    use crate::smart_glob_summary::SmartGlob;
    use std::env;

    // 默认搜索当前目录
    let pattern = arg.unwrap_or(".");

    // 获取主题
    let theme = default_theme();

    // 🔥 显示当前工作目录（调试信息）
    let current_dir = env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "<unknown>".to_string());

    // 🔥 自动检测宽泛搜索，自动启用智能模式
    let is_broad_search =
        pattern.contains("**/*") || pattern == "*" || pattern == "." || pattern.ends_with("/**");

    let (results, mode) = if is_broad_search {
        // 宽泛搜索：使用智能 Glob，限制结果
        (
            SmartGlob::search(pattern).with_limit(100).execute(),
            "smart",
        )
    } else {
        // 精确搜索：使用较宽松的限制
        (
            SmartGlob::search(pattern).with_limit(1000).execute(),
            "normal",
        )
    };

    // 生成输出
    let mut output = String::new();

    // 🔥 显示当前工作目录
    output.push_str(&format!(
        "{}📂 Working Directory: {}{}\n",
        theme.dim, current_dir, RESET
    ));
    output.push_str(&format!(
        "{}🔍 Pattern: {}{}\n\n",
        theme.dim, pattern, RESET
    ));

    if mode == "smart" {
        output.push_str(&format!(
            "{}⚠️  检测到宽泛搜索模式，使用智能 Glob（显示前 100 个结果）{}\n\n",
            theme.warning, RESET
        ));
    }

    // 显示摘要
    output.push_str(&results.render_summary());
    output.push_str("\n\n");

    // 显示详细结果（受限制）
    output.push_str(&results.render_results());

    // 🔥 如果没有找到文件，显示提示信息
    if results.summary.total_files == 0 {
        output.push_str(&format!(
            "\n{}❌ 未找到文件{}{}\n",
            theme.error, RESET, RESET
        ));
        output.push_str(&format!("{}   可能原因：\n", theme.dim));
        output.push_str(&format!(
            "{}   1. 路径不存在：请检查路径是否正确\n",
            theme.dim
        ));
        output.push_str(&format!(
            "{}   2. 工作目录：当前工作目录是 {}\n",
            theme.dim, current_dir
        ));
        output.push_str(&format!(
            "{}   3. 搜索模式：尝试使用更具体的模式{}\n",
            theme.dim, RESET
        ));
        output.push_str(&format!(
            "{}   示例：{} /glob \"src/**/*.rs\" {} 或 {} /glob \"Cargo.toml\"{}\n\n",
            theme.dim, theme.code, RESET, theme.code, RESET
        ));
    }

    // 如果被截断，提示使用完整模式
    if results.summary.truncated {
        output.push_str(&format!(
            "\n\n{}💡 提示：仅显示前 {} 个文件（共 {} 个）{}\n",
            theme.muted,
            results.results.len(),
            results.summary.total_files,
            RESET
        ));
        output.push_str(&format!(
            "{}   使用更具体的搜索模式查看更多结果{}",
            theme.dim, RESET
        ));
    }

    Ok(Some(output))
}

/// 🏛️ 显示/清空任务列表（元编程：直接读取全局 TaskStore）
fn cmd_task(_session: &mut Session, arg: Option<&str>) -> CommandResult {
    use super::render::{default_theme, RESET};
    use ifainew_lib::harness::task::{get_global_task_store, TaskStatus};

    let theme = default_theme();
    let store = get_global_task_store();

    match arg {
        Some("clear") => {
            store.clear();
            Ok(Some(format!("{}✓ 任务列表已清空{}", theme.success, RESET)))
        }
        _ => {
            let tasks = store.get_tasks();
            if tasks.is_empty() {
                return Ok(Some(format!(
                    "{}当前没有任务{}（AI 会在处理复杂任务时自动创建）",
                    theme.muted, RESET
                )));
            }

            let total = tasks.len();
            let completed = store.count_by_status(TaskStatus::Completed);
            let in_progress = store.count_by_status(TaskStatus::InProgress);

            let mut output = String::new();
            output.push_str(&format!(
                "{}╭─────────────────────────────────────{}\n",
                theme.table_border, RESET
            ));
            output.push_str(&format!(
                "{}│{} Tasks [{}/{}] ({} in progress){}\n",
                theme.table_border, theme.brand, completed, total, in_progress, RESET
            ));
            output.push_str(&format!(
                "{}├─────────────────────────────────────{}\n",
                theme.table_border, RESET
            ));

            // 🔥 查表渲染（与 TUI TASK_STATUS_DISPLAYS 一致）
            for (i, task) in tasks.iter().enumerate() {
                let (icon, color) = match task.status {
                    TaskStatus::Completed => ("[x]", theme.success),
                    TaskStatus::InProgress => ("▸", theme.warning),
                    TaskStatus::Pending => ("[ ]", theme.muted),
                };
                output.push_str(&format!(
                    "{}│  {} {}{}{}\n",
                    theme.table_border, icon, color, &task.content, RESET
                ));
            }

            output.push_str(&format!(
                "{}╰─────────────────────────────────────{}\n",
                theme.table_border, RESET
            ));
            Ok(Some(output))
        }
    }
}

/// /thread 占位 handler（TUI 模式下由 main.rs 拦截，仅在 REPL 模式生效）
fn cmd_thread_stub(_session: &mut Session, arg: Option<&str>) -> CommandResult {
    Ok(Some(
        "线程管理命令（TUI 模式专用）:\n\
         /thread          创建侧线程\n\
         /thread list     列出所有线程\n\
         /thread switch N 切换到第 N 个线程\n\
         /thread close    关闭当前侧线程\n\
         /thread rename X 重命名当前线程"
            .to_string(),
    ))
}

// ── /workflow ────────────────────────────────────────────────────────────────

fn cmd_workflow(session: &mut Session, arg: Option<&str>) -> CommandResult {
    let arg = arg.unwrap_or("");
    let (sub, path) = super::workflow_cmd::parse_workflow_args(arg);

    match sub {
        "templates" => {
            let templates = super::workflow_cmd::list_templates();
            let list: Vec<String> = templates.iter().map(|t| format!("  {:<14} {}", t.name, t.description)).collect();
            Ok(Some(format!("📋 可用工作流模板:\n{}", list.join("\n"))))
        }
        "run" => {
            let path = path.ok_or("用法: /workflow run <模板名|file.yaml>")?;
            let provider_json = session.workflow_provider_config_json();
            super::workflow_cmd::run_workflow(path, provider_json.as_deref())?;
            Ok(None)
        }
        _ => Ok(Some(
            "用法:\n\
             /workflow run <模板名>       执行内置工作流（explore/code-review/quality-check）\n\
             /workflow run <file.yaml>    执行指定 YAML 工作流\n\
             /workflow templates          列出可用模板"
                .to_string(),
        )),
    }
}

// ── /agent ───────────────────────────────────────────────────────────────────

fn cmd_agent(session: &mut Session, arg: Option<&str>) -> CommandResult {
    let arg = arg.ok_or("用法: /agent <explore|review|refactor|test|doc> <task>")?;
    let (agent_type, task) = super::agent_cmd::parse_agent_args(arg)?;
    let provider_json = session.workflow_provider_config_json();
    super::agent_cmd::run_agent(agent_type, task, provider_json.as_deref())?;
    Ok(None)
}

// ── /note ────────────────────────────────────────────────────────────────────

fn cmd_note(_session: &mut Session, arg: Option<&str>) -> CommandResult {
    let arg = arg.unwrap_or("");
    match arg.trim() {
        "export" => {
            let output = super::note_cmd::export_notes()?;
            Ok(Some(format!("✅ 笔记已导出: {}", output)))
        }
        _ => {
            match super::note_cmd::show_notes() {
                Ok(content) => Ok(Some(content)),
                Err(e) => Ok(Some(format!("📝 {}", e))),
            }
        }
    }
}

/// 🔥 Phase 4: /cleanup-sessions - 清理过期快照和归档日志
fn cmd_cleanup_sessions(_session: &mut Session, _arg: Option<&str>) -> CommandResult {
    use super::render::{default_theme, RESET};
    let theme = default_theme();

    let sessions_base = dirs::home_dir()
        .map(|home| home.join(".ifai").join("sessions"))
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp/ifai/sessions"));

    let snapshots_dir = sessions_base.join("auto");
    let live_dir = sessions_base.join("live");
    let archive_dir = sessions_base.join("archive");

    let manager = crate::snapshot_manager::SnapshotManager::with_defaults(
        snapshots_dir, live_dir, archive_dir,
    );

    let mut output = String::new();
    output.push_str(&format!("{}🧹 Session Cleanup{}\n", theme.brand, RESET));

    // 清理过期快照
    match manager.cleanup_old_snapshots() {
        Ok(count) => {
            output.push_str(&format!("  {}快照清理: 删除 {} 个过期快照{}\n", theme.success, count, RESET));
        }
        Err(e) => {
            output.push_str(&format!("  {}⚠ 快照清理失败: {}{}\n", theme.warning, e, RESET));
        }
    }

    // 清理过期归档（超过 30 天）
    match manager.cleanup_old_archives(30) {
        Ok(count) => {
            output.push_str(&format!("  {}归档清理: 删除 {} 个过期归档{}\n", theme.success, count, RESET));
        }
        Err(e) => {
            output.push_str(&format!("  {}⚠ 归档清理失败: {}{}\n", theme.warning, e, RESET));
        }
    }

    // 统计当前状态
    match manager.list_snapshots() {
        Ok(snapshots) => {
            output.push_str(&format!("  📊 当前快照数: {}", snapshots.len()));
        }
        Err(_) => {
            output.push_str("  📊 无法读取快照目录");
        }
    }

    Ok(Some(output))
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_all_commands() {
        // 验证所有 17 个命令都能找到
        assert!(find_command("help").is_some());
        assert!(find_command("clear").is_some());
        assert!(find_command("compact").is_some());
        assert!(find_command("cost").is_some());
        assert!(find_command("provider").is_some());
        assert!(find_command("model").is_some());
        assert!(find_command("permissions").is_some());
        assert!(find_command("resume").is_some());
        assert!(find_command("export").is_some());
        assert!(find_command("undo").is_some());
        assert!(find_command("config").is_some());
        assert!(find_command("exit").is_some());
        assert!(find_command("status").is_some());
        assert!(find_command("view").is_some());
        assert!(find_command("glob").is_some());
        assert!(find_command("task").is_some());
        assert!(find_command("thread").is_some());
    }

    #[test]
    fn test_find_unknown_command() {
        assert!(find_command("nonexistent").is_none());
    }

    #[test]
    fn test_dispatch_help() {
        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "help", None);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        let help_text = output.unwrap();
        assert!(help_text.contains("可用命令"));
        assert!(help_text.contains("/help"));
    }

    #[test]
    fn test_dispatch_clear() {
        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "clear", None);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        assert!(output.unwrap().contains("✅"));
    }

    #[test]
    fn test_dispatch_unknown_command() {
        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "nonexistent", None);
        assert!(result.is_err());

        let err = result.unwrap_err();
        assert!(err.contains("unknown command"));
        assert!(err.contains("Available"));
    }

    #[test]
    fn test_dispatch_provider_valid() {
        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "provider", Some("deepseek"));
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        assert!(output.unwrap().contains("deepseek"));
    }

    #[test]
    fn test_dispatch_provider_invalid() {
        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "provider", Some("nonexistent"));
        assert!(result.is_err());
    }

    #[test]
    fn test_dispatch_model_with_arg() {
        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "model", Some("gpt-4o"));
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        assert!(output.unwrap().contains("gpt-4o"));
    }

    #[test]
    fn test_dispatch_model_without_arg() {
        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "model", None);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        assert!(output.unwrap().contains("当前 Model"));
    }

    #[test]
    fn test_dispatch_config_init() {
        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "config", Some("init"));
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        assert!(output.unwrap().contains("✅"));
    }

    #[test]
    fn test_render_help_completeness() {
        let help = render_help();

        // 验证所有命令都在帮助中
        assert!(help.contains("/help"));
        assert!(help.contains("/clear"));
        assert!(help.contains("/compact"));
        assert!(help.contains("/cost"));
        assert!(help.contains("/provider"));
        assert!(help.contains("/model"));
        assert!(help.contains("/permissions"));
        assert!(help.contains("/resume"));
        assert!(help.contains("/export"));
        assert!(help.contains("/undo"));
        assert!(help.contains("/config"));
        assert!(help.contains("/exit"));
        assert!(help.contains("/task"));
    }

    #[test]
    fn test_command_spec_structure() {
        // 验证 CommandSpec 结构正确
        let help_spec = find_command("help").unwrap();
        assert_eq!(help_spec.name, "help");
        assert_eq!(help_spec.summary, "显示帮助信息");
        assert!(help_spec.arg_hint.is_none());
        assert_eq!(help_spec.min_permission, PermissionMode::None);

        // 验证带参数的命令
        let provider_spec = find_command("provider").unwrap();
        assert_eq!(provider_spec.name, "provider");
        assert!(provider_spec.arg_hint.is_some());
        assert_eq!(provider_spec.arg_hint.unwrap(), "[name]");
    }

    #[test]
    fn test_command_registry_size() {
        // 验证注册表包含所有 21 个命令
        assert_eq!(COMMAND_SPECS.len(), 21);
    }

    #[test]
    fn test_dispatch_status() {
        // 🆕 TDD 测试：验证 /status 命令正常工作
        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());

        // 测试空会话状态
        let result = dispatch_command(&mut session, "status", None);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());

        let status_text = output.unwrap();
        // 验证输出包含关键字段
        assert!(status_text.contains("Session Status"));
        assert!(status_text.contains("Provider:"));
        assert!(status_text.contains("deepseek-official"));
        assert!(status_text.contains("Model:"));
        assert!(status_text.contains("deepseek-chat"));
        assert!(status_text.contains("Messages:"));
        assert!(status_text.contains("User Turns:"));
        assert!(status_text.contains("No usage recorded"));
    }

    #[test]
    fn test_dispatch_status_with_messages() {
        // 🆕 TDD 测试：验证有消息的会话状态
        use ifainew_lib::harness::api::types::{Message, MessageContent, MessageRole};

        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());

        // 添加模拟消息
        session.default_ctx.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text("Hello".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });
        session.default_ctx.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text("How are you?".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        let result = dispatch_command(&mut session, "status", None);
        assert!(result.is_ok());

        let output = result.unwrap().unwrap();

        // 🔥 验证输出包含关键字段（忽略 ANSI 颜色代码）
        assert!(output.contains("Messages:"));
        assert!(output.contains("2")); // 验证包含消息数
        assert!(output.contains("User Turns:"));
    }

    #[test]
    fn test_status_command_spec() {
        // 🆕 TDD 测试：验证 status 命令规格正确
        let status_spec = find_command("status").expect("status command should exist");
        assert_eq!(status_spec.name, "status");
        assert_eq!(status_spec.summary, "显示会话状态统计");
        assert!(status_spec.arg_hint.is_none());
        assert_eq!(status_spec.min_permission, PermissionMode::None);
    }

    #[test]
    fn test_permission_mode_ordering() {
        // 验证权限级别可以正确比较
        assert!(PermissionMode::Admin > PermissionMode::Auth);
        assert!(PermissionMode::Auth > PermissionMode::Config);
        assert!(PermissionMode::Config > PermissionMode::None);
    }

    // ========================================================================
    // /undo Command Tests
    // ========================================================================

    #[test]
    fn test_dispatch_undo_empty_session() {
        // 🆕 TDD 测试：空会话无法撤销
        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());

        let result = dispatch_command(&mut session, "undo", None);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        let text = output.unwrap();
        assert!(text.contains("No conversation to undo") || text.contains("没有可撤销的对话"));
    }

    #[test]
    fn test_dispatch_undo_single_turn() {
        // 🆕 TDD 测试：撤销一轮对话（User + Assistant）
        use ifainew_lib::harness::api::types::{Message, MessageContent, MessageRole};

        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());

        // 添加一轮对话
        session.default_ctx.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text("Hello".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });
        session.default_ctx.messages.push(Message {
            role: MessageRole::Assistant,
            content: MessageContent::Text("Hi there!".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        // 撤销前：2 条消息
        assert_eq!(session.default_ctx.messages.len(), 2);

        let result = dispatch_command(&mut session, "undo", None);
        assert!(result.is_ok());

        // 撤销后：0 条消息
        assert_eq!(session.default_ctx.messages.len(), 0);

        let output = result.unwrap().unwrap();
        assert!(output.contains("撤销") || output.contains("Removed"));
    }

    #[test]
    fn test_dispatch_undo_multiple_turns() {
        // 🆕 TDD 测试：撤销最后一轮（保留前面轮次）
        use ifainew_lib::harness::api::types::{Message, MessageContent, MessageRole};

        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());

        // 第一轮
        session.default_ctx.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text("First question".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });
        session.default_ctx.messages.push(Message {
            role: MessageRole::Assistant,
            content: MessageContent::Text("First answer".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        // 第二轮
        session.default_ctx.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text("Second question".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });
        session.default_ctx.messages.push(Message {
            role: MessageRole::Assistant,
            content: MessageContent::Text("Second answer".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        // 撤销前：4 条消息
        assert_eq!(session.default_ctx.messages.len(), 4);

        let result = dispatch_command(&mut session, "undo", None);
        assert!(result.is_ok());

        // 撤销后：2 条消息（只保留第一轮）
        assert_eq!(session.default_ctx.messages.len(), 2);
        // 验证剩余消息的内容（通过模式匹配）
        match &session.default_ctx.messages[1].content {
            MessageContent::Text(text) => assert_eq!(text, "First answer"),
            _ => panic!("Expected Text content"),
        }
    }

    #[test]
    fn test_dispatch_undo_with_tool_calls() {
        // 🆕 TDD 测试：撤销包含工具调用的轮次
        use ifainew_lib::harness::api::types::{
            Message, MessageContent, MessageRole, ToolCall, ToolCallFunction,
        };

        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());

        // 用户消息
        session.default_ctx.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text("Use the calculator".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        // Assistant 响应（包含工具调用）
        session.default_ctx.messages.push(Message {
            role: MessageRole::Assistant,
            content: MessageContent::Text("I'll calculate that.".to_string()),
            tool_calls: Some(vec![ToolCall {
                id: "call_1".to_string(),
                call_type: "function".to_string(),
                function: ToolCallFunction {
                    name: "calculator".to_string(),
                    arguments: "{}".to_string(),
                },
            }]),
            tool_call_id: None,
        });

        // 工具结果
        session.default_ctx.messages.push(Message {
            role: MessageRole::Tool,
            content: MessageContent::Text("Result: 42".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        // 撤销前：3 条消息
        assert_eq!(session.default_ctx.messages.len(), 3);

        let result = dispatch_command(&mut session, "undo", None);
        assert!(result.is_ok());

        // 撤销后：0 条消息（整个轮次都被删除）
        assert_eq!(session.default_ctx.messages.len(), 0);
    }

    // ============================================================================
    // /export 命令测试 (TDD: Red-Green)
    // ============================================================================

    #[test]
    fn test_dispatch_export_empty_session() {
        // 🆕 TDD 测试：导出空会话
        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());

        let result = dispatch_command(&mut session, "export", Some("/tmp/test_empty.md"));
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        let output_text = output.unwrap();

        // 应该包含成功消息
        assert!(output_text.contains("Exported"));
        assert!(output_text.contains("0 messages"));

        // 验证文件已创建
        assert!(std::path::Path::new("/tmp/test_empty.md").exists());

        // 清理
        let _ = std::fs::remove_file("/tmp/test_empty.md");
    }

    #[test]
    fn test_dispatch_export_single_turn() {
        // 🆕 TDD 测试：导出单轮对话
        use ifainew_lib::harness::api::types::{Message, MessageContent, MessageRole};

        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());

        session.default_ctx.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text("What is Rust?".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        session.default_ctx.messages.push(Message {
            role: MessageRole::Assistant,
            content: MessageContent::Text("Rust is a systems programming language.".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        let result = dispatch_command(&mut session, "export", Some("/tmp/test_single.md"));
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        let output_text = output.unwrap();

        // 验证成功消息
        assert!(output_text.contains("Exported"));
        assert!(output_text.contains("2 messages"));

        // 验证文件内容
        let content = std::fs::read_to_string("/tmp/test_single.md").unwrap();
        assert!(content.contains("# Conversation Export"));
        assert!(content.contains("## User"));
        assert!(content.contains("What is Rust?"));
        assert!(content.contains("## Assistant"));
        assert!(content.contains("Rust is a systems programming language"));

        // 清理
        let _ = std::fs::remove_file("/tmp/test_single.md");
    }

    #[test]
    fn test_dispatch_export_with_markdown_formatting() {
        // 🆕 TDD 测试：导出包含代码块的消息
        use ifainew_lib::harness::api::types::{Message, MessageContent, MessageRole};

        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());

        session.default_ctx.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text("Show me code".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        session.default_ctx.messages.push(Message {
            role: MessageRole::Assistant,
            content: MessageContent::Text(
                "Here's a example:\n```rust\nfn main() {\n    println!(\"Hello\");\n}\n```"
                    .to_string(),
            ),
            tool_calls: None,
            tool_call_id: None,
        });

        let result = dispatch_command(&mut session, "export", Some("/tmp/test_markdown.md"));
        assert!(result.is_ok());

        // 验证文件内容包含正确的 Markdown 格式
        let content = std::fs::read_to_string("/tmp/test_markdown.md").unwrap();
        assert!(content.contains("```rust"));

        // 清理
        let _ = std::fs::remove_file("/tmp/test_markdown.md");
    }

    #[test]
    fn test_dispatch_export_missing_filename() {
        // 🆕 TDD 测试：缺少文件名参数
        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());

        let result = dispatch_command(&mut session, "export", None);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        let output_text = output.unwrap();

        // 应该包含用法提示
        assert!(output_text.contains("Usage:") || output_text.contains("用法"));
        assert!(output_text.contains("/export"));
    }

    #[test]
    fn test_dispatch_export_with_tool_calls() {
        // 🆕 TDD 测试：导出包含工具调用的会话
        use ifainew_lib::harness::api::types::{
            Message, MessageContent, MessageRole, ToolCall, ToolCallFunction,
        };

        let mut session =
            Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());

        session.default_ctx.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text("Calculate 2+2".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        session.default_ctx.messages.push(Message {
            role: MessageRole::Assistant,
            content: MessageContent::Text("I'll calculate that.".to_string()),
            tool_calls: Some(vec![ToolCall {
                id: "call_1".to_string(),
                call_type: "function".to_string(),
                function: ToolCallFunction {
                    name: "calculator".to_string(),
                    arguments: "{\"expression\": \"2+2\"}".to_string(),
                },
            }]),
            tool_call_id: None,
        });

        let result = dispatch_command(&mut session, "export", Some("/tmp/test_tools.md"));
        assert!(result.is_ok());

        // 验证文件内容包含工具调用信息
        let content = std::fs::read_to_string("/tmp/test_tools.md").unwrap();
        assert!(content.contains("Tool") || content.contains("calculator"));

        // 清理
        let _ = std::fs::remove_file("/tmp/test_tools.md");
    }
}
