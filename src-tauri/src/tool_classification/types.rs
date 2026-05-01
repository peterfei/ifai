/*!
Tool Classification Types
==========================

定义工具分类系统使用的类型
*/

use serde::{Deserialize, Serialize};

// ============================================================================
// Tool Category
// ============================================================================

/// 工具类别
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolCategory {
    /// 文件操作：打开、保存、重命名等
    FileOperations,

    /// 代码生成：补全、重构、注释等
    CodeGeneration,

    /// 代码分析：查找引用、解释代码等
    CodeAnalysis,

    /// 终端命令：git、npm、cargo 等
    TerminalCommands,

    /// AI 对话：问答、建议等
    AiChat,

    /// 搜索操作：全局搜索、符号查找等
    SearchOperations,

    /// 无需工具：直接回答
    NoToolNeeded,
}

impl ToolCategory {
    /// 获取类别的显示名称
    pub fn display_name(&self) -> &'static str {
        match self {
            ToolCategory::FileOperations => "file_operations",
            ToolCategory::CodeGeneration => "code_generation",
            ToolCategory::CodeAnalysis => "code_analysis",
            ToolCategory::TerminalCommands => "terminal_commands",
            ToolCategory::AiChat => "ai_chat",
            ToolCategory::SearchOperations => "search_operations",
            ToolCategory::NoToolNeeded => "no_tool_needed",
        }
    }

    /// 获取类别的中文描述
    pub fn description(&self) -> &'static str {
        match self {
            ToolCategory::FileOperations => "文件操作",
            ToolCategory::CodeGeneration => "代码生成",
            ToolCategory::CodeAnalysis => "代码分析",
            ToolCategory::TerminalCommands => "终端命令",
            ToolCategory::AiChat => "AI 对话",
            ToolCategory::SearchOperations => "搜索操作",
            ToolCategory::NoToolNeeded => "无需工具",
        }
    }
}

impl std::fmt::Display for ToolCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.display_name())
    }
}

// ============================================================================
// Classification Layer
// ============================================================================

/// 分类层级
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClassificationLayer {
    /// Layer 1: 精确匹配
    Layer1 = 1,

    /// Layer 2: 规则分类
    Layer2 = 2,

    /// Layer 3: LLM 推理
    Layer3 = 3,
}

impl ClassificationLayer {
    /// 获取层级的显示图标
    pub fn icon(&self) -> &'static str {
        match self {
            ClassificationLayer::Layer1 => "⚡",
            ClassificationLayer::Layer2 => "🔧",
            ClassificationLayer::Layer3 => "🤖",
        }
    }

    /// 获取层级的描述
    pub fn description(&self) -> &'static str {
        match self {
            ClassificationLayer::Layer1 => "精确匹配",
            ClassificationLayer::Layer2 => "规则匹配",
            ClassificationLayer::Layer3 => "本地 LLM",
        }
    }
}

// ============================================================================
// Classification Result
// ============================================================================

/// 分类结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassificationResult {
    /// 分类层级
    pub layer: ClassificationLayer,

    /// 工具类别
    pub category: ToolCategory,

    /// 具体工具名称（如果有）
    pub tool: Option<String>,

    /// 置信度 (0.0 - 1.0)
    pub confidence: f32,

    /// 匹配类型
    pub match_type: String,
}

impl ClassificationResult {
    /// 创建 Layer 1 结果
    pub fn layer1(category: ToolCategory, tool: Option<String>, match_type: &str) -> Self {
        Self {
            layer: ClassificationLayer::Layer1,
            category,
            tool,
            confidence: 1.0,
            match_type: match_type.to_string(),
        }
    }

    /// 创建 Layer 2 结果
    pub fn layer2(category: ToolCategory, confidence: f32, match_type: &str) -> Self {
        Self {
            layer: ClassificationLayer::Layer2,
            category,
            tool: None,
            confidence,
            match_type: match_type.to_string(),
        }
    }

    /// 创建 Layer 3 结果
    pub fn layer3(category: ToolCategory, confidence: f32) -> Self {
        Self {
            layer: ClassificationLayer::Layer3,
            category,
            tool: None,
            confidence,
            match_type: "llm_classification".to_string(),
        }
    }

    /// 获取显示信息
    pub fn display_info(&self) -> String {
        format!(
            "{} {} - {} ({:.0}%)",
            self.layer.icon(),
            self.layer.description(),
            self.category.description(),
            self.confidence * 100.0
        )
    }
}

// ============================================================================
// Tauri Command Types
// ============================================================================

/// 工具分类请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassifyToolRequest {
    pub input: String,
}

/// 工具分类响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassifyToolResponse {
    pub result: ClassificationResult,
    pub latency_ms: u64,
}

/// 批量分类请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchClassifyRequest {
    pub inputs: Vec<String>,
}

/// 批量分类响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchClassifyResponse {
    pub results: Vec<ClassificationResult>,
    pub total_latency_ms: u64,
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_category_display() {
        assert_eq!(
            ToolCategory::FileOperations.display_name(),
            "file_operations"
        );
        assert_eq!(ToolCategory::TerminalCommands.description(), "终端命令");
    }

    #[test]
    fn test_classification_layer_display() {
        assert_eq!(ClassificationLayer::Layer1.icon(), "⚡");
        assert_eq!(ClassificationLayer::Layer2.description(), "规则匹配");
    }

    #[test]
    fn test_classification_result_creation() {
        let result = ClassificationResult::layer1(
            ToolCategory::FileOperations,
            Some("agent_read_file".to_string()),
            "slash_command",
        );

        assert_eq!(result.layer, ClassificationLayer::Layer1);
        assert_eq!(result.category, ToolCategory::FileOperations);
        assert_eq!(result.tool, Some("agent_read_file".to_string()));
        assert_eq!(result.confidence, 1.0);
    }

    #[test]
    fn test_classification_result_display() {
        let result = ClassificationResult::layer1(
            ToolCategory::FileOperations,
            Some("agent_read_file".to_string()),
            "slash_command",
        );

        let display = result.display_info();
        assert!(display.contains("⚡"));
        assert!(display.contains("精确匹配"));
        assert!(display.contains("文件操作"));
    }
}
