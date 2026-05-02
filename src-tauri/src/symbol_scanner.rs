use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SymbolInfo {
    pub name: String,
    pub kind: String,
    pub line: usize,
}

#[tauri::command]
pub async fn get_file_symbols(path: String) -> Result<Vec<SymbolInfo>, String> {
    println!("[SymbolScanner] Dynamic scanning: {}", path);

    let extension = Path::new(&path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let file = File::open(&path).map_err(|e| format!("{}: {}", e, path))?;
    let reader = BufReader::new(file);
    let mut symbols = Vec::new();

    // 🚀 v0.3.5: 动态语言配置引擎
    let (re_func, re_type) = match extension.as_str() {
        // Rust: fn, struct, enum, trait
        "rs" => (
            Regex::new(r"(?m)^\s*(?:pub(?:\(.*\))?\s+)?(?:async\s+)?fn\s+([a-zA-Z_][\w]*)").unwrap(),
            Regex::new(r"(?m)^\s*(?:pub(?:\(.*\))?\s+)?(?:struct|enum|type|trait)\s+([a-zA-Z_][\w]*)").unwrap()
        ),
        // Java/C#: public void Name(), class Name
        "java" | "cs" => (
            Regex::new(r"(?m)^\s*(?:public|private|protected|static|final|native|synchronized|abstract|default)\s+(?:[\w<>\?\[\]]+\s+)+([a-zA-Z_][\w]*)[\s\n]*\(").unwrap(),
            Regex::new(r"(?m)^\s*(?:public|private|protected)?\s*(?:class|interface|enum|@interface)\s+([a-zA-Z_][\w]*)").unwrap()
        ),
        // Python: def name(), class Name:
        "py" => (
            Regex::new(r"(?m)^\s*def\s+([a-zA-Z_][\w]*)[\s\n]*\(").unwrap(),
            Regex::new(r"(?m)^\s*class\s+([a-zA-Z_][\w]*)").unwrap()
        ),
        // Go: func name(), type Name struct
        "go" => (
            Regex::new(r"(?m)^\s*func\s+(?:\(.*\)\s+)?([a-zA-Z_][\w]*)[\s\n]*\(").unwrap(),
            Regex::new(r"(?m)^\s*type\s+([a-zA-Z_][\w]*)\s+(?:struct|interface)").unwrap()
        ),
        // JS/TS: function, const name = (), class, interface
        "js" | "ts" | "jsx" | "tsx" => (
            Regex::new(r"(?m)(?:function|const|let|var|async)\s+([a-zA-Z_][\w]*)[\s\n]*=?[\s\n]*(?:\(.*\)|async)?\s*=>|function\s+([a-zA-Z_][\w]*)").unwrap(),
            Regex::new(r"(?m)(?:class|interface|type|enum)\s+([a-zA-Z_][\w]*)").unwrap()
        ),
        // 默认通用兜底
        _ => (
            Regex::new(r"(?m)(?:fn|func|def|function)\s+([a-zA-Z_][\w]*)").unwrap(),
            Regex::new(r"(?m)(?:class|struct|interface|type)\s+([a-zA-Z_][\w]*)").unwrap()
        )
    };

    for (idx, line) in reader.lines().enumerate() {
        if let Ok(l) = line {
            let trimmed = l.trim();
            if trimmed.is_empty()
                || trimmed.starts_with("//")
                || trimmed.starts_with("#")
                || trimmed.starts_with("/*")
                || trimmed.starts_with("*")
            {
                continue;
            }

            if let Some(cap) = re_func.captures(trimmed) {
                // 提取第一个非空捕获组
                let name = cap
                    .get(1)
                    .or_else(|| cap.get(2))
                    .map(|m| m.as_str().to_string());
                if let Some(n) = name {
                    if !["if", "while", "for", "switch", "catch", "return"].contains(&n.as_str()) {
                        symbols.push(SymbolInfo {
                            name: n,
                            kind: "Function".into(),
                            line: idx + 1,
                        });
                    }
                }
            } else if let Some(cap) = re_type.captures(trimmed) {
                if let Some(n) = cap.get(1).map(|m| m.as_str().to_string()) {
                    symbols.push(SymbolInfo {
                        name: n,
                        kind: "Type".into(),
                        line: idx + 1,
                    });
                }
            }
        }
    }

    println!(
        "[SymbolScanner] Extracted {} symbols for .{}",
        symbols.len(),
        extension
    );
    Ok(symbols)
}
