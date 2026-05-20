//! 工具注册表
//!
//! 集中管理所有工具的定义和注册。

use serde_json::json;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::RwLock;

use super::spec::{ToolPermissionMode, ToolSpec};

/// 全局工具注册表
pub struct ToolRegistry {
    tools: RwLock<BTreeMap<String, ToolSpec>>,
    permissions: RwLock<HashMap<String, ToolPermissionMode>>,
}

impl ToolRegistry {
    /// 创建新的工具注册表
    pub fn new() -> Self {
        let registry = Self {
            tools: RwLock::new(BTreeMap::new()),
            permissions: RwLock::new(HashMap::new()),
        };

        // 注册所有内置工具
        registry.register_builtin_tools();

        registry
    }

    /// 注册工具
    pub fn register(&self, spec: ToolSpec) {
        let mut tools = self.tools.write().unwrap();
        tools.insert(spec.name.to_string(), spec);
    }

    /// 获取工具规范
    pub fn get(&self, name: &str) -> Option<ToolSpec> {
        let tools = self.tools.read().unwrap();
        tools.get(name).cloned()
    }

    /// 获取所有工具
    pub fn all(&self) -> Vec<ToolSpec> {
        let tools = self.tools.read().unwrap();
        tools.values().cloned().collect()
    }

    /// 按权限过滤工具
    pub fn filter_by_permission(&self, max_permission: ToolPermissionMode) -> Vec<ToolSpec> {
        let tools = self.tools.read().unwrap();
        tools
            .values()
            .filter(|spec| spec.required_permission.level() <= max_permission.level())
            .cloned()
            .collect()
    }

    /// 设置工具的当前权限级别
    pub fn set_permission(&self, tool_name: &str, permission: ToolPermissionMode) {
        let mut permissions = self.permissions.write().unwrap();
        permissions.insert(tool_name.to_string(), permission);
    }

    /// 获取工具的当前权限级别
    pub fn get_permission(&self, tool_name: &str) -> Option<ToolPermissionMode> {
        let permissions = self.permissions.read().unwrap();
        permissions.get(tool_name).copied()
    }

    /// 注册所有内置工具
    fn register_builtin_tools(&self) {
        // 文件操作工具
        self.register(ToolSpec {
            name: "read_file",
            description: "Read the contents of a file",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" }
                },
                "required": ["path"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        self.register(ToolSpec {
            name: "write_file",
            description: "Write content to a file",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["path", "content"]
            }),
            required_permission: ToolPermissionMode::WorkspaceWrite,
        });

        self.register(ToolSpec {
            name: "edit_file",
            description: "Edit specific parts of a file",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "old_text": { "type": "string" },
                    "new_text": { "type": "string" }
                },
                "required": ["path", "old_text", "new_text"]
            }),
            required_permission: ToolPermissionMode::WorkspaceWrite,
        });

        // 搜索工具
        self.register(ToolSpec {
            name: "glob_search",
            description: "Search for files using glob patterns",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "pattern": { "type": "string" },
                    "path": { "type": "string" }
                },
                "required": ["pattern"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        self.register(ToolSpec {
            name: "grep_search",
            description: "Search for text in files",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "pattern": { "type": "string" },
                    "path": { "type": "string" }
                },
                "required": ["pattern"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        // 命令执行工具
        self.register(ToolSpec {
            name: "bash",
            description: "Execute bash commands",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "command": { "type": "string" }
                },
                "required": ["command"]
            }),
            required_permission: ToolPermissionMode::DangerFullAccess,
        });

        self.register(ToolSpec {
            name: "PowerShell",
            description: "Execute PowerShell commands (Windows)",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "command": { "type": "string" }
                },
                "required": ["command"]
            }),
            required_permission: ToolPermissionMode::DangerFullAccess,
        });

        // 网络工具
        self.register(ToolSpec {
            name: "WebFetch",
            description: "Fetch content from a URL",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "url": { "type": "string" }
                },
                "required": ["url"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        self.register(ToolSpec {
            name: "web_search",
            description: "Search the web using Bocha AI and return relevant results. Use this tool when user asks to search the internet, find information online, or look up current data.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query string"
                    },
                    "count": {
                        "type": "integer",
                        "description": "Number of results to return (default: 5, max: 50)",
                        "default": 5
                    }
                },
                "required": ["query"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        // 任务管理工具
        self.register(ToolSpec {
            name: "TodoWrite",
            description: "Create or update a task list for tracking work progress. Use this tool whenever the user asks you to create tasks, to-do items, task lists, or project plans. The tool accepts an array of task objects with content (task name), activeForm (active verb form like 'Doing X'), and optional status (pending/in_progress/completed).",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "todos": {
                        "type": "array",
                        "description": "Array of tasks to manage",
                        "items": {
                            "type": "object",
                            "properties": {
                                "activeForm": {
                                    "type": "string",
                                    "description": "The task in active/verb form (e.g., 'Implementing login feature')"
                                },
                                "content": {
                                    "type": "string",
                                    "description": "The task description in noun form (e.g., 'Implement login feature')"
                                },
                                "status": {
                                    "type": "string",
                                    "enum": ["pending", "in_progress", "completed"],
                                    "description": "Current status: 'pending' (not started), 'in_progress' (working on it), 'completed' (done). Default is 'pending'."
                                }
                            },
                            "required": ["content", "activeForm"]
                        }
                    }
                },
                "required": ["todos"]
            }),
            required_permission: ToolPermissionMode::WorkspaceWrite,
        });

        // 🆕 记忆管理工具
        // 🔥 MemorySave 使用 ReadOnly 权限（自动执行，无需用户审批）
        // 理由：只是写入本地 Markdown 文件，风险极低，应该流畅运行不打断对话
        self.register(ToolSpec {
            name: "MemorySave",
            description: "Save an important user preference, project knowledge, or decision to persistent memory. Use proactively when user states a clear preference or makes an important decision. Supports spatial metaphor paths like 'Preferences/programming-languages' or 'project/Preferences/programming-languages'.",
            input_schema: crate::memory::memory_save_schema(),
            required_permission: ToolPermissionMode::ReadOnly,  // 🔥 改为 ReadOnly 以自动执行
        });

        // 🆕 专用 Agent 工具
        self.register(ToolSpec {
            name: "explore_agent",
            description: "深度分析项目结构、模块依赖、设计模式。当用户请求分析项目架构、了解项目组织时使用此工具。",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "分析任务描述"
                    }
                },
                "required": ["task"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        self.register(ToolSpec {
            name: "review_agent",
            description: "审查代码质量、安全性、性能。当用户请求审查代码、检查问题时使用此工具。",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "files": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "要审查的文件列表"
                    }
                },
                "required": ["files"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        // 🆕 注册 WebSearch Agent 工具
        self.register(ToolSpec {
            name: "websearch_agent",
            description: "智能网络搜索 Agent，执行复杂的搜索任务并分析结果。当用户请求网络搜索、查找在线信息时使用此工具。",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索查询关键词"
                    }
                },
                "required": ["query"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        // 🆕 注册 Test Agent 工具
        self.register(ToolSpec {
            name: "test_agent",
            description: "测试智能体，自动生成测试用例、分析测试覆盖率、建议测试策略。当用户请求生成测试、分析测试覆盖、编写单元测试时使用此工具。",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "测试任务描述（如：为 src/lib.rs 生成单元测试）"
                    }
                },
                "required": ["task"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        // 🆕 注册 Doc Agent 工具
        self.register(ToolSpec {
            name: "doc_agent",
            description: "文档智能体，生成 API 文档、README、代码注释、使用指南。当用户请求生成文档、写文档注释、创建 README 时使用此工具。",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "文档任务描述（如：为 src/lib.rs 生成 API 文档）"
                    }
                },
                "required": ["task"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        // 🆕 注册 Debug Agent 工具
        self.register(ToolSpec {
            name: "debug_agent",
            description: "调试智能体，根据错误信息定位问题、分析根因、提供修复方案。当用户请求调试代码、分析错误、修复 bug 时使用此工具。",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "调试任务描述（如：调试 src/main.rs 的编译错误）"
                    }
                },
                "required": ["task"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        // 🆕 注册 Plan Agent 工具
        self.register(ToolSpec {
            name: "plan_agent",
            description: "任务规划智能体，将复杂任务拆解为可执行的子任务步骤。当用户请求制定计划、拆解任务时使用此工具。",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "规划任务描述（如：为用户登录功能制定实施计划）"
                    }
                },
                "required": ["task"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        // 🆕 注册 GitDiffTool（审查用差异分析工具）
        self.register(ToolSpec {
            name: "git_diff",
            description: "获取 Git 差异信息。只需传入基准提交（如 HEAD~1, main），即可返回代码变更内容。",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "base": {
                        "type": "string",
                        "description": "基准提交 SHA 或分支名（如 HEAD~1, main）"
                    }
                },
                "required": ["base"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        // 🆕 注册 code_review 工具（多维度代码审查）
        self.register(ToolSpec {
            name: "code_review",
            description: "多维度代码审查：安全、性能、代码质量。自动获取 git diff 上下文并生成结构化报告。",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "base": {
                        "type": "string",
                        "description": "基准提交 SHA 或分支名（默认为 HEAD~1）"
                    },
                    "path_filter": {
                        "type": "string",
                        "description": "可选的路径过滤"
                    }
                }
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        // Phase 6D: ReAct Agent 工具
        self.register(ToolSpec {
            name: "react_agent",
            description: "深度推理智能体，通过 Thought-Action-Observation 循环进行多步推理分析。当用户请求深度分析、逐步推理、全面分析时使用此工具。",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "推理任务描述（如：深度分析项目中的性能瓶颈）"
                    }
                },
                "required": ["task"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        // 🆕 注册 ComplexityAnalyzer（代码复杂度分析工具）
        self.register(ToolSpec {
            name: "complexity_analyzer",
            description: "分析 Rust 代码的圈复杂度，识别高复杂度函数，用于代码审查工作流。",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "要分析的 Rust 文件路径"
                    },
                    "depth": {
                        "type": "integer",
                        "description": "分析深度"
                    }
                },
                "required": ["file_path", "depth"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        // 🆕 Phase 3: 协作工具（v0.5.2）

        // call_agent_parallel - 并行调用多个 Agent
        self.register(ToolSpec {
            name: "call_agent_parallel",
            description: "并行调用多个 Agent 执行任务。当需要同时执行多个独立任务时使用此工具，如同时审查代码和生成测试。",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "calls": {
                        "type": "array",
                        "description": "要并行调用的 Agent 列表",
                        "items": {
                            "type": "object",
                            "properties": {
                                "agent_type": {
                                    "type": "string",
                                    "enum": ["explore_agent", "review_agent", "refactor_agent", "test_agent", "doc_agent", "debug_agent", "plan_agent", "git_commit_agent"],
                                    "description": "Agent 类型"
                                },
                                "task": {
                                    "type": "string",
                                    "description": "要传递给 Agent 的任务描述"
                                }
                            },
                            "required": ["agent_type", "task"]
                        }
                    }
                },
                "required": ["calls"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        // share_knowledge - 在 Agent 之间共享知识
        self.register(ToolSpec {
            name: "share_knowledge",
            description: "在 Agent 之间传递知识和中间结果。当需要将一个 Agent 的发现传递给下一个 Agent 时使用此工具。",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "from_agent": {
                        "type": "string",
                        "description": "发送知识的 Agent ID"
                    },
                    "to_agent": {
                        "type": "string",
                        "description": "接收知识的 Agent ID"
                    },
                    "knowledge": {
                        "type": "string",
                        "description": "要共享的知识内容"
                    }
                },
                "required": ["from_agent", "to_agent", "knowledge"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        // aggregate_results - 聚合多个 Agent 的结果
        self.register(ToolSpec {
            name: "aggregate_results",
            description: "聚合多个 Agent 的执行结果。支持三种策略：merge（合并所有结果）、vote（多数投票）、first（返回第一个成功结果）。",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "results": {
                        "type": "array",
                        "description": "要聚合的结果列表",
                        "items": {
                            "type": "object"
                        }
                    },
                    "strategy": {
                        "type": "string",
                        "enum": ["merge", "vote", "first"],
                        "description": "聚合策略：merge-合并所有结果，vote-多数投票，first-返回第一个成功结果"
                    }
                },
                "required": ["results", "strategy"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });

        // monitor_progress - 监控工作流进度
        self.register(ToolSpec {
            name: "monitor_progress",
            description: "监控协作任务的执行进度。支持获取当前状态和订阅进度更新。",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "workflow_id": {
                        "type": "string",
                        "description": "要监控的工作流 ID"
                    },
                    "action": {
                        "type": "string",
                        "enum": ["status", "subscribe"],
                        "description": "操作类型：status-获取当前状态，subscribe-订阅进度更新"
                    }
                },
                "required": ["workflow_id", "action"]
            }),
            required_permission: ToolPermissionMode::ReadOnly,
        });
    }

    /// 获取工具白名单（用于子 Agent）
    pub fn get_whitelist_for_permission(&self, permission: ToolPermissionMode) -> Vec<String> {
        self.filter_by_permission(permission)
            .into_iter()
            .map(|spec| spec.name.to_string())
            .collect()
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_registration() {
        let registry = ToolRegistry::new();

        // 检查内置工具已注册
        assert!(registry.get("read_file").is_some());
        assert!(registry.get("bash").is_some());
        assert!(registry.get("TodoWrite").is_some());

        // 🆕 检查专用 agent 工具已注册
        assert!(registry.get("explore_agent").is_some());
        assert!(registry.get("review_agent").is_some());
    }

    #[test]
    fn test_permission_filtering() {
        let registry = ToolRegistry::new();

        // 只读权限只能看到只读工具
        let readonly_tools = registry.filter_by_permission(ToolPermissionMode::ReadOnly);
        assert!(readonly_tools.iter().any(|t| t.name == "read_file"));
        assert!(!readonly_tools.iter().any(|t| t.name == "bash"));

        // 完全权限可以看到所有工具
        let all_tools = registry.filter_by_permission(ToolPermissionMode::DangerFullAccess);
        assert!(all_tools.iter().any(|t| t.name == "read_file"));
        assert!(all_tools.iter().any(|t| t.name == "bash"));
    }

    #[test]
    fn test_whitelist_generation() {
        let registry = ToolRegistry::new();

        let whitelist = registry.get_whitelist_for_permission(ToolPermissionMode::ReadOnly);
        assert!(whitelist.contains(&"read_file".to_string()));
        assert!(!whitelist.contains(&"bash".to_string()));
    }
}
