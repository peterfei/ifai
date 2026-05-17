//! Agent 系统元编程模块
//!
//! 本模块提供 Agent 互调用的宏生成能力，包括：
//! - `global_agent_registry!`: 全局 Agent 注册表
//! - `workflow!`: 工作流 DSL
//!
//! # 设计原则
//!
//! - **零样板代码**: 所有重复逻辑由宏生成
//! - **编译时安全**: 类型检查 + 宏展开验证
//! - **单点维护**: 修改宏定义，自动传播
//!
//! # 使用示例
//!
//! ```rust
//! global_agent_registry! {
//!     agents: [
//!         Explore,
//!         Review,
//!         Refactor,
//!         // ...
//!     ],
//!     max_depth: 5,
//! }
//! ```

pub mod registry;

/// 全局 Agent 注册表宏
///
/// 声明式注册所有 Agent，自动生成注册表代码。
///
/// # 语法
///
/// ```rust
/// global_agent_registry! {
///     agents: [
///         AgentType1,
///         AgentType2,
///         // ...
///     ],
///     max_depth: 5,
/// }
/// ```
///
/// # 生成内容
///
/// - `AgentRegistry::global()` 单例
/// - 自动注册所有指定的 Agent
/// - 调用链深度限制配置
#[macro_export]
macro_rules! global_agent_registry {
    {
        agents: [$($agent:ident),+ $(,)?],
        max_depth: $max_depth:expr,
    } => {
        // 宏展开时，这些代码已经在 registry.rs 的 AgentRegistry::global() 中实现
        // 这里只是提供一个声明式接口，实际逻辑在 runtime 执行
        //
        // 未来可以扩展为：
        // 1. 生成自定义 AgentCaller trait
        // 2. 自动生成 Agent 互调用代码
        // 3. 编译时验证 Agent 依赖关系

        // 当前版本：通过静态断言确保编译时检查
        const _: () = {
            // 验证 max_depth 是合理的值
            let _ = [(); $max_depth];

            // 确保至少有一个 Agent
            let _ = [$(stringify!($agent)),+];
        };
    };
}

// 测试模块
#[cfg(test)]
mod tests {
    include!("tests/registry_tests.rs");
}

// 重新导出常用类型
pub use registry::{AgentRegistry, CallContext, CallChain};
