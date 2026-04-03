//! API 客户端集成测试
//!
//! 这些测试需要真实的 API Key，通过环境变量提供：
//! - ANTHROPIC_API_KEY: Anthropic API Key
//! - OPENAI_API_KEY: OpenAI API Key
//! - DEEPSEEK_API_KEY: DeepSeek API Key
//!
//! 运行方式：
//! ```bash
//! # 测试所有提供商
//! cargo test harness::api::integration_tests --lib -- --ignored
//!
//! # 测试单个提供商
//! cargo test harness::api::integration_tests::test_anthropic_stream --lib --ignored
//! ```

#[cfg(test)]
mod integration_tests {
    use crate::harness::api::{
        AnthropicClient, ApiClient, ApiClientFactory, Message, MessageRole,
        ProviderConfig, StreamEvent, StreamRequest, AiProvider,
    };
    use futures_util::StreamExt;

    /// 测试辅助函数：从环境变量获取 API Key
    fn get_api_key(provider: &str) -> String {
        let env_var = match provider {
            "anthropic" => "ANTHROPIC_API_KEY",
            "openai" => "OPENAI_API_KEY",
            "deepseek" => "DEEPSEEK_API_KEY",
            _ => panic!("Unknown provider: {}", provider),
        };

        std::env::var(env_var).unwrap_or_else(|_| {
            panic!(
                "API Key not found. Set {} environment variable to run this test.",
                env_var
            )
        })
    }

    /// Anthropic 流式响应集成测试
    #[tokio::test]
    #[ignore] // 需要真实 API Key，默认跳过
    async fn test_anthropic_stream() {
        let api_key = get_api_key("anthropic");

        let config = ProviderConfig {
            api_key,
            base_url: None,
            organization: None,
        };

        let client = AnthropicClient::new(&config);
        let request = StreamRequest {
            model: "claude-sonnet-4-20250514".to_string(),
            messages: vec![Message {
                role: MessageRole::User,
                content: "Say 'Hello, Anthropic!' in exactly this way.".to_string(),
                tool_calls: None,
                tool_call_id: None,
            }],
            max_tokens: 50,
            system: None,
            temperature: Some(1.0),
            stream: true,
            tools: None,
        };

        let mut stream = client.stream(request).await.unwrap();

        let mut full_text = String::new();
        let mut event_count = 0;

        while let Some(result) = stream.next().await {
            match result {
                Ok(event) => {
                    event_count += 1;
                    match event {
                        StreamEvent::TextDelta { text, .. } => {
                            full_text.push_str(&text);
                        }
                        StreamEvent::MessageDone { .. } => break,
                        _ => {}
                    }
                }
                Err(e) => {
                    eprintln!("Stream error: {:?}", e);
                    break;
                }
            }
        }

        println!("Anthropic response: {}", full_text);
        println!("Event count: {}", event_count);

        assert!(event_count > 0, "Should receive at least one event");
        assert!(
            full_text.contains("Hello") || full_text.contains("Anthropic"),
            "Response should contain expected text"
        );
    }

    /// OpenAI 流式响应集成测试
    #[tokio::test]
    #[ignore]
    async fn test_openai_stream() {
        let api_key = get_api_key("openai");

        let config = ProviderConfig {
            api_key,
            base_url: None,
            organization: None,
        };

        let client = ApiClientFactory::create_provider(AiProvider::OpenAI, &config).unwrap();
        let request = StreamRequest {
            model: "gpt-4o-mini".to_string(),
            messages: vec![Message {
                role: MessageRole::User,
                content: "Say 'Hello, OpenAI!' in exactly this way.".to_string(),
                tool_calls: None,
                tool_call_id: None,
            }],
            max_tokens: 50,
            system: None,
            temperature: Some(1.0),
            stream: true,
            tools: None,
        };

        let mut stream = client.stream(request).await.unwrap();

        let mut full_text = String::new();
        let mut event_count = 0;

        while let Some(result) = stream.next().await {
            match result {
                Ok(event) => {
                    event_count += 1;
                    match event {
                        StreamEvent::TextDelta { text, .. } => {
                            full_text.push_str(&text);
                        }
                        StreamEvent::MessageDone { .. } => break,
                        _ => {}
                    }
                }
                Err(e) => {
                    eprintln!("Stream error: {:?}", e);
                    break;
                }
            }
        }

        println!("OpenAI response: {}", full_text);
        println!("Event count: {}", event_count);

        assert!(event_count > 0, "Should receive at least one event");
        assert!(
            full_text.contains("Hello") || full_text.contains("OpenAI"),
            "Response should contain expected text"
        );
    }

    /// DeepSeek 流式响应集成测试
    #[tokio::test]
    #[ignore]
    async fn test_deepseek_stream() {
        let api_key = get_api_key("deepseek");

        let config = ProviderConfig {
            api_key,
            base_url: None,
            organization: None,
        };

        let client = ApiClientFactory::create_provider(AiProvider::DeepSeek, &config).unwrap();
        let request = StreamRequest {
            model: "deepseek-chat".to_string(),
            messages: vec![Message {
                role: MessageRole::User,
                content: "Say 'Hello, DeepSeek!' in exactly this way.".to_string(),
                tool_calls: None,
                tool_call_id: None,
            }],
            max_tokens: 50,
            system: None,
            temperature: Some(1.0),
            stream: true,
            tools: None,
        };

        let mut stream = client.stream(request).await.unwrap();

        let mut full_text = String::new();
        let mut event_count = 0;

        while let Some(result) = stream.next().await {
            match result {
                Ok(event) => {
                    event_count += 1;
                    match event {
                        StreamEvent::TextDelta { text, .. } => {
                            full_text.push_str(&text);
                        }
                        StreamEvent::MessageDone { .. } => break,
                        _ => {}
                    }
                }
                Err(e) => {
                    eprintln!("Stream error: {:?}", e);
                    break;
                }
            }
        }

        println!("DeepSeek response: {}", full_text);
        println!("Event count: {}", event_count);

        assert!(event_count > 0, "Should receive at least one event");
        assert!(
            full_text.contains("Hello") || full_text.contains("DeepSeek"),
            "Response should contain expected text"
        );
    }

    /// 测试多提供商工厂
    #[tokio::test]
    #[ignore]
    async fn test_provider_factory() {
        // 测试 Anthropic
        let anthropic_key = get_api_key("anthropic");
        let anthropic = ApiClientFactory::create_provider(
            AiProvider::Anthropic,
            &ProviderConfig {
                api_key: anthropic_key,
                base_url: None,
                organization: None,
            },
        );
        assert!(anthropic.is_ok(), "Should create Anthropic client");

        // 测试 OpenAI
        let openai_key = get_api_key("openai");
        let openai = ApiClientFactory::create_provider(
            AiProvider::OpenAI,
            &ProviderConfig {
                api_key: openai_key,
                base_url: None,
                organization: None,
            },
        );
        assert!(openai.is_ok(), "Should create OpenAI client");

        // 测试 DeepSeek
        let deepseek_key = get_api_key("deepseek");
        let deepseek = ApiClientFactory::create_provider(
            AiProvider::DeepSeek,
            &ProviderConfig {
                api_key: deepseek_key,
                base_url: None,
                organization: None,
            },
        );
        assert!(deepseek.is_ok(), "Should create DeepSeek client");
    }

    /// 测试 Token 估算准确性
    #[tokio::test]
    #[ignore]
    async fn test_token_estimation_accuracy() {
        let api_key = get_api_key("anthropic");

        let config = ProviderConfig {
            api_key,
            base_url: None,
            organization: None,
        };

        let client = AnthropicClient::new(&config);

        // 测试英文文本
        let english_text = "Hello, world! This is a test.";
        let estimated = client.estimate_tokens(english_text);
        println!("English text: '{}' -> {} tokens", english_text, estimated);
        assert!(estimated > 0 && estimated < 20, "Estimate should be reasonable");

        // 测试中文文本
        let chinese_text = "你好，世界！这是一个测试。";
        let estimated = client.estimate_tokens(chinese_text);
        println!("Chinese text: '{}' -> {} tokens", chinese_text, estimated);
        assert!(estimated > 0 && estimated < 20, "Estimate should be reasonable");

        // 测试混合文本
        let mixed_text = "Hello 你好 World 世界";
        let estimated = client.estimate_tokens(mixed_text);
        println!("Mixed text: '{}' -> {} tokens", mixed_text, estimated);
        assert!(estimated > 0 && estimated < 20, "Estimate should be reasonable");
    }
}
