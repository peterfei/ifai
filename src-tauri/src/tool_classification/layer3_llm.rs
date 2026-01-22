/*!
Layer 3: LLM Classification
============================

使用 Qwen 0.5B 本地模型进行工具分类。

通过构造分类 prompt，让 LLM 直接输出工具类别，
无需训练，零样本推理。

目标延迟：<300ms
目标准确率：85%+
*/

use super::types::{ClassificationResult, ClassificationLayer, ToolCategory};

// 条件导入：仅当启用 llm-inference feature 时可用
#[cfg(feature = "llm-inference")]
use crate::llm_inference::{generate_completion, InferenceError};

// ============================================================================
// Classification Prompt
// ============================================================================

/// 构造工具分类的 prompt
fn build_classification_prompt(user_input: &str) -> String {
    format!(
        "你是工具分类助手。根据用户输入，选择最合适的工具类别。

工具类别：
- file_operations: 文件操作（打开、保存、重命名、读取、写入等）
- code_generation: 代码生成（补全、重构、创建组件、编写函数等）
- code_analysis: 代码分析（解释代码、分析性能、检查错误、代码审查等）
- terminal_commands: 终端命令（git、npm、cargo、pip 等命令执行）
- ai_chat: AI 对话（技术问答、概念解释、使用方法询问等）
- search_operations: 搜索操作（查找代码、搜索函数、定位引用等）
- no_tool_needed: 无需工具（直接回答、闲聊等）

用户输入：{}

只返回类别名称（如 file_operations），不要其他内容。",
        user_input
    )
}

/// Few-shot prompt（带示例，提高准确率）
fn build_classification_prompt_fewshot(user_input: &str) -> String {
    format!(
        "你是工具分类助手。根据用户输入，选择最合适的工具类别。

示例：
用户输入：\"帮我打开文件\"
分类：file_operations

用户输入：\"执行 git\"
分类：terminal_commands

用户输入：\"解释这段代码\"
分类：code_analysis

用户输入：\"生成一个组件\"
分类：code_generation

用户输入：\"查找所有\"
分类：search_operations

用户输入：\"什么是闭包\"
分类：ai_chat

用户输入：\"{}\"

分类：",
        user_input
    )
}

// ============================================================================
// LLM Response Parsing
// ============================================================================

/// 从 LLM 输出中解析工具类别
fn parse_llm_response(output: &str) -> Option<ToolCategory> {
    let output_lower = output.trim().to_lowercase();

    // 清理可能的额外内容
    let cleaned = output_lower
        .lines()
        .next()
        .unwrap_or(&output_lower)
        .trim();

    // 匹配工具类别
    match cleaned {
        "file_operations" => Some(ToolCategory::FileOperations),
        "code_generation" => Some(ToolCategory::CodeGeneration),
        "code_analysis" => Some(ToolCategory::CodeAnalysis),
        "terminal_commands" => Some(ToolCategory::TerminalCommands),
        "ai_chat" => Some(ToolCategory::AiChat),
        "search_operations" => Some(ToolCategory::SearchOperations),
        "no_tool_needed" => Some(ToolCategory::NoToolNeeded),
        _ => None,
    }
}

// ============================================================================
// Fallback Logic
// ============================================================================

/// 当 LLM 不可用时的回退分类
fn fallback_classify(input: &str) -> ClassificationResult {
    let input_lower = input.to_lowercase();

    // 简单的关键词回退
    if input_lower.contains("代码") || input_lower.contains("code") {
        if input_lower.contains("分析") || input_lower.contains("解释") {
            return ClassificationResult::layer3(ToolCategory::CodeAnalysis, 0.6);
        }
        if input_lower.contains("生成") || input_lower.contains("创建") || input_lower.contains("写") {
            return ClassificationResult::layer3(ToolCategory::CodeGeneration, 0.6);
        }
    }

    if input_lower.contains("?") || input_lower.contains("？") {
        return ClassificationResult::layer3(ToolCategory::AiChat, 0.6);
    }

    // 默认回退到 AI Chat
    ClassificationResult::layer3(ToolCategory::AiChat, 0.5)
}

// ============================================================================
// Public API
// ============================================================================

/// Layer 3 分类入口（使用 Qwen 0.5B）
#[cfg(feature = "llm-inference")]
pub fn classify(input: &str) -> ClassificationResult {
    // 检查 LLM 推理是否可用
    if !crate::llm_inference::is_available() {
        return fallback_classify(input);
    }

    // 使用 Few-shot prompt 提高准确率
    let prompt = build_classification_prompt_fewshot(input);

    // 调用 LLM 生成（只需要生成几个 token）
    match generate_completion(&prompt, 10) {
        Ok(output) => {
            // 解析 LLM 输出
            if let Some(category) = parse_llm_response(&output) {
                // 根据输出质量设置置信度
                let confidence = if output.lines().count() == 1 {
                    0.88  // 单行输出，置信度较高
                } else {
                    0.82  // 多行输出，可能包含额外内容
                };

                ClassificationResult::layer3(category, confidence)
            } else {
                // 解析失败，使用回退
                fallback_classify(input)
            }
        }
        Err(_) => {
            // LLM 推理失败，使用回退
            fallback_classify(input)
        }
    }
}

/// Layer 3 分类入口（无 LLM 时，使用回退逻辑）
#[cfg(not(feature = "llm-inference"))]
pub fn classify(input: &str) -> ClassificationResult {
    // 无 LLM 支持，直接使用回退逻辑
    fallback_classify(input)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classification_prompt_format() {
        let prompt = build_classification_prompt("读取文件");
        assert!(prompt.contains("file_operations"));
        assert!(prompt.contains("读取文件"));

        let prompt_fewshot = build_classification_prompt_fewshot("读取文件");
        assert!(prompt_fewshot.contains("示例"));
        assert!(prompt_fewshot.contains("file_operations"));
    }

    #[test]
    fn test_parse_llm_response_valid() {
        let test_cases = [
            ("file_operations", Some(ToolCategory::FileOperations)),
            ("code_generation", Some(ToolCategory::CodeGeneration)),
            ("code_analysis", Some(ToolCategory::CodeAnalysis)),
            ("terminal_commands", Some(ToolCategory::TerminalCommands)),
            ("ai_chat", Some(ToolCategory::AiChat)),
            ("search_operations", Some(ToolCategory::SearchOperations)),
            ("no_tool_needed", Some(ToolCategory::NoToolNeeded)),
            ("FILE_OPERATIONS", Some(ToolCategory::FileOperations)), // case insensitive
            ("  file_operations  ", Some(ToolCategory::FileOperations)), // trim
            ("invalid_category", None),
            ("", None),
        ];

        for (input, expected) in test_cases {
            let result = parse_llm_response(input);
            assert_eq!(result, expected, "Failed for input: '{}'", input);
        }
    }

    #[test]
    fn test_parse_llm_response_multiline() {
        let output = "file_operations\nSome extra content";
        let result = parse_llm_response(output);
        assert_eq!(result, Some(ToolCategory::FileOperations));
    }

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
        // 注意：这个测试需要 LLM 可用才能通过
        // 在 CI/CD 环境中可能需要跳过
        let result = classify("复杂的查询内容");
        assert_eq!(result.layer, ClassificationLayer::Layer3);
    }

    #[test]
    fn test_classify_confidence_range() {
        let result = classify("test input");
        assert!(result.confidence > 0.0 && result.confidence <= 1.0);
    }
}
