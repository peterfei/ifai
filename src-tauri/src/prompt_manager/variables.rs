use chrono::Local;
use std::collections::HashMap;
use std::path::Path;

pub fn collect_system_variables(project_root: &str) -> HashMap<String, String> {
    let mut vars = HashMap::new();

    // Project Name
    let project_name = Path::new(project_root)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown Project");
    vars.insert("PROJECT_NAME".to_string(), project_name.to_string());

    // CWD
    vars.insert("CWD".to_string(), project_root.to_string());

    // Date/Time
    let now = Local::now();
    vars.insert(
        "CURRENT_DATE".to_string(),
        now.format("%A, %B %d, %Y").to_string(),
    );
    vars.insert(
        "CURRENT_TIME".to_string(),
        now.format("%H:%M:%S").to_string(),
    );

    // User Info
    vars.insert("USER_NAME".to_string(), "Developer".to_string());

    vars
}
