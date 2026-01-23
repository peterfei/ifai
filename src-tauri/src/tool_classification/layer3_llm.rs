/*!
Layer 3: LLM Classification
============================

工具分类 Layer 3 实现

商业版：使用 ifainew-core 私有库的 LLM 推理
社区版：使用关键词回退 (Mock)

目标延迟：<300ms
目标准确率：85%+
*/

use super::types::{ClassificationResult, ClassificationLayer, ToolCategory};

// 条件导入：仅当启用 llm-inference feature 时可用
#[cfg(feature = "llm-inference")]
use crate::llm_inference::generate_completion;

// 商业版：导入私有库 ifainew-core
#[cfg(feature = "commercial")]
use ifainew_core::tool_classification::{
    classify_with_llm as core_classify_with_llm,
    ToolCategory as CoreToolCategory,
};

// ============================================================================
// Fallback Logic (社区版 Mock)
// ============================================================================

/// 社区版回退分类（使用 Mock 模块）
fn fallback_classify(input: &str) -> ClassificationResult {
    // 委托给 mock 模块的统一回退逻辑
    super::mock::classify_layer3_mock(input)
}

// ============================================================================
// 类型转换 (仅商业版)
// ============================================================================

/// 将 ifainew-core 的 ToolCategory 转换为本地类型
#[cfg(feature = "commercial")]
fn convert_core_category(category: CoreToolCategory) -> ToolCategory {
    match category {
        CoreToolCategory::FileOperations => ToolCategory::FileOperations,
        CoreToolCategory::CodeGeneration => ToolCategory::CodeGeneration,
        CoreToolCategory::CodeAnalysis => ToolCategory::CodeAnalysis,
        CoreToolCategory::TerminalCommands => ToolCategory::TerminalCommands,
        CoreToolCategory::AiChat => ToolCategory::AiChat,
        CoreToolCategory::SearchOperations => ToolCategory::SearchOperations,
        CoreToolCategory::NoToolNeeded => ToolCategory::NoToolNeeded,
    }
}

// ============================================================================
// Public API
// ============================================================================

/// Layer 3 分类入口 - 商业版（使用 ifainew-core 私有库）
#[cfg(all(feature = "llm-inference", feature = "commercial"))]
pub fn classify(input: &str) -> ClassificationResult {
    // 商业版：使用 ifainew-core 的 LLM 分类
    let llm_generate = |prompt: &str, max_tokens: usize| -> Result<String, Box<dyn std::error::Error>> {
        // 调用本地的 llama.cpp 推理
        generate_completion(prompt, max_tokens).map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
    };

    match core_classify_with_llm(input, llm_generate) {
        Ok(core_result) => {
            // 转换类型
            ClassificationResult {
                layer: ClassificationLayer::Layer3,
                category: convert_core_category(core_result.category),
                tool: None,
                confidence: core_result.confidence,
                match_type: core_result.match_type,
            }
        }
        Err(_) => {
            // 私有库失败，使用回退
            fallback_classify(input)
        }
    }
}

/// Layer 3 分类入口 - 社区版（只使用 Mock 回退）
#[cfg(not(all(feature = "llm-inference", feature = "commercial")))]
pub fn classify(input: &str) -> ClassificationResult {
    // 社区版：直接使用 Mock 回退逻辑
    // 不包含任何 LLM 推理核心代码
    fallback_classify(input)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fallback_classify() {
        let result = fallback_classify("分析代码逻辑");
        assert_eq!(result.category, ToolCategory::CodeAnalysis);

        let result = fallback_classify("这是什么？");
        assert_eq!(result.category, ToolCategory::AiChat);

        let result = fallback_classify("some random text");
        assert_eq!(result.category, ToolCategory::AiChat);
    }

    #[test]
    fn test_classify_returns_layer3() {
        let result = classify("复杂的查询内容");
        assert_eq!(result.layer, ClassificationLayer::Layer3);
    }

    #[test]
    fn test_classify_confidence_range() {
        let result = classify("test input");
        assert!(result.confidence > 0.0 && result.confidence <= 1.0);
    }

    #[test]
    fn test_classify_match_type_is_fallback() {
        let result = classify("任何输入");
        // 社区版应该使用 fallback
        assert_eq!(result.match_type, "fallback");
    }

    #[test]
    #[cfg(feature = "commercial")]
    fn test_convert_core_category() {
        assert_eq!(
            convert_core_category(CoreToolCategory::FileOperations),
            ToolCategory::FileOperations
        );
        assert_eq!(
            convert_core_category(CoreToolCategory::CodeAnalysis),
            ToolCategory::CodeAnalysis
        );
    }
}
