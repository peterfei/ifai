//! 搜索工具执行器
//!
//! 实现 Glob 和 Grep 搜索工具。

use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use glob::{glob as glob_pattern, Pattern};
use regex::Regex;

use super::super::{ToolError, ToolExecutor};

/// Grep 搜索结果
struct GrepResult {
    file: String,
    matches: Vec<(usize, String)>,
}

/// 搜索工具执行器
pub struct SearchToolsExecutor {
    allowed_tools: HashSet<String>,
}

impl SearchToolsExecutor {
    /// 创建新的搜索工具执行器
    pub fn new() -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("glob_search".to_string());
        allowed_tools.insert("grep_search".to_string());

        Self { allowed_tools }
    }

    /// 处理 glob_search 工具调用
    fn handle_glob_search(&self, input: &Value) -> Result<String, ToolError> {
        let pattern = input
            .get("pattern")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                ToolError::InvalidInput("Missing 'pattern' parameter".to_string())
            })?;

        let base_path = input
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or(".");

        let base = Path::new(base_path);
        if !base.exists() {
            return Err(ToolError::Execution(format!(
                "Base path does not exist: {}",
                base_path
            )));
        }

        // 构建完整的 glob 模式
        let full_pattern = if base_path == "." {
            pattern.to_string()
        } else {
            format!("{}/{}", base_path.trim_end_matches('/'), pattern)
        };

        // 执行 glob 搜索
        let mut matches = Vec::new();
        let mut error_count = 0;

        for entry in glob_pattern(&full_pattern)
            .map_err(|e| ToolError::Execution(format!("Invalid glob pattern: {}", e)))?
        {
            match entry {
                Ok(path) => {
                    if let Some(path_str) = path.to_str() {
                        matches.push(path_str.to_string());
                    }
                }
                Err(e) => {
                    error_count += 1;
                    eprintln!("Glob error: {}", e);
                }
            }
        }

        if matches.is_empty() {
            return Ok(format!(
                "🔍 Glob search: '{}'\n📂 Base: {}\n❌ No matches found",
                pattern, base_path
            ));
        }

        // 格式化结果
        let mut result = format!(
            "🔍 Glob search: '{}'\n📂 Base: {}\n\n✅ Found {} file(s):\n",
            pattern,
            base_path,
            matches.len()
        );

        for (i, path) in matches.iter().enumerate() {
            result.push_str(&format!("  [{}] {}\n", i + 1, path));
        }

        if error_count > 0 {
            result.push_str(&format!("\n⚠️  {} error(s) occurred during search", error_count));
        }

        Ok(result)
    }

    /// 处理 grep_search 工具调用
    fn handle_grep_search(&self, input: &Value) -> Result<String, ToolError> {
        let pattern = input
            .get("pattern")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                ToolError::InvalidInput("Missing 'pattern' parameter".to_string())
            })?;

        let base_path = input
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or(".");

        let base = Path::new(base_path);
        if !base.exists() {
            return Err(ToolError::Execution(format!(
                "Base path does not exist: {}",
                base_path
            )));
        }

        // 创建正则表达式
        let regex = Regex::new(pattern).map_err(|e| {
            ToolError::Execution(format!("Invalid regex pattern: {}", e))
        })?;

        let mut results: Vec<GrepResult> = Vec::new();

        // 遍历目录
        if base.is_file() {
            // 单个文件
            self.search_file(&base, &regex, &mut results)?;
        } else {
            // 目录
            self.search_directory(&base, &regex, &mut results)?;
        }

        if results.is_empty() {
            return Ok(format!(
                "🔍 Grep search: '{}'\n📂 Path: {}\n❌ No matches found",
                pattern, base_path
            ));
        }

        // 格式化结果
        let mut total_matches = 0;
        let mut output = format!(
            "🔍 Grep search: '{}'\n📂 Path: {}\n\n",
            pattern, base_path
        );

        for result in &results {
            output.push_str(&format!("📄 {} ({} matches):\n", result.file, result.matches.len()));
            total_matches += result.matches.len();

            for (line_num, line) in &result.matches {
                output.push_str(&format!("  [L{}] {}\n", line_num, line.trim()));
            }
            output.push('\n');
        }

        output.push_str(&format!("📊 Total: {} matches in {} file(s)", total_matches, results.len()));

        Ok(output)
    }

    /// 搜索单个文件
    fn search_file(
        &self,
        path: &Path,
        regex: &Regex,
        results: &mut Vec<GrepResult>,
    ) -> Result<(), ToolError> {
        let file_path = path.to_string_lossy().to_string();

        // 读取文件内容
        let content = fs::read_to_string(path).map_err(|e| {
            ToolError::Execution(format!("Failed to read file '{}': {}", file_path, e))
        })?;

        // 遍历文件行并使用正则表达式匹配
        let mut matches = Vec::new();
        for (line_num, line) in content.lines().enumerate() {
            if regex.is_match(line) {
                matches.push(((line_num + 1) as usize, line.to_string()));
            }
        }

        if !matches.is_empty() {
            results.push(GrepResult {
                file: file_path,
                matches,
            });
        }

        Ok(())
    }

    /// 搜索目录
    fn search_directory(
        &self,
        dir: &Path,
        regex: &Regex,
        results: &mut Vec<GrepResult>,
    ) -> Result<(), ToolError> {
        let entries = fs::read_dir(dir).map_err(|e| {
            ToolError::Execution(format!("Failed to read directory '{}': {}", dir.display(), e))
        })?;

        for entry in entries {
            let entry = entry.map_err(|e| {
                ToolError::Execution(format!("Failed to read directory entry: {}", e))
            })?;

            let path = entry.path();

            // 跳过隐藏文件和常见忽略目录
            if let Some(name) = path.file_name() {
                let name_str = name.to_string_lossy();
                if name_str.starts_with('.')
                    || name_str == "node_modules"
                    || name_str == "target"
                    || name_str == "dist"
                    || name_str == "build"
                {
                    continue;
                }
            }

            if path.is_file() {
                // 只搜索文本文件
                if let Some(ext) = path.extension() {
                    let ext_str = ext.to_string_lossy();
                    // 常见文本文件扩展名
                    let is_text = matches!(
                        ext_str.as_ref(),
                        "rs" | "js" | "ts" | "tsx" | "jsx" | "py" | "go" | "java"
                            | "c" | "cpp" | "h" | "hpp" | "cs" | "rb" | "php"
                            | "sh" | "bash" | "zsh" | "fish" | "json" | "toml"
                            | "yaml" | "yml" | "xml" | "md" | "txt" | "html"
                            | "css" | "scss" | "less" | "sql" | "r" | "lua"
                    );
                    if is_text {
                        self.search_file(&path, regex, results)?;
                    }
                }
            } else if path.is_dir() {
                self.search_directory(&path, regex, results)?;
            }
        }

        Ok(())
    }
}

impl ToolExecutor for SearchToolsExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "glob_search" => self.handle_glob_search(input),
            "grep_search" => self.handle_grep_search(input),
            _ => Err(ToolError::NotFound {
                name: name.to_string(),
            }),
        }
    }

    fn is_available(&self, name: &str) -> bool {
        self.allowed_tools.contains(name)
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

impl Default for SearchToolsExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_glob_search_files() {
        let temp_dir = TempDir::new().unwrap();

        // 创建测试文件
        let test_file1 = temp_dir.path().join("test1.rs");
        let test_file2 = temp_dir.path().join("test2.rs");
        fs::write(&test_file1, "content 1").unwrap();
        fs::write(&test_file2, "content 2").unwrap();

        let mut executor = SearchToolsExecutor::new();
        let input = serde_json::json!({
            "pattern": "*.rs",
            "path": temp_dir.path().to_string_lossy().to_string()
        });

        let result = executor.execute("glob_search", &input);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.contains("Found 2 file(s)"));
    }

    #[test]
    fn test_allowed_tools() {
        let mut executor = SearchToolsExecutor::new();
        assert!(executor.is_available("glob_search"));
        assert!(executor.is_available("grep_search"));
        assert!(!executor.is_available("read_file"));
    }
}
