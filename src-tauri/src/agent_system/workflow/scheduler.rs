//! 工作流调度器
//!
//! 负责对工作流进行拓扑排序，确定节点执行顺序

use super::types::{Workflow, AgentType};
use std::collections::{HashMap, HashSet, VecDeque};

/// 调度结果
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Schedule {
    /// 执行顺序（拓扑排序结果）
    pub execution_order: Vec<String>,

    /// 并行执行组
    ///
    /// 每个组中的节点可以并行执行，组之间必须串行执行
    pub parallel_groups: Vec<Vec<String>>,
}

impl Schedule {
    /// 创建新的调度结果
    pub fn new(execution_order: Vec<String>, parallel_groups: Vec<Vec<String>>) -> Self {
        Self {
            execution_order,
            parallel_groups,
        }
    }

    /// 获取节点的执行索引
    ///
    /// 返回节点在执行顺序中的位置（0-based）
    pub fn get_node_index(&self, node_id: &str) -> Option<usize> {
        self.execution_order
            .iter()
            .position(|id| id == node_id)
    }

    /// 获取节点所在的并行组索引
    pub fn get_node_group(&self, node_id: &str) -> Option<usize> {
        self.parallel_groups
            .iter()
            .position(|group| group.contains(&node_id.to_string()))
    }

    /// 检查节点是否可以并行执行
    ///
    /// 两个节点可以并行执行当且仅当它们在同一并行组中
    pub fn can_execute_in_parallel(&self, node_a: &str, node_b: &str) -> bool {
        if let (Some(group_a), Some(group_b)) = (self.get_node_group(node_a), self.get_node_group(node_b)) {
            group_a == group_b
        } else {
            false
        }
    }
}

/// 工作流调度器
pub struct WorkflowScheduler;

impl WorkflowScheduler {
    /// 对工作流进行调度
    ///
    /// 使用 Kahn 算法进行拓扑排序，并识别并行执行组
    pub fn schedule(workflow: &Workflow) -> Result<Schedule, ScheduleError> {
        // 首先验证工作流
        workflow.validate()?;

        // 构建邻接表和入度表
        let (adj_list, in_degree) = Self::build_graph_structures(workflow);

        // 使用 Kahn 算法进行拓扑排序
        let execution_order = Self::kahn_topological_sort(&adj_list, &in_degree)?;

        // 识别并行执行组
        let parallel_groups = Self::identify_parallel_groups(workflow, &execution_order)?;

        Ok(Schedule::new(execution_order, parallel_groups))
    }

    /// 构建图的邻接表和入度表
    fn build_graph_structures(
        workflow: &Workflow,
    ) -> (HashMap<String, Vec<String>>, HashMap<String, usize>) {
        let mut adj_list: HashMap<String, Vec<String>> = HashMap::new();
        let mut in_degree: HashMap<String, usize> = HashMap::new();

        // 初始化所有节点
        for node in &workflow.nodes {
            adj_list.entry(node.id.clone()).or_default();
            in_degree.entry(node.id.clone()).or_insert(0);
        }

        // 构建邻接表和入度
        for edge in &workflow.edges {
            adj_list
                .entry(edge.from.clone())
                .or_default()
                .push(edge.to.clone());

            *in_degree.entry(edge.to.clone()).or_insert(0) += 1;
        }

        (adj_list, in_degree)
    }

    /// Kahn 算法进行拓扑排序
    ///
    /// 返回节点的拓扑排序顺序
    fn kahn_topological_sort(
        adj_list: &HashMap<String, Vec<String>>,
        in_degree: &HashMap<String, usize>,
    ) -> Result<Vec<String>, ScheduleError> {
        let mut in_degree = in_degree.clone();
        let mut queue: VecDeque<String> = VecDeque::new();
        let mut result = Vec::new();

        // 将所有入度为 0 的节点加入队列
        for (node_id, degree) in &in_degree {
            if *degree == 0 {
                queue.push_back(node_id.clone());
            }
        }

        // 处理队列
        while let Some(node_id) = queue.pop_front() {
            result.push(node_id.clone());

            // 减少所有邻居的入度
            if let Some(neighbors) = adj_list.get(&node_id) {
                for neighbor in neighbors {
                    if let Some(degree) = in_degree.get_mut(neighbor) {
                        if *degree > 0 {
                            *degree -= 1;
                            if *degree == 0 {
                                queue.push_back(neighbor.clone());
                            }
                        }
                    }
                }
            }
        }

        // 检查是否所有节点都被处理（检测环）
        if result.len() != adj_list.len() {
            return Err(ScheduleError::CycleDetected);
        }

        Ok(result)
    }

    /// 识别并行执行组
    ///
    /// 基于拓扑排序结果，识别可以并行执行的节点组
    fn identify_parallel_groups(
        workflow: &Workflow,
        execution_order: &[String],
    ) -> Result<Vec<Vec<String>>, ScheduleError> {
        if execution_order.is_empty() {
            return Ok(Vec::new());
        }

        let mut groups: Vec<Vec<String>> = Vec::new();
        let mut processed: HashSet<String> = HashSet::new();

        for node_id in execution_order {
            // 获取所有未处理的前驱节点
            let predecessors = Self::get_predecessors(workflow, node_id);
            let unprocessed_preds: Vec<_> = predecessors
                .iter()
                .filter(|pred| !processed.contains(pred.as_str()))
                .collect();

            if unprocessed_preds.is_empty() {
                // 可以加入当前组或创建新组
                if let Some(current_group) = groups.last_mut() {
                    // 检查是否可以加入当前组（组内节点无依赖关系）
                    let can_join = current_group.iter().all(|member| {
                        !Self::has_dependency_between(workflow, member, node_id)
                            && !Self::has_dependency_between(workflow, node_id, member)
                    });

                    if can_join {
                        current_group.push(node_id.clone());
                    } else {
                        groups.push(vec![node_id.clone()]);
                    }
                } else {
                    groups.push(vec![node_id.clone()]);
                }

                processed.insert(node_id.clone());
            } else {
                return Err(ScheduleError::InvalidSchedule(format!(
                    "Node {} has unprocessed predecessors",
                    node_id
                )));
            }
        }

        Ok(groups)
    }

    /// 获取节点的前驱节点（有边指向该节点的节点）
    fn get_predecessors(workflow: &Workflow, node_id: &str) -> Vec<String> {
        let mut predecessors = Vec::new();

        for edge in &workflow.edges {
            if edge.to == node_id {
                predecessors.push(edge.from.clone());
            }
        }

        predecessors
    }

    /// 检查两个节点之间是否存在依赖关系
    fn has_dependency_between(workflow: &Workflow, from: &str, to: &str) -> bool {
        workflow.edges.iter().any(|edge| {
            (edge.from == from && edge.to == to)
                || (edge.from == to && edge.to == from)
        })
    }
}

/// 调度错误
#[derive(Debug, Clone, thiserror::Error)]
pub enum ScheduleError {
    #[error("Cycle detected in workflow graph")]
    CycleDetected,

    #[error("Invalid schedule: {0}")]
    InvalidSchedule(String),

    #[error("Workflow validation failed: {0}")]
    ValidationError(String),
}

impl From<crate::agent_system::workflow::WorkflowValidationError> for ScheduleError {
    fn from(err: crate::agent_system::workflow::WorkflowValidationError) -> Self {
        // 如果是循环依赖错误，转换为 CycleDetected
        if matches!(err, crate::agent_system::workflow::WorkflowValidationError::CyclicDependency) {
            ScheduleError::CycleDetected
        } else {
            ScheduleError::ValidationError(err.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_system::workflow::{Workflow, WorkflowNode, WorkflowEdge, AgentType};

    #[test]
    fn test_schedule_linear_workflow() {
        // a -> b -> c
        let mut workflow = Workflow::new("test", "Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("b", "c"));

        let schedule = WorkflowScheduler::schedule(&workflow).unwrap();

        // 执行顺序应该是 a, b, c
        assert_eq!(schedule.execution_order, vec!["a", "b", "c"]);

        // 每个节点都是独立的组（串行执行）
        assert_eq!(schedule.parallel_groups.len(), 3);
        assert_eq!(schedule.parallel_groups[0], vec!["a"]);
        assert_eq!(schedule.parallel_groups[1], vec!["b"]);
        assert_eq!(schedule.parallel_groups[2], vec!["c"]);
    }

    #[test]
    fn test_schedule_diamond_shape() {
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

        let schedule = WorkflowScheduler::schedule(&workflow).unwrap();

        // 执行顺序必须保证 a 在 b 和 c 之前，b 和 c 在 d 之前
        let pos_a = schedule.get_node_index("a").unwrap();
        let pos_b = schedule.get_node_index("b").unwrap();
        let pos_c = schedule.get_node_index("c").unwrap();
        let pos_d = schedule.get_node_index("d").unwrap();

        assert!(pos_a < pos_b);
        assert!(pos_a < pos_c);
        assert!(pos_b < pos_d);
        assert!(pos_c < pos_d);

        // b 和 c 可以并行
        assert!(schedule.can_execute_in_parallel("b", "c"));
    }

    #[test]
    fn test_schedule_disconnected_nodes() {
        // a -> b
        // c -> d (两个独立的链)
        let mut workflow = Workflow::new("test", "Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_node(WorkflowNode::new("d", AgentType::Test))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("c", "d"));

        let schedule = WorkflowScheduler::schedule(&workflow).unwrap();

        // a 和 c 应该在第一组（可以并行）
        // b 和 d 应该在第二组（可以并行）
        assert_eq!(schedule.parallel_groups.len(), 2);

        let group0: HashSet<_> = schedule.parallel_groups[0].iter().map(|s| s.as_str()).collect();
        let group1: HashSet<_> = schedule.parallel_groups[1].iter().map(|s| s.as_str()).collect();

        assert!(group0.contains("a") || group0.contains("c"));
        assert!(group0.contains("a") || group0.contains("c"));
        assert!(group1.contains("b") || group1.contains("d"));
        assert!(group1.contains("b") || group1.contains("d"));
    }

    #[test]
    fn test_schedule_with_cycle() {
        // a -> b -> c -> a (有环)
        let mut workflow = Workflow::new("test", "Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("b", "c"))
            .add_edge(WorkflowEdge::new("c", "a"));

        let result = WorkflowScheduler::schedule(&workflow);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), ScheduleError::CycleDetected));
    }

    #[test]
    fn test_can_execute_in_parallel() {
        let mut workflow = Workflow::new("test", "Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("a", "c"));

        let schedule = WorkflowScheduler::schedule(&workflow).unwrap();

        // b 和 c 可以并行
        assert!(schedule.can_execute_in_parallel("b", "c"));

        // a 和 b 不能并行（a 是 b 的前驱）
        assert!(!schedule.can_execute_in_parallel("a", "b"));
    }

    #[test]
    fn test_get_node_group() {
        let mut workflow = Workflow::new("test", "Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("a", "c"));

        let schedule = WorkflowScheduler::schedule(&workflow).unwrap();

        // a 在第 0 组
        assert_eq!(schedule.get_node_group("a"), Some(0));

        // b 和 c 在第 1 组
        assert_eq!(schedule.get_node_group("b"), Some(1));
        assert_eq!(schedule.get_node_group("c"), Some(1));
    }

    #[test]
    fn test_empty_workflow() {
        let workflow = Workflow::new("test", "Test");
        let schedule = WorkflowScheduler::schedule(&workflow).unwrap();

        assert_eq!(schedule.execution_order.len(), 0);
        assert_eq!(schedule.parallel_groups.len(), 0);
    }

    #[test]
    fn test_single_node_workflow() {
        let mut workflow = Workflow::new("test", "Test");
        workflow.add_node(WorkflowNode::new("a", AgentType::Explore));

        let schedule = WorkflowScheduler::schedule(&workflow).unwrap();

        assert_eq!(schedule.execution_order, vec!["a"]);
        assert_eq!(schedule.parallel_groups, vec![vec!["a"]]);
    }

    #[test]
    fn test_complex_workflow() {
        //      a
        //     /|\
        //    b c d
        //    |\|/|
        //    e f g
        //     \|/
        //      h
        let mut workflow = Workflow::new("test", "Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_node(WorkflowNode::new("d", AgentType::Test))
            .add_node(WorkflowNode::new("e", AgentType::Doc))
            .add_node(WorkflowNode::new("f", AgentType::Explore))
            .add_node(WorkflowNode::new("g", AgentType::Review))
            .add_node(WorkflowNode::new("h", AgentType::Refactor))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("a", "c"))
            .add_edge(WorkflowEdge::new("a", "d"))
            .add_edge(WorkflowEdge::new("b", "e"))
            .add_edge(WorkflowEdge::new("b", "f"))
            .add_edge(WorkflowEdge::new("c", "e"))
            .add_edge(WorkflowEdge::new("c", "f"))
            .add_edge(WorkflowEdge::new("c", "g"))
            .add_edge(WorkflowEdge::new("d", "f"))
            .add_edge(WorkflowEdge::new("d", "g"))
            .add_edge(WorkflowEdge::new("e", "h"))
            .add_edge(WorkflowEdge::new("f", "h"))
            .add_edge(WorkflowEdge::new("g", "h"));

        let schedule = WorkflowScheduler::schedule(&workflow).unwrap();

        // 验证执行顺序
        assert_eq!(schedule.execution_order[0], "a");
        assert_eq!(*schedule.execution_order.last().unwrap(), "h");

        // 验证依赖关系
        let pos_a = schedule.get_node_index("a").unwrap();
        let pos_e = schedule.get_node_index("e").unwrap();
        let pos_h = schedule.get_node_index("h").unwrap();
        assert!(pos_a < pos_e);
        assert!(pos_e < pos_h);
    }
}
