/*!
Layer 2: Rule-Based Classification
===================================

规则分类层，基于关键词和模式匹配：
1. 文件操作关键词
2. 终端命令关键词
3. 代码生成关键词
4. 代码分析关键词
5. 搜索操作关键词
6. AI 对话关键词

目标延迟：<5ms
目标准确率：90%+
*/

use super::types::{ClassificationResult, ClassificationLayer, ToolCategory};

// ============================================================================
// Rule Definitions
// ============================================================================

/// 文件操作关键词（中文）
const FILE_OPS_KEYWORDS_CN: &[&str] = &[
    "读取", "打开", "查看", "保存", "写入",
    "删除", "重命名", "移动", "复制", "编辑", "修改",
];

/// 文件操作关键词（英文）
const FILE_OPS_KEYWORDS_EN: &[&str] = &[
    "read", "open", "view", "save",
    "delete", "remove", "rename", "move", "copy", "edit", "modify",
];

/// 终端命令关键词（中文）
const TERMINAL_KEYWORDS_CN: &[&str] = &[
    "执行", "运行", "构建", "编译", "测试",
];

/// 终端命令关键词（英文工具名）
const TERMINAL_TOOLS: &[&str] = &[
    "git", "npm", "yarn", "pnpm", "cargo", "pip", "python", "node",
];

/// 代码生成关键词（中文）
const CODEGEN_KEYWORDS_CN: &[&str] = &[
    "生成", "创建", "写", "编写", "重构", "优化",
];

/// 代码生成关键词（英文）
const CODEGEN_KEYWORDS_EN: &[&str] = &[
    "generate", "create", "write", "refactor", "optimize",
    "implement", "build", "develop",
];

/// 代码分析关键词（中文）
const ANALYSIS_KEYWORDS_CN: &[&str] = &[
    "解释", "分析", "审查", "理解",
];

/// 代码分析关键词（英文）
const ANALYSIS_KEYWORDS_EN: &[&str] = &[
    "explain", "analyze", "review", "understand",
    "inspect", "examine",
];

/// 搜索操作关键词（中文）
const SEARCH_KEYWORDS_CN: &[&str] = &[
    "查找", "搜索", "定位", "找", "寻找",
];

/// 搜索操作关键词（英文）
const SEARCH_KEYWORDS_EN: &[&str] = &[
    "find", "search", "locate", "look for",
];

/// AI 对话关键词（中文问题词）- 更严格的模式
const CHAT_KEYWORDS_CN: &[&str] = &[
    "什么是", "怎么", "如何", "为什么",
];

/// AI 对话关键词（英文问题词）- 更严格的模式
const CHAT_KEYWORDS_EN: &[&str] = &[
    "what is", "how to", "why", "explain ",
];

// ============================================================================
// Pattern Matching
// ============================================================================

/// 检查输入是否包含指定关键词列表中的任意一个
fn contains_any_keyword(input: &str, keywords: &[&str]) -> bool {
    let input_lower = input.to_lowercase();

    for keyword in keywords {
        if input_lower.contains(keyword) {
            return true;
        }
    }

    false
}

/// 检查输入是否以指定关键词开始
fn starts_with_any_keyword(input: &str, keywords: &[&str]) -> bool {
    let input_lower = input.to_lowercase();

    for keyword in keywords {
        if input_lower.starts_with(keyword) {
            return true;
        }
    }

    false
}

// ============================================================================
// Classification Rules
// ============================================================================

/// 规则：文件操作
fn rule_file_operations(input: &str) -> Option<ClassificationResult> {
    let has_cn_keyword = contains_any_keyword(input, FILE_OPS_KEYWORDS_CN);
    let has_en_keyword = contains_any_keyword(input, FILE_OPS_KEYWORDS_EN);

    if has_cn_keyword || has_en_keyword {
        return Some(ClassificationResult::layer2(
            ToolCategory::FileOperations,
            0.9,
            "keyword_file_operations",
        ));
    }

    None
}

/// 规则：终端命令
fn rule_terminal_commands(input: &str) -> Option<ClassificationResult> {
    let has_cn_keyword = contains_any_keyword(input, TERMINAL_KEYWORDS_CN);
    let has_tool_keyword = contains_any_keyword(input, TERMINAL_TOOLS);

    if has_cn_keyword || has_tool_keyword {
        return Some(ClassificationResult::layer2(
            ToolCategory::TerminalCommands,
            0.92,
            "keyword_terminal",
        ));
    }

    None
}

/// 规则：代码生成
fn rule_code_generation(input: &str) -> Option<ClassificationResult> {
    let has_cn_keyword = contains_any_keyword(input, CODEGEN_KEYWORDS_CN);
    let has_en_keyword = contains_any_keyword(input, CODEGEN_KEYWORDS_EN);

    if has_cn_keyword || has_en_keyword {
        return Some(ClassificationResult::layer2(
            ToolCategory::CodeGeneration,
            0.85,
            "keyword_code_generation",
        ));
    }

    None
}

/// 规则：代码分析
fn rule_code_analysis(input: &str) -> Option<ClassificationResult> {
    let has_cn_keyword = contains_any_keyword(input, ANALYSIS_KEYWORDS_CN);
    let has_en_keyword = contains_any_keyword(input, ANALYSIS_KEYWORDS_EN);

    if has_cn_keyword || has_en_keyword {
        return Some(ClassificationResult::layer2(
            ToolCategory::CodeAnalysis,
            0.88,
            "keyword_code_analysis",
        ));
    }

    None
}

/// 规则：搜索操作
fn rule_search_operations(input: &str) -> Option<ClassificationResult> {
    let has_cn_keyword = contains_any_keyword(input, SEARCH_KEYWORDS_CN);
    let has_en_keyword = contains_any_keyword(input, SEARCH_KEYWORDS_EN);

    if has_cn_keyword || has_en_keyword {
        return Some(ClassificationResult::layer2(
            ToolCategory::SearchOperations,
            0.9,
            "keyword_search",
        ));
    }

    None
}

/// 规则：AI 对话
fn rule_ai_chat(input: &str) -> Option<ClassificationResult> {
    let has_cn_keyword = starts_with_any_keyword(input, CHAT_KEYWORDS_CN)
        || contains_any_keyword(input, CHAT_KEYWORDS_CN);
    let has_en_keyword = starts_with_any_keyword(input, CHAT_KEYWORDS_EN)
        || contains_any_keyword(input, CHAT_KEYWORDS_EN);

    if has_cn_keyword || has_en_keyword {
        return Some(ClassificationResult::layer2(
            ToolCategory::AiChat,
            0.8,
            "keyword_question",
        ));
    }

    None
}

// ============================================================================
// Priority Handling
// ============================================================================

/// 规则优先级定义
/// 数字越小优先级越高
fn rule_priority(category: ToolCategory) -> u8 {
    match category {
        ToolCategory::TerminalCommands => 1,  // 最高优先级（工具名明确）
        ToolCategory::SearchOperations => 2,
        ToolCategory::FileOperations => 3,
        ToolCategory::CodeGeneration => 4,
        ToolCategory::CodeAnalysis => 5,
        ToolCategory::AiChat => 6,             // 最低优先级（最模糊）
        ToolCategory::NoToolNeeded => 7,
    }
}

// ============================================================================
// Public API
// ============================================================================

/// Layer 2 分类入口
pub fn classify(input: &str) -> Option<ClassificationResult> {
    // 复杂度检查：较长的输入应交给 Layer3 (LLM 分类)
    // 使用字符数而非字节数，以正确处理中文
    let char_count = input.chars().count();
    if char_count > 20 {
        return None; // 延迟到 Layer3
    }

    // 语义复杂度检查：某些模式表示复杂的语义理解需求
    // 这些输入虽然不长，但需要 LLM 理解上下文和意图
    let complex_patterns = [
        "一下",    // "帮我分析一下" - 需要复杂分析
        "这段",    // "解释这段代码" - 需要上下文理解
        "项目的",  // "项目的架构" - 需要全局理解
        "原理",    // "工作原理" - 需要深入理解
        "架构",    // "项目架构" - 需要全局视角
    ];
    let has_complex_pattern = complex_patterns.iter().any(|pattern| input.contains(pattern));
    if has_complex_pattern {
        return None; // 延迟到 Layer3 进行语义分析
    }

    // 首先检查明确的问句格式（最高优先级）
    let has_question_mark = input.contains('?') || input.contains('？');
    let is_question_format = CHAT_KEYWORDS_CN.iter().any(|kw| input.starts_with(kw))
        || CHAT_KEYWORDS_EN.iter().any(|kw| {
            let input_lower = input.to_lowercase();
            input_lower.starts_with(kw)
        });

    if has_question_mark || is_question_format {
        if let Some(result) = rule_ai_chat(input) {
            return Some(result);
        }
    }

    // 其他规则按优先级执行
    // 1. Terminal 命令（工具名明确）
    if let Some(result) = rule_terminal_commands(input) {
        return Some(result);
    }

    // 2. 搜索操作（明确的搜索行为）
    if let Some(result) = rule_search_operations(input) {
        return Some(result);
    }

    // 3. 文件操作（明确的文件操作）
    if let Some(result) = rule_file_operations(input) {
        return Some(result);
    }

    // 4. 代码分析（分析类行为）
    if let Some(result) = rule_code_analysis(input) {
        return Some(result);
    }

    // 5. 代码生成（生成类行为）
    if let Some(result) = rule_code_generation(input) {
        return Some(result);
    }

    // 6. AI 对话（最模糊，最低优先级）
    rule_ai_chat(input)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // File Operations Tests
    #[test]
    fn test_rule_file_operations_chinese() {
        let inputs = [
            "读取文件",
            "打开配置",
            "查看代码",
            "保存修改",
            "重命名文件",
            "删除文件",
        ];

        for input in inputs {
            let result = classify(input).unwrap();
            assert_eq!(result.layer, ClassificationLayer::Layer2);
            assert_eq!(result.category, ToolCategory::FileOperations);
            assert!(result.confidence > 0.8);
        }
    }

    #[test]
    fn test_rule_file_operations_english() {
        let inputs = [
            "read file",
            "open config",
            "view code",
            "save file",
            "rename file",
        ];

        for input in inputs {
            let result = classify(input).unwrap();
            assert_eq!(result.category, ToolCategory::FileOperations);
        }
    }

    // Terminal Commands Tests
    #[test]
    fn test_rule_terminal_commands_chinese() {
        let inputs = [
            "执行 git 命令",
            "运行 npm install",
            "执行 cargo test",
        ];

        for input in inputs {
            let result = classify(input).unwrap();
            assert_eq!(result.layer, ClassificationLayer::Layer2);
            assert_eq!(result.category, ToolCategory::TerminalCommands);
        }
    }

    #[test]
    fn test_rule_terminal_commands_with_tools() {
        let inputs = [
            "git 操作",
            "npm 安装",
            "cargo 构建",
            "pip 安装包",
        ];

        for input in inputs {
            let result = classify(input).unwrap();
            assert_eq!(result.category, ToolCategory::TerminalCommands);
        }
    }

    // Code Generation Tests
    #[test]
    fn test_rule_code_generation() {
        let inputs = [
            "生成一个函数",
            "创建组件",
            "写一个类",
            "重构代码",
            "优化函数",
        ];

        for input in inputs {
            let result = classify(input).unwrap();
            assert_eq!(result.layer, ClassificationLayer::Layer2);
            assert_eq!(result.category, ToolCategory::CodeGeneration);
        }
    }

    // Code Analysis Tests
    #[test]
    fn test_rule_code_analysis() {
        let inputs = [
            "解释代码",
            "分析性能",
            "代码审查",
            "理解逻辑",
        ];

        for input in inputs {
            let result = classify(input).unwrap();
            assert_eq!(result.layer, ClassificationLayer::Layer2);
            assert_eq!(result.category, ToolCategory::CodeAnalysis);
        }
    }

    // Search Operations Tests
    #[test]
    fn test_rule_search_operations() {
        let inputs = [
            "查找代码",
            "搜索函数",
            "定位引用",
            "找所有",
        ];

        for input in inputs {
            let result = classify(input).unwrap();
            assert_eq!(result.layer, ClassificationLayer::Layer2);
            assert_eq!(result.category, ToolCategory::SearchOperations);
        }
    }

    // AI Chat Tests
    #[test]
    fn test_rule_ai_chat() {
        let inputs = [
            "什么是闭包",
            "怎么使用 Hook",
            "如何优化",
            "explain async",
            "what is promise",
        ];

        for input in inputs {
            let result = classify(input).unwrap();
            assert_eq!(result.layer, ClassificationLayer::Layer2);
            assert_eq!(result.category, ToolCategory::AiChat);
        }
    }

    // Priority Tests
    #[test]
    fn test_rule_priority() {
        // "git log" - Terminal commands should have higher priority than search
        let result = classify("git log 查看").unwrap();
        assert_eq!(result.category, ToolCategory::TerminalCommands);

        // "搜索 npm 包" - Search should be detected
        let result = classify("搜索 npm 包").unwrap();
        // Should be either Search or Terminal depending on implementation
        assert!(matches!(result.category,
            ToolCategory::SearchOperations | ToolCategory::TerminalCommands));
    }

    // Confidence Tests
    #[test]
    fn test_layer2_confidence_range() {
        let inputs = vec![
            "读取文件",
            "执行 git",
            "生成函数",
            "解释代码",
        ];

        for input in inputs {
            if let Some(result) = classify(input) {
                assert!(result.confidence >= 0.7 && result.confidence < 1.0,
                    "Layer 2 confidence should be in [0.7, 1.0), got {} for '{}'",
                    result.confidence, input);
            }
        }
    }

    // Non-matching Tests
    #[test]
    fn test_no_matching_rule() {
        let inputs = [
            "hello world",
            "random text",
            "just checking",
        ];

        for input in inputs {
            let result = classify(input);
            assert!(result.is_none(), "Input '{}' should not match any rule", input);
        }
    }
}
