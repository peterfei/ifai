/**
 * 社区版工具分类 Mock 实现
 *
 * 当 llm-inference feature 未启用时使用
 * 提供 Layer 1 + Layer 2 功能，Layer 3 使用关键词回退
 */

use super::types::{ClassificationResult, ClassificationLayer, ToolCategory};

/// 社区版 Layer 3 分类（Mock实现）
///
/// 使用简单的关键词匹配作为回退策略
/// 商业版将使用 ifainew-core 中的完整 LLM 实现
pub fn classify_layer3_mock(input: &str) -> ClassificationResult {
    let input_lower = input.to_lowercase();

    // 简单的关键词回退逻辑
    if input_lower.contains("代码") || input_lower.contains("code") {
        if input_lower.contains("分析") || input_lower.contains("解释") {
            return ClassificationResult {
                layer: ClassificationLayer::Layer3,
                category: ToolCategory::CodeAnalysis,
                tool: None,
                confidence: 0.6,
                match_type: "fallback".to_string(),
            };
        }
        if input_lower.contains("生成") || input_lower.contains("创建") || input_lower.contains("写") {
            return ClassificationResult {
                layer: ClassificationLayer::Layer3,
                category: ToolCategory::CodeGeneration,
                tool: None,
                confidence: 0.6,
                match_type: "fallback".to_string(),
            };
        }
    }

    if input_lower.contains("?") || input_lower.contains("？") {
        return ClassificationResult {
            layer: ClassificationLayer::Layer3,
            category: ToolCategory::AiChat,
            tool: None,
            confidence: 0.6,
            match_type: "fallback".to_string(),
        };
    }

    // 默认回退到 AI Chat
    ClassificationResult {
        layer: ClassificationLayer::Layer3,
        category: ToolCategory::AiChat,
        tool: None,
        confidence: 0.55,
        match_type: "fallback".to_string(),
    }
}

/// 检查是否为社区版
///
/// 通过检查 llm-inference feature 是否启用
pub fn is_community_edition() -> bool {
    !cfg!(feature = "llm-inference")
}

/// 检查是否为商业版
pub fn is_commercial_edition() -> bool {
    cfg!(feature = "llm-inference")
}

/// 获取版本信息
pub fn get_edition_info() -> &'static str {
    if is_community_edition() {
        "community (基础版：仅Layer 1+2，Layer3使用回退策略)"
    } else {
        "commercial (完整版：包含LLM推理)"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_layer3_mock_code_analysis() {
        let result = classify_layer3_mock("帮我分析一下这段代码");
        assert_eq!(result.layer, ClassificationLayer::Layer3);
        assert_eq!(result.category, ToolCategory::CodeAnalysis);
        assert_eq!(result.match_type, "fallback");
    }

    #[test]
    fn test_layer3_mock_ai_chat() {
        let result = classify_layer3_mock("什么是闭包？");
        assert_eq!(result.layer, ClassificationLayer::Layer3);
        assert_eq!(result.category, ToolCategory::AiChat);
        assert_eq!(result.match_type, "fallback");
    }

    #[test]
    fn test_layer3_mock_default_fallback() {
        let result = classify_layer3_mock("随便什么文本");
        assert_eq!(result.layer, ClassificationLayer::Layer3);
        assert_eq!(result.category, ToolCategory::AiChat);
        assert!(result.confidence < 0.7);
    }

    #[test]
    fn test_edition_detection() {
        // 这些测试在不同 feature 配置下会有不同结果
        let _is_community = is_community_edition();
        let _is_commercial = is_commercial_edition();
        let info = get_edition_info();
        assert!(!info.is_empty());
    }
}
