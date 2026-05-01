use crate::analysis::SymbolProbe;
use regex::Regex;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

/**
 * 🏆 PIVO 3.0: Fast Stream Scanner
 * 基于流式读取和正则捕获的高性能探测引擎。
 */

pub fn probe_file_symbols(path: &Path) -> Result<Vec<SymbolProbe>, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);

    // 🏆 PIVO 3.0: 预定义核心符号正则组
    let re_class = Regex::new(r"(?:export\s+)?class\s+([a-zA-Z0-9_]+)").unwrap();
    let re_func = Regex::new(r"(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)").unwrap();
    let re_interface = Regex::new(r"(?:export\s+)?interface\s+([a-zA-Z0-9_]+)").unwrap();
    let re_const = Regex::new(r"export\s+(?:const|let)\s+([a-zA-Z0-9_]+)").unwrap();

    let mut probes = Vec::new();

    for (i, line_result) in reader.lines().enumerate() {
        let line = line_result.map_err(|e| e.to_string())?;
        let line_num = i + 1;
        let trimmed = line.trim();

        if trimmed.is_empty() || trimmed.starts_with("//") || trimmed.starts_with("/*") {
            continue;
        }

        // 执行原子捕获
        if let Some(cap) = re_class.captures(trimmed) {
            probes.push(SymbolProbe {
                name: cap[1].to_string(),
                kind: "class".to_string(),
                line: line_num,
                context: trimmed.to_string(),
            });
        } else if let Some(cap) = re_func.captures(trimmed) {
            probes.push(SymbolProbe {
                name: cap[1].to_string(),
                kind: "function".to_string(),
                line: line_num,
                context: trimmed.to_string(),
            });
        } else if let Some(cap) = re_interface.captures(trimmed) {
            probes.push(SymbolProbe {
                name: cap[1].to_string(),
                kind: "interface".to_string(),
                line: line_num,
                context: trimmed.to_string(),
            });
        } else if let Some(cap) = re_const.captures(trimmed) {
            probes.push(SymbolProbe {
                name: cap[1].to_string(),
                kind: "variable".to_string(),
                line: line_num,
                context: trimmed.to_string(),
            });
        }
    }

    Ok(probes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_probe_ts_symbols() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "import {{ foo }} from './bar';").unwrap();
        writeln!(file, "export class TestController {{").unwrap();
        writeln!(file, "  async function handleRequest() {{ }}").unwrap();
        writeln!(file, "}}").unwrap();
        writeln!(file, "export const API_KEY = '123';").unwrap();

        let probes = probe_file_symbols(file.path()).unwrap();

        assert!(probes
            .iter()
            .any(|p| p.name == "TestController" && p.kind == "class"));
        assert!(probes
            .iter()
            .any(|p| p.name == "handleRequest" && p.kind == "function"));
        assert!(probes
            .iter()
            .any(|p| p.name == "API_KEY" && p.kind == "variable"));
    }
}
