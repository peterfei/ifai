//! # IfAI 元编程宏库
//!
//! 本库提供用于 IfAI 技能系统的元编程宏，支持代码生成和声明式设计。
//!
//! ## 核心宏
//!
//! - `#[derive(SkillFormat)]` - 技能格式 derive 宏，自动生成序列化/反序列化方法
//! - `#[derive(StateMachine)]` - 状态机 derive 宏，编译时类型安全的状态转换
//! - `tauri_commands!` - Tauri 命令生成宏，自动生成命令函数
//!
//! ## 使用示例
//!
//! ```rust
//! use ifainew_macros::SkillFormat;
//!
//! #[derive(SkillFormat)]
//! #[skill(id = "id", name = "name", prompt = "system_prompt")]
//! pub struct Skill {
//!     #[skill(id)]
//!     pub id: String,
//!     #[skill(name)]
//!     pub name: String,
//!     #[skill(prompt)]
//!     pub system_prompt: String,
//! }
//! ```
//!
//! ## 特性
//!
//! - **编译时类型安全** - 所有宏在编译时验证，零运行时开销
//! - **声明式设计** - 描述"是什么"，不写"怎么做"
//! - **代码生成代码** - 宏自动生成业务逻辑，减少重复代码

#![cfg_attr(feature = "debug", allow(dead_code))]

extern crate proc_macro;

use proc_macro::TokenStream;

// 导出各个宏模块
mod skill_format;
mod state_machine;
mod commands;
mod api_client;

// 导出主要的 derive 宏
use skill_format::impl_skill_format;
use state_machine::impl_state_machine;
use commands::impl_tauri_commands;
use api_client::impl_api_client;

/// 技能格式 derive 宏
///
/// 为结构体自动生成技能格式转换方法：
/// - `from_json()` / `to_json()`
/// - `from_markdown()` / `to_markdown()`
/// - `from_yaml()` / `to_yaml()`
/// - `from_str()` (自动格式检测)
/// - `validate()` (Schema 校验)
///
/// # 属性
///
/// - `#[skill(id = "...")]` - 标记 ID 字段
/// - `#[skill(name = "...")]` - 标记名称字段
/// - `#[skill(description = "...")]` - 标记描述字段
/// - `#[skill(prompt = "...")]` - 标记提示词字段
///
/// # 示例
///
/// ```rust
/// use ifainew_macros::SkillFormat;
/// use serde::{Deserialize, Serialize};
///
/// #[derive(SkillFormat, Clone, Debug, Serialize, Deserialize)]
/// #[skill(id = "id", name = "name", prompt = "system_prompt")]
/// pub struct Skill {
///     #[skill(id)]
///     pub id: String,
///
///     #[skill(name)]
///     pub name: String,
///
///     #[skill(description)]
///     pub description: String,
///
///     #[skill(prompt)]
///     pub system_prompt: String,
///
///     pub version: String,
///     pub tags: Vec<String>,
/// }
/// ```
#[proc_macro_derive(SkillFormat, attributes(skill))]
pub fn derive_skill_format(input: TokenStream) -> TokenStream {
    impl_skill_format(input)
}

/// 状态机 derive 宏
///
/// 为枚举自动生成类型安全的状态机：
/// - 编译时状态转换验证
/// - 状态查询方法
/// - 进入/退出回调
/// - 自动事件发射
///
/// # 属性
///
/// - `#[state(initial = "...")]` - 标记初始状态
/// - `#[state(transitions = [...])]` - 定义可转换的状态
/// - `#[state(on_enter = "...")]` - 进入状态时的回调
/// - `#[state(on_exit = "...")]` - 退出状态时的回调
///
/// # 示例
///
/// ```rust
/// use ifainew_macros::StateMachine;
///
/// #[derive(StateMachine)]
/// #[state_machine(initial = "NotInstalled")]
/// pub enum SkillState {
///     #[state(transitions = ["Installing"])]
///     NotInstalled,
///
///     #[state(
///         transitions = ["Installed", "Error"],
///         on_enter = "log_install_start",
///         on_exit = "cleanup_temp_files"
///     )]
///     Installing { progress: u8 },
///
///     #[state(transitions = ["Active", "Uninstalling"])]
///     Installed { version: String },
///
///     #[state(transitions = ["Installed", "Error"])]
///     Active,
///
///     #[state(transitions = ["NotInstalled"])]
///     Uninstalling,
///
///     #[state(transitions = ["NotInstalled"])]
///     Error { message: String },
/// }
/// ```
#[proc_macro_derive(StateMachine, attributes(state_machine, state))]
pub fn derive_state_machine(input: TokenStream) -> TokenStream {
    impl_state_machine(input)
}

/// Tauri 命令生成宏
///
/// 从声明式配置自动生成 Tauri 命令函数：
/// - 参数解析和验证
/// - 权限检查
/// - 错误处理
/// - 日志记录
/// - 性能监控
/// - 事件发射
///
/// # 示例
///
/// ```rust
/// use ifainew_macros::tauri_commands;
///
/// tauri_commands! {
///     error_type = "SkillError";
///     context_type = "SkillManager";
///     log_prefix = "[SkillCmd]";
///
///     commands: {
///         Install {
///             description = "安装技能";
///             input: {
///                 skill_id: String,
///                 version: Option<String>,
///             };
///             output: InstalledSkill;
///             permission: ReadWrite;
///             method: install;
///         },
///
///         Uninstall {
///             description = "卸载技能";
///             input: { skill_id: String };
///             output: ();
///             permission: ReadWrite;
///             method: uninstall;
///         },
///     }
/// }
/// ```
#[proc_macro]
pub fn tauri_commands(input: TokenStream) -> TokenStream {
    impl_tauri_commands(input)
}

/// API 客户端生成宏
///
/// 从声明式配置生成类型安全的 API 客户端
///
/// # 示例
///
/// ```rust
/// use ifainew_macros::api_client;
///
/// api_client! {
///     name = "SkillRegistryClient";
///     base_url = "https://api.ifai.com";
///
///     endpoints: {
///         ListSkills {
///             method = GET;
///             path = "/skills";
///             returns = Vec<Skill>;
///         },
///     }
/// }
/// ```
#[proc_macro]
pub fn api_client(input: TokenStream) -> TokenStream {
    impl_api_client(input)
}
