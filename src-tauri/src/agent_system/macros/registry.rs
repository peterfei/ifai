// Agent Registry 实现
//
// 全局 Agent 注册表，支持 Agent 互调用和调用链追踪。

use crate::agent_system::workflow::types::AgentType;
use serde_json::Value;
use std::collections::HashSet;

/// 全局 Agent 注册表（单例）
#[derive(Debug)]
pub struct AgentRegistry {
    agents: HashSet<AgentType>,
}

impl AgentRegistry {
    /// 获取全局注册表实例（单例模式）
    pub fn global() -> &'static AgentRegistry {
        use std::sync::OnceLock;
        static REGISTRY: OnceLock<AgentRegistry> = OnceLock::new();
        REGISTRY.get_or_init(|| {
            let mut agents = HashSet::new();
            // 注册所有 Agent（plan_agent 映射到 TaskBreakdown）
            agents.insert(AgentType::Explore);
            agents.insert(AgentType::Review);
            agents.insert(AgentType::Refactor);
            agents.insert(AgentType::Test);
            agents.insert(AgentType::Doc);
            agents.insert(AgentType::Debug);
            agents.insert(AgentType::GitCommit);
            agents.insert(AgentType::TaskBreakdown);
            agents.insert(AgentType::ReAct);

            AgentRegistry { agents }
        })
    }

    /// 检查指定 Agent 是否已注册
    pub fn has_agent(&self, agent_type: &AgentType) -> bool {
        self.agents.contains(agent_type)
    }
}

/// Agent 调用上下文
#[derive(Debug, Clone)]
pub struct CallContext {
    depth: usize,
    max_depth: usize,
    chain: CallChain,
}

impl CallContext {
    /// 创建新的调用上下文（默认 max_depth=5）
    pub fn new() -> Self {
        CallContext {
            depth: 0,
            max_depth: 5,
            chain: CallChain::new(),
        }
    }

    /// 使用配置创建调用上下文
    pub fn with_config(config: Value) -> Self {
        let max_depth = config["max_depth"].as_u64().unwrap_or(5) as usize;
        CallContext {
            depth: 0,
            max_depth,
            chain: CallChain::new(),
        }
    }

    /// 获取当前深度
    pub fn depth(&self) -> usize {
        self.depth
    }

    /// 增加深度
    pub fn increment_depth(&mut self) {
        self.depth += 1;
        self.chain.push_call(AgentType::ReAct); // 测试用，实际应该从外部传入
    }

    /// 减少深度
    pub fn decrement_depth(&mut self) {
        if self.depth > 0 {
            self.depth -= 1;
        }
    }

    /// 检查是否达到最大深度
    pub fn is_at_max_depth(&self) -> bool {
        self.depth >= self.max_depth
    }

    /// 检查是否应该停止调用
    pub fn should_stop(&self) -> bool {
        self.is_at_max_depth()
    }
}

/// Agent 调用链追踪
#[derive(Debug, Clone)]
pub struct CallChain {
    calls: Vec<AgentType>,
    max_depth: usize,
}

impl CallChain {
    /// 创建新的调用链
    pub fn new() -> Self {
        CallChain {
            calls: Vec::new(),
            max_depth: 5,
        }
    }

    /// 添加调用记录
    pub fn push_call(&mut self, agent_type: AgentType) {
        self.calls.push(agent_type);
    }

    /// 尝试添加调用记录（检查深度限制）
    pub fn try_push_call(&mut self, agent_type: AgentType) -> Result<(), String> {
        if self.is_at_max_depth(5) {
            return Err(format!("Max depth limit reached: {}", self.max_depth));
        }
        self.calls.push(agent_type);
        Ok(())
    }

    /// 获取调用记录
    pub fn calls(&self) -> &[AgentType] {
        &self.calls
    }

    /// 获取当前深度
    pub fn depth(&self) -> usize {
        self.calls.len()
    }

    /// 检查是否达到最大深度
    pub fn is_at_max_depth(&self, max: usize) -> bool {
        self.calls.len() >= max
    }
}
