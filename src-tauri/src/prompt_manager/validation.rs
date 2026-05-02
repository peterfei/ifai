use anyhow::{Context, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy)]
enum HandlebarsType {
    Double, // {{ }}
    Triple, // {{{ }}}
}

/**
 * 提示词验证模块
 *
 * 功能：
 * - 语法验证（Handlebars、Markdown）
 * - 花括号平衡检查
 * - YAML Front Matter 验证
 * - 安全检查（注入攻击检测）
 */

/// 验证错误类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    pub error_type: String,
    pub message: String,
    pub line: Option<usize>,
    pub column: Option<usize>,
    pub severity: ErrorSeverity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorSeverity {
    Error,
    Warning,
    Info,
}

/// 验证结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<ValidationError>,
}

/// 提示词验证器
pub struct PromptValidator;

impl PromptValidator {
    /// 完整验证提示词
    pub fn validate(content: &str) -> Result<ValidationResult> {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        // 1. YAML Front Matter 验证
        if let Err(e) = Self::validate_yaml_front_matter(content) {
            errors.push(e);
        }

        // 2. 花括号平衡检查
        if let Err(e) = Self::validate_braces_balance(content) {
            errors.push(e);
        }

        // 3. Handlebars 语法检查
        let handlebars_warnings = Self::validate_handlebars_syntax(content);
        warnings.extend(handlebars_warnings);

        // 4. 安全检查
        let security_warnings = Self::validate_security(content);
        warnings.extend(security_warnings);

        let is_valid = errors.is_empty();

        Ok(ValidationResult {
            is_valid,
            errors,
            warnings,
        })
    }

    /// 验证 YAML Front Matter
    fn validate_yaml_front_matter(content: &str) -> std::result::Result<(), ValidationError> {
        if !content.starts_with("---") {
            return Err(ValidationError {
                error_type: "yaml".to_string(),
                message: "提示词必须以 YAML Front Matter 开头 (---)".to_string(),
                line: Some(1),
                column: Some(1),
                severity: ErrorSeverity::Error,
            });
        }

        let parts: Vec<&str> = content.splitn(3, "---").collect();
        if parts.len() < 3 {
            return Err(ValidationError {
                error_type: "yaml".to_string(),
                message: "YAML Front Matter 格式错误：需要两个 --- 分隔符".to_string(),
                line: Some(1),
                column: Some(1),
                severity: ErrorSeverity::Error,
            });
        }

        let yaml_content = parts[1];
        if yaml_content.trim().is_empty() {
            return Err(ValidationError {
                error_type: "yaml".to_string(),
                message: "YAML Front Matter 不能为空".to_string(),
                line: Some(2),
                column: Some(1),
                severity: ErrorSeverity::Error,
            });
        }

        // 尝试解析 YAML
        serde_yaml::from_str::<serde_yaml::Value>(yaml_content).map_err(|e| ValidationError {
            error_type: "yaml".to_string(),
            message: format!("YAML 解析失败: {}", e),
            line: Some(2),
            column: None,
            severity: ErrorSeverity::Error,
        })?;

        Ok(())
    }

    /// 检查花括号平衡
    fn validate_braces_balance(content: &str) -> std::result::Result<(), ValidationError> {
        let mut stack = Vec::new();
        let mut chars = content.chars().enumerate().peekable();

        while let Some((idx, ch)) = chars.next() {
            match ch {
                '{' => {
                    // 检查是否是 Handlebars 的开始
                    let next_char = chars.peek();
                    if let Some(&(_, next)) = next_char {
                        if next == '{' {
                            // 这是 Handlebars 开始标记 {{{
                            chars.next(); // 消耗第二个 {
                            chars.next(); // 消耗第三个 {
                            stack.push((idx, HandlebarsType::Triple));
                        } else {
                            stack.push((idx, HandlebarsType::Double));
                        }
                    } else {
                        // 单个 {，可能是普通字符
                        continue;
                    }
                }
                '}' => {
                    // 检查前面的字符
                    let next_char = chars.peek();
                    if let Some(&(_, next)) = next_char {
                        if next == '}' {
                            chars.next(); // 消耗第二个 }
                            if let Some(&(_, next_next)) = chars.peek() {
                                if next_next == '}' {
                                    chars.next(); // 消耗第三个 }
                                    if let Some((start, HandlebarsType::Triple)) = stack.pop() {
                                        if start + 3 != idx {
                                            return Err(ValidationError {
                                                error_type: "braces".to_string(),
                                                message: format!("不匹配的 Handlebars 标记 {{{{ ... }}}}, 从第 {} 行开始", start + 1),
                                                line: Self::line_number(content, idx),
                                                column: Some(idx - content[..idx].rfind('\n').map_or(0, |p| idx - p - 1)),
                                                severity: ErrorSeverity::Error,
                                            });
                                        }
                                    } else {
                                        return Err(ValidationError {
                                            error_type: "braces".to_string(),
                                            message: "多余的 }}} 标记".to_string(),
                                            line: Self::line_number(content, idx),
                                            column: Some(
                                                idx - content[..idx]
                                                    .rfind('\n')
                                                    .map_or(0, |p| idx - p - 1),
                                            ),
                                            severity: ErrorSeverity::Error,
                                        });
                                    }
                                } else {
                                    // 这是 }}
                                    if let Some((_, HandlebarsType::Double)) = stack.pop() {
                                        // 正常的 }}
                                    } else if let Some((start, HandlebarsType::Triple)) =
                                        stack.last()
                                    {
                                        // 在 {{{ 后面遇到 }}
                                        return Err(ValidationError {
                                            error_type: "braces".to_string(),
                                            message: "Handlebars 标记不匹配：期望 }}} 但遇到 }}"
                                                .to_string(),
                                            line: Self::line_number(content, idx),
                                            column: Some(
                                                idx - content[..idx]
                                                    .rfind('\n')
                                                    .map_or(0, |p| idx - p - 1),
                                            ),
                                            severity: ErrorSeverity::Error,
                                        });
                                    }
                                }
                            } else {
                                // 字符串结束时的 }}
                                if let Some((_, HandlebarsType::Double)) = stack.pop() {
                                    // 正常的 }}
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        if !stack.is_empty() {
            let (start, _) = stack[0];
            Err(ValidationError {
                error_type: "braces".to_string(),
                message: format!("未闭合的 Handlebars 标记，从第 {} 行开始", start + 1),
                line: Self::line_number(content, start),
                column: None,
                severity: ErrorSeverity::Error,
            })
        } else {
            Ok(())
        }
    }

    /// 获取字符所在的行号（1-based）
    fn line_number(content: &str, index: usize) -> Option<usize> {
        content[..index]
            .chars()
            .filter(|&c| c == '\n')
            .count()
            .checked_add(1)
    }

    /// 验证 Handlebars 语法
    fn validate_handlebars_syntax(content: &str) -> Vec<ValidationError> {
        let mut warnings = Vec::new();

        // 检查未闭合的 {{ 标记（简单检查）
        let open_braces = content.matches("{{").count();
        let close_braces = content.matches("}}").count();

        // 注意：{{{ 和 }}} 也是有效的，所以这个检查可能不准确
        // 这里只做简单的警告
        if open_braces != close_braces {
            // 已经在 validate_braces_balance 中处理
        }

        // 检查常见的 Handlebars 错误
        // 1. {{#if}} 没有 {{/if}}
        let re_if = Regex::new(r"\{\{#if\s+([^}]+)\}\}").unwrap();
        let re_end_if = Regex::new(r"\{\{/if\}\}").unwrap();

        let if_count = re_if.find_iter(content).count();
        let end_if_count = re_end_if.find_iter(content).count();

        if if_count != end_if_count {
            warnings.push(ValidationError {
                error_type: "handlebars".to_string(),
                message: format!(
                    "{{#if}} 和 {{/if}} 数量不匹配：{} 个 #if，{} 个 /if",
                    if_count, end_if_count
                ),
                line: None,
                column: None,
                severity: ErrorSeverity::Warning,
            });
        }

        // 2. {{#each}} 没有 {{/each}}
        let re_each = Regex::new(r"\{\{#each\s+([^}]+)\}\}").unwrap();
        let re_end_each = Regex::new(r"\{\{/each\}\}").unwrap();

        let each_count = re_each.find_iter(content).count();
        let end_each_count = re_end_each.find_iter(content).count();

        if each_count != end_each_count {
            warnings.push(ValidationError {
                error_type: "handlebars".to_string(),
                message: format!(
                    "{{#each}} 和 {{/each}} 数量不匹配：{} 个 #each，{} 个 /each",
                    each_count, end_each_count
                ),
                line: None,
                column: None,
                severity: ErrorSeverity::Warning,
            });
        }

        warnings
    }

    /// 安全检查
    fn validate_security(content: &str) -> Vec<ValidationError> {
        let mut warnings = Vec::new();

        // 1. 检查潜在的注入攻击
        let dangerous_patterns = vec![
            ("<script", "可能的脚本注入"),
            ("javascript:", "可能的脚本注入"),
            ("onerror=", "可能的事件注入"),
            ("onload=", "可能的事件注入"),
            ("eval(", "可能的代码注入"),
        ];

        for (pattern, description) in dangerous_patterns {
            if content.to_lowercase().contains(pattern) {
                warnings.push(ValidationError {
                    error_type: "security".to_string(),
                    message: format!("检测到潜在的安全风险：{}", description),
                    line: None,
                    column: None,
                    severity: ErrorSeverity::Warning,
                });
            }
        }

        // 2. 检查过长的变量名（可能是错误的）
        let re_var = Regex::new(r"\{\{([a-zA-Z_]\w*)\}\}").unwrap();
        for cap in re_var.captures_iter(content) {
            let var_name = cap.get(1).unwrap().as_str();
            if var_name.len() > 50 {
                warnings.push(ValidationError {
                    error_type: "naming".to_string(),
                    message: format!("变量名过长 ({} 字符)：{}", var_name.len(), var_name),
                    line: None,
                    column: None,
                    severity: ErrorSeverity::Info,
                });
            }
        }

        warnings
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_valid_prompt() {
        let content = r#"---
name: "Test Prompt"
description: "A test prompt"
version: "1.0.0"
access_tier: "public"
variables: []
tools: []
---

This is a test prompt with {{variable}}."#;

        let result = PromptValidator::validate(content).unwrap();
        assert!(result.is_valid);
        assert_eq!(result.errors.len(), 0);
    }

    #[test]
    fn test_validate_missing_yaml() {
        let content = "This prompt has no YAML front matter";

        let result = PromptValidator::validate(content).unwrap();
        assert!(!result.is_valid);
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].error_type, "yaml");
    }

    #[test]
    fn test_validate_unmatched_braces() {
        let content = r#"---
name: "Test"
---

This has an unmatched {{variable."#;

        let result = PromptValidator::validate(content).unwrap();
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|e| e.error_type == "braces"));
    }

    #[test]
    fn test_validate_unmatched_if() {
        let content = r#"---
name: "Test"
---

{{#if condition}}
Some content
"#;

        let result = PromptValidator::validate(content).unwrap();
        assert!(result.is_valid); // 没有语法错误，但有警告
        assert!(result.warnings.iter().any(|e| e.error_type == "handlebars"));
    }

    #[test]
    fn test_validate_security_warning() {
        let content = r#"---
name: "Test"
---

Check out <script>alert('xss')</script>"#;

        let result = PromptValidator::validate(content).unwrap();
        assert!(result.warnings.iter().any(|e| e.error_type == "security"));
    }
}
