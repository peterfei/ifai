/*!
IfAI Editor - Tool Classification System
========================================

三层工具分类系统：
- Layer 1: 精确匹配 (<1ms)
- Layer 2: 规则分类 (~5ms)
- Layer 3: Qwen 0.5B 推理 (~200ms)

Platform Support:
- macOS (Apple Silicon + Intel)
- Linux (x64 + ARM64)
- Windows (x64)
*/

mod layer1_exact_match;
mod layer2_rule_based;
mod layer3_llm;

// 社区版 Mock 实现
mod mock;

pub mod types;

// 重新导出主要类型
pub use types::{
    ToolCategory,
    ClassificationResult,
    ClassificationLayer,
};

// 重新导出版本信息
pub use mock::{is_community_edition, is_commercial_edition, get_edition_info};

/// Tauri 命令：获取版本信息
#[tauri::command]
pub fn get_edition_info_command() -> String {
    get_edition_info().to_string()
}

use std::collections::HashMap;

// ============================================================================
// Public API
// ============================================================================

/**
 * 工具分类函数（三层路由）
 *
 * 按优先级尝试：
 * 1. Layer 1: 精确匹配（命令格式、函数调用、纯命令）
 * 2. Layer 2: 规则分类（关键词、模式匹配）
 * 3. Layer 3: LLM 推理（Qwen 0.5B 本地分类）
 */
pub fn classify_tool(input: &str) -> ClassificationResult {
    let input = input.trim();

    // 空输入处理
    if input.is_empty() {
        return ClassificationResult {
            layer: ClassificationLayer::Layer3,
            category: ToolCategory::NoToolNeeded,
            tool: None,
            confidence: 0.5,
            match_type: "empty_input".to_string(),
        };
    }

    // Layer 1: 精确匹配
    if let Some(result) = layer1_exact_match::classify(input) {
        return result;
    }

    // Layer 2: 规则分类
    if let Some(result) = layer2_rule_based::classify(input) {
        return result;
    }

    // Layer 3: LLM 推理
    layer3_llm::classify(input)
}

/**
 * 批量分类工具
 */
pub fn classify_tools(inputs: &[&str]) -> Vec<ClassificationResult> {
    inputs.iter().map(|input| classify_tool(input)).collect()
}

// ============================================================================
// Tauri Commands
// ============================================================================

use std::time::Instant;
use crate::tool_classification::types::{ClassifyToolResponse, BatchClassifyResponse};

/// Tauri 命令：工具分类
#[tauri::command]
pub fn tool_classify(input: String) -> ClassifyToolResponse {
    let start = Instant::now();
    let result = classify_tool(&input);
    let latency_ms = start.elapsed().as_millis() as u64;

    ClassifyToolResponse {
        result,
        latency_ms,
    }
}

/// Tauri 命令：批量工具分类
#[tauri::command]
pub fn tool_batch_classify(inputs: Vec<String>) -> BatchClassifyResponse {
    let start = Instant::now();

    let inputs_str: Vec<&str> = inputs.iter().map(|s| s.as_str()).collect();
    let results = classify_tools(&inputs_str);

    let total_latency_ms = start.elapsed().as_millis() as u64;

    BatchClassifyResponse {
        results,
        total_latency_ms,
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // Layer 1 Tests
    #[test]
    fn test_exact_match_slash_commands() {
        let inputs = [
            "/read",
            "/read file.txt",
            "/explore",
            "/explore src",
            "/list",
            "/list tests",
        ];

        for input in inputs {
            let result = classify_tool(input);
            assert_eq!(result.layer, ClassificationLayer::Layer1);
            assert_eq!(result.confidence, 1.0);
        }
    }

    #[test]
    fn test_exact_match_agent_functions() {
        let inputs = [
            "agent_read_file(rel_path=\"README.md\")",
            "agent_list_dir(rel_path=\"src\")",
            "agent_write_file(rel_path=\"test.txt\", content=\"hello\")",
        ];

        for input in inputs {
            let result = classify_tool(input);
            assert_eq!(result.layer, ClassificationLayer::Layer1);
            assert_eq!(result.confidence, 1.0);
            assert!(result.tool.is_some());
        }
    }

    #[test]
    fn test_exact_match_pure_commands() {
        let inputs = [
            "ls",
            "pwd",
            "git status",
            "npm run dev",
            "cargo build",
        ];

        for input in inputs {
            let result = classify_tool(input);
            assert_eq!(result.layer, ClassificationLayer::Layer1);
            assert_eq!(result.category, ToolCategory::TerminalCommands);
            assert_eq!(result.confidence, 1.0);
        }
    }

    // Layer 2 Tests
    #[test]
    fn test_rule_based_file_operations() {
        let inputs = [
            "读取文件",
            "打开配置",
            "查看代码",
            "保存修改",
            "read file",
            "open file",
        ];

        for input in inputs {
            let result = classify_tool(input);
            assert_eq!(result.layer, ClassificationLayer::Layer2);
            assert_eq!(result.category, ToolCategory::FileOperations);
            assert!(result.confidence > 0.7);
        }
    }

    #[test]
    fn test_rule_based_terminal_commands() {
        let inputs = [
            "执行 git",
            "运行 npm",
            "执行 cargo",
        ];

        for input in inputs {
            let result = classify_tool(input);
            assert_eq!(result.layer, ClassificationLayer::Layer2);
            assert_eq!(result.category, ToolCategory::TerminalCommands);
        }
    }

    // Layer 3 Tests
    #[test]
    fn test_llm_classification() {
        let inputs = [
            "帮我分析一下这个项目的架构",
            "解释这段代码的工作原理",
        ];

        for input in inputs {
            let result = classify_tool(input);
            assert_eq!(result.layer, ClassificationLayer::Layer3);
        }
    }

    // Priority Tests
    #[test]
    fn test_layer1_priority() {
        // "/read" should match Layer 1, not Layer 2 keyword
        let result = classify_tool("/read 文件");
        assert_eq!(result.layer, ClassificationLayer::Layer1);
    }

    // Edge Cases
    #[test]
    fn test_empty_input() {
        let result = classify_tool("");
        assert_eq!(result.category, ToolCategory::NoToolNeeded);
    }

    #[test]
    fn test_whitespace_input() {
        let result = classify_tool("   ");
        assert!(matches!(result.category,
            ToolCategory::AiChat | ToolCategory::NoToolNeeded));
    }
}
