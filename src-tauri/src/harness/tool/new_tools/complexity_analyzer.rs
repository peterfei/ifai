//! 代码复杂度分析工具 - 使用 #[derive(Tool)] 宏
//!
//! 分析 Rust 代码的圈复杂度，识别高复杂度函数。
//! 用于代码审查工作流中的质量检查。

use tool_macro::Tool;
use std::collections::HashMap;

/// 复杂度分析工具
///
/// 分析指定文件的代码复杂度，识别需要重构的高复杂度函数
#[derive(Tool)]
#[tool(
    name = "complexity_analyzer",
    description = "分析 Rust 代码的圈复杂度，识别高复杂度函数",
    params(file_path: str, depth: int)
)]
pub struct ComplexityAnalyzer {
    #[tool(config)]
    /// 警告阈值（超过此值标记为警告）
    warning_threshold: u64,

    #[tool(state)]
    /// 分析过的文件数
    analyzed_count: usize,
}

impl ComplexityAnalyzer {
    /// 分析文件复杂度
    ///
    /// 扫描文件中的函数，计算圈复杂度，返回结构化报告
    pub fn execute_complexity_analyzer(&self, file_path: &str, depth: u64) -> Result<ComplexityReport, ComplexityError> {
        let content = std::fs::read_to_string(file_path)
            .map_err(|e| ComplexityError::FileReadError(format!("Cannot read '{}': {}", file_path, e)))?;

        let functions = self.extract_functions(&content, depth as usize);
        if functions.is_empty() {
            return Ok(ComplexityReport {
                file: file_path.to_string(),
                total_functions: 0,
                high_complexity: Vec::new(),
                summary: "No functions found in file.".to_string(),
            });
        }

        let high_risk: Vec<_> = functions.iter()
            .filter(|f| f.complexity >= self.warning_threshold)
            .cloned()
            .collect();

        let max_cx = functions.iter().map(|f| f.complexity).max().unwrap_or(0);
        let avg_cx = functions.iter().map(|f| f.complexity).sum::<u64>() as f64 / functions.len() as f64;

        let warning_count = high_risk.len();
        let total = functions.len();

        let summary = format!(
            "\
复杂度分析报告: {file}
  总函数数: {total}
  平均复杂度: {avg:.1}
  最大复杂度: {max_cx}
  高风险函数: {warning_count} 个 (阈值 > {threshold})
  建议: {suggestion}",
            file = file_path,
            total = total,
            avg = avg_cx,
            max_cx = max_cx,
            warning_count = warning_count,
            threshold = self.warning_threshold,
            suggestion = if warning_count > 0 {
                format!("发现 {} 个高复杂度函数，建议重构", warning_count)
            } else {
                "代码复杂度健康".to_string()
            },
        );

        Ok(ComplexityReport {
            file: file_path.to_string(),
            total_functions: total,
            high_complexity: high_risk,
            summary,
        })
    }

    /// 从源码中提取函数并估算复杂度
    fn extract_functions(&self, content: &str, _depth: usize) -> Vec<FunctionComplexity> {
        let mut functions = Vec::new();

        // 简单的基于行的复杂度估算
        // 遍历源码，检测函数定义并估算复杂度
        let lines: Vec<&str> = content.lines().collect();
        let mut i = 0;

        while i < lines.len() {
            let line = lines[i].trim();

            // 检测函数定义：fn name(...)
            if let Some(func_name) = self.extract_fn_name(line) {
                let mut body_start = i + 1;
                let mut brace_depth = 0;
                let mut found_body = false;

                // 找到函数体开始
                for j in i..lines.len() {
                    if lines[j].contains('{') {
                        body_start = j;
                        found_body = true;
                        break;
                    }
                }

                if found_body {
                    // 从函数体估算复杂度
                    let mut complexity: u64 = 1; // 基础复杂度
                    let mut line_count: usize = 0;

                    for j in body_start..lines.len() {
                        let body_line = lines[j].trim();

                        // 计算括号深度确定函数结束
                        brace_depth += body_line.matches('{').count();
                        brace_depth -= body_line.matches('}').count();

                        if brace_depth <= 0 {
                            // 函数结束（不计最后一行）
                            break;
                        }

                        line_count += 1;

                        // 复杂度增加关键字
                        let keywords = [
                            "if ", "else if ", "match ", "while ", "for ",
                            "&&", "||", "catch ", "loop {",
                        ];
                        for kw in &keywords {
                            if body_line.contains(kw) {
                                complexity += 1;
                                break;
                            }
                        }

                        // 嵌套的 match arm
                        if body_line.contains("=>") && body_line.contains("|") {
                            complexity += 1;
                        }
                    }

                    functions.push(FunctionComplexity {
                        name: func_name,
                        complexity,
                        line_count,
                        lines: (body_start + 1) as u64,
                    });
                }
            }

            i += 1;
        }

        functions
    }

    /// 从代码行中提取函数名
    fn extract_fn_name(&self, line: &str) -> Option<String> {
        let line = line.trim();
        // 匹配 pub fn name, fn name, pub async fn name, async fn name 等
        if line.starts_with("fn ")
            || line.starts_with("pub fn ")
            || line.starts_with("pub async fn ")
            || line.starts_with("async fn ")
            || line.starts_with("pub(crate) fn ")
        {
            let name_part = if line.starts_with("pub(crate) fn ") {
                line.strip_prefix("pub(crate) fn ")?
            } else if line.starts_with("pub async fn ") {
                line.strip_prefix("pub async fn ")?
            } else if line.starts_with("pub fn ") {
                line.strip_prefix("pub fn ")?
            } else if line.starts_with("async fn ") {
                line.strip_prefix("async fn ")?
            } else {
                line.strip_prefix("fn ")?
            };

            // 提取函数名（到第一个 ( 或 < 为止）
            let name = name_part.split(['(', '<', ' ']).next()?.to_string();
            if !name.is_empty() {
                return Some(name);
            }
        }
        None
    }
}

/// 函数复杂度信息
#[derive(Debug, Clone)]
pub struct FunctionComplexity {
    pub name: String,
    pub complexity: u64,
    pub line_count: usize,
    pub lines: u64,
}

/// 复杂度分析报告
#[derive(Debug, Clone)]
pub struct ComplexityReport {
    pub file: String,
    pub total_functions: usize,
    pub high_complexity: Vec<FunctionComplexity>,
    pub summary: String,
}

impl ComplexityReport {
    /// 格式化输出
    pub fn to_output_string(&self) -> String {
        let mut output = self.summary.clone();

        if !self.high_complexity.is_empty() {
            output.push_str("\n\n高风险函数详情:\n");
            for (idx, func) in self.high_complexity.iter().enumerate() {
                output.push_str(&format!(
                    "  {}. {} - 复杂度: {} ({} 行, L{})\n",
                    idx + 1, func.name, func.complexity, func.line_count, func.lines
                ));
            }
        }

        output
    }
}

/// 复杂度分析错误
#[derive(Debug, thiserror::Error)]
pub enum ComplexityError {
    #[error("File read error: {0}")]
    FileReadError(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_macro_attributes() {
        assert_eq!(ComplexityAnalyzer::TOOL_NAME, "complexity_analyzer");
        assert!(ComplexityAnalyzer::TOOL_DESCRIPTION.contains("复杂度"));
        assert_eq!(ComplexityAnalyzer::get_name(), "complexity_analyzer");
    }

    #[test]
    fn test_constructor() {
        let tool = ComplexityAnalyzer::new(10, 0);
        assert_eq!(tool.warning_threshold, 10);
        assert_eq!(tool.analyzed_count, 0);
    }

    #[test]
    fn test_extract_fn_name_simple() {
        let tool = ComplexityAnalyzer::new(10, 0);
        assert_eq!(tool.extract_fn_name("fn foo() {"), Some("foo".into()));
        assert_eq!(tool.extract_fn_name("pub fn bar(x: i32) -> i32 {"), Some("bar".into()));
        assert_eq!(tool.extract_fn_name("pub async fn baz() {"), Some("baz".into()));
    }

    #[test]
    fn test_extract_fn_name_none() {
        let tool = ComplexityAnalyzer::new(10, 0);
        assert_eq!(tool.extract_fn_name("struct Foo;"), None);
        assert_eq!(tool.extract_fn_name("impl Foo {"), None);
        assert_eq!(tool.extract_fn_name("// fn comment"), None);
    }

    #[test]
    fn test_extract_functions_simple() {
        let tool = ComplexityAnalyzer::new(10, 0);
        let code = r#"
fn simple() {
    let x = 1;
    let y = 2;
}

fn complex() {
    if x > 0 {
        if y > 0 {
            println!("nested");
        }
    }
    for item in list {
        println!("loop");
    }
}
"#;
        let functions = tool.extract_functions(code, 3);
        assert_eq!(functions.len(), 2);
        assert_eq!(functions[0].name, "simple");
        assert_eq!(functions[0].complexity, 1); // 只有基础复杂度
        assert!(functions[1].complexity > 1); // complex 有 if + for
    }

    #[test]
    fn test_analyze_complexity_file_not_found() {
        let tool = ComplexityAnalyzer::new(10, 0);
        let result = tool.execute_complexity_analyzer("/nonexistent/path.rs", 3);
        match result {
            Err(ComplexityError::FileReadError(msg)) => {
                assert!(msg.contains("nonexistent"));
            },
            other => panic!("Expected FileReadError, got: {:?}", other),
        }
    }

    #[test]
    fn test_analyze_complexity_real_file() {
        // 分析当前文件自身的复杂度
        let tool = ComplexityAnalyzer::new(10, 0);
        let result = tool.execute_complexity_analyzer("src/harness/tool/new_tools/git_diff.rs", 3);
        assert!(result.is_ok());
        let report = result.unwrap();
        assert!(report.total_functions > 0);
        assert!(report.summary.contains("复杂度分析报告"));
    }

    #[test]
    fn test_report_format() {
        let report = ComplexityReport {
            file: "test.rs".to_string(),
            total_functions: 5,
            high_complexity: vec![
                FunctionComplexity {
                    name: "complex_func".to_string(),
                    complexity: 15,
                    line_count: 30,
                    lines: 42,
                },
            ],
            summary: "测试报告".to_string(),
        };

        let output = report.to_output_string();
        assert!(output.contains("测试报告"));
        assert!(output.contains("complex_func"));
        assert!(output.contains("复杂度: 15"));
    }
}
