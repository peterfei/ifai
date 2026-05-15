//! YAML 工作流解析器
//!
//! 将 YAML 格式的工作流定义解析为 Workflow 结构体

use super::types::{AgentConfig, AgentType, Workflow, WorkflowEdge, WorkflowNode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// YAML 格式的工作流定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowYaml {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub variables: HashMap<String, String>,
    pub nodes: Vec<NodeYaml>,
    #[serde(default)]
    pub edges: Vec<EdgeYaml>,
}

/// YAML 格式的节点定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeYaml {
    pub id: String,
    #[serde(rename = "agentType")]
    pub agent_type: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub config: Option<ConfigYaml>,
}

/// YAML 格式的配置定义
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConfigYaml {
    #[serde(rename = "target", default)]
    pub target: Option<String>,

    #[serde(alias = "taskDescription", default)]
    pub task_description: Option<String>,

    #[serde(alias = "severityThreshold", default)]
    pub severity_threshold: Option<u8>,

    #[serde(alias = "timeoutSecs", default)]
    pub timeout_secs: Option<u64>,

    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// YAML 格式的边定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeYaml {
    pub from: String,
    pub to: String,
    #[serde(rename = "condition", default)]
    pub condition: Option<String>,
}

/// 工作流解析器
pub struct WorkflowParser;

impl WorkflowParser {
    /// 从文件解析工作流
    pub fn from_file<P: AsRef<Path>>(path: P) -> Result<Workflow, ParseError> {
        let content = fs::read_to_string(path).map_err(|e| ParseError::IoError(e.to_string()))?;

        Self::from_str(&content)
    }

    ///从字符串解析工作流
    pub fn from_str(content: &str) -> Result<Workflow, ParseError> {
        // 解析 YAML
        let yaml: WorkflowYaml =
            serde_yaml::from_str(content).map_err(|e| ParseError::YamlError(e.to_string()))?;

        // 转换为 Workflow
        Self::yaml_to_workflow(yaml)
    }

    /// 将 YAML 格式转换为 Workflow
    fn yaml_to_workflow(yaml: WorkflowYaml) -> Result<Workflow, ParseError> {
        let mut workflow = Workflow::new(&yaml.id, &yaml.name).with_description(&yaml.description);

        // 设置变量
        workflow.variables = yaml.variables;

        // 转换节点
        for node_yaml in yaml.nodes {
            let agent_type = Self::parse_agent_type(&node_yaml.agent_type)?;

            let config = if let Some(config_yaml) = node_yaml.config {
                AgentConfig {
                    target: config_yaml.target,
                    task_description: config_yaml.task_description,
                    severity_threshold: config_yaml.severity_threshold,
                    timeout_secs: config_yaml.timeout_secs,
                    custom_params: config_yaml.extra,
                }
            } else {
                AgentConfig::default()
            };

            let mut node = WorkflowNode::new(&node_yaml.id, agent_type).with_config(config);

            if let Some(label) = node_yaml.label {
                node = node.with_label(label);
            }

            workflow.add_node(node);
        }

        // 转换边
        for edge_yaml in yaml.edges {
            let mut edge = WorkflowEdge::new(&edge_yaml.from, &edge_yaml.to);

            if let Some(condition) = edge_yaml.condition {
                edge = edge.with_condition(condition);
            }

            workflow.add_edge(edge);
        }

        // 执行变量替换
        Self::substitute_variables(&mut workflow)?;

        Ok(workflow)
    }

    /// 解析智能体类型
    fn parse_agent_type(s: &str) -> Result<AgentType, ParseError> {
        match s.to_lowercase().as_str() {
            "explore" => Ok(AgentType::Explore),
            "review" => Ok(AgentType::Review),
            "refactor" => Ok(AgentType::Refactor),
            "test" => Ok(AgentType::Test),
            "doc" => Ok(AgentType::Doc),
            "debug" => Ok(AgentType::Debug),
            "task_breakdown" => Ok(AgentType::TaskBreakdown),
            "proposal_generator" => Ok(AgentType::ProposalGenerator),
            "git_commit" => Ok(AgentType::GitCommit),
            "general_purpose" => Ok(AgentType::GeneralPurpose),
            _ => Err(ParseError::InvalidAgentType(s.to_string())),
        }
    }

    /// 替换工作流中的变量
    fn substitute_variables(workflow: &mut Workflow) -> Result<(), ParseError> {
        // 替换节点配置中的变量
        for node in &mut workflow.nodes {
            if let Some(target) = &node.config.target {
                node.config.target = Some(Self::substitute_str(target, &workflow.variables));
            }

            if let Some(task) = &node.config.task_description {
                node.config.task_description =
                    Some(Self::substitute_str(task, &workflow.variables));
            }
        }

        // 替换边条件中的变量
        for edge in &mut workflow.edges {
            if let Some(condition) = &edge.condition {
                edge.condition = Some(Self::substitute_str(condition, &workflow.variables));
            }
        }

        Ok(())
    }

    /// 替换字符串中的变量
    fn substitute_str(s: &str, variables: &HashMap<String, String>) -> String {
        let mut result = s.to_string();

        for (key, value) in variables {
            // 替换 ${key} 格式
            let pattern = format!("${{{}}}", key);
            result = result.replace(&pattern, value);
        }

        result
    }
}

/// 解析错误
#[derive(Debug, Clone, thiserror::Error)]
pub enum ParseError {
    #[error("IO error: {0}")]
    IoError(String),

    #[error("YAML parsing error: {0}")]
    YamlError(String),

    #[error("Invalid agent type: {0}")]
    InvalidAgentType(String),

    #[error("Variable substitution error: {0}")]
    VariableError(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_workflow() {
        let yaml = r#"
id: "test-workflow"
name: "Test Workflow"
description: "A simple test"
variables:
  target_dir: "src"
nodes:
  - id: "explore"
    agentType: "explore"
    config:
      target: "${target_dir}"
edges: []
"#;

        let workflow = WorkflowParser::from_str(yaml).unwrap();

        assert_eq!(workflow.id, "test-workflow");
        assert_eq!(workflow.name, "Test Workflow");
        assert_eq!(workflow.nodes.len(), 1);
        assert_eq!(workflow.nodes[0].agent_type, AgentType::Explore);
        assert_eq!(workflow.nodes[0].config.target, Some("src".to_string()));
    }

    #[test]
    fn test_parse_multiple_nodes() {
        let yaml = r#"
id: "multi-node"
name: "Multi Node Workflow"
nodes:
  - id: "explore"
    agentType: "explore"
  - id: "review"
    agentType: "review"
  - id: "refactor"
    agentType: "refactor"
edges:
  - from: "explore"
    to: "review"
  - from: "review"
    to: "refactor"
    condition: "${review.issues} > 0"
"#;

        let workflow = WorkflowParser::from_str(yaml).unwrap();

        assert_eq!(workflow.nodes.len(), 3);
        assert_eq!(workflow.edges.len(), 2);
        assert_eq!(
            workflow.edges[1].condition,
            Some("${review.issues} > 0".to_string())
        );
    }

    #[test]
    fn test_parse_invalid_agent_type() {
        let yaml = r#"
id: "test"
name: "Test"
nodes:
  - id: "node1"
    agentType: "invalid_type"
edges: []
"#;

        let result = WorkflowParser::from_str(yaml);
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            ParseError::InvalidAgentType(_)
        ));
    }

    #[test]
    fn test_variable_substitution() {
        let yaml = r#"
id: "test"
name: "Test"
variables:
  dir: "src/components"
  threshold: "7"
nodes:
  - id: "review"
    agentType: "review"
    config:
      target: "${dir}"
      severity_threshold: 7
edges:
  - from: "review"
    to: "refactor"
    condition: "${threshold} > 5"
"#;

        let workflow = WorkflowParser::from_str(yaml).unwrap();

        assert_eq!(
            workflow.nodes[0].config.target,
            Some("src/components".to_string())
        );
        assert_eq!(workflow.edges[0].condition, Some("7 > 5".to_string()));
    }

    #[test]
    fn test_parse_with_label() {
        let yaml = r#"
id: "test"
name: "Test"
nodes:
  - id: "explore"
    agentType: "explore"
    label: "探索代码"
edges: []
"#;

        let workflow = WorkflowParser::from_str(yaml).unwrap();

        assert_eq!(workflow.nodes[0].label, Some("探索代码".to_string()));
    }

    #[test]
    fn test_parse_full_config() {
        let yaml = r#"
id: "test"
name: "Test"
nodes:
  - id: "review"
    agentType: "review"
    config:
      target: "src"
      task_description: "Review the code"
      severity_threshold: 7
      timeout_secs: 300
edges: []
"#;

        let workflow = WorkflowParser::from_str(yaml).unwrap();

        let config = &workflow.nodes[0].config;
        assert_eq!(config.target, Some("src".to_string()));
        assert_eq!(config.task_description, Some("Review the code".to_string()));
        assert_eq!(config.severity_threshold, Some(7));
        assert_eq!(config.timeout_secs, Some(300));
    }
}
