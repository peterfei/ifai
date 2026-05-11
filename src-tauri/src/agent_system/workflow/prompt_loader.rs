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

    /// 🎯 统一加载入口：语言回退链 + 文件加载 + 内置 fallback
    ///
    /// 加载优先级（与 TUI prompt_manager 一致）：
    /// 1. `.ifai/prompts/zh-CN/agents/{file}`  （本地化文件）
    /// 2. `.ifai/prompts/agents/{file}`          （默认文件）
    /// 3. 内置 fallback 模板                       （hardcode）
    pub fn load_for(
        &self,
        agent_type: &crate::agent_system::workflow::types::AgentType,
        context: &PromptContext,
    ) -> String {
        let config = self.get_config_for_agent(agent_type);
        let agent_label = format!("{:?}", agent_type).to_lowercase();

        // 检测项目语言设置（与 TUI prompt_manager 一致）
        let lang = crate::project_config::load_project_config_sync(&context.project_root)
            .and_then(|c| c.default_language)
            .unwrap_or_else(|| "en".to_string());
        let is_zh = lang.to_lowercase().starts_with("zh");

        // 构建回退路径链
        let prompts_base = self.prompts_dir.parent().unwrap(); // .ifai/prompts/
        let candidates: Vec<PathBuf> = if is_zh {
            vec![
                prompts_base.join("zh-CN/agents").join(config.prompt_file),
                self.prompts_dir.join(config.prompt_file),
            ]
        } else {
            vec![
                self.prompts_dir.join(config.prompt_file),
            ]
        };

        // 按优先级尝试加载
        for prompt_path in &candidates {
            wf_log!(
                "[AgentPromptLoader] 🔍 Trying {} prompt: {:?}",
                agent_label,
                prompt_path
            );

            if let Ok(content) = std::fs::read_to_string(prompt_path) {
                let prompt_body = self.extract_markdown_body(&content);
                let replaced = self.replace_variables(&prompt_body, config.variable_names, context);

                wf_log!(
                    "[AgentPromptLoader] ✅ Loaded {} from file {:?} ({} bytes)",
                    agent_label,
                    prompt_path,
                    replaced.len()
                );

                return replaced;
            }
        }

        // 全部失败，fallback 到内置模板
        wf_log!(
            "[AgentPromptLoader] 🔄 No file found for {}, using fallback built-in prompt",
            agent_label
        );

        let agent_ctx = AgentContext {
            project_root: context.project_root.clone(),
            task_description: context.task_description.clone(),
            initial_prompt: String::new(),
            variables: context.variables.clone(),
            provider_config: self.default_provider_config(),
            current_model: None,
            cancellation_token: None, // 🔥 fallback 场景无需取消令牌
        };

        (config.fallback_template)(&agent_ctx)
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
        r#"你是一个高效的代码探索智能体。

**项目根目录**：{}

**探索策略（多轮迭代）**：

⚠️ **关键**：第 1 轮后不要输出最终分析！继续第 2、3 轮！

第 1 轮（快速概览 - 3-5 个文件）：
- 读取关键文件：Cargo.toml, src/main.rs, src/lib.rs, README.md
- 在同一次响应中发起所有 `agent_read_file` 调用，并行执行
- 收到结果后，**仍不要输出最终分析**！

第 2 轮（深入探索 - 5-10 个文件）：
- 根据第 1 轮结果，识别需要探索的核心模块
- 读取数据模型、业务逻辑、API 定义
- 再次并行发起多个 `agent_read_file` 调用
- 如果还有关键文件，**仍不要输出最终分析**！

第 3 轮（补充细节 - 按需）：
- 使用 `agent_search` 查找函数/类的定义和使用
- 按需读取特定实现文件
- **只有收集了足够信息后**，才输出最终分析

**停止条件**：当你已经：
- 理解了核心架构（3-5 个关键模块）
- 识别了主要技术栈和依赖
- 发现了值得注意的设计模式或问题

**探索原则**：
1. **迭代式**：使用 2-3 轮工具调用，不要只有 1 轮
2. **并行**：每次响应发起 3-10 个工具调用
3. **分层**：配置 → 核心 → 细节
4. **全面**：目标读取 15-20 个文件，全面理解项目

**可用工具**：
- `agent_read_file(rel_path)` — 读取文件（可并行，一次发起多个）
- `agent_search(pattern, path)` — 搜索代码（查找定义和使用）
- `agent_list_dir(rel_path)` — 列出单层目录

**输出格式**：
- 项目概述（1-2 句）
- 技术栈（语言、框架、关键依赖）
- 目录结构（核心模块说明）
- 架构特点（设计模式、分层结构）
- 关键发现（值得注意的设计或问题）

保持全面。这是探索，不是摘要。
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

**项目根目录**：{}
**审查目标**：{}

**严格限制：最多 2 次工具调用**
目录结构已在上下文中提供，无需调用 agent_scan_project。

**工具使用策略**：

第 1 次调用：同时发起多个 `agent_read_file` — 并行读取需要审查的所有关键文件。
⚠️ 在同一次响应中发起多个 tool_call，它们会并行执行！
```json
{{"rel_path": "src/main.rs"}}
{{"rel_path": "src/lib.rs"}}
{{"rel_path": "src/config.rs"}}
```
❌ 禁止调用 agent_scan_project！

第 2 次调用：不调用工具，直接输出审查结果。

**可用工具**：
- `agent_read_file(rel_path)` — 读取单个文件，可同时发起多个实现并行

**审查输出**（基于实际代码内容）：
- 代码质量评估（按文件）
- 发现的问题（附文件名和行号）
- 改进建议（具体可操作）
- 安全注意事项
"#,
        ctx.project_root, ctx.task_description
    )
}

fn fallback_refactor_prompt(ctx: &AgentContext) -> String {
    format!(
        r#"你是一个专业的代码重构顾问。

**项目根目录**：{}
**重构目标**：{}

目录结构已在上下文中提供，无需调用 agent_scan_project。

**严格限制：最多 2 次工具调用**

**工具使用策略**：

第 1 次调用：同时发起多个 `agent_read_file` — 并行读取需要重构的关键文件。
⚠️ 在同一次响应中发起多个 tool_call，它们会并行执行！
```json
{{"rel_path": "src/main.rs"}}
{{"rel_path": "src/lib.rs"}}
```

第 2 次调用：不调用工具，直接输出重构建议。

**可用工具**：
- `agent_read_file(rel_path)` — 读取单个文件，可同时发起多个实现并行
- `agent_list_dir(rel_path)` — 列出单层目录

**输出格式**（基于实际代码内容）：
- 架构优化建议（附文件名和行号）
- 模块化改进方案
- 性能优化机会
- 代码清理建议
- 重构优先级清单
"#,
        ctx.project_root, ctx.task_description
    )
}

fn fallback_doc_prompt(ctx: &AgentContext) -> String {
    format!(
        r#"你是一个专业的文档生成智能体。

**项目根目录**：{}
**目标文件**：{}

目录结构已在上下文中提供，无需调用 agent_scan_project。

**严格限制：最多 2 次工具调用**

**工具使用策略**：

第 1 次调用：同时发起多个 `agent_read_file` — 并行读取需要生成文档的文件。
⚠️ 在同一次响应中发起多个 tool_call，它们会并行执行！

第 2 次调用：不调用工具，直接输出文档。

**可用工具**：
- `agent_read_file(rel_path)` — 读取单个文件，可同时发起多个实现并行
- `agent_list_dir(rel_path)` — 列出单层目录

**输出格式**（结构化文档）：
- 模块/函数概述
- API 文档（参数、返回值、示例）
- 使用说明
"#,
        ctx.project_root,
        ctx.variables.get("target_files").cloned().unwrap_or_default()
    )
}

fn fallback_test_prompt(ctx: &AgentContext) -> String {
    format!(
        r#"你是一个专业的测试智能体。

**项目根目录**：{}
**测试目标**：{}

目录结构已在上下文中提供，无需调用 agent_scan_project。

**严格限制：最多 2 次工具调用**

**工具使用策略**：

第 1 次调用：同时发起多个 `agent_read_file` — 并行读取源码和现有测试文件。
⚠️ 在同一次响应中发起多个 tool_call，它们会并行执行！

第 2 次调用：不调用工具，直接输出测试建议。

**可用工具**：
- `agent_read_file(rel_path)` — 读取单个文件，可同时发起多个实现并行
- `agent_list_dir(rel_path)` — 列出单层目录

**输出格式**：
- 测试覆盖率分析
- 未测试的关键功能
- 测试用例建议（含代码示例）
- 边界条件和错误处理测试
"#,
        ctx.project_root,
        ctx.variables.get("test_target").cloned().unwrap_or_default()
    )
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
