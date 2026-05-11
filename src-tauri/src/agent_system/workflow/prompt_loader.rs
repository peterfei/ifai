//! Agent Prompt 统一加载器（元编程化）
//!
//! 使用声明式配置替代重复的加载函数

use crate::agent_system::base::AgentContext;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// 🔥 Agent Prompt 配置（声明式）
#[derive(Debug, Clone)]
pub struct AgentPromptConfig {
    /// 提示词文件名（相对于 .ifai/prompts/agents/）
    pub prompt_file: &'static str,
    /// 需要替换的变量名列表
    pub variable_names: &'static [&'static str],
    /// Fallback 模板函数
    pub fallback_template: fn(&AgentContext) -> String,
}

/// 🔥 Prompt 加载上下文
#[derive(Debug, Clone)]
pub struct PromptContext {
    pub project_root: String,
    pub task_description: String,
    pub variables: HashMap<String, String>,
}

impl PromptContext {
    /// 获取变量值
    pub fn get_variable(&self, name: &str) -> String {
        match name {
            "PROJECT_ROOT" => self.project_root.clone(),
            "TASK_DESCRIPTION" => self.task_description.clone(),
            "TARGET_PATH" => self
                .variables
                .get("target_path")
                .cloned()
                .unwrap_or_default(),
            "PROPOSAL_ID" => self
                .variables
                .get("proposal_id")
                .cloned()
                .unwrap_or_default(),
            "PROPOSAL_CONTEXT" => self.task_description.clone(),
            _ => self.variables.get(name).cloned().unwrap_or_default(),
        }
    }
}

/// 🔥 统一 Prompt 加载器
pub struct AgentPromptLoader {
    prompts_dir: PathBuf,
}

impl AgentPromptLoader {
    /// 创建新的加载器
    pub fn new(project_root: &str) -> Self {
        let prompts_dir = PathBuf::from(project_root).join(".ifai/prompts/agents");
        Self { prompts_dir }
    }

    /// 🎯 统一加载入口：50 行替代 500 行重复代码
    pub fn load_for(
        &self,
        agent_type: &crate::agent_system::workflow::types::AgentType,
        context: &PromptContext,
    ) -> String {
        let config = self.get_config_for_agent(agent_type);
        let prompt_path = self.prompts_dir.join(config.prompt_file);

        wf_log!(
            "[AgentPromptLoader] 🔍 Loading {} prompt from: {:?}",
            format!("{:?}", agent_type).to_lowercase(),
            prompt_path
        );

        // 1. 尝试从文件加载
        match std::fs::read_to_string(&prompt_path) {
            Ok(content) => {
                let prompt_body = self.extract_markdown_body(&content);
                let replaced = self.replace_variables(&prompt_body, config.variable_names, context);

                wf_log!(
                    "[AgentPromptLoader] ✅ Loaded {} from file ({} bytes)",
                    format!("{:?}", agent_type).to_lowercase(),
                    replaced.len()
                );

                replaced
            }
            Err(e) => {
                wf_log!(
                    "[AgentPromptLoader] ⚠️ Failed to load {} from {:?}: {}",
                    format!("{:?}", agent_type).to_lowercase(),
                    prompt_path,
                    e
                );
                wf_log!(
                    "[AgentPromptLoader] 🔄 Using fallback built-in {} prompt",
                    format!("{:?}", agent_type).to_lowercase()
                );

                // 2. Fallback 到内置模板
                let agent_ctx = AgentContext {
                    project_root: context.project_root.clone(),
                    task_description: context.task_description.clone(),
                    initial_prompt: String::new(),
                    variables: context.variables.clone(),
                    provider_config: self.default_provider_config(),
                    current_model: None,
                };

                (config.fallback_template)(&agent_ctx)
            }
        }
    }

    /// 提取 Markdown 正文（跳过 YAML front matter）
    fn extract_markdown_body(&self, content: &str) -> String {
        if let Some(start) = content.find("---") {
            if let Some(second_marker) = content[start + 3..].find("---") {
                return content[start + 3 + second_marker + 3..]
                    .trim_start()
                    .to_string();
            }
        }
        content.to_string()
    }

    /// 替换变量占位符
    fn replace_variables(
        &self,
        content: &str,
        variable_names: &[&str],
        context: &PromptContext,
    ) -> String {
        let mut result = content.to_string();

        for var_name in variable_names {
            let placeholder = format!("{{{}}}", var_name);
            let value = context.get_variable(var_name);
            result = result.replace(&placeholder, &value);
        }

        result
    }

    /// 获取 AgentType 的配置
    fn get_config_for_agent(
        &self,
        agent_type: &crate::agent_system::workflow::types::AgentType,
    ) -> AgentPromptConfig {
        use crate::agent_system::workflow::types::AgentType;

        match agent_type {
            AgentType::Explore => AgentPromptConfig {
                prompt_file: "explore.md",
                variable_names: &["PROJECT_ROOT", "TARGET_PATH"],
                fallback_template: fallback_explore_prompt,
            },
            AgentType::TaskBreakdown => AgentPromptConfig {
                prompt_file: "task-breakdown-enhanced.md",
                variable_names: &["PROPOSAL_ID", "PROPOSAL_CONTEXT"],
                fallback_template: fallback_task_breakdown_prompt,
            },
            AgentType::Review => AgentPromptConfig {
                prompt_file: "review.md",
                variable_names: &["PROJECT_ROOT", "TASK_DESCRIPTION"],
                fallback_template: fallback_review_prompt,
            },
            AgentType::Refactor => AgentPromptConfig {
                prompt_file: "refactor-agent.md",
                variable_names: &["PROJECT_ROOT", "TASK_DESCRIPTION"],
                fallback_template: fallback_refactor_prompt,
            },
            AgentType::Doc => AgentPromptConfig {
                prompt_file: "doc.md",
                variable_names: &["PROJECT_ROOT", "TARGET_FILES"],
                fallback_template: fallback_doc_prompt,
            },
            AgentType::Test => AgentPromptConfig {
                prompt_file: "test.md",
                variable_names: &["PROJECT_ROOT", "TEST_TARGET"],
                fallback_template: fallback_test_prompt,
            },
            AgentType::ProposalGenerator => AgentPromptConfig {
                prompt_file: "proposal-generator.md",
                variable_names: &["PROJECT_ROOT", "REQUIREMENTS"],
                fallback_template: fallback_proposal_generator_prompt,
            },
            AgentType::GeneralPurpose => AgentPromptConfig {
                prompt_file: "general-purpose.md",
                variable_names: &["PROJECT_ROOT"],
                fallback_template: fallback_general_purpose_prompt,
            },
            // TODO: 添加 Bash Agent
        }
    }

    fn default_provider_config(&self) -> crate::core_traits::ai::AIProviderConfig {
        crate::core_traits::ai::AIProviderConfig {
            id: String::new(),
            name: String::new(),
            api_key: String::new(),
            base_url: String::new(),
            models: Vec::new(),
            protocol: crate::core_traits::ai::AIProtocol::OpenAI,
            enabled: false,
        }
    }
}

// ============================================================================
// Fallback 提示词模板（内置版本，确保系统始终可用）
// ============================================================================

fn fallback_explore_prompt(ctx: &AgentContext) -> String {
    format!(
        r#"你是一个高效的代码探索智能体。你可以访问实际文件系统。

**项目根目录**：{}

**严格限制：最多 3 次工具调用**
你必须在 3 次工具调用内完成任务。每次工具调用都需要等待网络往返，调用越少越快。

**工具使用策略（严格遵守）**：

第 1 次调用：`agent_scan_project(".", 2)` — 获取项目结构

第 2 次调用（也是最后一次文件读取）：`agent_batch_read` — 一次性读取所有需要的文件。
⚠️ 关键：必须把所有文件路径放入同一个 paths 数组！
```json
{{"paths": ["Cargo.toml", "src/main.rs", "README.md"]}}
```
❌ 禁止分多次调用 batch_read！禁止调用 read_file！所有文件必须在一次调用中完成。

第 3 次调用：不调用工具，直接输出分析结果。

**可用工具**：
- `agent_scan_project(rel_path, max_depth)` — 扫描目录（默认深度 2）
- `agent_batch_read(paths)` — 批量读取文件，paths 是字符串数组，最多 10 个
- `agent_read_file(rel_path)` — 仅当只需读 1 个文件时使用

**输出格式**（简洁）：
- 项目概述（1-2句）
- 技术栈
- 关键目录（3-5个）
- 架构特点（3-5点）
"#,
        ctx.project_root
    )
}

fn fallback_task_breakdown_prompt(ctx: &AgentContext) -> String {
    format!(
        r#"你是一个专业的任务分解智能体，基于 OpenSpec 提案将复杂任务分解为可执行的子任务树。

=== 你的角色 ===

你接收 OpenSpec 提案（包含 proposal.md、tasks.md、spec deltas），并基于这些信息生成详细的任务拆解结果。

=== 输出格式（严格 JSON） ===

你必须**仅**输出以下格式的有效 JSON（在 ```json 代码块中）：

```json
{{
  "todos": [{{
    "id": "root-1",
    "content": "[主任务标题]",
    "activeForm": "[进度描述]",
    "status": "pending",
    "dependencies": [],
    "meta": {{
      "priority": "high",
      "category": "development",
      "hours": 0,
      "acceptance": ["验收条件1", "验收条件2"]
    }},
    "children": []
  }}],
  "proposalReference": {{
    "proposalId": "[提案ID]",
    "proposalTitle": "[提案标题]"
  }}
}}
```

=== 拆解指南 ===

1. **从提案标题开始**作为根节点
2. **分解提案中的高层任务**：将每个高层任务分解为 2-5 个可执行子任务
3. **添加任务间的依赖关系**：使用 `id` 字段引用依赖
4. **合理估算时间**：考虑编码 + 测试 + 审查
5. **定义验收标准**：每个任务 2-5 个具体标准
6. **最多嵌套 3 层**：主任务 → 主要子任务 → 详细子任务

=== 当前任务 ===
{}

=== 重要 ===
- 任务必须具体可执行
- 优先级：urgent/high/medium/low
- 类别：development/testing/documentation/design/research/deployment
- 输出必须是有效 JSON 格式
"#,
        ctx.task_description
    )
}

fn fallback_review_prompt(ctx: &AgentContext) -> String {
    format!(
        r#"你是一个专业的代码审查智能体。

**项目信息**：
- 项目根目录：{}
- 审查目标：{}

你的任务是：
1. **提供审查建议**：基于项目类型，提供针对性的代码审查清单和建议
2. **常见问题检查**：列出该类型项目常见的代码问题和注意事项
3. **最佳实践**：建议适用的编码标准和最佳实践
4. **安全性检查**：提醒应该注意的安全问题
5. **性能优化**：建议性能优化的方向

输出格式：
- ✅ **应该优先检查的文件/模块**
- ⚠️ **需要特别注意的问题**
- 💡 **改进建议**
- 🔒 **安全注意事项**

注意：提供针对该项目的实用审查指南，而不是"模拟"审查过程。
"#,
        ctx.project_root, ctx.task_description
    )
}

fn fallback_refactor_prompt(ctx: &AgentContext) -> String {
    format!(
        r#"你是一个专业的代码重构顾问。

**项目信息**：
- 项目根目录：{}
- 重构目标：{}

你的任务是：
1. **重构建议**：基于项目类型，提供针对性的重构建议和方向
2. **架构优化**：建议如何改进代码组织和模块化
3. **代码质量提升**：提供提高代码可读性和可维护性的具体建议
4. **性能优化**：建议性能优化的机会和方法
5. **技术债务**：提醒可能存在的技术债务及解决方案

输出格式：
- 🏗️ **架构优化建议**
- 📦 **模块化改进方案**
- ⚡ **性能优化机会**
- 🧹 **代码清理建议**
- 📋 **重构优先级清单**

注意：提供实用的重构指南和最佳实践，而不是"模拟"重构过程。
"#,
        ctx.project_root, ctx.task_description
    )
}

fn fallback_doc_prompt(_ctx: &AgentContext) -> String {
    r#"你是一个专业的文档生成智能体。你的任务是：

1. 分析代码并生成清晰的文档
2. 编写 API 文档和使用说明
3. 创建代码示例和教程
4. 改善现有文档的质量

请确保文档：
- 准确且完整
- 易于理解
- 包含实用示例
- 遵循文档最佳实践

请输出结构化的文档内容。
"#
    .to_string()
}

fn fallback_test_prompt(_ctx: &AgentContext) -> String {
    r#"你是一个专业的测试智能体。你的任务是：

1. 分析测试覆盖率和测试策略
2. 识别未测试的关键功能
3. 提供测试用例建议
4. 改进现有测试的质量

请关注：
- 单元测试
- 集成测试
- 边界条件测试
- 错误处理测试

请输出测试建议和示例测试代码。
"#
    .to_string()
}

fn fallback_proposal_generator_prompt(_ctx: &AgentContext) -> String {
    r#"你是一个专业的提案生成智能体。你的任务是：

1. 分析需求并生成技术提案
2. 设计实施方案和架构
3. 评估风险和资源需求
4. 提供时间表和里程碑

请确保提案：
- 全面且可行
- 考虑了技术选型
- 包含风险评估
- 有清晰的交付物

请输出结构化的技术提案。
"#
    .to_string()
}

fn fallback_general_purpose_prompt(_ctx: &AgentContext) -> String {
    r#"你是一个专业的通用智能体。你的任务是：

1. 理解用户的需求
2. 提供准确、有用的信息
3. 帮助解决问题
4. 给出切实可行的建议

请使用清晰、友好的语言，提供高质量的回应。
"#
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_system::workflow::types::AgentType;

    #[test]
    fn test_prompt_loader_creation() {
        let loader = AgentPromptLoader::new("/tmp/test_project");
        assert_eq!(
            loader.prompts_dir,
            PathBuf::from("/tmp/test_project/.ifai/prompts/agents")
        );
    }

    #[test]
    fn test_extract_markdown_body_with_front_matter() {
        let content = r#"---
name: "Test"
version: "1.0"
---
Actual content here"#;
        let loader = AgentPromptLoader::new("/tmp");
        let body = loader.extract_markdown_body(content);
        assert_eq!(body, "Actual content here");
    }

    #[test]
    fn test_extract_markdown_body_without_front_matter() {
        let content = "Just content without front matter";
        let loader = AgentPromptLoader::new("/tmp");
        let body = loader.extract_markdown_body(content);
        assert_eq!(body, "Just content without front matter");
    }

    #[test]
    fn test_prompt_context_get_variable() {
        let context = PromptContext {
            project_root: "/project".to_string(),
            task_description: "Test task".to_string(),
            variables: {
                let mut vars = HashMap::new();
                vars.insert("target_path".to_string(), "/src/main.rs".to_string());
                vars
            },
        };

        assert_eq!(context.get_variable("PROJECT_ROOT"), "/project");
        assert_eq!(context.get_variable("TASK_DESCRIPTION"), "Test task");
        assert_eq!(context.get_variable("TARGET_PATH"), "/src/main.rs");
    }

    #[test]
    fn test_all_agent_types_have_config() {
        let loader = AgentPromptLoader::new("/tmp");

        // 测试所有 AgentType 都有配置
        let agents = vec![
            AgentType::Explore,
            AgentType::TaskBreakdown,
            AgentType::Review,
            AgentType::Refactor,
            AgentType::Doc,
            AgentType::Test,
            AgentType::ProposalGenerator,
            AgentType::GeneralPurpose,
        ];

        for agent in agents {
            let config = loader.get_config_for_agent(&agent);
            assert!(!config.prompt_file.is_empty());
            assert!(!config.variable_names.is_empty());
        }
    }
}
