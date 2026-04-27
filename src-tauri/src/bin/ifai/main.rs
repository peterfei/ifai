//! IfAI CLI - Main Entry Point
//!
//! 🏛️ 零外部依赖：手动参数解析 + CliAction dispatch + REPL 循环

mod render;
mod provider;
mod config;
mod commands;
mod session;
// ✅ prompts.rs 已删除：CLI 现在使用 ifainew_lib::prompt_manager
mod prompt_vars; // 🏛️ 元编程：变量自动收集器
mod permission;  // 🔥 元编程权限引擎
mod token;       // 🔥 元编程 Token 显示层
mod persistence; // 🔥 元编程会话持久化
mod pipeline;    // 🎨 元编程 Pipeline 可视化
mod loop_detector; // 🎨 元编程循环检测引擎
mod terminal;    // 🔥 终端抽象层（ANSI 光标定位）
mod tui_layout;  // 🔥 声明式 TUI 布局层
mod tui;         // 🔥 ratatui 全屏 TUI 模块
mod input_composer; // 🔥 输入框组件（替代 rustyline）
mod stream_render; // 🔥 声明式流式渲染管道
mod markdown_stream; // 🎨 Markdown 代码块流式渲染器
mod code_folding; // 🎨 代码折叠 - 元编程架构
mod syntax_highlight; // 🎨 语法高亮 - 元编程架构
mod markdown_meta; // 🎨 Markdown 元编程驱动层
mod smart_glob_summary; // 🔥 智能 Glob 搜索 - 元编程架构（简化版）
mod approval_overlay; // 🔥 TUI 工具审批 Overlay
mod permission_store; // 🔥 权限规则存储（用户白名单）
mod event; // 🔥 TUI 事件系统 - 元编程级声明式事件处理框架
mod welcome; // 🔥 TUI 欢迎页组件
mod keybindings; // 🔥 快捷键定义和帮助系统

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
}

use std::env;
use std::io::{self, IsTerminal, Write};
use serde::{Deserialize, Serialize};
use rustyline::Editor;

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
    fn error(
        provider: String,
        model: String,
        prompt: String,
        error_message: String,
    ) -> Self {
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
    Prompt { text: String, json_output: bool, no_tool: bool },

    /// REPL 交互模式：`ifai` 或 `ifai --repl`
    Repl,

    /// 显示版本：`ifai --version` / `ifai -V`
    Version,

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

    for (i, arg) in args.iter().enumerate() {
        if skip_next {
            skip_next = false;
            continue;
        }

        match arg.as_str() {
            "--version" | "-V" => return Ok(CliAction::Version),

            "--json" => {
                // 🔥 JSON 输出模式
                json_output = true;
            }

            "--no-tool" => {
                // 🔥 禁用工具调用
                no_tool = true;
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
            _ => Err(format!("unknown config subcommand: {}. Use 'init' or 'show'", action)),
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
        });
    }

    // 🔥 只有标志，没有 prompt 文本 → 保存标志用于管道输入
    if json_output || no_tool {
        // 返回一个虚拟的 Prompt，稍后会从 stdin 读取
        return Ok(CliAction::Prompt {
            text: String::new(),  // 占位符，会被 stdin 覆盖
            json_output,
            no_tool,
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
    // 🔥 检测 stdin 管道输入（非 TTY）
    let is_piped = !io::stdin().is_terminal();

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
    let action = if is_piped {
        // 获取当前的设置
        let (current_json_output, current_no_tool) = match &action {
            CliAction::Prompt { json_output, no_tool, .. } => (*json_output, *no_tool),
            _ => (false, false),
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
                    }
                }
            }
            Err(e) => {
                eprintln!("Error reading stdin: {}", e);
                std::process::exit(1);
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

        CliAction::Prompt { text, json_output, no_tool } => {
            run_prompt(&text, json_output, no_tool)?;
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
    println!("IfAI CLI v0.4.4");
    println!("Industrial-grade AI code assistant");
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

    println!("{}", render::render_banner("v0.4.4", &config.provider(), &config.model(), &theme));
    println!();
    println!("{}", render::render_config_chain(
        None,  // CLI arg
        None,  // env var
        None,  // file
        &format!("{} (default)", config.provider()),  // YAML default
        &theme,
    ));

    Ok(())
}

/// 运行单次提示词模式
///
/// **用途**: `ifai "your prompt"` 或 `echo "prompt" | ifai`
async fn run_prompt_async(text: &str, json_output: bool, no_tool: bool) -> Result<(), String> {
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

    // 🔥 从配置读取 API key
    if let Some(api_key) = config.api_key() {
        session.set_api_key(api_key.to_string());
    }

    // 🔥 从配置读取 Base URL
    if let Some(base_url) = config.base_url() {
        session.set_base_url(base_url.to_string());
    }

    // 🔥 设置项目根目录
    let current_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
    session.set_project_root(current_dir.to_string_lossy().to_string());

    // 🔥 JSON 模式：不打印流式输出，只缓冲
    if json_output {
        // 记录初始 token 计数
        let initial_input_tokens = session.cumulative_input_tokens;
        let initial_output_tokens = session.cumulative_output_tokens;

        match session.stream_prompt(text).await {
            Ok(content) => {
                // 计算本次请求的 token 使用量
                let input_tokens = session.cumulative_input_tokens - initial_input_tokens;
                let output_tokens = session.cumulative_output_tokens - initial_output_tokens;

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
                let response = JsonResponse::error(
                    provider,
                    model,
                    text.to_string(),
                    e,
                );
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
fn run_prompt(text: &str, json_output: bool, no_tool: bool) -> Result<(), String> {
    // 创建 tokio runtime
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {}", e))?;

    // 在 async runtime 中运行
    rt.block_on(async {
        run_prompt_async(text, json_output, no_tool).await
    })
}

/// 🔄 运行 REPL 循环
async fn run_repl_async(resume_name: Option<String>) -> Result<(), String> {
    // 🔇 全局禁用调试日志（必须在最前面）
    std::env::set_var("IFAI_QUIET", "1");

    // 解析有效配置
    let config = config::EffectiveConfig::resolve(None, None, None, None)?;
    let theme = render::default_theme();

    // 显示 Banner
    println!("{}", render::render_banner("v0.4.4", &config.provider(), &config.model(), &theme));
    println!();

    // 初始化 Session
    let mut session = session::Session::new(config.provider().to_string(), config.model().to_string());

    // 🔥 从配置读取 API key（优先级：CLI > Env > TOML > Default）
    if let Some(api_key) = config.api_key() {
        session.set_api_key(api_key.to_string());
    }

    // 🔥 从配置读取 Base URL（优先级：CLI > TOML > Default）
    if let Some(base_url) = config.base_url() {
        session.set_base_url(base_url.to_string());
    }

    // 🔥 FIX: 设置项目根目录为当前工作目录
    let current_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
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
                if e.kind() == io::ErrorKind::UnexpectedEof || e.kind() == io::ErrorKind::Interrupted {
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
            let token_count = token::estimate_tokens(&session.messages);
            let max_tokens = token::get_model_max_tokens(&session.model);

            // 警告阈值：80% 的上下文窗口
            if token_count > (max_tokens * 80 / 100) && session.messages.len() >= 10 {
                eprintln!("{}Warning: Context size ({} tokens, {} messages) exceeds 80% of model limit ({}).{}",
                    render::color_256(208), token_count, session.messages.len(), max_tokens, render::RESET);
                eprintln!("{}Consider using /compact to reduce context size, or /clear to start fresh.{}",
                    render::color_256(208), render::RESET);
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
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {}", e))?;

    // 在 async runtime 中运行 REPL
    rt.block_on(async {
        run_repl_async(resume_name).await
    })
}

/// 🖥️ 运行 TUI 全屏 REPL（同步包装）
fn run_tui_repl(resume_name: Option<String>) -> Result<(), String> {
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {}", e))?;

    rt.block_on(async {
        run_tui_repl_async(resume_name).await
    })
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
    let mut app = tui::App::new()
        .map_err(|e| format!("Failed to initialize TUI: {}", e))?;

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

                // 显示用户输入
                let theme = render::default_theme();
                app.push_line(format!("{}⟩{} {}", theme.brand, render::RESET, &text));

                if text.starts_with('/') {
                    // REPL 命令
                    let parts: Vec<&str> = text.splitn(2, ' ').collect();
                    let cmd = &parts[0][1..];
                    let arg = parts.get(1).map(|s| s.to_string());

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
                    // AI 调用 — 使用 channel 接收流式输出
                    app.set_busy(true);
                    app.set_status("Thinking...".to_string());
                    app.render();

                    let (output_tx, mut output_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
                    let (status_tx, mut status_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
                    let (approval_tx, mut approval_rx) = tokio::sync::mpsc::unbounded_channel::<approval_overlay::ApprovalRequest>();

                    let session_clone = session.clone();
                    let input = text.clone();

                    // 在后台任务中运行 stream_prompt
                    let mut stream_handle = tokio::spawn(async move {
                        let mut s = session_clone.lock().await;
                        s.stream_prompt_tui(&input, output_tx, status_tx, approval_tx).await
                    });

                    // 实时接收输出并渲染
                    loop {
                        tokio::select! {
                            Some(line) = output_rx.recv() => {
                                app.push_line(line);
                                app.render();
                            }
                            Some(status) = status_rx.recv() => {
                                app.set_status(status);
                                app.render();
                            }
                            Some(request) = approval_rx.recv() => {
                                app.set_approval_pending(request);
                                app.render();

                                // 审批模式：拦截按键直到决策
                                loop {
                                    if crossterm::event::poll(std::time::Duration::from_millis(50)).unwrap_or(false) {
                                        if let Ok(crossterm::event::Event::Key(key)) = crossterm::event::read() {
                                            use crossterm::event::KeyCode;

                                            // 获取当前审批请求的选项数量
                                            let options_count = if let Some(ref req) = app.approval_state_ref() {
                                                approval_overlay::build_approval_options(req).len()
                                            } else {
                                                0
                                            };

                                            let mut should_break = false;

                                            // 处理按键
                                            match key.code {
                                                KeyCode::Up | KeyCode::Down => {
                                                    // 箭头键：更新选中项并继续等待（不退出循环）
                                                    if options_count > 0 {
                                                        if key.code == KeyCode::Up {
                                                            if app.approval_selected > 0 {
                                                                app.approval_selected -= 1;
                                                            } else {
                                                                app.approval_selected = options_count - 1; // 循环到最后
                                                            }
                                                        } else {
                                                            if app.approval_selected + 1 < options_count {
                                                                app.approval_selected += 1;
                                                            } else {
                                                                app.approval_selected = 0; // 循环到第一个
                                                            }
                                                        }
                                                        app.render();
                                                    }
                                                    // 箭头键不退出循环，继续等待下一个按键
                                                }
                                                KeyCode::Enter => {
                                                    // Enter：确认当前选中项并退出循环
                                                    if options_count > 0 {
                                                        if let Some(ref req) = app.approval_state_ref() {
                                                            let options = approval_overlay::build_approval_options(req);
                                                            if app.approval_selected < options.len() {
                                                                let decision = options[app.approval_selected].decision;
                                                                let msg = app.resolve_approval(decision);
                                                                app.push_line(msg);
                                                                app.render();
                                                                should_break = true;
                                                            }
                                                        }
                                                    }
                                                }
                                                KeyCode::Char(c) if c.is_ascii_digit() => {
                                                    // 数字键：直接选择并退出循环
                                                    let digit = c.to_digit(10).unwrap() as usize;
                                                    if digit > 0 && digit <= options_count {
                                                        if let Some(ref req) = app.approval_state_ref() {
                                                            let options = approval_overlay::build_approval_options(req);
                                                            let decision = options[digit - 1].decision;
                                                            let msg = app.resolve_approval(decision);
                                                            app.push_line(msg);
                                                            app.render();
                                                            should_break = true;
                                                        }
                                                    }
                                                }
                                                _ => {
                                                    // 尝试单键快捷键（向后兼容）
                                                    if let Some(decision) = approval_overlay::resolve_approval_key(key) {
                                                        let msg = app.resolve_approval(decision);
                                                        app.push_line(msg);
                                                        app.render();
                                                        should_break = true;
                                                    }
                                                }
                                            }

                                            // 只有做出决策后才退出循环
                                            if should_break {
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            result = &mut stream_handle => {
                                match result {
                                    Ok(Ok(_)) => {}
                                    Ok(Err(e)) => {
                                        app.push_line(format!("Error: {}", e));
                                    }
                                    Err(e) => {
                                        app.push_line(format!("Task error: {}", e));
                                    }
                                }
                                break;
                            }
                        }
                    }

                    app.set_busy(false);
                    app.set_status(String::new());
                    app.push_line(String::new());
                    app.render();
                }
            }
            AppResult::Exit => {
                break;
            }
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

    // 包含测试基础设施
    mod common {
        mod test_env {
            include!("tests/common/test_env.rs");
        }
        mod assertions {
            include!("tests/common/assertions.rs");
        }
        mod mock_server {
            include!("tests/common/mock_server.rs");
        }
        mod fixtures {
            include!("tests/common/fixtures.rs");
        }

        pub use test_env::*;
        pub use assertions::*;
        pub use mock_server::*;
        pub use fixtures::*;
    }

    // 包含生成的集成测试
    mod generated {
        use crate::tests::common::*;
        include!("tests/generated/mod.rs");
    }

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
    fn test_parse_args_prompt() {
        let action = parse_args_from_vec(&["ifai".to_string(), "hello world".to_string()]).unwrap();
        match action {
            CliAction::Prompt { text, .. } => assert_eq!(text, "hello world"),
            _ => panic!("Expected Prompt action"),
        }
    }

    #[test]
    fn test_parse_args_config_init() {
        let action = parse_args_from_vec(&["ifai".to_string(), "--config".to_string(), "init".to_string()]).unwrap();
        assert!(matches!(action, CliAction::ConfigInit));
    }

    #[test]
    fn test_parse_args_config_show() {
        let action = parse_args_from_vec(&["ifai".to_string(), "--config".to_string(), "show".to_string()]).unwrap();
        assert!(matches!(action, CliAction::ConfigShow));
    }

    #[test]
    fn test_parse_args_resume() {
        let action = parse_args_from_vec(&["ifai".to_string(), "--resume".to_string(), "mysession".to_string()]).unwrap();
        match action {
            CliAction::Resume { name } => assert_eq!(name, "mysession"),
            _ => panic!("Expected Resume action"),
        }
    }

    #[test]
    fn test_parse_args_provider_override() {
        let action = parse_args_from_vec(&["ifai".to_string(), "--provider".to_string(), "openai".to_string()]).unwrap();
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
