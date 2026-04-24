//! IfAI CLI - Main Entry Point
//!
//! 🏛️ 临时占位：逐步迁移功能

mod render;
mod provider;
mod config;
mod commands;
mod session;
mod prompts;

fn main() {
    println!("IfAI CLI v0.4.3 - 重构中");

    // 测试 render 模块
    let theme = render::default_theme();
    println!("{}", render::color_256(69));
    println!("Brand color test");
    println!("{}", render::RESET);

    // 测试 provider 模块
    match provider::resolve_provider("deepseek") {
        Ok(spec) => println!("Provider: {} ({})", spec.metadata.name, spec.metadata.id),
        Err(e) => println!("Error: {}", e),
    }

    // 测试 config 模块
    match config::EffectiveConfig::resolve(Some("deepseek"), Some("deepseek-chat"), Some("sk-test"), None) {
        Ok(cfg) => println!("Config: {} ({})", cfg.provider(), cfg.model()),
        Err(e) => println!("Config Error: {}", e),
    }

    // 测试 commands 模块
    match commands::dispatch_command("help", None) {
        Ok(Some(output)) => println!("\n{}", output),
        Ok(None) => println!("Command executed"),
        Err(e) => println!("Command Error: {}", e),
    }

    // 测试 session 模块
    let mut session = session::Session::new("deepseek".to_string(), "deepseek-chat".to_string());
    session.add_message("test message".to_string());
    println!("Session: {} messages", session.messages.len());

    // 测试 prompts 模块
    match provider::resolve_provider("deepseek") {
        Ok(spec) => {
            let prompt = prompts::build_system_prompt(spec);
            println!("System Prompt (first line): {}", prompt.lines().next().unwrap_or(""));
        }
        Err(e) => println!("Prompt Error: {}", e),
    }
}
