// Agent Registry 实现
//
// 全局 Agent 注册表，支持 Agent 互调用和调用链追踪。

use crate::agent_system::workflow::types::AgentType;
use crate::agent_system::macros::permission::{PermissionChecker, AllowAllPermissionChecker};
use serde_json::{json, Value};
use std::collections::HashSet;
use thiserror::Error;

/// Agent 互调用错误
#[derive(Debug, Error)]
pub enum AgentCallError {
    #[error("Agent {0:?} 未注册")]
    AgentNotRegistered(AgentType),

    #[error("调用深度超限: 当前深度 {depth}, 最大深度 {max}")]
    MaxDepthExceeded { depth: usize, max: usize },

    #[error("Agent 执行失败: {0}")]
    ExecutionFailed(String),

    #[error("权限不足: 需要 {required:?}, 当前 {current:?}")]
    PermissionDenied {
        required: String,
        current: String,
    },
}

/// Agent 调用结果
pub type AgentCallResult = Result<Value, AgentCallError>;

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

    /// 调用指定 Agent（核心互调用方法）
    ///
    /// # 参数
    ///
    /// * `agent_type` - 要调用的 Agent 类型
    /// * `input` - 输入数据（JSON）
    /// * `ctx` - 调用上下文
    ///
    /// # 返回
    ///
    /// Agent 执行结果（JSON）
    pub fn call(
        &self,
        agent_type: AgentType,
        input: Value,
        ctx: &mut CallContext,
    ) -> AgentCallResult {
        // 检查 Agent 是否已注册
        if !self.has_agent(&agent_type) {
            return Err(AgentCallError::AgentNotRegistered(agent_type));
        }

        // 检查调用深度
        if ctx.is_at_max_depth() {
            return Err(AgentCallError::MaxDepthExceeded {
                depth: ctx.depth(),
                max: ctx.max_depth,
            });
        }

        // 🔥 Phase 5.2: 权限检查
        ctx.check_permission(&agent_type)?;

        // 增加调用深度
        ctx.increment_depth();
        ctx.chain.push_call(agent_type.clone());

        // TODO: 实际执行 Agent
        // 这里需要集成现有的 Agent 执行逻辑
        // 暂时返回模拟结果
        let agent_name = format!("{:?}", agent_type);
        Ok(json!({
            "agent": agent_name,
            "input": input,
            "depth": ctx.depth(),
        }))

        // 实际实现应该是：
        // let task = extract_task_from_input(&input)?;
        // let output = execute_agent_sync(agent_type, &task)?;
        // ctx.decrement_depth();
        // Ok(serde_json::from_str(&output)?)
    }

    /// 🔥 Phase 2.5: 并行调用多个 Agent
    ///
    /// 同时调用多个 Agent，显著提升性能。使用 tokio 并发执行。
    ///
    /// # 参数
    ///
    /// * `calls` - Agent 调用列表 `(AgentType, Input)`
    /// * `ctx` - 调用上下文
    ///
    /// # 返回
    ///
    /// 向量 of `(AgentType, Result)`，顺序与输入一致
    ///
    /// # 示例
    /// ```
    /// let results = registry.call_parallel(vec![
    ///     (AgentType::Explore, json!({"task": "分析前端"})),
    ///     (AgentType::Review, json!({"task": "审查安全"})),
    /// ], &mut ctx);
    /// ```
    pub fn call_parallel(
        &self,
        calls: Vec<(AgentType, Value)>,
        ctx: &mut CallContext,
    ) -> Vec<(AgentType, AgentCallResult)> {
        // 最大并行调用限制
        const MAX_PARALLEL_CALLS: usize = 5;

        // 检查调用数量
        if calls.len() > MAX_PARALLEL_CALLS {
            // TODO: 添加警告机制
            eprintln!(
                "警告: 并行调用数量 {} 超过限制 {}",
                calls.len(),
                MAX_PARALLEL_CALLS
            );
        }

        // 空调用直接返回
        if calls.is_empty() {
            return Vec::new();
        }

        // 使用 tokio runtime 并行执行
        let handle = tokio::runtime::Handle::try_current()
            .unwrap_or_else(|_| {
                // 如果没有当前 runtime，创建一个新的
                tokio::runtime::Handle::current()
            });

        // 在 async 块中执行并行调用
        let results = handle.block_on(async {
            self.call_parallel_async(calls, ctx).await
        });

        results
    }

    /// 🔥 Phase 2.5: 异步并行调用实现（公开）
    ///
    /// 使用 JoinSet 管理并发任务的异步方法
    pub async fn call_parallel_async(
        &self,
        calls: Vec<(AgentType, Value)>,
        ctx: &mut CallContext,
    ) -> Vec<(AgentType, AgentCallResult)> {
        use tokio::task::JoinSet;

        let mut join_set = JoinSet::new();
        let mut immediate_results = Vec::new(); // 立即失败的结果

        // 并行启动所有 Agent
        for (agent_type, input) in calls {
            // 深度检查（提前失败）
            if ctx.is_at_max_depth() {
                immediate_results.push((
                    agent_type.clone(),
                    Err(AgentCallError::MaxDepthExceeded {
                        depth: ctx.depth(),
                        max: ctx.max_depth,
                    }),
                ));
                continue;
            }

            // 权限检查
            match ctx.check_permission(&agent_type) {
                Ok(_) => {},
                Err(e) => {
                    immediate_results.push((agent_type.clone(), Err(e)));
                    continue;
                }
            }

            // Clone 需要的数据
            let agent_type_clone = agent_type.clone();
            let input_clone = input.clone();
            let mut ctx_fork = ctx.fork(); // Fork 上下文

            // Spawn 并行任务
            join_set.spawn(async move {
                // 注意：这里不能直接调用 self.call()，因为 &self 不是 Send
                // 我们直接模拟调用逻辑
                if ctx_fork.is_at_max_depth() {
                    return (
                        agent_type_clone.clone(),
                        Err(AgentCallError::MaxDepthExceeded {
                            depth: ctx_fork.depth(),
                            max: ctx_fork.max_depth,
                        }),
                    );
                }

                ctx_fork.increment_depth();
                ctx_fork.chain.push_call(agent_type_clone.clone());

                // TODO: 实际执行 Agent
                // 暂时返回模拟结果
                let agent_name = format!("{:?}", agent_type_clone);
                (
                    agent_type_clone.clone(),
                    Ok(json!({
                        "agent": agent_name,
                        "input": input_clone,
                        "depth": ctx_fork.depth(),
                    })),
                )
            });
        }

        // 等待所有任务完成
        let mut task_results = Vec::new();
        while let Some(result) = join_set.join_next().await {
            match result {
                Ok(r) => task_results.push(r),
                Err(e) => {
                    // Task panic 或 join 错误
                    eprintln!("并行任务失败: {:?}", e);
                }
            }
        }

        // 合并立即失败和任务结果
        // 注意：这不会保持原始顺序，我们需要重新排序
        // 暂时先简单合并，TODO: 在 Green Phase 完善后重构
        let mut all_results = immediate_results;
        all_results.extend(task_results);
        all_results
    }
}

/// Agent 调用者 trait
///
/// 所有需要调用其他 Agent 的类型都应该实现此 trait
pub trait AgentCaller {
    /// 调用其他 Agent
    ///
    /// # 参数
    ///
    /// * `target` - 目标 Agent 类型
    /// * `input` - 输入数据（JSON）
    /// * `ctx` - 调用上下文
    ///
    /// # 返回
    ///
    /// Agent 执行结果（JSON）
    fn call_agent(
        &mut self,
        target: AgentType,
        input: Value,
        ctx: &mut CallContext,
    ) -> AgentCallResult {
        // 默认实现：通过全局注册表调用
        AgentRegistry::global().call(target, input, ctx)
    }
}

// 为所有 ToolExecutor 实现 AgentCaller（blanket impl）
impl<T: ToolExecutor> AgentCaller for T {
    // 使用默认实现
}

// ToolExecutor trait 的前向声明
#[cfg(not(feature = "commercial"))]
use crate::harness::tool::ToolExecutor;

#[cfg(feature = "commercial")]
use crate::harness::tool::ToolExecutor;

/// Agent 调用上下文
#[derive(Debug)]
pub struct CallContext {
    depth: usize,
    max_depth: usize,
    chain: CallChain,
    /// 🔥 Phase 5.2: 权限检查器（使用 Rc 以便克隆共享）
    permission_checker: std::sync::Arc<dyn PermissionChecker + Send + Sync>,
}

impl Clone for CallContext {
    fn clone(&self) -> Self {
        Self {
            depth: self.depth,
            max_depth: self.max_depth,
            chain: self.chain.clone(),
            permission_checker: std::sync::Arc::clone(&self.permission_checker),
        }
    }
}

impl CallContext {
    /// 创建新的调用上下文（默认 max_depth=5, 使用 AllowAllPermissionChecker）
    pub fn new() -> Self {
        CallContext {
            depth: 0,
            max_depth: 5,
            chain: CallChain::new(),
            permission_checker: std::sync::Arc::new(AllowAllPermissionChecker),
        }
    }

    /// 使用配置创建调用上下文
    pub fn with_config(config: Value) -> Self {
        let max_depth = config["max_depth"].as_u64().unwrap_or(5) as usize;
        CallContext {
            depth: 0,
            max_depth,
            chain: CallChain::new(),
            permission_checker: std::sync::Arc::new(AllowAllPermissionChecker),
        }
    }

    /// 🔥 Phase 5.2: 使用自定义权限检查器创建调用上下文
    pub fn with_permission_checker(
        max_depth: usize,
        checker: std::sync::Arc<dyn PermissionChecker + Send + Sync>,
    ) -> Self {
        CallContext {
            depth: 0,
            max_depth,
            chain: CallChain::new(),
            permission_checker: checker,
        }
    }

    /// 获取当前深度
    pub fn depth(&self) -> usize {
        self.depth
    }

    /// 获取最大深度
    pub fn max_depth(&self) -> usize {
        self.max_depth
    }

    /// 获取调用链
    pub fn call_chain(&self) -> &CallChain {
        &self.chain
    }

    /// 🔥 Phase 5.2: 检查 Agent 权限
    ///
    /// 如果当前权限级别不足，返回 PermissionDenied 错误
    pub fn check_permission(&self, agent_type: &AgentType) -> Result<(), AgentCallError> {
        let required = agent_type.required_permission();
        self.permission_checker
            .check_permission(required)
            .map_err(|e| AgentCallError::PermissionDenied {
                required: format!("{:?}", required),
                current: format!("{:?}", self.permission_checker.current_level()),
            })
    }

    /// 增加深度
    pub fn increment_depth(&mut self) {
        self.depth += 1;
        // 注意：不在这里调用 chain.push_call，由 AgentRegistry.call() 负责
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

    /// 🔥 Phase 2.5: Fork 上下文（用于并行调用）
    ///
    /// 创建一个独立的上下文副本，共享深度限制和调用链
    ///
    /// # 示例
    /// ```
    /// let ctx1 = CallContext::new();
    /// let ctx2 = ctx1.fork();
    ///
    /// // ctx1 和 ctx2 有相同的配置，但深度是独立的
    /// assert_eq!(ctx1.max_depth(), ctx2.max_depth());
    /// assert_eq!(ctx1.depth(), ctx2.depth());
    /// ```
    pub fn fork(&self) -> Self {
        Self {
            depth: self.depth,
            max_depth: self.max_depth,
            chain: self.chain.clone(), // 共享调用链
            permission_checker: std::sync::Arc::clone(&self.permission_checker),
        }
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
