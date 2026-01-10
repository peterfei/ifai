pub mod prompt_commands;
pub mod agent_commands;
pub mod core_wrappers;
// v0.2.6 新增：任务拆解文件存储
pub mod task_commands;
// v0.2.6 新增：提案管理
pub mod proposal_commands;
// v0.5.0 新增：Bash 命令执行
pub mod bash_commands;
// v0.2.8 新增：符号索引与跨文件关联
pub mod symbol_commands;
// v0.2.8 新增：原子文件操作
pub mod atomic_commands;
// v0.2.8 新增：终端错误解析
pub mod error_commands;