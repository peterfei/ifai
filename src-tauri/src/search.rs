use grep::regex::RegexMatcher;
use grep::searcher::sinks::UTF8;
use grep::searcher::Searcher;
use ignore::WalkBuilder;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::command;

#[derive(Serialize, Clone, Debug)]
pub struct MatchResult {
    pub path: String,
    pub line_number: u64,
    pub content: String,
}

#[command]
pub async fn search_in_files(root_path: String, query: String) -> Result<Vec<MatchResult>, String> {
    grep_search(&root_path, &query).map_err(|e| e.to_string())
}

pub fn grep_search(root_path: &str, query: &str) -> anyhow::Result<Vec<MatchResult>> {
    let matches = Arc::new(Mutex::new(Vec::new()));
    let matches_clone = matches.clone();

    // Use ignore::WalkBuilder to respect .gitignore
    let walker = WalkBuilder::new(root_path).build();

    let matcher = RegexMatcher::new(query)?;

    for result in walker {
        match result {
            Ok(entry) => {
                if !entry.file_type().map_or(false, |ft| ft.is_file()) {
                    continue;
                }
                let path = entry.path();

                let matches_in_file = matches_clone.clone();
                let path_string = path.to_string_lossy().to_string();

                let _ = Searcher::new().search_path(
                    &matcher,
                    path,
                    UTF8(|ln, line| {
                        let mut m = matches_in_file.lock().unwrap();
                        if m.len() >= 1000 {
                            return Ok(false);
                        }
                        m.push(MatchResult {
                            path: path_string.clone(),
                            line_number: ln,
                            content: line.to_string(),
                        });
                        Ok(true)
                    }),
                );

                if matches_clone.lock().unwrap().len() >= 1000 {
                    break;
                }
            }
            Err(err) => eprintln!("Error walking directory: {}", err),
        }
    }

    let result = matches.lock().unwrap().clone();
    Ok(result)
}
