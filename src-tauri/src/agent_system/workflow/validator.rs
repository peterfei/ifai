//! 工作流验证器
//!
//! 提供工作流的结构验证功能，包括循环依赖检测

use super::types::{Workflow, WorkflowValidationError};
use std::collections::{HashMap, HashSet};

/// 工作流验证器
pub struct WorkflowValidator;

impl WorkflowValidator {
    /// 验证工作流的完整性
    ///
    /// 检查：
    /// 1. 节点 ID 唯一性
    /// 2. 边引用的节点存在性
    /// 3. 循环依赖
    pub fn validate(workflow: &Workflow) -> Result<(), WorkflowValidationError> {
        // 1. 检查节点 ID 唯一性
        Self::validate_unique_nodes(workflow)?;

        // 2. 检查边引用的节点存在性
        Self::validate_edge_references(workflow)?;

        // 3. 检查循环依赖
        Self::validate_no_cycles(workflow)?;

        Ok(())
    }

    /// 验证节点 ID 唯一性
    fn validate_unique_nodes(workflow: &Workflow) -> Result<(), WorkflowValidationError> {
        let mut node_ids = HashSet::new();

        for node in &workflow.nodes {
            if !node_ids.insert(&node.id) {
                return Err(WorkflowValidationError::DuplicateNode(node.id.clone()));
            }
        }

        Ok(())
    }

    /// 验证边引用的节点存在性
    fn validate_edge_references(workflow: &Workflow) -> Result<(), WorkflowValidationError> {
        let node_ids: HashSet<&str> = workflow.nodes.iter().map(|n| n.id.as_str()).collect();

        for edge in &workflow.edges {
            if !node_ids.contains(edge.from.as_str()) {
                return Err(WorkflowValidationError::NodeNotFound(edge.from.clone()));
            }
            if !node_ids.contains(edge.to.as_str()) {
                return Err(WorkflowValidationError::NodeNotFound(edge.to.clone()));
            }
        }

        Ok(())
    }

    /// 验证没有循环依赖
    ///
    /// 使用深度优先搜索（DFS）检测有向图中的环
    fn validate_no_cycles(workflow: &Workflow) -> Result<(), WorkflowValidationError> {
        // 构建邻接表
        let graph = Self::build_graph(workflow);

        // 使用 DFS 检测环
        let mut visited = HashSet::new();
        let mut recursion_stack = HashSet::new();

        for node_id in workflow.nodes.iter().map(|n| n.id.as_str()) {
            if !visited.contains(node_id) {
                if Self::dfs_detect_cycle(node_id, &graph, &mut visited, &mut recursion_stack) {
                    return Err(WorkflowValidationError::CyclicDependency);
                }
            }
        }

        Ok(())
    }

    /// 构建图的邻接表表示
    fn build_graph(workflow: &Workflow) -> HashMap<String, Vec<String>> {
        let mut graph: HashMap<String, Vec<String>> = HashMap::new();

        // 初始化所有节点
        for node in &workflow.nodes {
            graph.entry(node.id.clone()).or_default();
        }

        // 添加边
        for edge in &workflow.edges {
            graph
                .entry(edge.from.clone())
                .or_default()
                .push(edge.to.clone());
        }

        graph
    }

    /// 使用 DFS 检测从给定节点开始的环
    ///
    /// 返回 true 如果检测到环，否则返回 false
    fn dfs_detect_cycle(
        node_id: &str,
        graph: &HashMap<String, Vec<String>>,
        visited: &mut HashSet<String>,
        recursion_stack: &mut HashSet<String>,
    ) -> bool {
        // 标记当前节点为已访问
        visited.insert(node_id.to_string());
        // 将当前节点加入递归栈
        recursion_stack.insert(node_id.to_string());

        // 访问所有邻居
        if let Some(neighbors) = graph.get(node_id) {
            for neighbor in neighbors {
                // 如果邻居在递归栈中，说明找到了环
                if recursion_stack.contains(neighbor.as_str()) {
                    return true;
                }

                // 如果邻居未被访问，递归访问
                if !visited.contains(neighbor) {
                    if Self::dfs_detect_cycle(neighbor, graph, visited, recursion_stack) {
                        return true;
                    }
                }
            }
        }

        // 从递归栈中移除当前节点
        recursion_stack.remove(node_id);

        false
    }

    /// 获取循环路径（用于调试）
    ///
    /// 如果存在环，返回形成环的节点序列
    #[cfg(test)]
    pub fn find_cycle_path(workflow: &Workflow) -> Option<Vec<String>> {
        let graph = Self::build_graph(workflow);
        let mut visited = HashSet::new();
        let mut path = Vec::new();
        let mut in_path = HashSet::new();

        for node_id in workflow.nodes.iter().map(|n| n.id.as_str()) {
            if !visited.contains(node_id) {
                if Self::dfs_find_path(node_id, &graph, &mut visited, &mut path, &mut in_path) {
                    return Some(path);
                }
            }
        }

        None
    }

    /// DFS 查找循环路径
    #[cfg(test)]
    fn dfs_find_path(
        node_id: &str,
        graph: &HashMap<String, Vec<String>>,
        visited: &mut HashSet<String>,
        path: &mut Vec<String>,
        in_path: &mut HashSet<String>,
    ) -> bool {
        visited.insert(node_id.to_string());
        path.push(node_id.to_string());
        in_path.insert(node_id.to_string());

        if let Some(neighbors) = graph.get(node_id) {
            for neighbor in neighbors {
                if in_path.contains(neighbor) {
                    // 找到环，包含这个邻居作为环的终点
                    path.push(neighbor.clone());
                    return true;
                }

                if !visited.contains(neighbor) {
                    if Self::dfs_find_path(neighbor, graph, visited, path, in_path) {
                        return true;
                    }
                }
            }
        }

        // 回溯
        path.pop();
        in_path.remove(node_id);

        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_system::workflow::{AgentType, Workflow, WorkflowEdge, WorkflowNode};

    fn create_simple_workflow() -> Workflow {
        let mut workflow = Workflow::new("test", "Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("b", "c"));
        workflow
    }

    #[test]
    fn test_validate_valid_workflow() {
        let workflow = create_simple_workflow();

        let result = WorkflowValidator::validate(&workflow);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_duplicate_nodes() {
        let mut workflow = Workflow::new("test", "Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("a", AgentType::Review)); // 重复 ID

        let result = WorkflowValidator::validate(&workflow);
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            WorkflowValidationError::DuplicateNode(_)
        ));
    }

    #[test]
    fn test_validate_missing_node_reference() {
        let mut workflow = Workflow::new("test", "Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_edge(WorkflowEdge::new("a", "b")); // b 不存在

        let result = WorkflowValidator::validate(&workflow);
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            WorkflowValidationError::NodeNotFound(_)
        ));
    }

    #[test]
    fn test_detect_self_cycle() {
        // a -> a (自环)
        let mut workflow = Workflow::new("test", "Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_edge(WorkflowEdge::new("a", "a"));

        let result = WorkflowValidator::validate(&workflow);
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            WorkflowValidationError::CyclicDependency
        ));
    }

    #[test]
    fn test_detect_simple_cycle() {
        // a -> b -> c -> a (简单环)
        let mut workflow = Workflow::new("test", "Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("b", "c"))
            .add_edge(WorkflowEdge::new("c", "a"));

        let result = WorkflowValidator::validate(&workflow);
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            WorkflowValidationError::CyclicDependency
        ));
    }

    #[test]
    fn test_detect_complex_cycle() {
        // a -> b -> c
        //      ^     |
        //      |     v
        //      +-----+
        let mut workflow = Workflow::new("test", "Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("b", "c"))
            .add_edge(WorkflowEdge::new("c", "b"));

        let result = WorkflowValidator::validate(&workflow);
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            WorkflowValidationError::CyclicDependency
        ));
    }

    #[test]
    fn test_validate_disconnected_graph() {
        // a -> b
        // c -> d (两个不连通的组件)
        let mut workflow = Workflow::new("test", "Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_node(WorkflowNode::new("d", AgentType::Test))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("c", "d"));

        let result = WorkflowValidator::validate(&workflow);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_diamond_shape() {
        //     a
        //    / \
        //   b   c
        //    \ /
        //     d
        let mut workflow = Workflow::new("test", "Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_node(WorkflowNode::new("d", AgentType::Test))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("a", "c"))
            .add_edge(WorkflowEdge::new("b", "d"))
            .add_edge(WorkflowEdge::new("c", "d"));

        let result = WorkflowValidator::validate(&workflow);
        assert!(result.is_ok());
    }

    #[test]
    fn test_find_cycle_path() {
        // a -> b -> c -> a
        let mut workflow = Workflow::new("test", "Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("b", "c"))
            .add_edge(WorkflowEdge::new("c", "a"));

        let cycle = WorkflowValidator::find_cycle_path(&workflow);
        assert!(cycle.is_some());

        let path = cycle.unwrap();
        // 路径应该包含环的节点
        assert!(path.len() >= 4); // a -> b -> c -> a
    }
}
