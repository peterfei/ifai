//! v0.2.8 终端错误解析命令
//!
//! 提供智能错误解析 API：
//! - 解析终端输出
//! - 生成修复上下文
//! - 错误分类和提取

use tauri::State;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

// ============================================================================
// 类型定义
// ============================================================================

/// 解析后的错误信息（前端使用的版本）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedErrorFrontend {
    /// 错误代码
    pub code: String,

    /// 错误消息
    pub message: String,

    /// 文件路径
    pub file: String,

    /// 行号
    pub line: u32,

    /// 列号
    pub column: Option<u32>,

    /// 错误级别
    pub level: String,

    /// 语言类型
    pub language: String,

    /// 原始错误行
    pub raw_line: String,
}

/// 修复上下文（前端使用的版本）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixContextFrontend {
    pub error_code: String,
    pub error_message: String,
    pub file_path: String,
    pub line_number: u32,
    pub column: Option<u32>,
    pub code_context: String,
    pub language: String,
}

/// 错误解析器状态
pub struct ErrorParserState {
    #[cfg(feature = "commercial")]
    parser: ifainew_core::error_parser::ErrorParser,

    #[cfg(not(feature = "commercial"))]
    parser: Option<()>,
}

impl ErrorParserState {
    pub fn new() -> anyhow::Result<Self> {
        #[cfg(feature = "commercial")]
        {
            Ok(Self {
                parser: ifainew_core::error_parser::ErrorParser::new()?,
            })
        }

        #[cfg(not(feature = "commercial"))]
        {
            Ok(Self {
                parser: None,
            })
        }
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// 解析终端输出，提取所有错误
#[tauri::command]
pub fn parse_terminal_errors(
    state: State<Mutex<ErrorParserState>>,
    output: String,
) -> Result<Vec<ParsedErrorFrontend>, String> {
    let _state = state.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    #[cfg(feature = "commercial")]
    {
        let errors = _state.parser.parse_terminal_output(&output);

        let frontend_errors: Vec<ParsedErrorFrontend> = errors
            .into_iter()
            .map(|e| ParsedErrorFrontend {
                code: e.code,
                message: e.message,
                file: e.file,
                line: e.line,
                column: e.column,
                level: format!("{:?}", e.level),
                language: format!("{:?}", e.language),
                raw_line: e.raw_line,
            })
            .collect();

        Ok(frontend_errors)
    }

    #[cfg(not(feature = "commercial"))]
    {
        // 社区版：提供基本的错误解析
        use regex::Regex;

        let re = Regex::new(r"(.+?):(\d+):(.+)?").unwrap();
        let mut errors = Vec::new();

        for line in output.lines() {
            if let Some(caps) = re.captures(line) {
                errors.push(ParsedErrorFrontend {
                    code: "ERROR".to_string(),
                    message: caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default(),
                    file: caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default(),
                    line: caps.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0),
                    column: None,
                    level: "Error".to_string(),
                    language: "Generic".to_string(),
                    raw_line: line.to_string(),
                });
            }
        }

        Ok(errors)
    }
}

/// 生成错误修复上下文
#[tauri::command]
pub fn generate_error_fix_context(
    state: State<Mutex<ErrorParserState>>,
    file_path: String,
    error_code: String,
    error_message: String,
    line: u32,
    column: Option<u32>,
    language: String,
    raw_line: String,
) -> Result<FixContextFrontend, String> {
    let _state = state.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    // 读取文件内容
    let path = PathBuf::from(&file_path);
    let file_content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    #[cfg(feature = "commercial")]
    {
        // 构造 ParsedError
        use ifainew_core::error_parser::{ParsedError, ErrorLevel, Language};

        let parsed_language = match language.as_str() {
            "Rust" => Language::Rust,
            "TypeScript" => Language::TypeScript,
            "JavaScript" => Language::JavaScript,
            "Python" => Language::Python,
            "Go" => Language::Go,
            "Java" => Language::Java,
            "Cpp" => Language::Cpp,
            _ => Language::Generic,
        };

        let parsed_level = match raw_line.to_lowercase().as_str() {
            l if l.contains("warning") => ErrorLevel::Warning,
            l if l.contains("note") => ErrorLevel::Note,
            l if l.contains("help") => ErrorLevel::Help,
            _ => ErrorLevel::Error,
        };

        let error = ParsedError {
            code: error_code.clone(),
            message: error_message.clone(),
            file: file_path.clone(),
            line,
            column,
            level: parsed_level,
            language: parsed_language,
            raw_line,
        };

        // 生成修复上下文
        let fix_context = _state.parser.generate_fix_context(&error, &file_content);

        Ok(FixContextFrontend {
            error_code: fix_context.error_code,
            error_message: fix_context.error_message,
            file_path: fix_context.file_path,
            line_number: fix_context.line_number,
            column: fix_context.column,
            code_context: fix_context.code_context,
            language: format!("{:?}", fix_context.language),
        })
    }

    #[cfg(not(feature = "commercial"))]
    {
        // 社区版：基本的上下文提取
        let lines: Vec<&str> = file_content.lines().collect();
        let line_idx = line.saturating_sub(1) as usize;
        let start = line_idx.saturating_sub(3);
        let end = (line_idx + 4).min(lines.len());
        let code_context = lines[start..end].join("\n");

        Ok(FixContextFrontend {
            error_code,
            error_message,
            file_path,
            line_number: line,
            column,
            code_context,
            language,
        })
    }
}

/// 快速解析单个错误行（用于实时错误高亮）
#[tauri::command]
pub fn quick_parse_error_line(
    state: State<Mutex<ErrorParserState>>,
    line: String,
) -> Result<Option<ParsedErrorFrontend>, String> {
    let _state = state.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    #[cfg(feature = "commercial")]
    {
        let errors = _state.parser.parse_terminal_output(&line);

        if errors.is_empty() {
            Ok(None)
        } else {
            let error = &errors[0];
            Ok(Some(ParsedErrorFrontend {
                code: error.code.clone(),
                message: error.message.clone(),
                file: error.file.clone(),
                line: error.line,
                column: error.column,
                level: format!("{:?}", error.level),
                language: format!("{:?}", error.language),
                raw_line: error.raw_line.clone(),
            }))
        }
    }

    #[cfg(not(feature = "commercial"))]
    {
        // 社区版：使用基本的正则解析
        use regex::Regex;
        let re = Regex::new(r"(.+?):(\d+):(.+)?").unwrap();

        if let Some(caps) = re.captures(&line) {
            Ok(Some(ParsedErrorFrontend {
                code: "ERROR".to_string(),
                message: caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default(),
                file: caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default(),
                line: caps.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0),
                column: None,
                level: "Error".to_string(),
                language: "Generic".to_string(),
                raw_line: line,
            }))
        } else {
            Ok(None)
        }
    }
}

/// 检测终端输出的语言类型
#[tauri::command]
pub fn detect_terminal_language(
    state: State<Mutex<ErrorParserState>>,
    output: String,
) -> Result<String, String> {
    let state = state.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    // 使用内部方法检测语言
    let language = if output.contains("error[E") || output.contains("Compiling") || output.contains("cargo ") {
        "Rust".to_string()
    } else if output.contains("npm ERR") || output.contains("node:") || output.contains(".ts:") {
        "TypeScript".to_string()
    } else if output.contains("Traceback") || output.contains("Python ") {
        "Python".to_string()
    } else if output.contains("go build") {
        "Go".to_string()
    } else if output.contains("javac") {
        "Java".to_string()
    } else {
        "Generic".to_string()
    };

    Ok(language)
}

/// 批量解析多个错误输出
#[tauri::command]
pub fn batch_parse_errors(
    state: State<Mutex<ErrorParserState>>,
    outputs: Vec<String>,
) -> Result<Vec<Vec<ParsedErrorFrontend>>, String> {
    let _state = state.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    let mut all_errors = Vec::new();

    #[cfg(feature = "commercial")]
    {
        for output in outputs {
            let errors = _state.parser.parse_terminal_output(&output);

            let frontend_errors: Vec<ParsedErrorFrontend> = errors
                .into_iter()
                .map(|e| ParsedErrorFrontend {
                    code: e.code,
                    message: e.message,
                    file: e.file,
                    line: e.line,
                    column: e.column,
                    level: format!("{:?}", e.level),
                    language: format!("{:?}", e.language),
                    raw_line: e.raw_line,
                })
                .collect();

            all_errors.push(frontend_errors);
        }
    }

    #[cfg(not(feature = "commercial"))]
    {
        use regex::Regex;
        let re = Regex::new(r"(.+?):(\d+):(.+)?").unwrap();

        for output in outputs {
            let mut errors = Vec::new();

            for line in output.lines() {
                if let Some(caps) = re.captures(line) {
                    errors.push(ParsedErrorFrontend {
                        code: "ERROR".to_string(),
                        message: caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default(),
                        file: caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default(),
                        line: caps.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0),
                        column: None,
                        level: "Error".to_string(),
                        language: "Generic".to_string(),
                        raw_line: line.to_string(),
                    });
                }
            }

            all_errors.push(errors);
        }
    }

    Ok(all_errors)
}

/// 获取错误的文件内容
#[tauri::command]
pub fn get_error_file_content(
    file_path: String,
    line: u32,
    context_lines: Option<u32>,
) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let lines: Vec<&str> = content.lines().collect();
    let ctx = context_lines.unwrap_or(3);

    let start = line.saturating_sub(ctx + 1) as usize;
    let end = (line + ctx).min(lines.len() as u32) as usize;

    if start >= lines.len() {
        return Ok(content);
    }

    let context_lines = lines[start..end].join("\n");
    Ok(context_lines)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_rust_error() {
        // Error parsing logic tested in error_parser.rs
        // This is just a placeholder for command-level tests
    }
}
