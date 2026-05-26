//! Agent 工作流声明式 DSL
//!
//! 定义 AgentWorkflowSpec — Agent 工作流的声明式数据规约。
//! 通过文件约定加载: `from_type("explore")` → `workflows/explore.yml`
//!
//! 与 `WorkflowRunner` 的关系:
//! - AgentWorkflowSpec 是 DSL 层（声明什么）
//! - WorkflowRunner 是执行层（如何执行）

use serde::{Deserialize, Serialize};
use thiserror::Error;

use super::parser::WorkflowParser;
use super::types::{AgentConfig, AgentType, Workflow, WorkflowEdge, WorkflowNode};

/// Agent 工作流规约 — 声明式 DSL
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentWorkflowSpec {
    /// Agent 类型标识
    pub r#type: String,
    /// 显示名称
    pub label: String,
    /// 工作流阶段序列
    pub phases: Vec<PhaseSpec>,
}

/// 单个 phase 规约
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhaseSpec {
    /// 执行模式: sequential | parallel
    pub mode: PhaseMode,
    /// 允许的工具列表
    pub tools: Vec<String>,
    /// 并行最大并发数
    #[serde(default)]
    pub max_concurrent: Option<usize>,
    /// 最大步数
    #[serde(default)]
    pub max_steps: Option<usize>,
    /// 是否需要审批
    #[serde(default)]
    pub require_approval: Option<bool>,
    /// 阶段意图描述
    #[serde(default)]
    pub intent: Option<String>,
}

/// Phase 执行模式
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PhaseMode {
    #[serde(rename = "sequential")]
    Sequential,
    #[serde(rename = "parallel")]
    Parallel,
}

/// DSL 规约错误
#[derive(Debug, Error)]
pub enum SpecError {
    #[error("工作流文件未找到: {0}")]
    FileNotFound(String),
    #[error("解析错误: {0}")]
    ParseError(String),
    #[error("转换错误: {0}")]
    ConversionError(String),
}

impl std::fmt::Display for PhaseMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PhaseMode::Sequential => write!(f, "sequential"),
            PhaseMode::Parallel => write!(f, "parallel"),
        }
    }
}

impl AgentWorkflowSpec {
    /// 从 agent type 加载规约 — 文件约定加载，零 match
    ///
    /// 约定: agent_type "explore" → workflows/explore.yml
    /// 新增 agent 类型 = 新增 YAML 文件，引擎代码零修改。
    pub fn from_type(agent_type: &str, task: &str) -> Result<Self, SpecError> {
        let path = format!("workflows/{}.yml", agent_type);
        // 先尝试从项目根目录加载
        let workflow = WorkflowParser::from_file(&path)
            .map_err(|e| SpecError::FileNotFound(format!("{}: {}", path, e)))?;
        Ok(workflow.to_spec(task))
    }

    /// 将 DSL 编译为 WorkflowRunner 可执行的 Workflow
    pub fn to_workflow(&self) -> Result<Workflow, SpecError> {
        let mut workflow = Workflow::new(&self.r#type, &self.label)
            .with_description(format!("Agent workflow for {}", self.r#type));

        for (i, phase) in self.phases.iter().enumerate() {
            let phase_id = match phase.mode {
                PhaseMode::Sequential => format!("phase{}", i),
                PhaseMode::Parallel => format!("parallel_group{}", i),
            };

            let mut config = AgentConfig::default();
            config.task_description = phase.intent.clone();

            let node = WorkflowNode::new(&phase_id, AgentType::Explore)
                .with_label(phase.intent.clone().unwrap_or_else(|| format!("Phase {}", i + 1)))
                .with_config(config);
            workflow.add_node(node);
        }

        // 添加串行边
        for i in 1..self.phases.len() {
            let prev_id = match self.phases[i - 1].mode {
                PhaseMode::Sequential => format!("phase{}", i - 1),
                PhaseMode::Parallel => format!("parallel_group{}", i - 1),
            };
            let curr_id = match self.phases[i].mode {
                PhaseMode::Sequential => format!("phase{}", i),
                PhaseMode::Parallel => format!("parallel_group{}", i),
            };
            workflow.add_edge(WorkflowEdge::new(&prev_id, &curr_id));
        }

        Ok(workflow)
    }
}

// ============================================================
// Workflow 扩展 — 添加 to_spec 方法
// ============================================================

/// 从 Workflow 提取 task_description 作为 intent
trait WorkflowToSpec {
    fn to_spec(&self, task: &str) -> AgentWorkflowSpec;
}

impl WorkflowToSpec for Workflow {
    fn to_spec(&self, task: &str) -> AgentWorkflowSpec {
        let phases = self.nodes.iter().map(|node| {
            PhaseSpec {
                mode: PhaseMode::Sequential, // from Workflow → default sequential
                tools: vec![],
                max_concurrent: None,
                max_steps: None,
                require_approval: None,
                intent: Some(node.label.clone().unwrap_or_else(|| task.to_string())),
            }
        }).collect();

        AgentWorkflowSpec {
            r#type: self.id.clone(),
            label: self.name.clone(),
            phases,
        }
    }
}

// ============================================================
// 单元测试 (TDD)
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    // --- UT-Y.1.1: from_type 加载 ---
    #[test]
    fn test_from_type_file_not_found() {
        let result = AgentWorkflowSpec::from_type("nonexistent", "test task");
        assert!(result.is_err(), "不存在的 agent type 应返回错误");
        match result {
            Err(SpecError::FileNotFound(_)) => {} // 预期
            _ => panic!("应返回 FileNotFound 错误"),
        }
    }

    // --- UT-Y.1.2: to_workflow 输出结构 ---
    #[test]
    fn test_to_workflow_sequential_phases() {
        let spec = AgentWorkflowSpec {
            r#type: "test".into(),
            label: "测试".into(),
            phases: vec![
                PhaseSpec {
                    mode: PhaseMode::Sequential,
                    tools: vec!["scan_directory".into()],
                    max_concurrent: None,
                    max_steps: Some(3),
                    require_approval: None,
                    intent: Some("采集项目结构".into()),
                },
                PhaseSpec {
                    mode: PhaseMode::Sequential,
                    tools: vec!["batch_read".into()],
                    max_concurrent: None,
                    max_steps: Some(5),
                    require_approval: None,
                    intent: Some("读取目标文件".into()),
                },
            ],
        };

        let workflow = spec.to_workflow().expect("to_workflow 应成功");
        assert_eq!(workflow.nodes.len(), 2, "2 个 phase → 2 个节点");
        assert_eq!(workflow.edges.len(), 1, "2 个 phase → 1 条边");
        assert_eq!(
            workflow.edges[0].from, "phase0",
            "边 from 应为 phase0"
        );
        assert_eq!(
            workflow.edges[0].to, "phase1",
            "边 to 应为 phase1"
        );
    }

    // --- UT-Y.1.3: to_workflow 中 parallel phases 映射 ---
    #[test]
    fn test_to_workflow_parallel_phase_naming() {
        let spec = AgentWorkflowSpec {
            r#type: "test".into(),
            label: "测试".into(),
            phases: vec![
                PhaseSpec {
                    mode: PhaseMode::Parallel,
                    tools: vec!["read".into()],
                    max_concurrent: None,
                    max_steps: None,
                    require_approval: None,
                    intent: Some("并行读取".into()),
                },
            ],
        };

        let workflow = spec.to_workflow().expect("to_workflow 应成功");
        assert_eq!(workflow.nodes.len(), 1);
        assert!(
            workflow.nodes[0].id.starts_with("parallel_group"),
            "并行 phase 节点 id 应以 parallel_group 开头, got: {}",
            workflow.nodes[0].id
        );
    }

    // --- 验证 PhaseSpec 序列化/反序列化 ---
    #[test]
    fn test_phase_spec_serde() {
        let spec = PhaseSpec {
            mode: PhaseMode::Sequential,
            tools: vec!["bash".into(), "read".into()],
            max_concurrent: None,
            max_steps: Some(3),
            require_approval: Some(true),
            intent: Some("测试阶段".into()),
        };

        let json = serde_json::to_string(&spec).expect("序列化应成功");
        assert!(json.contains("\"sequential\""));
        assert!(json.contains("bash"));
        assert!(json.contains("true"));

        let deserialized: PhaseSpec = serde_json::from_str(&json).expect("反序列化应成功");
        assert_eq!(deserialized.mode, PhaseMode::Sequential);
        assert_eq!(deserialized.tools.len(), 2);
        assert_eq!(deserialized.require_approval, Some(true));
    }

    // --- UT-Y.1.4: 并行 mode 序列化 ---
    #[test]
    fn test_parallel_mode_serde() {
        let json = r#"{"mode":"parallel","tools":[]}"#;
        let spec: PhaseSpec = serde_json::from_str(json).expect("反序列化并行模式应成功");
        assert_eq!(spec.mode, PhaseMode::Parallel);
    }

    // --- from_type: 空字符串处理 ---
    #[test]
    fn test_from_type_empty_type() {
        let result = AgentWorkflowSpec::from_type("", "task");
        assert!(result.is_err(), "空 type 应返回错误");
    }
}
