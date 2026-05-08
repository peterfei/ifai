//! 🔥 元编程驱动的参数验证
//!
//! 使用 serde 的自定义反序列化实现声明式验证，
//! 零运行时开销，类型安全。

use serde::{Deserialize, Deserializer, Serialize};
use std::fmt;
use crate::harness::task::{TaskItem, TaskStatus};

/// ✅ 验证过的 TodoWrite 请求
///
/// 🪄 元编程魔法：
/// - 通过自定义 Deserialize 实现，在反序列化时自动验证
/// - 无需手动调用 validate() 函数
/// - 编译时保证类型安全
#[derive(Debug, Clone, Serialize)]
pub struct ValidatedTodoWrite {
    pub todos: Vec<ValidatedTaskItem>,
}

/// 验证过的任务项
#[derive(Debug, Clone, Serialize)]
pub struct ValidatedTaskItem {
    pub content: String,
    pub active_form: String,
    pub status: String,
}

impl From<ValidatedTaskItem> for TaskItem {
    fn from(item: ValidatedTaskItem) -> Self {
        TaskItem {
            content: item.content,
            active_form: item.active_form,
            status: parse_status(&item.status),
        }
    }
}

fn parse_status(s: &str) -> TaskStatus {
    match s {
        "in_progress" => TaskStatus::InProgress,
        "completed" => TaskStatus::Completed,
        _ => TaskStatus::Pending,
    }
}

/// 🔥 自定义反序列化：验证逻辑嵌入其中
impl<'de> Deserialize<'de> for ValidatedTodoWrite {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct RawTodoWrite {
            todos: Vec<RawTaskItem>,
        }

        #[derive(Deserialize)]
        struct RawTaskItem {
            #[serde(rename = "content")]
            content: String,

            #[serde(rename = "activeForm")]
            active_form: String,

            #[serde(default = "default_status")]
            status: String,
        }

        fn default_status() -> String {
            "pending".to_string()
        }

        impl RawTaskItem {
            /// 🪄 声明式验证：一条规则 = 一行代码
            fn validate(self, index: usize) -> Result<ValidatedTaskItem, ValidationError> {
                // 规则 1: content 非空
                let content = self.content.trim();
                if content.is_empty() {
                    return Err(ValidationError::empty_content());
                }

                // 规则 2: content 最小长度
                if content.len() < 3 {
                    return Err(ValidationError::content_too_short(content.len()));
                }

                // 规则 3: activeForm 非空
                let active_form = self.active_form.trim();
                if active_form.is_empty() {
                    return Err(ValidationError::empty_active_form());
                }

                // 规则 4: activeForm 最小长度
                if active_form.len() < 3 {
                    return Err(ValidationError::active_form_too_short(active_form.len()));
                }

                // ✅ 所有验证通过
                Ok(ValidatedTaskItem {
                    content: content.to_string(),
                    active_form: active_form.to_string(),
                    status: self.status,
                })
            }
        }

        // 第一步：反序列化原始数据
        let raw = RawTodoWrite::deserialize(deserializer)?;

        // 第二步：验证 todos 数组非空
        if raw.todos.is_empty() {
            return Err(serde::de::Error::custom(
                "❌ 参数错误: todos 数组不能为空\n💡 建议修复: 至少包含一个任务",
            ));
        }

        // 第三步：验证每个任务项（映射验证）
        let todos = raw.todos
            .into_iter()
            .enumerate()
            .map(|(index, item)| {
                item.validate(index).map_err(|e| {
                    serde::de::Error::custom(format!(
                        "🔧 任务[{}] 验证失败:\n❌ {}\n💡 {}",
                        index, e.error, e.hint
                    ))
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        Ok(ValidatedTodoWrite { todos })
    }
}

/// 📋 验证错误（声明式定义）
#[derive(Debug)]
struct ValidationError {
    error: String,
    hint: String,
}

impl ValidationError {
    fn empty_content() -> Self {
        Self {
            error: "content 字段为空".to_string(),
            hint: "content 不能是空白字符串".to_string(),
        }
    }

    fn content_too_short(actual: usize) -> Self {
        Self {
            error: format!("content 长度为 {}，最小要求 3", actual),
            hint: "例如：\"添加测试\"".to_string(),
        }
    }

    fn empty_active_form() -> Self {
        Self {
            error: "activeForm 字段为空".to_string(),
            hint: "activeForm 不能是空白字符串".to_string(),
        }
    }

    fn active_form_too_short(actual: usize) -> Self {
        Self {
            error: format!("activeForm 长度为 {}，最小要求 3", actual),
            hint: "例如：\"添加测试中\"".to_string(),
        }
    }
}

// ============ 元编程：单元测试 ============

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_validate_empty_content() {
        let input = json!({
            "todos": [{
                "content": "",
                "activeForm": "Testing"
            }]
        });

        let result: Result<ValidatedTodoWrite, _> = serde_json::from_value(input);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("content 字段为空"));
    }

    #[test]
    fn test_validate_whitespace_only_content() {
        let input = json!({
            "todos": [{
                "content": "   ",
                "activeForm": "Testing"
            }]
        });

        let result: Result<ValidatedTodoWrite, _> = serde_json::from_value(input);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("content 字段为空"));
    }

    #[test]
    fn test_validate_content_too_short() {
        let input = json!({
            "todos": [{
                "content": "AB",
                "activeForm": "Testing"
            }]
        });

        let result: Result<ValidatedTodoWrite, _> = serde_json::from_value(input);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("content 长度为 2"));
        assert!(err.contains("最小要求 3"));
    }

    #[test]
    fn test_validate_empty_active_form() {
        let input = json!({
            "todos": [{
                "content": "Valid task",
                "activeForm": ""
            }]
        });

        let result: Result<ValidatedTodoWrite, _> = serde_json::from_value(input);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("activeForm 字段为空"));
    }

    #[test]
    fn test_validate_empty_todos_array() {
        let input = json!({
            "todos": []
        });

        let result: Result<ValidatedTodoWrite, _> = serde_json::from_value(input);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("todos 数组不能为空"));
    }

    #[test]
    fn test_validate_valid_input() {
        let input = json!({
            "todos": [{
                "content": "Valid task",
                "activeForm": "Valid tasking",
                "status": "pending"
            }]
        });

        let result: Result<ValidatedTodoWrite, _> = serde_json::from_value(input);
        assert!(result.is_ok());
        let validated = result.unwrap();
        assert_eq!(validated.todos.len(), 1);
        assert_eq!(validated.todos[0].content, "Valid task");
    }

    #[test]
    fn test_validate_multiple_tasks() {
        let input = json!({
            "todos": [
                {"content": "Task 1", "activeForm": "Task 1ing"},
                {"content": "Task 2", "activeForm": "Task 2ing"}
            ]
        });

        let result: Result<ValidatedTodoWrite, _> = serde_json::from_value(input);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().todos.len(), 2);
    }

    #[test]
    fn test_validate_with_default_status() {
        let input = json!({
            "todos": [{
                "content": "Valid task",
                "activeForm": "Valid tasking"
            }]
        });

        let result: Result<ValidatedTodoWrite, _> = serde_json::from_value(input);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().todos[0].status, "pending");
    }

    #[test]
    fn test_validate_preserves_whitespace_in_valid_content() {
        // 前后空白会被 trim，但内部空白保留
        let input = json!({
            "todos": [{
                "content": "  Valid task with spaces  ",
                "activeForm": "  Valid tasking  "
            }]
        });

        let result: Result<ValidatedTodoWrite, _> = serde_json::from_value(input);
        assert!(result.is_ok());
        let validated = result.unwrap();
        // trim() 后应该去掉前后空白
        assert_eq!(validated.todos[0].content, "Valid task with spaces");
        assert_eq!(validated.todos[0].active_form, "Valid tasking");
    }
}
