//! IfAI CLI - Main Entry Point
//!
//! 🏛️ 零外部依赖：手动参数解析 + CliAction dispatch + REPL 循环

mod commands;
mod config;
mod provider;
mod render;
mod session;
// ✅ prompts.rs 已删除：CLI 现在使用 ifainew_lib::prompt_manager
mod approval_overlay; // 🔥 TUI 工具审批 Overlay
mod code_folding; // 🎨 代码折叠 - 元编程架构
mod command_popup; // 🔥 声明式命令弹出框
mod detail_overlay; // 🔥 Ctrl+O Detail View Overlay
mod diff_render; // 🔥 TUI Diff 渲染系统
mod event; // 🔥 TUI 事件系统 - 元编程级声明式事件处理框架
mod input_composer; // 🔥 输入框组件（替代 rustyline）
mod keybindings; // 🔥 快捷键定义和帮助系统
mod loop_detector; // 🎨 元编程循环检测引擎
mod markdown_meta; // 🎨 Markdown 元编程驱动层
mod markdown_stream; // 🎨 Markdown 代码块流式渲染器
mod permission; // 🔥 元编程权限引擎
mod permission_store; // 🔥 权限规则存储（用户白名单）
mod persistence; // 🔥 元编程会话持久化
mod pipeline; // 🎨 元编程 Pipeline 可视化
mod prompt_vars; // 🏛️ 元编程：变量自动收集器
mod smart_glob_summary; // 🔥 智能 Glob 搜索 - 元编程架构（简化版）
mod stream_render; // 🔥 声明式流式渲染管道
mod syntax_highlight; // 🎨 语法高亮 - 元编程架构
mod terminal; // 🔥 终端抽象层（ANSI 光标定位）
mod thread; // 🔥 多线程对话系统 - 元编程架构
#[cfg(test)]
mod thread_event_test; // 🧪 ThreadEvent TDD 测试
mod token; // 🔥 元编程 Token 显示层
mod tui; // 🔥 ratatui 全屏 TUI 模块
mod tui_layout; // 🔥 声明式 TUI 布局层
#[cfg(test)]
mod tui_test;
#[cfg(test)]
mod thread_switch_test; // 🧪 线程切换 E2E 快照测试
#[cfg(test)]
mod streaming_thread_switch_test; // 🧪 流式期间线程切换 E2E 测试
#[cfg(test)]
mod thread2_message_test; // 🧪 Thread-2 消息显示 E2E 测试
#[cfg(test)]
mod thread3_message_test; // 🧪 Thread-3 消息显示 E2E 测试
#[cfg(test)]
mod thread_cross_talk_test; // 🧪 线程消息串台 E2E 测试
#[cfg(test)]
mod input_help_bug_test; // 🧪 键盘输入触发帮助 E2E 测试
#[cfg(test)]
mod streaming_thread_leak_test; // 🧪 流式输出线程泄漏 E2E 测试
#[cfg(test)]
mod real_streaming_test; // 🧪 真实流式输出场景测试
#[cfg(test)]
mod queued_message_thread_test; // 🧪 排队消息线程错误 E2E 测试
#[cfg(test)]
mod approval_thread_leak_test; // 🧪 工具审批界面线程泄漏 E2E 测试
#[cfg(test)]
mod approval_thread_switch_test; // 🧪 审批期间线程切换 E2E 测试
#[cfg(test)]
mod concurrent_processing_test; // 🧪 并发处理 E2E 测试
#[cfg(test)]
mod realistic_concurrent_test; // 🔥 高保真 LLM E2E 并发测试
mod thread_switch_mode_test; // 🔥 线程切换时 Mode 同步测试
#[cfg(test)]
mod concurrent_message_cross_talk_test; // 🔥 并发消息串台 E2E 测试
#[cfg(test)]
mod user_reported_cross_talk_test; // 🔥 用户报告的消息串台场景测试
#[cfg(test)]
mod e2e_concurrent_approval_test; // 🔥 Phase 6: 并发和审批 E2E 高保真测试
#[cfg(test)]
#[cfg(feature = "real-llm")]
mod real_llm_e2e_test; // 🔥 Phase 6: 真实 LLM API E2E 并发测试（需要真实 API，默认不编译）
mod welcome; // 🔥 TUI 欢迎页组件 // 🧪 TUI 渲染测试共享基础设施

// ============================================================================
// TUI 事件循环结果
// ============================================================================

/// TUI 事件循环结果
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppResult {
    /// 用户提交输入
    Submit(String),
    /// 用户请求退出
    Exit,
    /// 事件已消费，无需额外动作
    Handled,
}

/// TUI 输出消息（支持文本和 diff）
#[derive(Debug, Clone)]
pub enum OutputMessage {
    Text(String),
    Diff(diff_render::DiffFileChange),
}

impl From<String> for OutputMessage {
    fn from(s: String) -> Self {
        OutputMessage::Text(s)
    }
}

impl From<diff_render::DiffFileChange> for OutputMessage {
    fn from(diff: diff_render::DiffFileChange) -> Self {
        OutputMessage::Diff(diff)
    }
}

use rustyline::Editor;
use serde::{Deserialize, Serialize};
use std::env;
use std::io::{self, IsTerminal, Write};

// ============================================================================
// JSON 输出结构
// ============================================================================

/// 🔥 JSON 响应格式
#[derive(Debug, Serialize, Deserialize)]
struct JsonResponse {
    /// 响应状态
    status: String,

    /// 提供商
    provider: String,

    /// 模型
    model: String,

    /// 用户提示词
    prompt: String,

    /// AI 响应内容
    content: String,

    /// 输入 token 数量
    #[serde(skip_serializing_if = "Option::is_none")]
    input_tokens: Option<u32>,

    /// 输出 token 数量
    #[serde(skip_serializing_if = "Option::is_none")]
    output_tokens: Option<u32>,

    /// 总 token 数量
    #[serde(skip_serializing_if = "Option::is_none")]
    total_tokens: Option<u32>,

    /// 错误信息（如果有）
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,

    /// 时间戳
    timestamp: String,
}

impl JsonResponse {
    /// 创建成功响应
    fn success(
        provider: String,
        model: String,
        prompt: String,
        content: String,
        input_tokens: Option<u32>,
        output_tokens: Option<u32>,
    ) -> Self {
        let total_tokens = match (input_tokens, output_tokens) {
            (Some(i), Some(o)) => Some(i + o),
            _ => None,
        };

        Self {
            status: "success".to_string(),
            provider,
            model,
            prompt,
            content,
            input_tokens,
            output_tokens,
            total_tokens,
            error: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// 创建错误响应
    fn error(provider: String, model: String, prompt: String, error_message: String) -> Self {
        Self {
            status: "error".to_string(),
            provider,
            model,
            prompt,
            content: String::new(),
            input_tokens: None,
            output_tokens: None,
            total_tokens: None,
            error: Some(error_message),
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }
}

// ============================================================================
// CliAction - 动作分发枚举
// ============================================================================

/// 🎯 CLI 动作类型
///
/// **零 clap 依赖**：手动解析 std::env::args()，然后 dispatch 到不同的处理器
#[derive(Debug)]
pub enum CliAction {
    /// 单次提示词模式：`ifai "write a hello world"`
    Prompt {
        text: String,
        json_output: bool,
        no_tool: bool,
        system: Option<String>,
    },

    /// REPL 交互模式：`ifai` 或 `ifai --repl`
    Repl,

    /// 显示版本：`ifai --version` / `ifai -V`
    Version,

    /// 显示帮助：`ifai --help` / `ifai -h`
    Help,

    /// 配置初始化：`ifai --config init`
    ConfigInit,

    /// 显示配置：`ifai --config show`
    ConfigShow,

    /// 恢复会话：`ifai --resume <name>`
    Resume { name: String },
}

// ============================================================================
// 手动参数解析（零 clap 依赖）
// ============================================================================

/// 🏛️ 从参数列表解析 CLI 动作
///
/// **内部函数**：被 `parse_args()` 和测试使用
fn parse_args_from_list(args: &[String]) -> Result<CliAction, String> {
    // 无参数 → REPL 模式
    if args.len() == 1 {
        return Ok(CliAction::Repl);
    }

    let mut config_action: Option<String> = None;
    let mut resume_name: Option<String> = None;
    let mut prompt_text: Vec<String> = Vec::new();
    let mut skip_next = false;
    let mut json_output = false;
    let mut no_tool = false;
    let mut system_prompt: Option<String> = None;

    for (i, arg) in args.iter().enumerate() {
        if skip_next {
            skip_next = false;
            continue;
        }

        match arg.as_str() {
            "--help" | "-h" => return Ok(CliAction::Help),

            "--version" | "-V" => return Ok(CliAction::Version),

            "--json" => {
                // 🔥 JSON 输出模式
                json_output = true;
            }

            "--no-tool" => {
                // 🔥 禁用工具调用
                no_tool = true;
            }

            "--system" => {
                // 🔥 设置系统提示词
                if i + 1 >= args.len() {
                    return Err("--system requires a prompt text".to_string());
                }
                system_prompt = Some(args[i + 1].clone());
                skip_next = true;
            }

            "--provider" | "--model" | "--api-key" => {
                // 这些标志暂时忽略（用于未来的配置覆盖）
                if i + 1 >= args.len() {
                    let flag_name = arg.trim_start_matches("--");
                    return Err(format!("--{} requires a value", flag_name));
                }
                skip_next = true;
            }

            "--config" => {
                if i + 1 >= args.len() {
                    return Err("--config requires a subcommand (init|show)".to_string());
                }
                config_action = Some(args[i + 1].clone());
                skip_next = true;
            }

            "--resume" => {
                if i + 1 >= args.len() {
                    return Err("--resume requires a session name".to_string());
                }
                resume_name = Some(args[i + 1].clone());
                skip_next = true;
            }

            "--repl" => {
                // 显式指定 REPL，与其他选项兼容
            }

            arg if arg.starts_with("--") => {
                return Err(format!("unknown flag: {}", arg));
            }

            // 非标志参数 → prompt 文本
            _ => {
                if i > 0 {
                    prompt_text.push(arg.clone());
                }
            }
        }
    }

    // 处理特殊动作
    if let Some(action) = config_action {
        return match action.as_str() {
            "init" => Ok(CliAction::ConfigInit),
            "show" => Ok(CliAction::ConfigShow),
            _ => Err(format!(
                "unknown config subcommand: {}. Use 'init' or 'show'",
                action
            )),
        };
    }

    if let Some(name) = resume_name {
        return Ok(CliAction::Resume { name });
    }

    // 有 prompt 文本 → 单次模式
    if !prompt_text.is_empty() {
        return Ok(CliAction::Prompt {
            text: prompt_text.join(" "),
            json_output,
            no_tool,
            system: system_prompt,
        });
    }

    // 🔥 只有标志，没有 prompt 文本 → 保存标志用于管道输入
    if json_output || no_tool || system_prompt.is_some() {
        // 返回一个虚拟的 Prompt，稍后会从 stdin 读取
        return Ok(CliAction::Prompt {
            text: String::new(), // 占位符，会被 stdin 覆盖
            json_output,
            no_tool,
            system: system_prompt,
        });
    }

    // 默认 → REPL 模式
    Ok(CliAction::Repl)
}

/// 🏛️ 解析命令行参数（从 std::env::args()）
///
/// **支持格式**：
/// - `ifai` → Repl
/// - `ifai "prompt"` → Prompt
/// - `ifai --version` / `ifai -V` → Version
/// - `ifai --config init` → ConfigInit
/// - `ifai --config show` → ConfigShow
/// - `ifai --resume <name>` → Resume
/// - `ifai --provider deepseek --model deepseek-chat` → Repl with overrides
fn parse_args() -> Result<CliAction, String> {
    let args: Vec<String> = env::args().collect();
    parse_args_from_list(&args)
}

// ============================================================================
// Stdin 管道输入支持
// ============================================================================

/// 🔥 读取 stdin 全部内容作为 prompt
///
/// **用途**: 支持管道输入，如 `echo "hello" | ifai` 或 `cat file.txt | ifai`
fn read_stdin_to_prompt() -> Result<String, String> {
    use std::io::Read;

    let mut buffer = String::new();
    io::stdin()
        .read_to_string(&mut buffer)
        .map_err(|e| format!("Failed to read stdin: {}", e))?;

    // 移除首尾空白，保留内部换行
    Ok(buffer.trim().to_string())
}

// ============================================================================
// 主入口
// ============================================================================

fn main() {
    // 🔥 检测 stdin 管道输入（非 TTY 或测试环境）
    let is_piped = !io::stdin().is_terminal() || std::env::var("IFAI_TEST_STDIN").is_ok();

    // 解析参数
    let action = match parse_args() {
        Ok(action) => action,
        Err(e) => {
            eprintln!("Error: {}", e);
            eprintln!("\nUsage:");
            eprintln!("  ifai                    # Start REPL");
            eprintln!("  ifai \"your prompt\"       # Single-shot mode");
            eprintln!("  ifai --json \"prompt\"     # JSON output mode");
            eprintln!("  echo \"prompt\" | ifai      # Pipe stdin as prompt");
            eprintln!("  ifai --version           # Show version");
            eprintln!("  ifai --config init       # Initialize config");
            eprintln!("  ifai --config show       # Show effective config");
            eprintln!("  ifai --resume <name>     # Resume saved session");
            eprintln!("\nOptions:");
            eprintln!("  --json                  Output as JSON (machine-readable)");
            eprintln!("  --no-tool               Disable tool calling");
            eprintln!("  --provider <name>       Override AI provider");
            eprintln!("  --model <name>          Override model");
            eprintln!("  --api-key <key>         Override API key");
            std::process::exit(1);
        }
    };

    // 🔥 如果检测到管道输入，读取 stdin 并与现有参数合并
    // 但如果 parse_args 已经解析到有内容的 prompt（如 CLI args 中传了文本），
    // 则不覆盖——stdin 可能是工具审批等交互式输入（测试场景）
    let action = if is_piped {
        // 检查是否已有非空的 prompt 文本
        let has_prompt_text = match &action {
            CliAction::Prompt { text, .. } => !text.is_empty(),
            _ => false,
        };

        if has_prompt_text {
            // 已有 prompt，不读取 stdin（保留 stdin 给工具审批等交互使用）
            action
        } else {
            // 获取当前的设置
            let (current_json_output, current_no_tool, current_system) = match &action {
                CliAction::Prompt {
                    json_output,
                    no_tool,
                    system,
                    ..
                } => (*json_output, *no_tool, system.clone()),
                _ => (false, false, None),
            };

            match read_stdin_to_prompt() {
                Ok(prompt) => {
                    if prompt.is_empty() {
                        // 🔥 JSON 模式下不打印警告
                        if !current_json_output {
                            eprintln!("Warning: Empty stdin input");
                        }
                        action
                    } else {
                        // 使用 stdin 内容和当前的设置
                        CliAction::Prompt {
                            text: prompt,
                            json_output: current_json_output,
                            no_tool: current_no_tool,
                            system: current_system,
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Error reading stdin: {}", e);
                    std::process::exit(1);
                }
            }
        }
    } else {
        action
    };

    // 执行动作
    if let Err(e) = run_action(action) {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}

/// 🎯 执行 CLI 动作
fn run_action(action: CliAction) -> Result<(), String> {
    match action {
        CliAction::Help => {
            show_help();
            Ok(())
        }

        CliAction::Version => {
            show_version();
            Ok(())
        }

        CliAction::ConfigInit => {
            config_init()?;
            Ok(())
        }

        CliAction::ConfigShow => {
            config_show()?;
            Ok(())
        }

        CliAction::Resume { name } => {
            if io::stdin().is_terminal() {
                run_tui_repl(Some(name))?;
            } else {
                run_repl(Some(name))?;
            }
            Ok(())
        }

        CliAction::Prompt {
            text,
            json_output,
            no_tool,
            system,
        } => {
            run_prompt(&text, json_output, no_tool, system)?;
            Ok(())
        }

        CliAction::Repl => {
            if io::stdin().is_terminal() {
                run_tui_repl(None)?;
            } else {
                run_repl(None)?;
            }
            Ok(())
        }
    }
}

/// 📋 显示版本信息
fn show_version() {
    println!("IfAI CLI v0.4.5");
    println!("Industrial-grade AI code assistant");
}

/// 显示帮助信息
fn show_help() {
    println!("IfAI CLI - Industrial-grade AI code assistant");
    println!();
    println!("USAGE:");
    println!("  ifai [OPTIONS] [PROMPT]");
    println!("  ifai --repl");
    println!();
    println!("OPTIONS:");
    println!("  -h, --help              显示帮助信息");
    println!("  -V, --version           显示版本信息");
    println!("      --json              以 JSON 格式输出");
    println!("      --no-tool           禁用工具调用");
    println!("      --system <prompt>   设置系统提示词");
    println!("      --provider <name>   指定 AI 提供商");
    println!("      --model <name>      指定模型");
    println!("      --api-key <key>     指定 API key");
    println!("      --config <cmd>      配置管理 (init|show)");
    println!("      --resume <name>     恢复会话");
    println!("      --repl              启动 REPL 模式");
    println!();
    println!("EXAMPLES:");
    println!("  ifai hello                      # 单次提示");
    println!("  ifai \"explain rust\"               # 带空格的提示");
    println!("  ifai --system \"You are expert\" hello  # 设置系统提示词");
    println!("  ifai --model gpt-4 hello         # 指定模型");
    println!("  ifai --json hello                # JSON 输出");
    println!("  echo \"prompt\" | ifai              # 从 stdin 读取");
    println!();
    println!("ENVIRONMENT VARIABLES:");
    println!("  IFAI_PROVIDER        默认提供商");
    println!("  IFAI_MODEL           默认模型");
    println!("  OPENAI_API_KEY       OpenAI API key");
    println!("  IFAI_API_BASE        自定义 API endpoint");
    println!();
    println!("For more information, visit: https://github.com/your-repo/ifai");
}

/// 配置初始化
fn config_init() -> Result<(), String> {
    println!("Initializing IfAI CLI configuration...");

    let filepath = config::init_config_file()?;

    println!();
    println!("Configuration file created: {}", filepath.display());
    println!();
    println!("Edit the file to customize your settings:");
    println!("  - Default provider and model");
    println!("  - API keys (or use environment variables)");
    println!("  - Custom base URLs");
    println!();
    println!("Configuration precedence (highest to lowest):");
    println!("  1. CLI arguments (--provider, --model, --api-key)");
    println!("  2. Environment variables (IFAI_PROVIDER, IFAI_MODEL, {{PROVIDER}}_API_KEY)");
    println!("  3. Config file ({})", filepath.display());
    println!("  4. YAML defaults (embedded in binary)");

    Ok(())
}

/// 📊 显示有效配置
fn config_show() -> Result<(), String> {
    let config = config::EffectiveConfig::resolve(None, None, None, None)?;
    let theme = render::default_theme();

    println!(
        "{}",
        render::render_banner("v0.4.5", &config.provider(), &config.model(), &theme)
    );
    println!();
    println!(
        "{}",
        render::render_config_chain(
            None,                                        // CLI arg
            None,                                        // env var
            None,                                        // file
            &format!("{} (default)", config.provider()), // YAML default
            &theme,
        )
    );

    Ok(())
}

/// 运行单次提示词模式
///
/// **用途**: `ifai "your prompt"` 或 `echo "prompt" | ifai`
async fn run_prompt_async(
    text: &str,
    json_output: bool,
    no_tool: bool,
    system: Option<String>,
) -> Result<(), String> {
    // 解析有效配置
    let config = config::EffectiveConfig::resolve(None, None, None, None)?;

    let provider = config.provider().to_string();
    let model = config.model().to_string();

    // 初始化 Session
    let mut session = session::Session::new(provider.clone(), model.clone());

    // 🔥 禁用工具调用（如果设置了 --no-tool）
    if no_tool {
        session.disable_tools();
    }

    // 🔥 设置自定义系统提示词（如果指定了 --system）
    if let Some(system_prompt) = system {
        session.set_system_prompt(system_prompt);
    }

    // 🔥 从配置读取 API key
    if let Some(api_key) = config.api_key() {
        session.set_api_key(api_key.to_string());
    }

    // 🔥 从配置读取 Base URL
    if let Some(base_url) = config.base_url() {
        session.set_base_url(base_url.to_string());
    }

    // 🔥 设置项目根目录
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;
    session.set_project_root(current_dir.to_string_lossy().to_string());

    // 🔥 JSON 模式：不打印流式输出，只缓冲
    if json_output {
        // 记录初始 token 计数
        let initial_input_tokens = session.default_ctx.cumulative_input_tokens;
        let initial_output_tokens = session.default_ctx.cumulative_output_tokens;

        match session.stream_prompt(text).await {
            Ok(content) => {
                // 计算本次请求的 token 使用量
                let input_tokens = session.default_ctx.cumulative_input_tokens - initial_input_tokens;
                let output_tokens = session.default_ctx.cumulative_output_tokens - initial_output_tokens;

                let response = JsonResponse::success(
                    provider,
                    model,
                    text.to_string(),
                    content,
                    Some(input_tokens),
                    Some(output_tokens),
                );

                println!("{}", serde_json::to_string(&response).unwrap());
                Ok(())
            }
            Err(e) => {
                let response = JsonResponse::error(provider, model, text.to_string(), e);
                println!("{}", serde_json::to_string(&response).unwrap());
                Err(format!("Request failed"))
            }
        }
    } else {
        // 🔥 普通模式：流式输出
        match session.stream_prompt(text).await {
            Ok(_) => {
                // 流式响应已在 stream_prompt 中打印
                println!(); // 确保响应后换行
                Ok(())
            }
            Err(e) => {
                eprintln!("Error: {}", e);
                Err(e)
            }
        }
    }
}

/// 运行单次提示词模式（同步包装）
fn run_prompt(
    text: &str,
    json_output: bool,
    no_tool: bool,
    system: Option<String>,
) -> Result<(), String> {
    // 创建 tokio runtime
    let rt =
        tokio::runtime::Runtime::new().map_err(|e| format!("Failed to create runtime: {}", e))?;

    // 在 async runtime 中运行
    rt.block_on(async { run_prompt_async(text, json_output, no_tool, system).await })
}

/// 🔄 运行 REPL 循环
async fn run_repl_async(resume_name: Option<String>) -> Result<(), String> {
    // 🔇 全局禁用调试日志（必须在最前面）
    std::env::set_var("IFAI_QUIET", "1");

    // 解析有效配置
    let config = config::EffectiveConfig::resolve(None, None, None, None)?;
    let theme = render::default_theme();

    // 显示 Banner
    println!(
        "{}",
        render::render_banner("v0.4.5", &config.provider(), &config.model(), &theme)
    );
    println!();

    // 初始化 Session
    let mut session =
        session::Session::new(config.provider().to_string(), config.model().to_string());

    // 🔥 从配置读取 API key（优先级：CLI > Env > TOML > Default）
    if let Some(api_key) = config.api_key() {
        session.set_api_key(api_key.to_string());
    }

    // 🔥 从配置读取 Base URL（优先级：CLI > TOML > Default）
    if let Some(base_url) = config.base_url() {
        session.set_base_url(base_url.to_string());
    }

    // 🔥 FIX: 设置项目根目录为当前工作目录
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;
    session.set_project_root(current_dir.to_string_lossy().to_string());

    // 显示欢迎信息
    println!("{}", theme.muted);
    println!("Welcome to IfAI! Type /help for available commands.");
    println!("Press Ctrl+D to exit.");
    println!("Use ↑/↓ arrows for command history.");
    println!("{}", render::RESET);

    // 🔥 创建 rustyline Editor（支持历史记录、上键、下键等）
    let mut rl = Editor::<(), rustyline::history::DefaultHistory>::new()
        .map_err(|e| format!("Failed to initialize editor: {:?}", e))?;

    // 🔥 配置历史文件路径
    let history_path = dirs::home_dir()
        .map(|home| home.join(".ifai").join("history"))
        .ok_or("Failed to determine home directory")?;

    // 确保历史文件目录存在
    if let Some(parent) = history_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create history directory: {}", e))?;
    }

    // 🔥 加载历史记录
    if history_path.exists() {
        let _ = rl.load_history(&history_path);
    }

    // REPL 循环
    loop {
        // 🔥 使用 rustyline readline（支持历史记录、上下键）
        let readline = rl.readline(&format!("{}⟩{} ", theme.brand, render::RESET));

        let input = match readline {
            Ok(line) => line,
            Err(rustyline::error::ReadlineError::Io(e)) => {
                if e.kind() == io::ErrorKind::UnexpectedEof
                    || e.kind() == io::ErrorKind::Interrupted
                {
                    // Ctrl+D (EOF) 或 Ctrl+C (Interrupt)
                    println!(); // 换行
                    println!("{}Goodbye!{}", theme.success, render::RESET);
                    break;
                }
                return Err(format!("IO error: {}", e));
            }
            Err(_) => {
                // 其他错误
                println!("{}Goodbye!{}", theme.success, render::RESET);
                break;
            }
        };

        let input = input.trim();

        // 空输入 → 继续
        if input.is_empty() {
            continue;
        }

        // 🔥 添加到历史记录
        rl.add_history_entry(input);

        // 退出命令
        if input == "/exit" || input == "/quit" || input == "exit" || input == "quit" {
            println!("{}Goodbye!{}", theme.success, render::RESET);

            // 🔥 保存历史记录
            let _ = rl.save_history(&history_path);
            break;
        }

        // REPL 命令
        if input.starts_with('/') {
            // 解析命令：/command [args]
            let parts: Vec<&str> = input.splitn(2, ' ').collect();
            let cmd = &parts[0][1..]; // 去掉 '/'
            let arg = parts.get(1).map(|s| s.to_string());

            match commands::dispatch_command(&mut session, cmd, arg.as_deref()) {
                Ok(Some(output)) => println!("{}", output),
                Ok(None) => {}
                Err(e) => eprintln!("{}Error: {}{}", render::color_256(167), e, render::RESET),
            }
        } else {
            // 🔥 元编程：检查是否需要压缩（复用 GUI 端 should_summarize 逻辑）
            use crate::token;
            let token_count = token::estimate_tokens(&session.default_ctx.messages);
            let max_tokens = token::get_model_max_tokens(&session.model);

            // 警告阈值：80% 的上下文窗口
            if token_count > (max_tokens * 80 / 100) && session.default_ctx.messages.len() >= 10 {
                eprintln!("{}Warning: Context size ({} tokens, {} messages) exceeds 80% of model limit ({}).{}",
                    render::color_256(208), token_count, session.default_ctx.messages.len(), max_tokens, render::RESET);
                eprintln!(
                    "{}Consider using /compact to reduce context size, or /clear to start fresh.{}",
                    render::color_256(208),
                    render::RESET
                );
            }

            // 用户消息 → 发送给 AI（流式响应）
            match session.stream_prompt(input).await {
                Ok(_) => {
                    // 流式响应已在 stream_prompt 中打印
                }
                Err(e) => {
                    eprintln!("{}Error: {}{}", theme.error, e, render::RESET);

                    // 🔥 如果是 token 超限错误，提示解决方案
                    if e.contains("maximum context length") || e.contains("tokens") {
                        eprintln!("{}💡 Tip: Use /compact to compress conversation or /clear to start over.{}",
                            render::color_256(71), render::RESET);
                    }
                }
            }
        }
    }

    // 🔥 保存历史记录（正常退出时）
    let _ = rl.save_history(&history_path);

    Ok(())
}

/// 🔄 运行 REPL 循环（同步包装）
fn run_repl(resume_name: Option<String>) -> Result<(), String> {
    // 创建 tokio runtime
    let rt =
        tokio::runtime::Runtime::new().map_err(|e| format!("Failed to create runtime: {}", e))?;

    // 在 async runtime 中运行 REPL
    rt.block_on(async { run_repl_async(resume_name).await })
}

/// 🖥️ 运行 TUI 全屏 REPL（同步包装）
fn run_tui_repl(resume_name: Option<String>) -> Result<(), String> {
    let rt =
        tokio::runtime::Runtime::new().map_err(|e| format!("Failed to create runtime: {}", e))?;

    rt.block_on(async { run_tui_repl_async(resume_name).await })
}

/// /thread 系列命令处理（需要 App 访问，不走 Session dispatch）
fn handle_thread_command(app: &mut tui::App, arg: Option<&str>) {
    let theme = render::default_theme();

    match arg {
        None | Some("") => {
            // /thread — 创建侧线程（同 Ctrl+T）
            if app.thread.store.len() >= 5 {
                app.push_line(format!(
                    "{}已达到最大线程数（5）{}",
                    render::RESET, render::RESET
                ));
                return;
            }
            let name = format!("Thread-{}", app.thread.store.len());
            let id = app.create_side_thread(Some(name));
            app.thread.active_mode = true;
            app.mode = crate::tui::Mode::ThreadPicker;
            app.push_line(format!(
                "{}✓ 已创建侧线程 {}{}",
                theme.success,
                app.thread.store.get_thread(id).map(|t| t.display_name()).unwrap_or_default(),
                render::RESET
            ));
        }
        Some("list") => {
            // /thread list — 列出所有线程
            let thread_count = app.thread.store.len();
            let active_id = app.thread.store.active_id();
            // 先收集显示信息，避免借用冲突
            let display_infos: Vec<(usize, String, &'static str, bool)> = app
                .thread.store
                .all_threads()
                .iter()
                .enumerate()
                .map(|(i, t)| {
                    let is_active = active_id == Some(t.id);
                    let kind = match t.kind {
                        crate::thread::ThreadKind::Main => "主线程",
                        crate::thread::ThreadKind::Side => "侧线程",
                    };
                    (i + 1, t.display_name(), kind, is_active)
                })
                .collect();

            app.push_line(format!(
                "{}线程列表（共 {} 个）:{}",
                theme.heading,
                thread_count,
                render::RESET
            ));
            for (idx, name, kind, is_active) in &display_infos {
                let marker = if *is_active { " ← 活跃" } else { "" };
                app.push_line(format!(
                    "  {}{}. {} [{}]{}",
                    theme.brand, idx, name, kind, marker
                ));
            }
        }
        Some(subcmd) => {
            let parts: Vec<&str> = subcmd.splitn(2, ' ').collect();
            match parts[0] {
                "switch" => {
                    if parts.len() < 2 {
                        app.push_line(format!(
                            "{}用法: /thread switch <N>{}（N 为线程编号，从 1 开始）",
                            theme.muted, render::RESET
                        ));
                        return;
                    }
                    match parts[1].parse::<usize>() {
                        Ok(n) if n >= 1 && n <= app.thread.store.len() => {
                            let threads = app.thread.store.all_threads();
                            let target = &threads[n - 1];
                            let target_id = target.id;
                            let display_name = target.display_name();
                            if app.switch_thread(target_id) {
                                app.push_line(format!(
                                    "{}✓ 已切换到线程 {}{}",
                                    theme.success,
                                    display_name,
                                    render::RESET
                                ));
                            } else {
                                app.push_line(format!(
                                    "{}切换失败{}",
                                    theme.error, render::RESET
                                ));
                            }
                        }
                        _ => {
                            app.push_line(format!(
                                "{}无效的线程编号 '{}'，范围: 1-{}{}",
                                theme.error,
                                parts[1],
                                app.thread.store.len(),
                                render::RESET
                            ));
                        }
                    }
                }
                "close" => {
                    let active = app.thread.store.active_thread();
                    match active {
                        Some(t) if t.kind == crate::thread::ThreadKind::Main => {
                            app.push_line(format!(
                                "{}不能关闭主线程{}",
                                theme.error, render::RESET
                            ));
                        }
                        Some(t) => {
                            let name = t.display_name();
                            let parent_id = t.parent_id;
                            let closed = app.thread.store.remove_thread(t.id);
                            if closed {
                                // 切回父线程
                                if let Some(pid) = parent_id {
                                    app.switch_thread(pid);
                                }
                                app.thread.active_mode = false;
                                app.mode = crate::tui::Mode::Normal;
                                app.push_line(format!(
                                    "{}✓ 已关闭线程 '{}'{}",
                                    theme.success,
                                    name,
                                    render::RESET
                                ));
                            }
                        }
                        None => {
                            app.push_line(format!("{}没有活跃线程{}", theme.error, render::RESET));
                        }
                    }
                }
                "rename" => {
                    if parts.len() < 2 || parts[1].trim().is_empty() {
                        app.push_line(format!(
                            "{}用法: /thread rename <新名称>{}",
                            theme.muted, render::RESET
                        ));
                        return;
                    }
                    let new_name = parts[1].trim().to_string();
                    let active_id = match app.thread.store.active_id() {
                        Some(id) => id,
                        None => {
                            app.push_line(format!("{}没有活跃线程{}", theme.error, render::RESET));
                            return;
                        }
                    };
                    if app.rename_thread(active_id, new_name.clone()) {
                        app.push_line(format!(
                            "{}✓ 线程已重命名为 '{}'{}",
                            theme.success,
                            new_name,
                            render::RESET
                        ));
                    } else {
                        app.push_line(format!("{}重命名失败{}", theme.error, render::RESET));
                    }
                }
                _ => {
                    app.push_line(format!(
                        "{}未知子命令: '{}'{}",
                        theme.error, parts[0], render::RESET
                    ));
                    app.push_line(format!(
                        "{}用法: /thread [list|switch <N>|close|rename <name>]{}",
                        theme.muted, render::RESET
                    ));
                }
            }
        }
    }
}

/// 每个 streaming 线程的完整句柄（属于线程，不属于循环）
pub(crate) struct StreamState {
    pub(crate) handle: Option<tokio::task::JoinHandle<Result<String, String>>>,
    pub(crate) output_rx: Option<tokio::sync::mpsc::UnboundedReceiver<OutputMessage>>,
    pub(crate) status_rx: Option<tokio::sync::mpsc::UnboundedReceiver<String>>,
    pub(crate) thread_event_rx: Option<tokio::sync::mpsc::UnboundedReceiver<thread::ThreadEvent>>,
    pub(crate) thread_event_tx: Option<tokio::sync::mpsc::UnboundedSender<thread::ThreadEvent>>,
    pub(crate) approval_tx_for_resend: Option<tokio::sync::mpsc::UnboundedSender<approval_overlay::ApprovalRequest>>,
}

/// select! 返回的控制信号
pub(crate) enum StreamingControl {
    /// 继续监听
    Continue,
    /// 当前线程的 stream 完成
    StreamFinished,
    /// 用户提交了新消息（在非 busy 线程上 Enter）
    NewRequest { text: String, thread_id: thread::ThreadId },
    /// 用户按了 Ctrl+C
    Interrupted,
    /// 退出 TUI
    Exit,
    /// 用户切换了线程（Alt+Left/Alt+Right），需要重新获取 active_id
    ThreadSwitch,
}

/// 单层 select! 事件循环 — receivers 从 stream_states 借用，所有权始终在 App
///
/// 核心设计：每个线程的 channel receivers 存储在 `stream_states: HashMap<ThreadId, StreamState>` 中。
/// 每次调用时，从 stream_states 中 take 出当前 active 线程的 receivers，传入 select!。
/// select! 结束后，如果线程仍在 streaming，将 receivers 放回。
async fn run_streaming_loop(
    app: &mut tui::App,
    session: &std::sync::Arc<tokio::sync::Mutex<session::Session>>,
    stream_states: &mut std::collections::HashMap<thread::ThreadId, StreamState>,
    approval_tx: tokio::sync::mpsc::UnboundedSender<approval_overlay::ApprovalRequest>,
    approval_rx: &mut tokio::sync::mpsc::UnboundedReceiver<approval_overlay::ApprovalRequest>,
    initial_request: (String, thread::ThreadId),
) {
    // 处理初始请求
    spawn_stream_request(app, session, stream_states, approval_tx.clone(), initial_request);

    // 键盘事件专用线程：持续读取 crossterm 事件，通过 channel 发送
    // 这样 select! 中的 kb_rx.recv() 与 output_rx.recv() 是同类 channel receiver，公平竞争
    let (kb_tx, mut kb_rx) = tokio::sync::mpsc::unbounded_channel::<crossterm::event::Event>();
    let kb_thread = std::thread::spawn({
        let kb_tx = kb_tx.clone();
        move || {
            loop {
                match crossterm::event::poll(std::time::Duration::from_millis(50)) {
                    Ok(true) => {
                        if let Ok(event) = crossterm::event::read() {
                            if kb_tx.send(event).is_err() {
                                break; // channel 已关闭，退出线程
                            }
                        }
                    }
                    Ok(false) => {} // 超时，继续轮询
                    Err(_) => {
                        // 终端瞬时错误（如 resize 信号），不退出，继续重试
                        std::thread::sleep(std::time::Duration::from_millis(100));
                        continue;
                    }
                }
            }
        }
    });

    // 单层事件循环
    loop {
        let active_id = app.thread.store.active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| app.thread.store.primary_id());

        // === 从 stream_states 取出当前线程的 receivers（借用，不移动所有权） ===
        // 用 Option::take() 临时取出，select! 结束后放回
        let (mut output_rx, mut status_rx, mut thread_event_rx, mut thread_event_tx, mut approval_tx_for_resend, mut stream_handle) =
            if let Some(state) = stream_states.get_mut(&active_id) {
                (
                    state.output_rx.take(),
                    state.status_rx.take(),
                    state.thread_event_rx.take(),
                    state.thread_event_tx.take(),
                    state.approval_tx_for_resend.take(),
                    state.handle.take(),
                )
            } else {
                (None, None, None, None, None, None)
            };

        // 检查是否有活跃的 stream
        let has_active_stream = output_rx.is_some();

        // select! 用临时变量
        let control = tokio::select! {
            // === AI 输出 ===
            msg = async {
                match output_rx.as_mut() {
                    Some(rx) => rx.recv().await,
                    None => std::future::pending::<Option<OutputMessage>>().await,
                }
            }, if has_active_stream => {
                if let Some(msg) = msg {
                    match msg {
                        OutputMessage::Text(line) => {
                            app.append_streaming_output(active_id, line.clone());
                            if let Some(tx) = thread_event_tx.as_ref() {
                                let _ = tx.send(thread::ThreadEvent::NewMessage {
                                    thread_id: active_id,
                                    message: line,
                                });
                            }
                        }
                        OutputMessage::Diff(diff) => {
                            app.push_diff_if_active_thread(active_id, diff);
                        }
                    }
                    app.render();
                    StreamingControl::Continue
                } else {
                    // output_rx 返回 None → channel 关闭 → 活跃线程 stream 完成
                    // 清理该线程的 stream state，防止已关闭的 channel 饥饿其他分支
                    if let Some(mut state) = stream_states.remove(&active_id) {
                        state.handle.take();
                        app.cleanup_after_stream(active_id);
                        app.push_line_if_active_thread(active_id, String::new());
                        app.render();
                    }
                    if stream_states.is_empty() {
                        StreamingControl::StreamFinished
                    } else {
                        StreamingControl::Continue
                    }
                }
            }

            // === 状态更新 ===
            status = async {
                match status_rx.as_mut() {
                    Some(rx) => rx.recv().await,
                    None => std::future::pending::<Option<String>>().await,
                }
            }, if has_active_stream => {
                if let Some(status) = status {
                    app.set_status(status);
                    app.render();
                }
                StreamingControl::Continue
            }

            // === 审批请求（全局 channel） ===
            Some(request) = approval_rx.recv() => {
                let current_id = app.thread.store.active_thread()
                    .map(|t| t.id)
                    .unwrap_or_else(|| app.thread.store.primary_id());

                if request.thread_id == current_id {
                    app.set_approval_pending(request);
                    app.render();
                    // 审批模式：进入 async 循环，通过 kb_rx 读取键盘事件
                    // 注意：需要先放回 receivers 再进入审批循环，因为审批循环是 async
                    // 简化处理：设置审批状态，键盘分支会自动检测并处理
                } else {
                    app.set_approval_pending(request);
                }
                StreamingControl::Continue
            }

            // === 线程事件 ===
            event = async {
                match thread_event_rx.as_mut() {
                    Some(rx) => rx.recv().await,
                    None => std::future::pending::<Option<thread::ThreadEvent>>().await,
                }
            }, if has_active_stream => {
                if let Some(event) = event {
                    match event {
                        thread::ThreadEvent::NewMessage { thread_id, message } => {
                            app.thread.messages.push(thread_id, thread::Message::assistant(message.clone()));
                            if let Some(active) = app.thread.store.active_thread() {
                                if active.id == thread_id {
                                    app.push_line(message);
                                    app.render();
                                }
                            }
                        }
                        thread::ThreadEvent::StatusChange { thread_id, status } => {
                            app.thread.store.update_status(thread_id, status);
                            app.render();
                        }
                        thread::ThreadEvent::Closed { thread_id } => {
                            app.thread.store.remove_thread(thread_id);
                            app.thread.messages.remove_thread(thread_id);
                            app.render();
                        }
                    }
                }
                StreamingControl::Continue
            }

            // === 键盘/鼠标事件（专用线程 + channel，与 stream output 公平竞争） ===
            Some(event) = kb_rx.recv() => {
                // 检查所有线程的 stream 是否完成
                let completed: Vec<_> = stream_states.iter()
                    .filter(|(_, s)| s.handle.as_ref().map_or(false, |h| h.is_finished()))
                    .map(|(id, _)| *id)
                    .collect();
                for id in completed {
                    if let Some(mut state) = stream_states.remove(&id) {
                        state.handle.take();
                        app.cleanup_after_stream(id);
                        app.push_line_if_active_thread(id, String::new());
                        app.render();
                    }
                }

                // 如果所有线程都完成了
                if stream_states.is_empty() {
                    StreamingControl::StreamFinished
                } else {
                    // 鼠标滚轮：streaming 期间也需要支持滚动
                    let mouse_scrolled = if let crossterm::event::Event::Mouse(mouse) = &event {
                        match mouse.kind {
                            crossterm::event::MouseEventKind::ScrollUp => {
                                app.scroll_up(3);
                                app.render();
                                true
                            }
                            crossterm::event::MouseEventKind::ScrollDown => {
                                app.scroll_down(3);
                                app.render();
                                true
                            }
                            _ => false,
                        }
                    } else {
                        false
                    };

                    if mouse_scrolled {
                        StreamingControl::Continue
                    } else {
                        // 处理键盘事件
                        handle_single_key_event(app, stream_states, &active_id, event)
                    }
                }
            }
        };

        // === 放回 receivers 和 handle（如果线程仍在 streaming） ===
        if let Some(state) = stream_states.get_mut(&active_id) {
            if state.output_rx.is_none() && output_rx.is_some() {
                state.output_rx = output_rx;
                state.status_rx = status_rx;
                state.thread_event_rx = thread_event_rx;
                state.thread_event_tx = thread_event_tx;
                state.approval_tx_for_resend = approval_tx_for_resend;
            }
            if state.handle.is_none() && stream_handle.is_some() {
                state.handle = stream_handle;
            }
        }

        // === 处理控制信号 ===
        match control {
            StreamingControl::Continue => {}
            StreamingControl::ThreadSwitch => {
                // 线程切换：receivers 已放回旧线程，continue 重新循环获取新 active_id
                continue;
            }
            StreamingControl::StreamFinished => {
                // 清理已完成的线程
                if stream_states.contains_key(&active_id) {
                    app.cleanup_after_stream(active_id);
                    app.push_line_if_active_thread(active_id, String::new());
                    app.render();
                    stream_states.remove(&active_id);
                }
                // 检查队列
                if let Some(next) = app.dequeue() {
                    spawn_stream_request(app, session, stream_states, approval_tx.clone(), next);
                } else if stream_states.is_empty() {
                    // 所有线程完成，回到 run_loop
                    break;
                }
                // 还有后台线程在 streaming，继续循环
            }
            StreamingControl::Interrupted => {
                // Ctrl+C 中断当前线程
                break;
            }
            StreamingControl::Exit => {
                break;
            }
            StreamingControl::NewRequest { text, thread_id } => {
                spawn_stream_request(app, session, stream_states, approval_tx.clone(), (text, thread_id));
            }
        }
    }

    // 清理：streaming 循环退出时，清除所有残留的审批状态
    // 场景：AI 请求了审批但 streaming 已结束（response_tx 已关闭），
    // 审批状态残留在 approval_states 中，会导致 run_loop 的审批拦截吞掉所有键盘事件
    app.approval.states.clear();

    // 关闭键盘线程的 channel
    drop(kb_tx);
    drop(kb_rx); // 必须在 join() 之前 drop receiver，否则线程内的 clone sender 仍能 send 成功，导致 join() 永远阻塞
    let _ = kb_thread.join();
}

/// 为指定线程 spawn AI streaming 请求
fn spawn_stream_request(
    app: &mut tui::App,
    session: &std::sync::Arc<tokio::sync::Mutex<session::Session>>,
    stream_states: &mut std::collections::HashMap<thread::ThreadId, StreamState>,
    global_approval_tx: tokio::sync::mpsc::UnboundedSender<approval_overlay::ApprovalRequest>,
    request: (String, thread::ThreadId),
) {
    let (input, thread_id) = request;

    // 显示用户输入
    let theme = render::default_theme();
    app.push_line_if_active_thread(thread_id, format!("{}⟩{} {}", theme.brand, render::RESET, &input));
    app.thread.messages.push(thread_id, thread::Message::user(input.clone()));
    app.render();

    // 设置 busy
    app.set_thread_busy(thread_id, true);
    app.set_status("Thinking...".to_string());
    app.begin_streaming(thread_id);
    app.render();

    // 创建 channels
    let (output_tx, output_rx) = tokio::sync::mpsc::unbounded_channel::<OutputMessage>();
    let (status_tx, status_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let approval_tx_for_resend = global_approval_tx.clone();
    let (thread_event_tx, thread_event_rx) = tokio::sync::mpsc::unbounded_channel::<thread::ThreadEvent>();
    let thread_event_tx_task = thread_event_tx.clone();

    // spawn — stream_prompt_tui 是关联函数，接受 Arc<Mutex<Self>>
    let session_clone = session.clone();
    let thread_ctx = app.ensure_session_context(thread_id);
    let task_store = app.ensure_task_store(thread_id);
    let handle = tokio::spawn(async move {
        session::Session::stream_prompt_tui(
            session_clone, thread_ctx, &input,
            output_tx, status_tx, global_approval_tx, thread_event_tx_task, thread_id, task_store,
        ).await
    });

    // 存入 stream_states（receivers 属于线程）
    stream_states.insert(thread_id, StreamState {
        handle: Some(handle),
        output_rx: Some(output_rx),
        status_rx: Some(status_rx),
        thread_event_rx: Some(thread_event_rx),
        thread_event_tx: Some(thread_event_tx),
        approval_tx_for_resend: Some(approval_tx_for_resend),
    });
}

/// 处理 streaming 期间的单个键盘事件（由 select! 键盘分支调用）
fn handle_single_key_event(
    app: &mut tui::App,
    stream_states: &mut std::collections::HashMap<thread::ThreadId, StreamState>,
    active_id: &thread::ThreadId,
    event: crossterm::event::Event,
) -> StreamingControl {
    // 忽略 Key Release 事件
    if matches!(event, crossterm::event::Event::Key(ref k) if k.kind == crossterm::event::KeyEventKind::Release) {
        return StreamingControl::Continue;
    }

    // 审批模式
    if app.is_approving() {
        if let crossterm::event::Event::Key(key) = event {
            use crossterm::event::KeyCode;

            let options_count = if let Some(ref req) = app.approval_state_ref() {
                approval_overlay::build_approval_options(req).len()
            } else {
                0
            };

            let mut decision: Option<approval_overlay::ApprovalDecision> = None;

            match key.code {
                KeyCode::Up | KeyCode::Down => {
                    if options_count > 0 {
                        if key.code == KeyCode::Up {
                            app.approval.selected = if app.approval.selected > 0 { app.approval.selected - 1 } else { options_count - 1 };
                        } else {
                            app.approval.selected = if app.approval.selected + 1 < options_count { app.approval.selected + 1 } else { 0 };
                        }
                        app.render();
                    }
                    return StreamingControl::Continue; // 审批内滚动，不 fallthrough
                }
                KeyCode::Enter => {
                    if options_count > 0 {
                        if let Some(ref req) = app.approval_state_ref() {
                            let options = approval_overlay::build_approval_options(req);
                            if app.approval.selected < options.len() {
                                decision = Some(options[app.approval.selected].decision);
                            }
                        }
                    }
                }
                KeyCode::Char(c) if c.is_ascii_digit() => {
                    let digit = c.to_digit(10).unwrap() as usize;
                    if digit > 0 && digit <= options_count {
                        if let Some(ref req) = app.approval_state_ref() {
                            let options = approval_overlay::build_approval_options(req);
                            decision = Some(options[digit - 1].decision);
                        }
                    }
                }
                KeyCode::Esc => {
                    decision = approval_overlay::resolve_approval_key(key);
                }
                _ => {
                    decision = approval_overlay::resolve_approval_key(key);
                }
            }

            if let Some(dec) = decision {
                // 审批决策已做出：发送响应，streaming 继续（不 abort！）
                let msg = app.resolve_approval(dec);
                app.push_line(msg);
                app.render();
            }
        }
        return StreamingControl::Continue;
    }

    // 普通键盘事件
    if let crossterm::event::Event::Key(key) = event {
        use crossterm::event::KeyCode;
        use crossterm::event::KeyModifiers;
        let mut consumed = false;

        // === Ctrl+C ===
        if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c') {
            app.clear_queue();
            if let Some(mut state) = stream_states.remove(active_id) {
                if let Some(h) = state.handle.take() {
                    h.abort();
                }
                app.end_streaming(*active_id);
                app.push_line_if_active_thread(*active_id, String::new());
                app.push_line_if_active_thread(*active_id, "^C 已中断 AI 响应".to_string());
            }
            app.set_thread_busy(*active_id, false);
            // 清理所有后台线程
            let all_ids: Vec<_> = stream_states.keys().copied().collect();
            for id in all_ids {
                if let Some(mut state) = stream_states.remove(&id) {
                    if let Some(h) = state.handle.take() {
                        h.abort();
                    }
                    app.cleanup_after_stream(id);
                }
            }
            return StreamingControl::Interrupted;
        }

        // === Ctrl+D：diff 模式 ===
        if key.code == KeyCode::Char('d') && key.modifiers.contains(KeyModifiers::CONTROL)
            && !app.is_diff_mode() && !app.diff.files.is_empty()
        {
            app.enter_diff_mode();
            consumed = true;
        } else if app.is_diff_mode() {
            use crate::event::{EventHandler, ControlFlow};
            use crate::event::handlers::DiffModeHandler;
            let mut handler = DiffModeHandler;
            let _ = handler.handle(&crossterm::event::Event::Key(key), app);
            consumed = true;
        }

        // === Ctrl+O ===
        if key.code == KeyCode::Char('o') && key.modifiers.contains(KeyModifiers::CONTROL)
            && !app.is_overlay_mode()
        {
            use crate::detail_overlay::DetailOverlay;
            if let Some(response) = app.get_last_ai_response() {
                let overlay = DetailOverlay::new_transcript(response.to_string());
                app.enter_overlay_mode(overlay);
                consumed = true;
            } else if let Some(buffer) = app.get_streaming_buffer() {
                let overlay = DetailOverlay::new_transcript(buffer.to_string());
                app.enter_overlay_mode(overlay);
                consumed = true;
            }
        } else if app.is_overlay_mode() {
            use crate::event::{EventHandler, ControlFlow};
            use crate::event::handlers::DetailModeHandler;
            let mut handler = DetailModeHandler;
            let _ = handler.handle(&crossterm::event::Event::Key(key), app);
            consumed = true;
        }

        // === Ctrl+T ===
        if !consumed && key.code == KeyCode::Char('t') && key.modifiers.contains(KeyModifiers::CONTROL)
            && app.mode == crate::tui::Mode::Normal
        {
            if app.thread.store.len() < 5 {
                let name = format!("Thread-{}", app.thread.store.len());
                app.create_side_thread(Some(name));
                app.thread.active_mode = true;
                // 不设置 ThreadPicker 模式：streaming loop 中没有退出 ThreadPicker 的处理逻辑，
                // 会导致所有 mode == Normal 守卫被阻止，快捷键失效
                consumed = true;
            }
        }
        // === Alt+Left ===
        else if !consumed && key.code == KeyCode::Left && key.modifiers.contains(KeyModifiers::ALT)
            && app.mode == crate::tui::Mode::Normal
        {
            if let Some(prev_id) = app.thread.store.previous_thread() {
                app.switch_thread(prev_id);
                app.render();
                return StreamingControl::ThreadSwitch;
            }
            consumed = true;
        }
        // === Alt+Right ===
        else if !consumed && key.code == KeyCode::Right && key.modifiers.contains(KeyModifiers::ALT)
            && app.mode == crate::tui::Mode::Normal
        {
            if let Some(next_id) = app.thread.store.next_thread() {
                app.switch_thread(next_id);
                app.render();
                return StreamingControl::ThreadSwitch;
            }
            consumed = true;
        }
        // === Esc ===
        else if !consumed && key.code == KeyCode::Esc && app.thread.active_mode
            && app.mode == crate::tui::Mode::Normal
        {
            if app.return_to_parent() {
                app.render();
                if let Some(thread) = app.thread.store.active_thread() {
                    if thread.kind == crate::thread::ThreadKind::Main {
                        app.thread.active_mode = false;
                        app.mode = crate::tui::Mode::Normal;
                    }
                }
            }
            consumed = true;
        }

        // 滚动
        if !consumed && app.mode == crate::tui::Mode::Normal {
            match key.code {
                KeyCode::PageUp => { app.scroll_up(5); consumed = true; }
                KeyCode::PageDown => { app.scroll_down(5); consumed = true; }
                KeyCode::Up if key.modifiers.contains(KeyModifiers::SHIFT) => { app.scroll_up(3); consumed = true; }
                KeyCode::Down if key.modifiers.contains(KeyModifiers::SHIFT) => { app.scroll_down(3); consumed = true; }
                _ => {}
            }
        }

        if consumed {
            app.render();
            return StreamingControl::Continue;
        }

        // === 输入框 ===
        use input_composer::InputAction;
        let action = app.input.handle_key(key);
        match action {
            InputAction::Submit(text) => {
                let current_thread_id = app.thread.store.active_thread()
                    .map(|t| t.id)
                    .unwrap_or_else(|| app.thread.store.primary_id());

                if app.is_current_thread_busy() {
                    app.enqueue(text);
                    app.render();
                } else {
                    return StreamingControl::NewRequest {
                        text,
                        thread_id: current_thread_id,
                    };
                }
            }
            InputAction::Exit => {}
            InputAction::Interrupt => {}
            InputAction::None => {
                if app.command_popup.is_visible() || app.input.value().starts_with('/') {
                    app.command_popup.update(app.input.value());
                }
                app.render();
            }
        }
    }

    StreamingControl::Continue
}

/// 🖥️ TUI 全屏 REPL 核心（async）
async fn run_tui_repl_async(resume_name: Option<String>) -> Result<(), String> {
    // 🔇 全局禁用调试日志
    std::env::set_var("IFAI_QUIET", "1");

    // 解析有效配置
    let config = config::EffectiveConfig::resolve(None, None, None, None)?;

    // 初始化 Session（使用 Arc<Mutex> 以便在 spawn 中共享）
    let session = session::Session::new(config.provider().to_string(), config.model().to_string());
    let session = std::sync::Arc::new(tokio::sync::Mutex::new(session));

    {
        let mut s = session.lock().await;
        if let Some(api_key) = config.api_key() {
            s.set_api_key(api_key.to_string());
        }
        if let Some(base_url) = config.base_url() {
            s.set_base_url(base_url.to_string());
        }
        let current_dir = std::env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e))?;
        s.set_project_root(current_dir.to_string_lossy().to_string());
    }

    // 加载历史记录
    let history_path = dirs::home_dir()
        .map(|home| home.join(".ifai").join("history"))
        .ok_or("Failed to determine home directory")?;
    if let Some(parent) = history_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    // 创建 TUI App
    let mut app = tui::App::new().map_err(|e| format!("Failed to initialize TUI: {}", e))?;

    if let Some(name) = &resume_name {
        app.push_line(format!("Resuming session: {}", name));
        app.push_line(String::new());
    }

    // 加载历史
    app.input.load_history(&history_path);

    // 主循环
    loop {
        match app.run_loop() {
            AppResult::Submit(text) => {
                // 添加历史
                app.input.add_history(&text);
                let _ = app.input.save_history(&history_path);

                // 退出命令
                if text == "/exit" || text == "/quit" {
                    break;
                }

                if text.starts_with('/') {
                    // 显示命令输入
                    let theme = render::default_theme();
                    app.push_line(format!("{}⟩{} {}", theme.brand, render::RESET, &text));
                    app.scroll_to_bottom();
                    app.render();
                    let parts: Vec<&str> = text.splitn(2, ' ').collect();
                    let cmd = &parts[0][1..];
                    let arg = parts.get(1).map(|s| s.to_string());

                    // === /thread 系列命令拦截（需要 App 访问，不走 Session dispatch） ===
                    if cmd == "thread" {
                        handle_thread_command(&mut app, arg.as_deref());
                        continue;
                    }

                    let mut s = session.lock().await;
                    match commands::dispatch_command(&mut s, cmd, arg.as_deref()) {
                        Ok(Some(output)) => {
                            for line in output.split('\n') {
                                app.push_line(line.to_string());
                            }
                        }
                        Ok(None) => {}
                        Err(e) => {
                            app.push_line(format!("Error: {}", e));
                        }
                    }
                } else {
                    // AI 调用 — 单层 select! 事件循环（StreamState per-thread）
                    let thread_id = app.thread.store.active_thread()
                        .map(|t| t.id)
                        .unwrap_or_else(|| app.thread.store.primary_id());
                    let (approval_tx, mut approval_rx) =
                        tokio::sync::mpsc::unbounded_channel::<approval_overlay::ApprovalRequest>();
                    let mut stream_states: std::collections::HashMap<thread::ThreadId, StreamState> =
                        std::collections::HashMap::new();
                    run_streaming_loop(&mut app, &session, &mut stream_states, approval_tx, &mut approval_rx, (text, thread_id)).await;
                }
            }
            AppResult::Exit => {
                break;
            }
            AppResult::Handled => {}
        }
    }

    // 保存历史
    let _ = app.input.save_history(&history_path);

    Ok(())
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::common::*;

    // 包含测试基础设施
    pub mod common {
        pub mod test_env {
            include!("tests/common/test_env.rs");
        }
        pub mod assertions {
            include!("tests/common/assertions.rs");
        }
        pub mod mock_server {
            include!("tests/common/mock_server.rs");
        }
        pub mod fixtures {
            include!("tests/common/fixtures.rs");
        }
        pub mod network {
            include!("tests/common/network.rs");
        }

        pub use assertions::*;
        pub use fixtures::*;
        pub use mock_server::*;
        pub use network::*;
        pub use test_env::*;
    }

    // 包含生成的集成测试
    mod generated {
        use crate::tests::common::*;
        include!("tests/generated/mod.rs");
    }

    // E2E 真实 API 测试（需要真实 API，默认不编译，需 --features real-llm）
    #[cfg(feature = "real-llm")]
    mod e2e {
        use crate::tests::common::*;
        include!("tests/e2e/real_providers.rs");
    }

    // E2E Mock SSE Proxy 测试（模拟 LLM 多轮对话）
    mod e2e_mock {
        use crate::tests::common::*;
        include!("tests/e2e/empty_args_loop.rs");
    }

    // 注意：旧的 CLI 模式压缩测试已移除
    // 真正的压缩测试现在使用 Session API，位于：
    // - session.rs: session::tests::test_compression_*
    // - tests/generated/session_compression.rs

    #[test]
    fn test_parse_args_no_args() {
        let action = parse_args_from_vec(&["ifai".to_string()]).unwrap();
        assert!(matches!(action, CliAction::Repl));
    }

    #[test]
    fn test_parse_args_version_short() {
        let action = parse_args_from_vec(&["ifai".to_string(), "-V".to_string()]).unwrap();
        assert!(matches!(action, CliAction::Version));
    }

    #[test]
    fn test_parse_args_version_long() {
        let action = parse_args_from_vec(&["ifai".to_string(), "--version".to_string()]).unwrap();
        assert!(matches!(action, CliAction::Version));
    }

    #[test]
    fn test_parse_args_help_short() {
        let action = parse_args_from_vec(&["ifai".to_string(), "-h".to_string()]).unwrap();
        assert!(matches!(action, CliAction::Help));
    }

    #[test]
    fn test_parse_args_help_long() {
        let action = parse_args_from_vec(&["ifai".to_string(), "--help".to_string()]).unwrap();
        assert!(matches!(action, CliAction::Help));
    }

    #[test]
    fn test_parse_args_prompt() {
        let action = parse_args_from_vec(&["ifai".to_string(), "hello world".to_string()]).unwrap();
        match action {
            CliAction::Prompt {
                text,
                json_output,
                no_tool,
                system,
            } => {
                assert_eq!(text, "hello world");
                assert!(!json_output);
                assert!(!no_tool);
                assert!(system.is_none());
            }
            _ => panic!("Expected Prompt action"),
        }
    }

    #[test]
    fn test_parse_args_system() {
        let action = parse_args_from_vec(&[
            "ifai".to_string(),
            "--system".to_string(),
            "You are expert".to_string(),
            "hello".to_string(),
        ])
        .unwrap();
        match action {
            CliAction::Prompt { text, system, .. } => {
                assert_eq!(text, "hello");
                assert_eq!(system, Some("You are expert".to_string()));
            }
            _ => panic!("Expected Prompt action with system"),
        }
    }

    #[test]
    fn test_parse_args_json() {
        let action = parse_args_from_vec(&[
            "ifai".to_string(),
            "--json".to_string(),
            "hello".to_string(),
        ])
        .unwrap();
        match action {
            CliAction::Prompt { json_output, .. } => {
                assert!(json_output);
            }
            _ => panic!("Expected Prompt action with json_output"),
        }
    }

    #[test]
    fn test_parse_args_combined_flags() {
        let action = parse_args_from_vec(&[
            "ifai".to_string(),
            "--system".to_string(),
            "Expert".to_string(),
            "--json".to_string(),
            "--no-tool".to_string(),
            "hello".to_string(),
        ])
        .unwrap();
        match action {
            CliAction::Prompt {
                text,
                json_output,
                no_tool,
                system,
            } => {
                assert_eq!(text, "hello");
                assert!(json_output);
                assert!(no_tool);
                assert_eq!(system, Some("Expert".to_string()));
            }
            _ => panic!("Expected Prompt action with all flags"),
        }
    }

    #[test]
    fn test_parse_args_config_init() {
        let action = parse_args_from_vec(&[
            "ifai".to_string(),
            "--config".to_string(),
            "init".to_string(),
        ])
        .unwrap();
        assert!(matches!(action, CliAction::ConfigInit));
    }

    #[test]
    fn test_parse_args_config_show() {
        let action = parse_args_from_vec(&[
            "ifai".to_string(),
            "--config".to_string(),
            "show".to_string(),
        ])
        .unwrap();
        assert!(matches!(action, CliAction::ConfigShow));
    }

    #[test]
    fn test_parse_args_resume() {
        let action = parse_args_from_vec(&[
            "ifai".to_string(),
            "--resume".to_string(),
            "mysession".to_string(),
        ])
        .unwrap();
        match action {
            CliAction::Resume { name } => assert_eq!(name, "mysession"),
            _ => panic!("Expected Resume action"),
        }
    }

    #[test]
    fn test_parse_args_provider_override() {
        let action = parse_args_from_vec(&[
            "ifai".to_string(),
            "--provider".to_string(),
            "openai".to_string(),
        ])
        .unwrap();
        assert!(matches!(action, CliAction::Repl));
    }

    #[test]
    fn test_parse_args_unknown_flag() {
        let result = parse_args_from_vec(&["ifai".to_string(), "--unknown".to_string()]);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_args_flag_without_value() {
        let result = parse_args_from_vec(&["ifai".to_string(), "--provider".to_string()]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("requires a value"));
    }

    /// Helper: 从 Vec 模拟解析
    fn parse_args_from_vec(args: &[String]) -> Result<CliAction, String> {
        parse_args_from_list(args)
    }
}
