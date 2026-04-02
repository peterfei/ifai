//! 多提供商切换测试

#[cfg(test)]
mod tests {
    use crate::harness::api::{
        ApiClientFactory, AiProvider, Message, MessageRole, ProviderConfig, StreamRequest,
    };

    /// 测试所有提供商客户端都能正常创建
    #[tokio::test]
    async fn test_create_all_providers() {
        let config = ProviderConfig {
            api_key: "test-key".to_string(),
            base_url: None,
            organization: None,
        };

        // Anthropic
        let anthropic = ApiClientFactory::create_provider(AiProvider::Anthropic, &config);
        assert!(anthropic.is_ok());
        let models = anthropic.unwrap().list_models().await;
        assert!(models.is_ok());
        assert!(!models.unwrap().is_empty());

        // DeepSeek
        let deepseek = ApiClientFactory::create_provider(AiProvider::DeepSeek, &config);
        assert!(deepseek.is_ok());
        let models = deepseek.unwrap().list_models().await;
        assert!(models.is_ok());
        assert!(!models.unwrap().is_empty());

        // OpenAI
        let openai = ApiClientFactory::create_provider(AiProvider::OpenAI, &config);
        assert!(openai.is_ok());
        let models = openai.unwrap().list_models().await;
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
        assert!(anthropic.is_ok());
        let client = anthropic.unwrap();

        // 纯英文
        let english = "Hello world";
        let tokens = client.estimate_tokens(english);
        assert!(tokens > 0 && tokens < english.len());

        // 纯中文
        let chinese = "你好世界";
        let tokens = client.estimate_tokens(chinese);
        assert!(tokens > 0 && tokens <= chinese.len());

        // 混合
        let mixed = "Hello 你好";
        let tokens = client.estimate_tokens(mixed);
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
            messages: vec![Message {
                role: MessageRole::User,
                content: "Hello".to_string(),
            }],
            max_tokens: 1000,
            system: None,
            temperature: Some(0.7),
            stream: true,
            tools: None,
        };

        assert_eq!(request.model, "claude-sonnet-4");
        assert_eq!(request.messages.len(), 1);
        assert_eq!(request.max_tokens, 1000);
        assert_eq!(request.temperature, Some(0.7));
        assert!(request.stream);
    }

    /// 测试自定义供应商
    #[test]
    fn test_custom_provider() {
        use std::str::FromStr;

        // 解析自定义供应商
        let provider = AiProvider::from_str("custom:MyProvider");
        assert!(provider.is_ok());
        let provider = provider.unwrap();
        assert!(provider.is_custom());
        assert_eq!(provider.name(), "MyProvider");

        // 解析通用 custom
        let provider = AiProvider::from_str("custom");
        assert!(provider.is_ok());
        let provider = provider.unwrap();
        assert!(provider.is_custom());
        assert_eq!(provider.name(), "Custom");
    }

    /// 测试自定义供应商创建（需要 base_url）
    #[test]
    fn test_custom_provider_requires_base_url() {
        let config = ProviderConfig {
            api_key: "test-key".to_string(),
            base_url: None,
            organization: None,
        };

        let provider = AiProvider::Custom {
            name: "TestProvider".to_string(),
        };

        let result = ApiClientFactory::create_provider(provider, &config);
        assert!(result.is_err());
        // 检查错误消息包含 base_url
        match result {
            Err(msg) => assert!(msg.contains("base_url"), "Error should mention base_url: {}", msg),
            Ok(_) => panic!("Expected error for missing base_url"),
        }
    }

    /// 测试自定义供应商创建（成功）
    #[test]
    fn test_custom_provider_with_base_url() {
        let config = ProviderConfig {
            api_key: "test-key".to_string(),
            base_url: Some("http://localhost:8080".to_string()),
            organization: None,
        };

        let provider = AiProvider::Custom {
            name: "Ollama".to_string(),
        };

        let result = ApiClientFactory::create_provider(provider, &config);
        assert!(result.is_ok());
    }

    /// 测试自定义供应商 URL 验证
    #[test]
    fn test_custom_provider_url_validation() {
        let config_invalid = ProviderConfig {
            api_key: "test-key".to_string(),
            base_url: Some("invalid-url".to_string()),
            organization: None,
        };

        let provider = AiProvider::Custom {
            name: "Test".to_string(),
        };

        let result = ApiClientFactory::create_provider(provider, &config_invalid);
        assert!(result.is_err());
        // 检查错误消息包含 http://
        match result {
            Err(msg) => assert!(msg.contains("http://"), "Error should mention http:// or https://: {}", msg),
            Ok(_) => panic!("Expected error for invalid URL"),
        }
    }
}
