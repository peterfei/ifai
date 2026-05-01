use crate::core_traits::ai::{Content, ContentPart, Message};
/**
 * Section 5.2: 会话笔记功能
 *
 * 自动从对话中提取和结构化关键信息
 */
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/**
 * 技术概念条目
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TechConcept {
    pub name: String,
    pub description: String,
    pub category: String, // "concept", "pattern", "algorithm", etc.
    pub mentions: usize,  // 提及次数
}

/**
 * 文件变更记录
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub path: String,
    pub action: String, // "created", "modified", "deleted"
    pub reason: String,
    pub timestamp: i64,
}

/**
 * 错误和修复记录
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorFix {
    pub error_message: String,
    pub error_type: String,
    pub solution: String,
    pub file_path: Option<String>,
    pub timestamp: i64,
}

/**
 * 待办任务
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoTask {
    pub id: String,
    pub description: String,
    pub status: String,   // "pending", "in_progress", "completed"
    pub priority: String, // "low", "medium", "high"
    pub created_at: i64,
}

/**
 * 会话笔记
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionNotes {
    pub session_id: String,
    pub project_root: String,
    pub started_at: i64,
    pub updated_at: i64,
    pub tech_concepts: Vec<TechConcept>,
    pub file_changes: Vec<FileChange>,
    pub error_fixes: Vec<ErrorFix>,
    pub todo_tasks: Vec<TodoTask>,
    pub summary: String,
}

impl SessionNotes {
    /**
     * 创建新的会话笔记
     */
    pub fn new(session_id: String, project_root: String) -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            session_id,
            project_root,
            started_at: now,
            updated_at: now,
            tech_concepts: Vec::new(),
            file_changes: Vec::new(),
            error_fixes: Vec::new(),
            todo_tasks: Vec::new(),
            summary: String::new(),
        }
    }

    /**
     * 添加技术概念
     */
    pub fn add_concept(&mut self, name: String, description: String, category: String) {
        // 检查是否已存在
        if let Some(concept) = self.tech_concepts.iter_mut().find(|c| c.name == name) {
            concept.mentions += 1;
        } else {
            self.tech_concepts.push(TechConcept {
                name,
                description,
                category,
                mentions: 1,
            });
        }
        self.updated_at = chrono::Utc::now().timestamp();
    }

    /**
     * 添加文件变更
     */
    pub fn add_file_change(&mut self, path: String, action: String, reason: String) {
        let now = chrono::Utc::now().timestamp();
        self.file_changes.push(FileChange {
            path,
            action,
            reason,
            timestamp: now,
        });
        self.updated_at = now;
    }

    /**
     * 添加错误修复记录
     */
    pub fn add_error_fix(
        &mut self,
        error_message: String,
        error_type: String,
        solution: String,
        file_path: Option<String>,
    ) {
        let now = chrono::Utc::now().timestamp();
        self.error_fixes.push(ErrorFix {
            error_message,
            error_type,
            solution,
            file_path,
            timestamp: now,
        });
        self.updated_at = now;
    }

    /**
     * 添加待办任务
     */
    pub fn add_todo_task(&mut self, description: String, priority: String) {
        let now = chrono::Utc::now().timestamp();
        let id = format!("todo_{}", now);
        self.todo_tasks.push(TodoTask {
            id,
            description,
            status: "pending".to_string(),
            priority,
            created_at: now,
        });
        self.updated_at = now;
    }

    /**
     * 更新待办任务状态
     */
    pub fn update_todo_status(&mut self, task_id: String, status: String) {
        if let Some(task) = self.todo_tasks.iter_mut().find(|t| t.id == task_id) {
            task.status = status;
            self.updated_at = chrono::Utc::now().timestamp();
        }
    }

    /**
     * 从对话消息中自动提取笔记
     */
    pub fn extract_from_messages(&mut self, messages: &[Message]) {
        for msg in messages {
            match &msg.content {
                Content::Text(text) => {
                    self.extract_from_text(text);
                }
                Content::Parts(parts) => {
                    for part in parts {
                        if let ContentPart::Text { text, .. } = part {
                            self.extract_from_text(text);
                        }
                    }
                }
            }
        }
    }

    /**
     * 从文本中提取关键信息
     */
    fn extract_from_text(&mut self, text: &str) {
        let lower_text = text.to_lowercase();

        // 🔥 改进：更智能的提取逻辑

        // 1. 提取错误信息
        if lower_text.contains("error")
            || lower_text.contains("failed")
            || lower_text.contains("错误")
            || lower_text.contains("失败")
        {
            if let Some(error_msg) = self.extract_error_message(text) {
                let error_type = self.detect_error_type(text);
                self.add_error_fix(
                    error_msg.clone(),
                    error_type,
                    "需要手动添加解决方案".to_string(),
                    None,
                );
            }
        }

        // 2. 提取待办任务
        if lower_text.contains("todo:")
            || lower_text.contains("待办")
            || lower_text.contains("需要")
            || lower_text.contains("TODO:")
            || lower_text.contains("fixme")
            || lower_text.contains("hack")
        {
            if let Some(task) = self.extract_todo_task(text) {
                self.add_todo_task(task, "medium".to_string());
            }
        }

        // 3. 🔥 改进：提取技术概念（更智能的实现）
        // 扩展关键词列表，包括更多技术栈
        let tech_keywords = vec![
            // 前端框架
            "React",
            "Vue",
            "Angular",
            "Svelte",
            "Solid",
            // 语言
            "TypeScript",
            "JavaScript",
            "Rust",
            "Go",
            "Python",
            "Java",
            "C++",
            "C#",
            // 框架和库
            "Tauri",
            "Vite",
            "Webpack",
            "Rollup",
            "Next.js",
            "Nuxt",
            "useState",
            "useEffect",
            "useRef",
            "useCallback",
            "useMemo",
            // 概念
            "组件",
            "函数",
            "模块",
            "接口",
            "类型",
            "类",
            "对象",
            "数组",
            "Hook",
            "Effect",
            "Context",
            "Reducer",
            "State",
            // 工具
            "Git",
            "Docker",
            "Kubernetes",
            "Linux",
            "Shell",
            "Bash",
            "API",
            "REST",
            "GraphQL",
            "gRPC",
            "WebSocket",
            // 数据库
            "SQL",
            "NoSQL",
            "MongoDB",
            "PostgreSQL",
            "MySQL",
            "Redis",
            // AI/ML
            "AI",
            "ML",
            "LLM",
            "GPT",
            "Claude",
            "Transformer",
            "Neural",
            // 测试
            "Jest",
            "Vitest",
            "Cypress",
            "Playwright",
            "Selenium",
            // 样式
            "CSS",
            "SCSS",
            "Tailwind",
            "Styled-components",
            // 构建工具
            "npm",
            "yarn",
            "pnpm",
            "bun",
            "Node.js",
        ];

        // 🔥 改进：更宽松的触发条件
        let has_tech_keyword = text.contains("实现")
            || text.contains("使用")
            || text.contains("调用")
            || text.contains("创建")
            || text.contains("添加")
            || text.contains("修改")
            || text.contains("删除")
            || text.contains("更新")
            || text.contains("配置")
            || text.contains("设置")
            || text.contains("安装")
            || text.contains("导入")
            || text.contains("导出")
            || text.contains("编写")
            || text.contains("实现")
            || text.contains("开发")
            || text.contains("调试")
            || lower_text.contains("use")
            || lower_text.contains("using")
            || lower_text.contains("implement")
            || lower_text.contains("create")
            || lower_text.contains("add")
            || lower_text.contains("modify")
            || lower_text.contains("config")
            || lower_text.contains("setup");

        // 如果消息包含技术相关动作，检查是否有技术关键词
        if has_tech_keyword {
            for keyword in tech_keywords {
                if text.contains(keyword) {
                    // 🔥 FIX: 避免重复添加相同概念
                    if !self.tech_concepts.iter().any(|c| c.name == keyword) {
                        self.add_concept(
                            keyword.to_string(),
                            format!("从对话中提取的{}相关概念", keyword),
                            "concept".to_string(),
                        );
                    }
                }
            }
        }

        // 🔥 新增：即使没有技术关键词，也记录有意义的对话内容
        // 如果消息长度超过50个字符且包含中文或英文，记录为一般概念
        if text.len() > 50 && self.tech_concepts.is_empty() {
            if text.contains("是")
                || text.contains("的")
                || text.contains("了")
                || lower_text.contains("is")
                || lower_text.contains("the")
            {
                // 提取第一个有意义的短语（简单的启发式方法）
                let meaningful_phrase =
                    if let Some(pos) = text.find(|c| c == '是' || c == '的' || c == '。') {
                        if pos > 5 && pos < 50 {
                            Some(text[..pos].to_string())
                        } else {
                            None
                        }
                    } else {
                        None
                    };

                if let Some(phrase) = meaningful_phrase {
                    if !self.tech_concepts.iter().any(|c| c.name == phrase) {
                        self.add_concept(
                            phrase.clone(),
                            format!("从对话中提取的关键内容"),
                            "concept".to_string(),
                        );
                    }
                }
            }
        }
    }

    /**
     * 提取错误消息
     */
    fn extract_error_message(&self, text: &str) -> Option<String> {
        // 查找错误模式
        if let Some(start) = text.find("Error:") {
            if let Some(end) = text[start..].find('\n') {
                return Some(text[start..start + end].trim().to_string());
            }
            return Some(text[start..].trim().to_string());
        }
        None
    }

    /**
     * 检测错误类型
     */
    fn detect_error_type(&self, text: &str) -> String {
        let lower = text.to_lowercase();
        if lower.contains("type") && lower.contains("error") {
            return "TypeError".to_string();
        }
        if lower.contains("reference") && lower.contains("error") {
            return "ReferenceError".to_string();
        }
        if lower.contains("syntax") && lower.contains("error") {
            return "SyntaxError".to_string();
        }
        if lower.contains("compil") {
            return "CompilationError".to_string();
        }
        "UnknownError".to_string()
    }

    /**
     * 提取待办任务
     */
    fn extract_todo_task(&self, text: &str) -> Option<String> {
        // 查找待办模式
        if let Some(start) = text.find("TODO:") {
            let task_text = if let Some(end) = text[start..].find('\n') {
                &text[start + 6..start + end]
            } else {
                &text[start + 6..]
            };
            return Some(task_text.trim().to_string());
        }
        None
    }

    /**
     * 生成摘要
     */
    pub fn generate_summary(&mut self) {
        let mut summary_parts = Vec::new();

        if !self.tech_concepts.is_empty() {
            summary_parts.push(format!("## 技术概念 ({}个)", self.tech_concepts.len()));
            for concept in &self.tech_concepts {
                summary_parts.push(format!("- {}: {}", concept.name, concept.description));
            }
        }

        if !self.file_changes.is_empty() {
            summary_parts.push(format!("\n## 文件变更 ({}次)", self.file_changes.len()));
            for change in &self.file_changes {
                summary_parts.push(format!("- {} ({})", change.path, change.action));
            }
        }

        if !self.error_fixes.is_empty() {
            summary_parts.push(format!("\n## 错误修复 ({}个)", self.error_fixes.len()));
            for fix in &self.error_fixes {
                summary_parts.push(format!("- {}: {}", fix.error_type, fix.solution));
            }
        }

        if !self.todo_tasks.is_empty() {
            summary_parts.push(format!("\n## 待办任务 ({}个)", self.todo_tasks.len()));
            for task in &self.todo_tasks {
                summary_parts.push(format!("- [{}] {}", task.status, task.description));
            }
        }

        self.summary = summary_parts.join("\n");
        self.updated_at = chrono::Utc::now().timestamp();
    }

    /**
     * 导出为 Markdown
     */
    pub fn to_markdown(&self) -> String {
        let mut md = String::new();

        md.push_str(&format!("# 会话笔记: {}\n\n", self.session_id));
        md.push_str(&format!("**项目**: {}\n", self.project_root));

        // 使用 DateTime::from_timestamp 替代 Utc::from_timestamp
        let start_datetime = chrono::DateTime::from_timestamp(self.started_at, 0)
            .unwrap_or_else(|| chrono::Utc::now());
        let updated_datetime = chrono::DateTime::from_timestamp(self.updated_at, 0)
            .unwrap_or_else(|| chrono::Utc::now());

        md.push_str(&format!("**开始时间**: {}\n", start_datetime.to_rfc3339()));
        md.push_str(&format!(
            "**更新时间**: {}\n\n",
            updated_datetime.to_rfc3339()
        ));

        md.push_str(&self.summary);

        md
    }

    /**
     * 从 JSON 导入
     */
    pub fn from_json(json: &str) -> Result<Self, String> {
        serde_json::from_str(json).map_err(|e| format!("Failed to parse notes JSON: {}", e))
    }

    /**
     * 导出为 JSON
     */
    pub fn to_json(&self) -> Result<String, String> {
        serde_json::to_string_pretty(self).map_err(|e| format!("Failed to serialize notes: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_session_notes() {
        let notes = SessionNotes::new("test_session".to_string(), "/tmp/test".to_string());

        assert_eq!(notes.session_id, "test_session");
        assert_eq!(notes.project_root, "/tmp/test");
        assert!(notes.tech_concepts.is_empty());
        assert!(notes.file_changes.is_empty());
        assert!(notes.error_fixes.is_empty());
        assert!(notes.todo_tasks.is_empty());
    }

    #[test]
    fn test_add_concept() {
        let mut notes = SessionNotes::new("test_session".to_string(), "/tmp/test".to_string());

        notes.add_concept(
            "React".to_string(),
            "前端框架".to_string(),
            "framework".to_string(),
        );

        assert_eq!(notes.tech_concepts.len(), 1);
        assert_eq!(notes.tech_concepts[0].name, "React");
        assert_eq!(notes.tech_concepts[0].mentions, 1);

        // 添加相同概念应该增加计数
        notes.add_concept(
            "React".to_string(),
            "前端框架".to_string(),
            "framework".to_string(),
        );

        assert_eq!(notes.tech_concepts.len(), 1);
        assert_eq!(notes.tech_concepts[0].mentions, 2);
    }

    #[test]
    fn test_add_file_change() {
        let mut notes = SessionNotes::new("test_session".to_string(), "/tmp/test".to_string());

        notes.add_file_change(
            "/src/main.rs".to_string(),
            "created".to_string(),
            "新功能实现".to_string(),
        );

        assert_eq!(notes.file_changes.len(), 1);
        assert_eq!(notes.file_changes[0].path, "/src/main.rs");
        assert_eq!(notes.file_changes[0].action, "created");
    }

    #[test]
    fn test_extract_error_message() {
        let notes = SessionNotes::new("test_session".to_string(), "/tmp/test".to_string());

        let text = "Error: Failed to compile\n  --> src/main.rs:10:5";
        let result = notes.extract_error_message(text);

        assert!(result.is_some());
        assert_eq!(result.unwrap(), "Error: Failed to compile");
    }

    #[test]
    fn test_detect_error_type() {
        let notes = SessionNotes::new("test_session".to_string(), "/tmp/test".to_string());

        assert_eq!(
            notes.detect_error_type("TypeError: Cannot read property 'x'"),
            "TypeError"
        );
        assert_eq!(
            notes.detect_error_type("SyntaxError: Unexpected token"),
            "SyntaxError"
        );
        assert_eq!(
            notes.detect_error_type("Some unknown error"),
            "UnknownError"
        );
    }
}
