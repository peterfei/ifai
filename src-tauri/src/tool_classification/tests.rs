/**
 * Rust Backend Tests: Tool Classification System (v0.3.3)
 *
 * 测试工具分类系统的 Rust 后端实现：
 * - Layer 1: 精确匹配
 * - Layer 2: 规则分类
 * - Layer 3: LLM 推理
 */

#[cfg(test)]
mod tests {
    // ============================================================================
    // Types
    // ============================================================================

    #[derive(Debug, Clone, PartialEq)]
    pub enum ToolCategory {
        FileOperations,
        CodeGeneration,
        CodeAnalysis,
        TerminalCommands,
        AiChat,
        SearchOperations,
        NoToolNeeded,
    }

    #[derive(Debug, Clone)]
    pub struct ClassificationResult {
        pub layer: u8,
        pub category: ToolCategory,
        pub tool: Option<String>,
        pub confidence: f32,
    }

    // ============================================================================
    // Mock Implementation (TODO: Replace with real implementation)
    // ============================================================================

    /// 工具分类函数（模拟实现）
    /// TODO: 替换为真实的 classify_tool 实现
    fn classify_tool(input: &str) -> ClassificationResult {
        // Layer 1: 精确匹配
        if input.starts_with('/') {
            return ClassificationResult {
                layer: 1,
                category: ToolCategory::FileOperations,
                tool: Some("agent_read_file".to_string()),
                confidence: 1.0,
            };
        }

        // 纯命令
        if input == "ls" || input.starts_with("git ") || input.starts_with("npm ") {
            return ClassificationResult {
                layer: 1,
                category: ToolCategory::TerminalCommands,
                tool: Some("bash".to_string()),
                confidence: 1.0,
            };
        }

        // Layer 2: 规则匹配
        if input.contains("读取") || input.contains("打开") {
            return ClassificationResult {
                layer: 2,
                category: ToolCategory::FileOperations,
                tool: None,
                confidence: 0.9,
            };
        }

        if input.contains("git") || input.contains("npm") || input.contains("cargo") {
            return ClassificationResult {
                layer: 2,
                category: ToolCategory::TerminalCommands,
                tool: None,
                confidence: 0.9,
            };
        }

        // Layer 3: LLM 推理
        ClassificationResult {
            layer: 3,
            category: ToolCategory::AiChat,
            tool: None,
            confidence: 0.8,
        }
    }

    // ============================================================================
    // Layer 1: Exact Match Tests
    // ============================================================================

    mod layer1_exact_match {
        use super::*;

        #[test]
        fn test_slash_command_read() {
            let result = classify_tool("/read file.txt");
            assert_eq!(result.layer, 1);
            assert_eq!(result.category, ToolCategory::FileOperations);
            assert_eq!(result.tool, Some("agent_read_file".to_string()));
            assert_eq!(result.confidence, 1.0);
        }

        #[test]
        fn test_slash_command_explore() {
            let result = classify_tool("/explore src");
            assert_eq!(result.layer, 1);
            assert_eq!(result.category, ToolCategory::FileOperations);
        }

        #[test]
        fn test_slash_command_list() {
            let result = classify_tool("/list tests");
            assert_eq!(result.layer, 1);
            assert_eq!(result.category, ToolCategory::FileOperations);
        }

        #[test]
        fn test_agent_function_read_file() {
            let result = classify_tool("agent_read_file(rel_path=\"README.md\")");
            assert_eq!(result.layer, 1);
            assert_eq!(result.tool, Some("agent_read_file".to_string()));
            assert_eq!(result.confidence, 1.0);
        }

        #[test]
        fn test_agent_function_list_dir() {
            let result = classify_tool("agent_list_dir(rel_path=\"src\")");
            assert_eq!(result.layer, 1);
            assert_eq!(result.tool, Some("agent_list_dir".to_string()));
        }

        #[test]
        fn test_pure_command_ls() {
            let result = classify_tool("ls");
            assert_eq!(result.layer, 1);
            assert_eq!(result.category, ToolCategory::TerminalCommands);
            assert_eq!(result.tool, Some("bash".to_string()));
            assert_eq!(result.confidence, 1.0);
        }

        #[test]
        fn test_pure_command_git_status() {
            let result = classify_tool("git status");
            assert_eq!(result.layer, 1);
            assert_eq!(result.category, ToolCategory::TerminalCommands);
            assert_eq!(result.tool, Some("bash".to_string()));
        }

        #[test]
        fn test_pure_command_git_log() {
            let result = classify_tool("git log");
            assert_eq!(result.layer, 1);
            assert_eq!(result.category, ToolCategory::TerminalCommands);
        }

        #[test]
        fn test_pure_command_git_diff() {
            let result = classify_tool("git diff");
            assert_eq!(result.layer, 1);
            assert_eq!(result.category, ToolCategory::TerminalCommands);
        }

        #[test]
        fn test_pure_command_npm_run() {
            let result = classify_tool("npm run dev");
            assert_eq!(result.layer, 1);
            assert_eq!(result.category, ToolCategory::TerminalCommands);
        }

        #[test]
        fn test_pure_command_npm_install() {
            let result = classify_tool("npm install");
            assert_eq!(result.layer, 1);
            assert_eq!(result.category, ToolCategory::TerminalCommands);
        }

        #[test]
        fn test_pure_command_cargo_build() {
            let result = classify_tool("cargo build");
            assert_eq!(result.layer, 1);
            assert_eq!(result.category, ToolCategory::TerminalCommands);
        }

        #[test]
        fn test_pure_command_pwd() {
            let result = classify_tool("pwd");
            assert_eq!(result.layer, 1);
            assert_eq!(result.category, ToolCategory::TerminalCommands);
        }

        #[test]
        fn test_layer1_confidence_always_1() {
            let inputs = vec![
                "/read file.txt",
                "agent_read_file(rel_path=\"x\")",
                "ls",
                "git status",
                "npm run dev",
                "cargo build",
            ];

            for input in inputs {
                let result = classify_tool(input);
                if result.layer == 1 {
                    assert_eq!(result.confidence, 1.0, "Layer 1 should always have confidence 1.0");
                }
            }
        }
    }

    // ============================================================================
    // Layer 2: Rule-Based Tests
    // ============================================================================

    mod layer2_rule_based {
        use super::*;

        #[test]
        fn test_file_operations_keyword_read() {
            let result = classify_tool("读取 README.md");
            assert_eq!(result.layer, 2);
            assert_eq!(result.category, ToolCategory::FileOperations);
            assert!(result.confidence > 0.7);
        }

        #[test]
        fn test_file_operations_keyword_open() {
            let result = classify_tool("打开 config.json");
            assert_eq!(result.layer, 2);
            assert_eq!(result.category, ToolCategory::FileOperations);
        }

        #[test]
        fn test_file_operations_keyword_view() {
            let result = classify_tool("查看 src/index.ts");
            assert_eq!(result.layer, 2);
            assert_eq!(result.category, ToolCategory::FileOperations);
        }

        #[test]
        fn test_file_operations_keyword_save() {
            let result = classify_tool("保存文件");
            assert_eq!(result.layer, 2);
            assert_eq!(result.category, ToolCategory::FileOperations);
        }

        #[test]
        fn test_terminal_commands_keyword_git() {
            let result = classify_tool("执行 git log");
            assert_eq!(result.layer, 2);
            assert_eq!(result.category, ToolCategory::TerminalCommands);
        }

        #[test]
        fn test_terminal_commands_keyword_npm() {
            let result = classify_tool("运行 npm install");
            assert_eq!(result.layer, 2);
            assert_eq!(result.category, ToolCategory::TerminalCommands);
        }

        #[test]
        fn test_terminal_commands_keyword_cargo() {
            let result = classify_tool("执行 cargo test");
            assert_eq!(result.layer, 2);
            assert_eq!(result.category, ToolCategory::TerminalCommands);
        }

        #[test]
        fn test_layer2_confidence_range() {
            let inputs = vec![
                "读取文件",
                "打开配置",
                "执行 git",
                "运行 npm",
            ];

            for input in inputs {
                let result = classify_tool(input);
                if result.layer == 2 {
                    assert!(result.confidence >= 0.7 && result.confidence < 1.0,
                        "Layer 2 confidence should be in [0.7, 1.0)");
                }
            }
        }
    }

    // ============================================================================
    // Layer 3: LLM Classification Tests
    // ============================================================================

    mod layer3_llm {
        use super::*;

        #[test]
        fn test_complex_analysis_query() {
            let result = classify_tool("帮我分析一下这个项目的架构");
            assert_eq!(result.layer, 3);
            assert!(matches!(result.category,
                ToolCategory::CodeAnalysis | ToolCategory::AiChat));
        }

        #[test]
        fn test_ambiguous_query() {
            let result = classify_tool("检查一下");
            assert_eq!(result.layer, 3);
        }

        #[test]
        fn test_context_dependent_query() {
            let result = classify_tool("这个文件有什么问题");
            assert_eq!(result.layer, 3);
        }

        #[test]
        fn test_layer3_confidence_range() {
            let inputs = vec![
                "分析项目架构",
                "解释这段代码",
                "优化性能",
            ];

            for input in inputs {
                let result = classify_tool(input);
                if result.layer == 3 {
                    assert!(result.confidence > 0.0 && result.confidence <= 1.0,
                        "Layer 3 confidence should be in (0, 1]");
                }
            }
        }
    }

    // ============================================================================
    // Edge Cases Tests
    // ============================================================================

    mod edge_cases {
        use super::*;

        #[test]
        fn test_empty_input() {
            let result = classify_tool("");
            assert!(matches!(result.category, ToolCategory::AiChat | ToolCategory::NoToolNeeded));
        }

        #[test]
        fn test_whitespace_only() {
            let result = classify_tool("   ");
            assert!(result.layer >= 2);
        }

        #[test]
        fn test_very_short_input() {
            let result = classify_tool("x");
            assert!(result.layer >= 2);
        }

        #[test]
        fn test_special_characters() {
            let result = classify_tool("???");
            assert!(matches!(result.category, ToolCategory::AiChat | ToolCategory::NoToolNeeded));
        }

        #[test]
        fn test_very_long_input() {
            let long_input = "分析".to_string() + &"x".repeat(1000);
            let result = classify_tool(&long_input);
            assert!(result.layer >= 2);
        }

        #[test]
        fn test_mixed_language() {
            let result = classify_tool("read the README 文件");
            assert!(result.layer >= 2);
        }

        #[test]
        fn test_code_snippet() {
            let code = "分析这段代码: function hello() { return \"world\"; }";
            let result = classify_tool(code);
            assert!(matches!(result.category,
                ToolCategory::CodeAnalysis | ToolCategory::CodeGeneration));
        }
    }

    // ============================================================================
    // Priority Tests
    // ============================================================================

    mod priority {
        use super::*;

        #[test]
        fn test_layer1_priority_over_layer2() {
            // "/read" could match both Layer 1 (slash command) and Layer 2 (keyword "read")
            let result = classify_tool("/read 文件");
            assert_eq!(result.layer, 1, "Layer 1 should take priority over Layer 2");
        }

        #[test]
        fn test_exact_command_priority_over_keyword() {
            let result = classify_tool("ls");
            assert_eq!(result.layer, 1, "Exact command should match Layer 1");
        }

        #[test]
        fn test_layer2_priority_over_layer3() {
            let result = classify_tool("读取文件");
            assert_eq!(result.layer, 2, "Rule match should take priority over LLM");
        }
    }

    // ============================================================================
    // Performance Tests
    // ============================================================================

    mod performance {
        use super::*;
        use std::time::Instant;

        #[test]
        fn test_layer1_latency() {
            let start = Instant::now();
            let result = classify_tool("/read file.txt");
            let duration = start.elapsed();

            assert_eq!(result.layer, 1);
            assert!(duration.as_millis() < 5, "Layer 1 should complete in <5ms");
        }

        #[test]
        fn test_layer2_latency() {
            let start = Instant::now();
            let result = classify_tool("读取文件");
            let duration = start.elapsed();

            assert_eq!(result.layer, 2);
            assert!(duration.as_millis() < 20, "Layer 2 should complete in <20ms");
        }

        #[test]
        fn test_multiple_classifications() {
            let inputs = vec![
                "/read file.txt",
                "读取配置",
                "分析代码",
                "git status",
                "生成函数",
            ];

            let start = Instant::now();
            for input in inputs {
                classify_tool(input);
            }
            let duration = start.elapsed();

            assert!(duration.as_millis() < 100, "All classifications should complete in <100ms");
        }

        #[test]
        fn test_consistency() {
            let input = "读取文件";

            let result1 = classify_tool(input);
            let result2 = classify_tool(input);
            let result3 = classify_tool(input);

            assert_eq!(result1.layer, result2.layer);
            assert_eq!(result2.layer, result3.layer);
            assert_eq!(result1.category, result2.category);
            assert_eq!(result2.category, result3.category);
        }
    }

    // ============================================================================
    // Integration Tests
    // ============================================================================

    mod integration {
        use super::*;

        #[test]
        fn test_complete_dataset_coverage() {
            // 测试所有类别都能被正确分类
            let test_cases = vec![
                ("/read", ToolCategory::FileOperations),
                ("ls", ToolCategory::TerminalCommands),
                ("读取文件", ToolCategory::FileOperations),
                ("git log", ToolCategory::TerminalCommands),
                ("生成函数", ToolCategory::CodeGeneration),
                ("解释代码", ToolCategory::CodeAnalysis),
                ("什么是闭包", ToolCategory::AiChat),
            ];

            for (input, expected_category) in test_cases {
                let result = classify_tool(input);
                assert_eq!(result.category, expected_category,
                    "Input '{}' should be classified as {:?}", input, expected_category);
            }
        }

        #[test]
        fn test_tool_name_provided_for_layer1() {
            let inputs_with_tools = vec![
                ("/read", "agent_read_file"),
                ("ls", "bash"),
                ("agent_list_dir(rel_path=\"src\")", "agent_list_dir"),
            ];

            for (input, expected_tool) in inputs_with_tools {
                let result = classify_tool(input);
                assert_eq!(result.tool.as_ref().unwrap(), &expected_tool,
                    "Input '{}' should have tool '{}'", input, expected_tool);
            }
        }

        #[test]
        fn test_confidence_decreases_with_layer() {
            let layer1_input = "/read";
            let layer2_input = "读取文件";
            let layer3_input = "分析项目架构";

            let result1 = classify_tool(layer1_input);
            let result2 = classify_tool(layer2_input);
            let result3 = classify_tool(layer3_input);

            assert!(result1.confidence >= result2.confidence,
                "Layer 1 confidence should be >= Layer 2");
            assert!(result2.confidence >= result3.confidence,
                "Layer 2 confidence should be >= Layer 3");
        }
    }
}
