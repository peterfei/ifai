//! v0.2.8 符号索引与跨文件关联命令
//!
//! 实现深度上下文感知的符号索引系统：
//! - 商业版: 使用 ifainew-core 的 tree-sitter 引擎
//! - 社区版: 使用基础正则表达式兜底

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::command;
use serde::{Serialize, Deserialize};
use ignore::WalkBuilder;

// ============================================================================
// 类型定义 (兼容 ifainew-core)
// ============================================================================

/// 代码符号定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Symbol {
    pub kind: String,
    pub name: String,
    pub line: u32,
    pub end_line: Option<u32>,
    pub parent: Option<String>,
    pub qualified_name: String,
}

/// 单个文件的符号集合
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSymbols {
    pub path: String,
    pub symbols: Vec<Symbol>,
    pub hash: String,
}

/// 符号引用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolReference {
    pub symbol_name: String,
    pub defined_at: String,
    pub referenced_in: Vec<String>,
}

/// 项目索引结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectIndexResult {
    pub files_indexed: usize,
    pub symbols_found: usize,
}

// ============================================================================
// 全局符号索引状态
// ============================================================================

pub struct SymbolIndexState {
    /// 路径 -> 文件符号
    file_symbols: HashMap<String, FileSymbols>,

    /// 符号名 -> 定义位置 "path:line"
    definitions: HashMap<String, Vec<String>>,

    /// 符号名 -> 引用位置列表 "path:line"
    references: HashMap<String, Vec<String>>,
}

impl SymbolIndexState {
    pub fn new() -> Self {
        Self {
            file_symbols: HashMap::new(),
            definitions: HashMap::new(),
            references: HashMap::new(),
        }
    }

    /// 添加文件的符号到索引
    pub fn index_file(&mut self, file_symbols: FileSymbols) {
        let path = file_symbols.path.clone();

        // 保存文件符号
        self.file_symbols.insert(path.clone(), file_symbols.clone());

        // 建立定义索引
        for symbol in &file_symbols.symbols {
            self.definitions
                .entry(symbol.qualified_name.clone())
                .or_insert_with(Vec::new)
                .push(format!("{}:{}", path, symbol.line));
        }

        // TODO: 建立引用索引（需要解析符号引用）
        // 这需要更复杂的分析，暂时留空
    }

    /// 查找符号的所有引用
    pub fn find_references(&self, symbol_name: &str) -> Vec<SymbolReference> {
        let mut refs = Vec::new();

        if let Some(defs) = self.definitions.get(symbol_name) {
            for def_loc in defs {
                refs.push(SymbolReference {
                    symbol_name: symbol_name.to_string(),
                    defined_at: def_loc.clone(),
                    referenced_in: self.references.get(symbol_name).cloned().unwrap_or_default(),
                });
            }
        }

        refs
    }

    /// 查找 trait/interface 的所有实现
    pub fn find_implementations(&self, trait_name: &str) -> Vec<String> {
        let mut impls = Vec::new();

        for (path, file_symbols) in &self.file_symbols {
            for symbol in &file_symbols.symbols {
                // 检查是否是 impl 块并且包含 trait 名称
                if symbol.kind == "impl" && symbol.name.contains(trait_name) {
                    impls.push(format!("{}:{}", path, symbol.line));
                }
            }
        }

        impls
    }

    /// 清空索引
    pub fn clear(&mut self) {
        self.file_symbols.clear();
        self.definitions.clear();
        self.references.clear();
    }
}

impl Default for SymbolIndexState {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Tauri 命令
// ============================================================================

/// 提取单个文件的符号
#[command]
pub async fn extract_symbols(
    code: String,
    language: String,
    file_path: String,
) -> Result<Vec<Symbol>, String> {
    #[cfg(feature = "commercial")]
    {
        // 商业版：使用 ifainew-core
        use ifainew_core::symbols::extract_symbols as core_extract;

        core_extract(&code, &language, &file_path)
            .map_err(|e| e.to_string())
            .map(|core_symbols| {
                core_symbols.into_iter().map(|s| Symbol {
                    kind: s.kind,
                    name: s.name,
                    line: s.line,
                    end_line: s.end_line,
                    parent: s.parent,
                    qualified_name: s.qualified_name,
                }).collect()
            })
    }

    #[cfg(not(feature = "commercial"))]
    {
        // 社区版：使用本地 symbol_engine
        use crate::symbol_engine::extract_symbols_from_source as local_extract;

        let local_symbols = local_extract(&code, &language);

        Ok(local_symbols.into_iter().map(|s| Symbol {
            kind: s.kind,
            name: s.name.clone(),
            line: (s.range.start_line + 1) as u32,
            end_line: Some((s.range.end_line + 1) as u32),
            parent: None,
            qualified_name: s.name,
        }).collect())
    }
}

/// 索引整个项目的符号
#[command]
pub async fn index_project_symbols(
    state: tauri::State<'_, Arc<Mutex<SymbolIndexState>>>,
    root_path: String,
) -> Result<ProjectIndexResult, String> {
    // 先清空现有索引
    {
        let mut index_state = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        index_state.clear();
    }

    let mut files_indexed = 0;
    let mut symbols_found = 0;
    let mut indexed_files = Vec::new();

    // 遍历项目文件并提取符号（不持有锁）
    let walker = WalkBuilder::new(&root_path)
        .hidden(true)
        .git_ignore(true)
        .build();

    for result in walker {
        match result {
            Ok(entry) => {
                if !entry.file_type().map_or(false, |ft| ft.is_file()) {
                    continue;
                }

                let path = entry.path();
                let extension = path.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("");

                // 只索引支持的代码文件
                if !["rs", "ts", "tsx", "js", "jsx", "py"].contains(&extension) {
                    continue;
                }

                // 读取文件内容
                let content = match std::fs::read_to_string(path) {
                    Ok(c) => c,
                    Err(_) => continue,
                };

                // 计算文件哈希（在移动之前）
                let content_hash = format!("{:x}", md5::compute(&content));

                // 检测语言
                let language = detect_language_from_ext(extension);

                // 提取符号
                match extract_symbols(
                    content,
                    language.to_string(),
                    path.to_string_lossy().to_string(),
                ).await {
                    Ok(symbols) => {
                        let symbols_count = symbols.len();
                        if !symbols.is_empty() {
                            indexed_files.push(FileSymbols {
                                path: path.to_string_lossy().to_string(),
                                symbols,
                                hash: content_hash,
                            });
                            files_indexed += 1;
                            symbols_found += symbols_count;
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to extract symbols from {:?}: {}", path, e);
                    }
                }
            }
            Err(e) => {
                eprintln!("Walk error: {}", e);
            }
        }
    }

    // 最后批量更新索引（获取锁）
    {
        let mut index_state = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        for file_symbols in indexed_files {
            index_state.index_file(file_symbols);
        }
    }

    Ok(ProjectIndexResult {
        files_indexed,
        symbols_found,
    })
}

/// 查找符号的所有引用
#[command]
pub async fn find_symbol_references(
    state: tauri::State<'_, Arc<Mutex<SymbolIndexState>>>,
    symbol_name: String,
) -> Result<Vec<SymbolReference>, String> {
    let index_state = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(index_state.find_references(&symbol_name))
}

/// 查找 trait/interface 的所有实现
#[command]
pub async fn find_implementations(
    state: tauri::State<'_, Arc<Mutex<SymbolIndexState>>>,
    trait_name: String,
) -> Result<Vec<String>, String> {
    let index_state = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(index_state.find_implementations(&trait_name))
}

/// 清空符号索引
#[command]
pub async fn clear_symbol_index(
    state: tauri::State<'_, Arc<Mutex<SymbolIndexState>>>,
) -> Result<(), String> {
    let mut index_state = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    index_state.clear();
    Ok(())
}

// ============================================================================
// 辅助函数
// ============================================================================

/// 从文件扩展名检测语言
fn detect_language_from_ext(ext: &str) -> &str {
    match ext {
        "rs" => "rust",
        "ts" | "tsx" => "typescript",
        "js" | "jsx" => "javascript",
        "py" => "python",
        "go" => "go",
        "java" => "java",
        _ => "unknown",
    }
}

// ============================================================================
// 单元测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_language_from_ext() {
        assert_eq!(detect_language_from_ext("rs"), "rust");
        assert_eq!(detect_language_from_ext("ts"), "typescript");
        assert_eq!(detect_language_from_ext("tsx"), "typescript");
        assert_eq!(detect_language_from_ext("js"), "javascript");
        assert_eq!(detect_language_from_ext("py"), "python");
        assert_eq!(detect_language_from_ext("xyz"), "unknown");
    }

    #[test]
    fn test_symbol_index_state() {
        let mut state = SymbolIndexState::new();

        // 添加测试文件符号
        let file_symbols = FileSymbols {
            path: "test.rs".to_string(),
            symbols: vec![
                Symbol {
                    kind: "struct".to_string(),
                    name: "User".to_string(),
                    line: 1,
                    end_line: Some(5),
                    parent: None,
                    qualified_name: "User".to_string(),
                },
                Symbol {
                    kind: "function".to_string(),
                    name: "new".to_string(),
                    line: 2,
                    end_line: Some(4),
                    parent: Some("User".to_string()),
                    qualified_name: "User::new".to_string(),
                },
            ],
            hash: "abc123".to_string(),
        };

        state.index_file(file_symbols);

        // 验证定义索引
        assert!(state.definitions.contains_key("User"));
        assert!(state.definitions.contains_key("User::new"));

        // 验证引用查找
        let refs = state.find_references("User");
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].symbol_name, "User");
    }

    #[test]
    fn test_find_implementations() {
        let mut state = SymbolIndexState::new();

        // 添加 impl 块
        let file_symbols = FileSymbols {
            path: "user.rs".to_string(),
            symbols: vec![
                Symbol {
                    kind: "impl".to_string(),
                    name: "impl Authenticator for User".to_string(),
                    line: 10,
                    end_line: Some(15),
                    parent: None,
                    qualified_name: "User::Authenticator".to_string(),
                },
            ],
            hash: "abc123".to_string(),
        };

        state.index_file(file_symbols);

        let impls = state.find_implementations("Authenticator");
        assert_eq!(impls.len(), 1);
        assert!(impls[0].contains("user.rs"));
    }
}
