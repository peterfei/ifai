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
            name: "WebSearch",
            description: "Search the web",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string" }
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
