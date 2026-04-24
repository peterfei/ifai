//! IfAI CLI - Main Entry Point
//!
//! 🏛️ 零外部依赖：手动参数解析 + CliAction dispatch + REPL 循环

mod render;
mod provider;
mod config;
mod commands;
mod session;
mod prompts;
mod permission;  // 🔥 元编程权限引擎
mod token;       // 🔥 元编程 Token 显示层
mod persistence; // 🔥 元编程会话持久化

use std::env;
use std::io::{self, Write};

// ============================================================================
// CliAction - 动作分发枚举
// ============================================================================

/// 🎯 CLI 动作类型
///
/// **零 clap 依赖**：手动解析 std::env::args()，然后 dispatch 到不同的处理器
#[derive(Debug)]
pub enum CliAction {
    /// 单次提示词模式：`ifai "write a hello world"`
    Prompt { text: String },

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

    for (i, arg) in args.iter().enumerate() {
        if skip_next {
            skip_next = false;
            continue;
        }

        match arg.as_str() {
            "--version" | "-V" => return Ok(CliAction::Version),

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
// 主入口
// ============================================================================

fn main() {
    // 解析参数
    let action = match parse_args() {
        Ok(action) => action,
        Err(e) => {
            eprintln!("Error: {}", e);
            eprintln!("\nUsage:");
            eprintln!("  ifai                    # Start REPL");
            eprintln!("  ifai \"your prompt\"       # Single-shot mode");
            eprintln!("  ifai --version           # Show version");
            eprintln!("  ifai --config init       # Initialize config");
            eprintln!("  ifai --config show       # Show effective config");
            eprintln!("  ifai --resume <name>     # Resume saved session");
            eprintln!("\nOptions:");
            eprintln!("  --provider <name>       Override AI provider");
            eprintln!("  --model <name>          Override model");
            eprintln!("  --api-key <key>         Override API key");
            std::process::exit(1);
        }
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
            run_repl(Some(name))?;
            Ok(())
        }

        CliAction::Prompt { text } => {
            run_prompt(&text)?;
            Ok(())
        }

        CliAction::Repl => {
            run_repl(None)?;
            Ok(())
        }
    }
}

/// 📋 显示版本信息
fn show_version() {
    println!("IfAI CLI v0.4.3");
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

    println!("{}", render::render_banner("v0.4.3", &config.provider(), &config.model(), &theme));
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
fn run_prompt(text: &str) -> Result<(), String> {
    println!("Prompt mode: {}", text);
    println!("(TODO: Implement prompt mode)");
    Ok(())
}

/// 🔄 运行 REPL 循环
async fn run_repl_async(resume_name: Option<String>) -> Result<(), String> {
    // 🔇 全局禁用调试日志（必须在最前面）
    std::env::set_var("IFAI_QUIET", "1");

    // 解析有效配置
    let config = config::EffectiveConfig::resolve(None, None, None, None)?;
    let theme = render::default_theme();

    // 显示 Banner
    println!("{}", render::render_banner("v0.4.3", &config.provider(), &config.model(), &theme));
    println!();

    // 初始化 Session
    let mut session = session::Session::new(config.provider().to_string(), config.model().to_string());

    // 🔥 FIX: 设置项目根目录为当前工作目录
    let current_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
    session.set_project_root(current_dir.to_string_lossy().to_string());

    // 显示欢迎信息
    println!("{}", theme.muted);
    println!("Welcome to IfAI! Type /help for available commands.");
    println!("{}", render::RESET);

    // REPL 循环
    loop {
        // 显示提示符
        print!("{}⟩{} ", theme.brand, render::RESET);
        io::stdout().flush().map_err(|e| format!("Failed to flush stdout: {}", e))?;

        // 读取输入
        let mut input = String::new();
        io::stdin()
            .read_line(&mut input)
            .map_err(|e| format!("Failed to read input: {}", e))?;

        let input = input.trim();

        // 空输入 → 继续
        if input.is_empty() {
            continue;
        }

        // 退出命令
        if input == "/exit" || input == "/quit" || input == "exit" || input == "quit" {
            println!("{}Goodbye!{}", theme.success, render::RESET);
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

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

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
            CliAction::Prompt { text } => assert_eq!(text, "hello world"),
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
