//! IfAI CLI - 终端命令行工具（交互式模式）
//!
//! 使用方式:
//!   cargo run --bin ifai -- --help           # 显示帮助
//!   cargo run --bin ifai --                  # 交互式模式
//!   cargo run --bin ifai -- -- "prompt"      # 单次执行

use std::env;
use std::io::{self, Write, BufRead};
use std::path::PathBuf;
use serde_json::json;
use rustyline::Editor;
use futures_util::StreamExt;

/// 配置结构
struct Config {
    provider: String,
    model: String,
    api_key: Option<String>,
    base_url: Option<String>,
    prompt: Option<String>,
    interactive: bool,
}

impl Config {
    fn from_args() -> Result<Self, String> {
        let args: Vec<String> = env::args().collect();

        let mut provider = "deepseek".to_string();
        let mut model = "deepseek-chat".to_string();
        let mut api_key = None;
        let mut base_url = None;
        let mut prompt = None;
        let mut interactive = false;

        let mut i = 1;
        while i < args.len() {
            match args[i].as_str() {
                "--help" | "-h" => {
                    print_help();
                    std::process::exit(0);
                }
                "--interactive" | "-i" => {
                    interactive = true;
                    i += 1;
                }
                "--provider" | "-p" => {
                    if i + 1 < args.len() {
                        provider = args[i + 1].clone();
                        i += 2;
                    } else {
                        return Err("--provider 需要参数".to_string());
                    }
                }
                "--model" | "-m" => {
                    if i + 1 < args.len() {
                        model = args[i + 1].clone();
                        i += 2;
                    } else {
                        return Err("--model 需要参数".to_string());
                    }
                }
                "--api-key" => {
                    if i + 1 < args.len() {
                        api_key = Some(args[i + 1].clone());
                        i += 2;
                    } else {
                        return Err("--api-key 需要参数".to_string());
                    }
                }
                "--base-url" => {
                    if i + 1 < args.len() {
                        base_url = Some(args[i + 1].clone());
                        i += 2;
                    } else {
                        return Err("--base-url 需要参数".to_string());
                    }
                }
                "--" => {
                    // 剩余的所有内容都是 prompt
                    if i + 1 < args.len() {
                        prompt = Some(args[i + 1..].join(" "));
                        break;
                    }
                    i += 1;
                }
                arg => {
                    // 如果不是选项，则视为 prompt 的一部分
                    if arg.starts_with('-') {
                        return Err(format!("未知选项: {}", arg));
                    }
                    prompt = Some(args[i..].join(" "));
                    break;
                }
            }
        }

        // 如果没有 prompt 且没有指定 interactive，则默认进入交互模式
        if prompt.is_none() && !interactive {
            interactive = true;
        }

        // 从环境变量读取 API Key
        if api_key.is_none() {
            if provider == "deepseek" {
                api_key = env::var("DEEPSEEK_API_KEY").ok();
            } else if provider == "openai" {
                api_key = env::var("OPENAI_API_KEY").ok();
            } else if provider == "anthropic" {
                api_key = env::var("ANTHROPIC_API_KEY").ok();
            }
        }

        if api_key.is_none() {
            return Err(format!(
                "未找到 API Key。请使用 --api-key 参数或设置 {}_API_KEY 环境变量",
                provider.to_uppercase()
            ));
        }

        Ok(Config {
            provider,
            model,
            api_key,
            base_url,
            prompt,
            interactive,
        })
    }
}

fn print_help() {
    println!("IfAI CLI - AI 交互式命令行助手");
    println!();
    println!("使用方式:");
    println!("  ifai                           # 交互式模式");
    println!("  ifai -- \"prompt\"              # 单次执行");
    println!("  ifai -p openai -m gpt-4o -- \"分析这段代码\"");
    println!();
    println!("选项:");
    println!("  -i, --interactive             强制进入交互式模式");
    println!("  -p, --provider <name>         AI 提供商 (deepseek/openai/anthropic) [默认: deepseek]");
    println!("  -m, --model <name>            模型名称 [默认: deepseek-chat]");
    println!("      --api-key <key>          API 密钥 (也可使用环境变量)");
    println!("      --base-url <url>         自定义 API 端点");
    println!("  -h, --help                    显示此帮助信息");
    println!();
    println!("交互式命令:");
    println!("  /exit, /quit                  退出交互模式");
    println!("  /clear, /reset               清空对话历史");
    println!("  /provider <name>             切换 AI 提供商");
    println!("  /model <name>                切换模型");
    println!("  /help                         显示帮助");
    println!();
    println!("环境变量:");
    println!("  DEEPSEEK_API_KEY              DeepSeek API 密钥");
    println!("  OPENAI_API_KEY                OpenAI API 密钥");
    println!("  ANTHROPIC_API_KEY             Anthropic API 密钥");
    println!();
    println!("示例:");
    println!("  # 交互式对话");
    println!("  $ ifai");
    println!("  >>> 你好");
    println!("  >>> 什么是 Rust？");
    println!("  >>> /exit");
    println!();
    println!("  # 单次查询");
    println!("  $ ifai -- \"写一个快速排序\"");
}

/// 会话状态
struct Session {
    provider: String,
    model: String,
    api_key: String,
    base_url: Option<String>,
    messages: Vec<ifainew_lib::harness::api::Message>,
    tool_registry: ifainew_lib::harness::tool::ToolRegistry,
    tool_router: ifainew_lib::harness::tool::ToolRouter,
    system_prompt: String,
}

impl Session {
    fn new(provider: String, model: String, api_key: String, base_url: Option<String>) -> Self {
        let system_prompt = Self::get_system_prompt(&provider);
        Self {
            provider,
            model,
            api_key,
            base_url,
            messages: Vec::new(),
            tool_registry: ifainew_lib::harness::tool::ToolRegistry::new(),
            tool_router: ifainew_lib::harness::tool::ToolRouter::new(),
            system_prompt,
        }
    }

    fn get_system_prompt(provider: &str) -> String {
        match provider {
            "deepseek" => format!(r#"你是 IfAI，一个专业的 AI 代码助手，基于 DeepSeek 模型。

## 你的身份
- 名字：IfAI
- 角色：AI 代码助手和开发伙伴
- 创建者：IfAI 开源社区
- 特点：专业、友好、技术精湛

## 你的能力
- 代码编写、分析和优化
- 多语言支持（Rust, Python, JavaScript, Go 等）
- 问题诊断和调试
- 架构设计和最佳实践建议
- 工具调用（文件操作、任务管理等）

## 回答风格
- 简洁专业，直击要点
- 代码示例完整可用
- 中文回答为主，技术术语保留英文
- 主动提供相关建议和最佳实践

## 注意事项
- 你是 IfAI，不是 DeepSeek
- 保持友好和专业的语气
- 不确定时诚实承认
- 优先给出实用建议
"#),
            "openai" => format!(r#"你是 IfAI，一个专业的 AI 代码助手，由 OpenAI GPT 模型驱动。

## 你的身份
- 名字：IfAI
- 角色：AI 代码助手和开发伙伴
- 创建者：IfAI 开源社区
- 特点：专业、友好、技术精湛

## 你的能力
- 代码编写、分析和优化
- 多语言支持（Rust, Python, JavaScript, Go 等）
- 问题诊断和调试
- 架构设计和最佳实践建议
- 工具调用（文件操作、任务管理等）

## 回答风格
- 简洁专业，直击要点
- 代码示例完整可用
- 中文回答为主，技术术语保留英文
- 主动提供相关建议和最佳实践

## 注意事项
- 你是 IfAI，不是 ChatGPT 或 OpenAI
- 保持友好和专业的语气
- 不确定时诚实承认
- 优先给出实用建议
"#),
            "anthropic" => format!(r#"你是 IfAI，一个专业的 AI 代码助手，由 Anthropic Claude 模型驱动。

## 你的身份
- 名字：IfAI
- 角色：AI 代码助手和开发伙伴
- 创建者：IfAI 开源社区
- 特点：专业、友好、技术精湛

## 你的能力
- 代码编写、分析和优化
- 多语言支持（Rust, Python, JavaScript, Go 等）
- 问题诊断和调试
- 架构设计和最佳实践建议
- 工具调用（文件操作、任务管理等）

## 回答风格
- 简洁专业，直击要点
- 代码示例完整可用
- 中文回答为主，技术术语保留英文
- 主动提供相关建议和最佳实践

## 注意事项
- 你是 IfAI，不是 Claude
- 保持友好和专业的语气
- 不确定时诚实承认
- 优先给出实用建议
"#),
            _ => "你是 IfAI，一个专业的 AI 代码助手。".to_string(),
        }
    }

    fn add_message(&mut self, role: ifainew_lib::harness::api::MessageRole, content: String) {
        self.messages.push(ifainew_lib::harness::api::Message {
            role,
            content,
        });
    }

    fn clear_history(&mut self) {
        self.messages.clear();
        println!("✅ 对话历史已清空");
    }

    async fn process_prompt(&mut self, prompt: &str) -> Result<String, Box<dyn std::error::Error>> {
        // 添加用户消息
        self.add_message(ifainew_lib::harness::api::MessageRole::User, prompt.to_string());

        // 创建 Provider 配置
        let provider_config = ifainew_lib::harness::api::ProviderConfig {
            api_key: self.api_key.clone(),
            base_url: self.base_url.clone(),
            organization: None,
        };

        // 确定 Provider 类型
        let provider = match self.provider.as_str() {
            "anthropic" | "claude" => ifainew_lib::harness::api::AiProvider::Anthropic,
            "deepseek" => ifainew_lib::harness::api::AiProvider::DeepSeek,
            "openai" | "gpt" => ifainew_lib::harness::api::AiProvider::OpenAI,
            _ => return Err(format!("不支持的 provider: {}", self.provider).into()),
        };

        // 创建 API 客户端
        let client = ifainew_lib::harness::api::ApiClientFactory::create_provider(provider, &provider_config)?;

        // 获取工具列表
        let tools: Vec<serde_json::Value> = self.tool_registry.all()
            .into_iter()
            .map(|tool| {
                json!({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.input_schema
                    }
                })
            })
            .collect();

        // 构建请求
        let request = ifainew_lib::harness::api::StreamRequest {
            model: self.model.clone(),
            messages: self.messages.clone(),
            max_tokens: 4096,
            system: Some(self.system_prompt.clone()),
            temperature: Some(0.7),
            stream: true,
            tools: Some(tools),
        };

        // 发送流式请求
        let mut stream = client.stream(request).await?;
        let mut full_response = String::new();

        // 🆕 P3: 保存 tool_id -> tool_name 映射
        use std::collections::HashMap;
        let mut tool_name_map: HashMap<String, String> = HashMap::new();

        // 处理流式响应
        while let Some(result) = stream.next().await {
            match result {
                Ok(event) => {
                    use ifainew_lib::harness::api::StreamEvent;

                    match event {
                        StreamEvent::TextDelta { text } => {
                            print!("{}", text);
                            io::stdout().flush().unwrap();
                            full_response.push_str(&text);
                        }
                        StreamEvent::ToolStart { tool_id, name, .. } => {
                            println!();
                            println!("🔧 工具调用: {} ({})", name, tool_id);
                            // 🆕 P3: 保存工具名称映射
                            tool_name_map.insert(tool_id.clone(), name.clone());
                        }
                        StreamEvent::ToolDone { tool_id, result } => {
                            // 🆕 P3: 执行工具
                            if let Ok(args) = serde_json::from_str::<serde_json::Value>(&result) {
                                // 从映射中获取工具名称
                                let tool_name = tool_name_map.get(&tool_id)
                                    .map(|s| s.as_str())
                                    .or_else(|| args.get("name").and_then(|v| v.as_str()))
                                    .or_else(|| args.get("tool").and_then(|v| v.as_str()))
                                    .unwrap_or("TodoWrite");

                                match self.tool_router.execute(tool_name, &args) {
                                    Ok(exec_result) => {
                                        println!("✅ 工具完成: {} ({})", tool_id, exec_result);
                                    }
                                    Err(e) => {
                                        println!("❌ 工具执行失败: {} => {:?}", tool_id, e);
                                    }
                                }
                            } else {
                                println!("✅ 工具完成: {} => {}", tool_id, result);
                            }
                        }
                        StreamEvent::MessageDone { .. } => {
                            // 消息完成，但不在交互模式中显示
                        }
                        StreamEvent::Error { code, message } => {
                            println!();
                            println!("❌ 错误 [{}]: {}", code, message);
                        }
                        _ => {}
                    }
                }
                Err(e) => {
                    println!();
                    println!("❌ 流错误: {:?}", e);
                    break;
                }
            }
        }

        println!();

        // 添加助手回复到历史
        self.add_message(ifainew_lib::harness::api::MessageRole::Assistant, full_response.clone());

        Ok(full_response)
    }
}

/// 交互式循环
async fn interactive_loop(mut session: Session) -> Result<(), Box<dyn std::error::Error>> {
    println!("🤖 IfAI 交互式模式 v0.2.0");
    println!("📦 Provider: {} | Model: {}", session.provider, session.model);
    println!("💡 输入 /help 查看可用命令，/exit 退出");
    println!();

    let mut rl = rustyline::Editor::<(), rustyline::history::DefaultHistory>::new()?;
    rl.load_history(".ifai-history").ok();

    let mut prompt_count = 0;

    loop {
        let readline = rl.readline(&format!(">>> "));

        match readline {
            Ok(line) => {
                let line = line.trim();

                // 跳过空行
                if line.is_empty() {
                    continue;
                }

                // 保存历史
                rl.add_history_entry(line);

                // 处理特殊命令
                if line.starts_with('/') {
                    let parts: Vec<&str> = line.splitn(2, ' ').collect();
                    let cmd = parts[0];

                    match cmd {
                        "/exit" | "/quit" | "/q" => {
                            println!("👋 再见！");
                            break;
                        }
                        "/clear" | "/reset" => {
                            session.clear_history();
                            prompt_count = 0;
                            continue;
                        }
                        "/provider" => {
                            if parts.len() > 1 {
                                session.provider = parts[1].to_string();
                                session.system_prompt = Session::get_system_prompt(&session.provider);
                                println!("✅ Provider 已切换为: {}", session.provider);
                            } else {
                                println!("❌ 请指定 provider: /provider <deepseek|openai|anthropic>");
                            }
                            continue;
                        }
                        "/model" => {
                            if parts.len() > 1 {
                                session.model = parts[1].to_string();
                                println!("✅ Model 已切换为: {}", session.model);
                            } else {
                                println!("❌ 请指定 model: /model <model-name>");
                            }
                            continue;
                        }
                        "/help" => {
                            println!("可用命令:");
                            println!("  /exit, /quit       退出");
                            println!("  /clear, /reset     清空历史");
                            println!("  /provider <name>   切换提供商");
                            println!("  /model <name>      切换模型");
                            println!("  /help              显示帮助");
                            continue;
                        }
                        _ => {
                            println!("❌ 未知命令: {}。输入 /help 查看帮助", cmd);
                            continue;
                        }
                    }
                }

                // 正常对话
                prompt_count += 1;

                match session.process_prompt(line).await {
                    Ok(_) => {
                        println!();
                    }
                    Err(e) => {
                        println!("❌ 错误: {}", e);
                    }
                }
            }
            Err(err) => {
                // 检查是否是 Ctrl+C (Interrupted)
                if err.to_string().contains("Interrupted") {
                    println!();
                    break;
                }
                println!("❌ 读取输入错误: {}", err);
                break;
            }
        }
    }

    rl.save_history(".ifai-history").ok();
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 解析配置
    let config = Config::from_args()?;

    // 如果是单次执行模式
    if let Some(prompt) = &config.prompt {
        println!("🤖 IfAI CLI v0.2.0 (单次执行模式)");
        println!("📦 Provider: {} | Model: {}", config.provider, config.model);
        println!("💬 Prompt: {}", prompt);
        println!();

        let mut session = Session::new(
            config.provider,
            config.model,
            config.api_key.unwrap(),
            config.base_url,
        );

        session.process_prompt(prompt).await?;
        println!();

        return Ok(());
    }

    // 交互式模式
    let session = Session::new(
        config.provider,
        config.model,
        config.api_key.unwrap(),
        config.base_url,
    );

    interactive_loop(session).await?;

    Ok(())
}
