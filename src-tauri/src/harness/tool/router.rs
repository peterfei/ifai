//! 工具路由器
//!
//! 根据工具名称路由到对应的执行器。

use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use super::{
    executor::{
        AliasExecutor, DebugAgentExecutor, DocAgentExecutor, ExploreAgentExecutor, GitCommitAgentExecutor, MemorySaveExecutor,
        PlanAgentExecutor, ReActAgentExecutor, RefactorAgentExecutor, ReviewAgentExecutor, SearchToolsExecutor, ShellToolsExecutor, TestAgentExecutor, TodoWriteExecutor,
        WebSearchAgentExecutor, ToolExecutor,
    },
    new_tools::{
        PingTool, PingToolAdapter, ReadFileTool, ReadFileAdapter, WriteFileTool, WriteFileAdapter, EditFileTool, EditFileAdapter, WebSearchTool, WebSearchAdapter, CachedWebSearchAdapter, BochaConfig, SearchCache, GitDiffTool, GitDiffAdapter, GitStatusTool, GitStatusAdapter, GitSnapshotTool, GitSnapshotAdapter, GitCommitTool, GitCommitAdapter, SecretScannerTool, SecretScannerAdapter, ComplexityAnalyzer, ComplexityAnalyzerAdapter, AgentCallParallelTool, AgentCallParallelAdapter,
        // Phase 3: 协作工具
        AggregateResultsTool, AggregateResultsAdapter, ShareKnowledgeTool, ShareKnowledgeAdapter, MonitorProgressTool, MonitorProgressAdapter,
    },
    ToolError,
};

/// 全局项目根目录（P4: 用于 agent_* 工具的相对路径解析）
static GLOBAL_PROJECT_ROOT: OnceLock<Option<String>> = OnceLock::new();

/// 设置全局项目根目录
pub fn set_global_project_root(root: String) {
    GLOBAL_PROJECT_ROOT.set(Some(root)).ok();
}

/// 获取全局项目根目录
pub fn get_global_project_root() -> Option<String> {
    GLOBAL_PROJECT_ROOT.get().cloned().flatten()
}

/// 工具路由器
pub struct ToolRouter {
    executors: Mutex<HashMap<String, Box<dyn ToolExecutor>>>,
}

impl ToolRouter {
    /// 创建新的工具路由器，注册所有内置工具
    pub fn new() -> Self {
        // 明确指定 HashMap 类型
        let mut executors: HashMap<String, Box<dyn ToolExecutor>> = HashMap::new();

        // 注册 TodoWrite 执行器
        let task_store = crate::harness::task::get_global_task_store();
        executors.insert(
            "TodoWrite".to_string(),
            Box::new(TodoWriteExecutor::new(task_store.clone())),
        );

        // 🆕 注册 MemorySave 执行器
        executors.insert(
            "MemorySave".to_string(),
            Box::new(MemorySaveExecutor::new()),
        );

        // 注册搜索工具执行器（每个工具一个实例）
        executors.insert(
            "glob_search".to_string(),
            Box::new(SearchToolsExecutor::new()),
        );
        executors.insert(
            "grep_search".to_string(),
            Box::new(SearchToolsExecutor::new()),
        );

        // 注册 Shell 工具执行器（每个工具一个实例）
        executors.insert("bash".to_string(), Box::new(ShellToolsExecutor::new()));
        executors.insert(
            "PowerShell".to_string(),
            Box::new(ShellToolsExecutor::new()),
        );

        // 🆕 P4: 注册 agent_* 工具（使用 AliasExecutor）
        executors.insert(
            "agent_read_file".to_string(),
            Box::new(AliasExecutor::new()),
        );
        executors.insert(
            "agent_write_file".to_string(),
            Box::new(AliasExecutor::new()),
        );
        executors.insert("agent_list_dir".to_string(), Box::new(AliasExecutor::new()));
        executors.insert(
            "agent_scan_project".to_string(),
            Box::new(AliasExecutor::new()),
        );

        // 🆕 注册专用 agent 工具
        executors.insert(
            "explore_agent".to_string(),
            Box::new(ExploreAgentExecutor::new()),
        );
        executors.insert(
            "review_agent".to_string(),
            Box::new(ReviewAgentExecutor::new()),
        );
        executors.insert(
            "code_review".to_string(),
            Box::new(ReviewAgentExecutor::new()),
        );
        executors.insert(
            "websearch_agent".to_string(),
            Box::new(WebSearchAgentExecutor::new()),
        );
        executors.insert(
            "test_agent".to_string(),
            Box::new(TestAgentExecutor::new()),
        );
        executors.insert(
            "doc_agent".to_string(),
            Box::new(DocAgentExecutor::new()),
        );
        executors.insert(
            "debug_agent".to_string(),
            Box::new(DebugAgentExecutor::new()),
        );
        executors.insert(
            "refactor_agent".to_string(),
            Box::new(RefactorAgentExecutor::new()),
        );
        executors.insert(
            "git_commit_agent".to_string(),
            Box::new(GitCommitAgentExecutor::new()),
        );

        // Phase 6C: Plan Agent
        executors.insert(
            "plan_agent".to_string(),
            Box::new(PlanAgentExecutor::new()),
        );

        // Phase 6D: ReAct Agent
        executors.insert(
            "react_agent".to_string(),
            Box::new(ReActAgentExecutor::new()),
        );

        // 🆕 Phase 2.5: Agent 并行调用工具
        let agent_call_parallel_tool = AgentCallParallelTool;
        let agent_call_parallel_adapter = AgentCallParallelAdapter::new(agent_call_parallel_tool, "call_agent_parallel".to_string());
        executors.insert("call_agent_parallel".to_string(), Box::new(agent_call_parallel_adapter));

        // 🆕 注册使用 #[derive(Tool)] 宏的 PingTool
        let ping_tool = PingTool::new(5000, 0);
        let ping_adapter = PingToolAdapter::new(ping_tool, "ping".to_string());
        executors.insert("ping".to_string(), Box::new(ping_adapter));

        // 🆕 使用 #[derive(Tool)] 宏的 ReadFileTool（替换旧实现）
        let read_file_tool = ReadFileTool::new();
        let read_file_adapter = ReadFileAdapter::new(read_file_tool, "read_file".to_string());
        executors.insert("read_file".to_string(), Box::new(read_file_adapter));

        // 🆕 使用 #[derive(Tool)] 宏的 WriteFileTool（替换旧实现）
        let write_file_tool = WriteFileTool::new();
        let write_file_adapter = WriteFileAdapter::new(write_file_tool, "write_file".to_string());
        executors.insert("write_file".to_string(), Box::new(write_file_adapter));

        // 🆕 使用 #[derive(Tool)] 宏的 EditFileTool（替换旧实现）
        let edit_file_tool = EditFileTool::new();
        let edit_file_adapter = EditFileAdapter::new(edit_file_tool, "edit_file".to_string());
        executors.insert("edit_file".to_string(), Box::new(edit_file_adapter));

        // 🆕 使用 #[derive(Tool)] 宏的 WebSearchTool（网络搜索功能 + 缓存）
        // 从 .env 文件加载博查 API Key（环境变量优先，然后 .env 文件）
        // 启用缓存以减少 API 调用成本
        let web_search_config = BochaConfig::from_env_file();
        let web_search_tool = WebSearchTool::new(web_search_config);
        let web_search_cache = SearchCache::default_config();
        let web_search_adapter = CachedWebSearchAdapter::new(web_search_tool, web_search_cache, "web_search".to_string());
        executors.insert("web_search".to_string(), Box::new(web_search_adapter));

        // 🆕 注册 GitDiffTool（代码审查）
        let git_diff_tool = GitDiffTool::new(5, 0);
        let git_diff_adapter = GitDiffAdapter::new(git_diff_tool, "git_diff".to_string());
        executors.insert("git_diff".to_string(), Box::new(git_diff_adapter));

        // 🆕 注册 ComplexityAnalyzer（代码复杂度分析）
        let complexity_tool = ComplexityAnalyzer::new(10, 0);
        let complexity_adapter = ComplexityAnalyzerAdapter::new(complexity_tool, "complexity_analyzer".to_string());
        executors.insert("complexity_analyzer".to_string(), Box::new(complexity_adapter));

        // Phase 6B: Git Commit Agent 工具
        let git_status_tool = GitStatusTool::new();
        let git_status_adapter = GitStatusAdapter::new(git_status_tool, "git_status".to_string());
        executors.insert("git_status".to_string(), Box::new(git_status_adapter));

        let git_snapshot_tool = GitSnapshotTool::new();
        let git_snapshot_adapter = GitSnapshotAdapter::new(git_snapshot_tool, "git_snapshot".to_string());
        executors.insert("git_snapshot".to_string(), Box::new(git_snapshot_adapter));

        let secret_scanner_tool = SecretScannerTool::new();
        let secret_scanner_adapter = SecretScannerAdapter::new(secret_scanner_tool, "secret_scanner".to_string());
        executors.insert("secret_scanner".to_string(), Box::new(secret_scanner_adapter));

        // 🆕 注册 GitCommitTool（安全提交 + 自动 Co-authored-by）
        let git_commit_tool = GitCommitTool::new();
        let git_commit_adapter = GitCommitAdapter::new(git_commit_tool, "git_commit".to_string());
        executors.insert("git_commit".to_string(), Box::new(git_commit_adapter));

        // 🆕 Phase 3: 注册协作工具
        let aggregate_results_tool = AggregateResultsTool;
        let aggregate_results_adapter = AggregateResultsAdapter::new(aggregate_results_tool, "aggregate_results".to_string());
        executors.insert("aggregate_results".to_string(), Box::new(aggregate_results_adapter));

        let share_knowledge_tool = ShareKnowledgeTool;
        let share_knowledge_adapter = ShareKnowledgeAdapter::new(share_knowledge_tool, "share_knowledge".to_string());
        executors.insert("share_knowledge".to_string(), Box::new(share_knowledge_adapter));

        let monitor_progress_tool = MonitorProgressTool;
        let monitor_progress_adapter = MonitorProgressAdapter::new(monitor_progress_tool, "monitor_progress".to_string());
        executors.insert("monitor_progress".to_string(), Box::new(monitor_progress_adapter));

        Self {
            executors: Mutex::new(executors),
        }
    }

    /// 设置项目根目录（用于 agent_* 工具）
    pub fn set_project_root(&self, root: String) {
        // 设置全局 project_root
        set_global_project_root(root);
    }

    /// 🔥 声明式：替换 TodoWrite 的 TaskStore（per-thread 隔离）
    /// 在 stream_prompt_tui 开始时调用，确保 TodoWrite 操作的是当前线程的 store
    pub fn set_task_store(&self, store: crate::harness::task::TaskStore) {
        let mut executors = self.executors.lock().unwrap();
        executors.insert(
            "TodoWrite".to_string(),
            Box::new(TodoWriteExecutor::new(store)),
        );
    }

    /// 执行工具
    pub fn execute(&self, name: &str, input: &Value) -> Result<String, ToolError> {
        let mut executors = self.executors.lock().unwrap();
        let executor = executors.get_mut(name).ok_or_else(|| ToolError::NotFound {
            name: name.to_string(),
        })?;

        executor.execute(name, input)
    }

    /// 检查工具是否可用
    pub fn is_available(&self, name: &str) -> bool {
        let executors = self.executors.lock().unwrap();
        executors.contains_key(name)
    }

    /// 获取所有已注册的工具名称
    pub fn list_tools(&self) -> Vec<String> {
        let executors = self.executors.lock().unwrap();
        executors.keys().cloned().collect()
    }
}

impl Default for ToolRouter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_router_has_all_tools() {
        let router = ToolRouter::new();
        let tools = router.list_tools();

        // 应该包含所有内置工具
        assert!(tools.contains(&"TodoWrite".to_string()));
        assert!(tools.contains(&"MemorySave".to_string()));
        assert!(tools.contains(&"read_file".to_string()));
        assert!(tools.contains(&"write_file".to_string()));
        assert!(tools.contains(&"edit_file".to_string()));
        assert!(tools.contains(&"web_search".to_string()));
        assert!(tools.contains(&"glob_search".to_string()));
        assert!(tools.contains(&"grep_search".to_string()));
        assert!(tools.contains(&"bash".to_string()));
        assert!(tools.contains(&"PowerShell".to_string()));
        assert!(tools.contains(&"git_diff".to_string()));
        assert!(tools.contains(&"complexity_analyzer".to_string()));
        assert!(tools.contains(&"code_review".to_string()));

        // Phase 6A: Refactor Agent
        assert!(tools.contains(&"refactor_agent".to_string()));

        // Phase 6B: Git Commit Agent
        assert!(tools.contains(&"git_commit_agent".to_string()));
        assert!(tools.contains(&"git_status".to_string()));
        assert!(tools.contains(&"git_snapshot".to_string()));
        assert!(tools.contains(&"secret_scanner".to_string()));

        // Phase 6C: Plan Agent
        assert!(tools.contains(&"plan_agent".to_string()));

        // Phase 6D: ReAct Agent
        assert!(tools.contains(&"react_agent".to_string()));

        // Phase 3: 协作工具
        assert!(tools.contains(&"aggregate_results".to_string()));
        assert!(tools.contains(&"share_knowledge".to_string()));
        assert!(tools.contains(&"monitor_progress".to_string()));
    }

    #[test]
    fn test_router_execute_todo_write() {
        let router = ToolRouter::new();
        let input = serde_json::json!({
            "todos": [
                {
                    "content": "Test task",
                    "activeForm": "Testing",
                    "status": "pending"
                }
            ]
        });

        let result = router.execute("TodoWrite", &input);
        assert!(result.is_ok());
        assert!(result.unwrap().contains("Updated task list"));
    }

    #[test]
    fn test_router_execute_unknown_tool() {
        let router = ToolRouter::new();
        let input = serde_json::json!({});

        let result = router.execute("unknown_tool", &input);
        assert!(matches!(result, Err(ToolError::NotFound { .. })));
    }
}
