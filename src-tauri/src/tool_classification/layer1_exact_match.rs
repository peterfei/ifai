/*!
Layer 1: Exact Match Classification
====================================

精确匹配层，处理：
1. 斜杠命令：/read, /explore, /list 等
2. Agent 函数调用：agent_xxx() 格式
3. 纯命令：ls, git status, npm run 等

目标延迟：<1ms
目标准确率：100%
*/

use super::types::{ClassificationResult, ClassificationLayer, ToolCategory};
use std::collections::HashMap;

// ============================================================================
// Slash Commands
// ============================================================================

/// 斜杠命令映射
const SLASH_COMMANDS: &[(&str, ToolCategory, &str)] = &[
    ("/read", ToolCategory::FileOperations, "agent_read_file"),
    ("/explore", ToolCategory::FileOperations, "agent_list_dir"),
    ("/list", ToolCategory::FileOperations, "agent_list_dir"),
    ("/scan", ToolCategory::FileOperations, "agent_list_dir"),
    ("/search", ToolCategory::SearchOperations, "agent_search"),
    ("/find", ToolCategory::SearchOperations, "agent_search"),
    ("/help", ToolCategory::AiChat, "help"),
];

/// 处理斜杠命令
fn classify_slash_command(input: &str) -> Option<ClassificationResult> {
    // 提取命令和参数
    let parts: Vec<&str> = input.splitn(2, ' ').collect();
    let command = parts[0];

    for &(cmd, category, tool) in SLASH_COMMANDS {
        if command == cmd {
            return Some(ClassificationResult::layer1(
                category,
                Some(tool.to_string()),
                "slash_command",
            ));
        }
    }

    None
}

// ============================================================================
// Agent Functions
// ============================================================================

/// Agent 函数模式
const AGENT_FUNCTIONS: &[(&str, ToolCategory)] = &[
    ("agent_read_file", ToolCategory::FileOperations),
    ("agent_list_dir", ToolCategory::FileOperations),
    ("agent_write_file", ToolCategory::FileOperations),
    ("agent_create_file", ToolCategory::FileOperations),
    ("agent_delete_file", ToolCategory::FileOperations),
    ("agent_rename_file", ToolCategory::FileOperations),
    ("agent_search", ToolCategory::SearchOperations),
    ("agent_find_references", ToolCategory::SearchOperations),
    ("agent_find_definition", ToolCategory::SearchOperations),
];

/// 解析 agent_xxx() 函数调用
fn parse_agent_function(input: &str) -> Option<(String, HashMap<String, String>)> {
    // 直接检查是否以 agent_ 开头
    let input_trimmed = input.trim();

    if !input_trimmed.to_lowercase().starts_with("agent_") {
        return None;
    }

    // 查找第一个 ( 的位置
    let paren_pos = input_trimmed.find('(')?;
    let func_name = input_trimmed[..paren_pos].to_string();

    // 验证是否是已知的 agent 函数
    for (known_func, _) in AGENT_FUNCTIONS {
        if func_name.to_lowercase() == *known_func {
            return Some((func_name, HashMap::new()));
        }
    }

    None
}

/// 处理 Agent 函数调用
fn classify_agent_function(input: &str) -> Option<ClassificationResult> {
    if let Some((func_name, _)) = parse_agent_function(input) {
        // 查找对应的类别
        for &(func, category) in AGENT_FUNCTIONS {
            if func_name.to_lowercase() == *func {
                return Some(ClassificationResult::layer1(
                    category,
                    Some(func_name.clone()),
                    "agent_function",
                ));
            }
        }
    }

    None
}

// ============================================================================
// Pure Commands
// ============================================================================

/// 纯命令关键词（立即匹配，无需参数）
const IMMEDIATE_COMMANDS: &[&str] = &[
    "ls", "pwd", "cd", "clear", "exit", "env",
];

/// Git 命令
const GIT_COMMANDS: &[&str] = &[
    "git status", "git log", "git diff", "git add", "git commit",
    "git push", "git pull", "git branch", "git checkout", "git merge",
    "git stash", "git reset", "git rm", "git mv", "git clone",
];

/// NPM/Yarn/PNPM 命令
const NPM_COMMANDS: &[&str] = &[
    "npm run", "npm test", "npm install", "npm uninstall", "npm update",
    "npm build", "npm start", "npm dev",
    "yarn", "yarn run", "yarn test", "yarn install", "yarn add", "yarn remove",
    "yarn build", "yarn start", "yarn dev",
    "pnpm", "pnpm run", "pnpm test", "pnpm install", "pnpm add", "pnpm remove",
    "pnpm build", "pnpm start", "pnpm dev",
];

/// Cargo 命令
const CARGO_COMMANDS: &[&str] = &[
    "cargo build", "cargo test", "cargo run", "cargo check", "cargo clean",
    "cargo doc", "cargo bench", "cargo publish", "cargo install", "cargo update",
];

/// Node/Python 命令
const RUNTIME_COMMANDS: &[&str] = &[
    "node ", "python ", "python3 ", "pip ", "pip3 ",
];

/// 检查是否是纯命令
fn is_pure_command(input: &str) -> bool {
    let input_lower = input.to_lowercase();
    let input_trimmed = input.trim();

    // 检查立即命令
    if IMMEDIATE_COMMANDS.contains(&input_trimmed) {
        return true;
    }

    // 检查 Git 命令
    for cmd in GIT_COMMANDS {
        if input_lower.starts_with(cmd) || input_trimmed == *cmd {
            return true;
        }
    }

    // 检查 NPM/Yarn/PNPM 命令
    for cmd in NPM_COMMANDS {
        if input_lower.starts_with(cmd) {
            return true;
        }
    }

    // 检查 Cargo 命令
    for cmd in CARGO_COMMANDS {
        if input_lower.starts_with(cmd) {
            return true;
        }
    }

    // 检查运行时命令
    for cmd in RUNTIME_COMMANDS {
        if input_lower.starts_with(cmd) {
            return true;
        }
    }

    false
}

/// 处理纯命令
fn classify_pure_command(input: &str) -> Option<ClassificationResult> {
    if is_pure_command(input) {
        return Some(ClassificationResult::layer1(
            ToolCategory::TerminalCommands,
            Some("bash".to_string()),
            "exact_command",
        ));
    }

    None
}

// ============================================================================
// Public API
// ============================================================================

/// Layer 1 分类入口
pub fn classify(input: &str) -> Option<ClassificationResult> {
    let input = input.trim();

    // 1. 检查斜杠命令
    if input.starts_with('/') {
        if let Some(result) = classify_slash_command(input) {
            return Some(result);
        }
    }

    // 2. 检查 Agent 函数
    if input.to_lowercase().starts_with("agent_") {
        if let Some(result) = classify_agent_function(input) {
            return Some(result);
        }
    }

    // 3. 检查纯命令
    if let Some(result) = classify_pure_command(input) {
        return Some(result);
    }

    None
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // Slash Command Tests
    #[test]
    fn test_slash_command_read() {
        let result = classify("/read file.txt").unwrap();
        assert_eq!(result.layer, ClassificationLayer::Layer1);
        assert_eq!(result.category, ToolCategory::FileOperations);
        assert_eq!(result.tool, Some("agent_read_file".to_string()));
        assert_eq!(result.confidence, 1.0);
    }

    #[test]
    fn test_slash_command_explore() {
        let result = classify("/explore src").unwrap();
        assert_eq!(result.layer, ClassificationLayer::Layer1);
        assert_eq!(result.category, ToolCategory::FileOperations);
    }

    #[test]
    fn test_slash_command_list() {
        let result = classify("/list tests").unwrap();
        assert_eq!(result.layer, ClassificationLayer::Layer1);
    }

    #[test]
    fn test_slash_command_search() {
        let result = classify("/search useState").unwrap();
        assert_eq!(result.category, ToolCategory::SearchOperations);
    }

    // Agent Function Tests
    #[test]
    fn test_agent_function_read_file() {
        let result = classify("agent_read_file(rel_path=\"README.md\")").unwrap();
        assert_eq!(result.layer, ClassificationLayer::Layer1);
        assert_eq!(result.tool, Some("agent_read_file".to_string()));
    }

    #[test]
    fn test_agent_function_list_dir() {
        let result = classify("agent_list_dir(rel_path=\"src\")").unwrap();
        assert_eq!(result.layer, ClassificationLayer::Layer1);
    }

    #[test]
    fn test_agent_function_write_file() {
        let result = classify("agent_write_file(rel_path=\"test.txt\", content=\"hello\")").unwrap();
        assert_eq!(result.layer, ClassificationLayer::Layer1);
    }

    #[test]
    fn test_agent_function_search() {
        let result = classify("agent_search(query=\"test\")").unwrap();
        assert_eq!(result.category, ToolCategory::SearchOperations);
    }

    // Pure Command Tests
    #[test]
    fn test_pure_command_ls() {
        let result = classify("ls").unwrap();
        assert_eq!(result.layer, ClassificationLayer::Layer1);
        assert_eq!(result.category, ToolCategory::TerminalCommands);
        assert_eq!(result.tool, Some("bash".to_string()));
    }

    #[test]
    fn test_pure_command_git_status() {
        let result = classify("git status").unwrap();
        assert_eq!(result.category, ToolCategory::TerminalCommands);
    }

    #[test]
    fn test_pure_command_git_log() {
        let result = classify("git log").unwrap();
        assert_eq!(result.category, ToolCategory::TerminalCommands);
    }

    #[test]
    fn test_pure_command_npm_run() {
        let result = classify("npm run dev").unwrap();
        assert_eq!(result.category, ToolCategory::TerminalCommands);
    }

    #[test]
    fn test_pure_command_cargo_build() {
        let result = classify("cargo build").unwrap();
        assert_eq!(result.category, ToolCategory::TerminalCommands);
    }

    #[test]
    fn test_pure_command_yarn() {
        let result = classify("yarn add react").unwrap();
        assert_eq!(result.category, ToolCategory::TerminalCommands);
    }

    #[test]
    fn test_pure_command_pnpm() {
        let result = classify("pnpm install").unwrap();
        assert_eq!(result.category, ToolCategory::TerminalCommands);
    }

    #[test]
    fn test_pure_command_python() {
        let result = classify("python main.py").unwrap();
        assert_eq!(result.category, ToolCategory::TerminalCommands);
    }

    // Non-matching Tests
    #[test]
    fn test_non_matching_input() {
        assert!(classify("读取文件").is_none());
        assert!(classify("some random text").is_none());
        assert!(classify("help me please").is_none());
    }

    // Confidence Tests
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
            if let Some(result) = classify(input) {
                assert_eq!(result.confidence, 1.0);
            }
        }
    }
}
