//! 多提供商切换测试

#[cfg(test)]
mod tests {
    use crate::harness::api::{
        ApiClientFactory, AiProvider, Message, MessageRole, ProviderConfig, StreamRequest,
    };

    /// 测试所有提供商客户端都能正常创建
    #[test]
    fn test_create_all_providers() {
        let config = ProviderConfig {
            api_key: "test-key".to_string(),
            base_url: None,
            organization: None,
        };

        // Anthropic
        let anthropic = ApiClientFactory::create_provider(AiProvider::Anthropic, &config);
        let models = anthropic.list_models();
        assert!(models.is_ok());
        assert!(!models.unwrap().is_empty());

        // DeepSeek
        let deepseek = ApiClientFactory::create_provider(AiProvider::DeepSeek, &config);
        let models = deepseek.list_models();
        assert!(models.is_ok());
        assert!(!models.unwrap().is_empty());

        // OpenAI
        let openai = ApiClientFactory::create_provider(AiProvider::OpenAI, &config);
        let models = openai.list_models();
        assert!(models.is_ok());
        assert!(!models.unwrap().is_empty());
    }

    /// 测试提供商字符串解析
    #[test]
    fn test_provider_parsing() {
        use std::str::FromStr;

        // 标准名称
        assert!(matches!(
            AiProvider::from_str("anthropic"),
            Ok(AiProvider::Anthropic)
        ));
        assert!(matches!(
            AiProvider::from_str("deepseek"),
            Ok(AiProvider::DeepSeek)
        ));
        assert!(matches!(
            AiProvider::from_str("openai"),
            Ok(AiProvider::OpenAI)
        ));

        // 大小写不敏感
        assert!(matches!(
            AiProvider::from_str("ANTHROPIC"),
            Ok(AiProvider::Anthropic)
        ));
        assert!(matches!(
            AiProvider::from_str("DeepSeek"),
            Ok(AiProvider::DeepSeek)
        ));

        // 无效提供商
        assert!(AiProvider::from_str("invalid").is_err());
    }

    /// 测试 Token 估算
    #[test]
    fn test_token_estimation() {
        let config = ProviderConfig {
            api_key: "test-key".to_string(),
            base_url: None,
            organization: None,
        };

        let anthropic = ApiClientFactory::create_provider(AiProvider::Anthropic, &config);

        // 纯英文
        let english = "Hello world";
        let tokens = anthropic.estimate_tokens(english);
        assert!(tokens > 0 && tokens < english.len());

        // 纯中文
        let chinese = "你好世界";
        let tokens = anthropic.estimate_tokens(chinese);
        assert!(tokens > 0 && tokens <= chinese.len());

        // 混合
        let mixed = "Hello 你好";
        let tokens = anthropic.estimate_tokens(mixed);
        assert!(tokens > 0);
    }

    /// 测试所有支持的模型
    #[test]
    fn test_all_supported_models() {
        use crate::harness::api::providers::get_all_supported_models;

        let models = get_all_supported_models();
        assert!(!models.is_empty());

        // 验证每个模型都有必需的字段
        for model in &models {
            assert!(!model.id.is_empty());
            assert!(!model.name.is_empty());
            assert!(model.context_tokens > 0);
        }
    }

    /// 测试流式请求构建
    #[test]
    fn test_stream_request_builder() {
        let request = StreamRequest {
            model: "claude-sonnet-4".to_string(),
            messages: vec![
                Message {
                    role: MessageRole::User,
                    content: "Hello".to_string(),
                },
            ],
            max_tokens: 1000,
            system: None,
            temperature: Some(0.7),
            stream: true,
        };

        assert_eq!(request.model, "claude-sonnet-4");
        assert_eq!(request.messages.len(), 1);
        assert_eq!(request.max_tokens, 1000);
        assert_eq!(request.temperature, Some(0.7));
        assert!(request.stream);
    }
}
