use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::fs;
use crate::prompt_manager::{PromptMetadata, PromptTemplate, BuiltinPrompts};
use crate::prompt_manager::storage;
use crate::prompt_manager::template;
use walkdir::WalkDir;

fn get_prompt_root(project_root: &str) -> PathBuf {
    PathBuf::from(project_root).join(".ifai/prompts")
}

#[tauri::command]
pub async fn list_prompts(project_root: String, locale: Option<String>, expert_mode: Option<bool>) -> Result<Vec<PromptTemplate>, String> {
    println!("[Backend] 📡 list_prompts called");
    println!("[Backend]   project_root: {}", project_root);
    println!("[Backend]   locale: {:?}", locale);
    println!("[Backend]   expert_mode: {:?}", expert_mode);

    let mut prompts_map = HashMap::new();
    let lang = locale.unwrap_or_else(|| "en".to_string());
    let lang_code = if lang.starts_with("zh") { "zh-CN" } else { "en" };
    let expert_mode_enabled = expert_mode.unwrap_or(false);

    let mut builtin_count = 0;
    let mut local_count = 0;

    // 1. Load Builtin Prompts with I18n Deduplication
    let builtin_iter: Vec<_> = BuiltinPrompts::iter().collect();
    println!("[Backend] 🔍 BuiltinPrompts iter returned {} files", builtin_iter.len());

    if builtin_iter.is_empty() {
        println!("[Backend] ⚠️  WARNING: BuiltinPrompts is empty! Checking fallback...");
        // Fallback: load from ifainew project directory
        let ifai_prompts_path = PathBuf::from("/Users/mac/project/aieditor/ifainew/.ifai/prompts");
        println!("[Backend] 📂 Checking ifai prompts path: {:?}", ifai_prompts_path);
        println!("[Backend]   Path exists: {}", ifai_prompts_path.exists());
    }

    for file_path in builtin_iter {
        if !file_path.ends_with(".md") { continue; }

        let path_str = file_path.as_ref();
        // 逻辑路径定义：移除语言前缀
        let logical_path = if path_str.starts_with("zh-CN/") {
            path_str[6..].to_string()
        } else if path_str.starts_with("en-US/") {
            path_str[6..].to_string()
        } else {
            path_str.to_string()
        };

        // 优先级：当前语言 > 默认版
        let is_current_lang = path_str.starts_with(lang_code);

        if !prompts_map.contains_key(&logical_path) || is_current_lang {
            if let Some(content_file) = BuiltinPrompts::get(path_str) {
                let content = std::str::from_utf8(content_file.data.as_ref()).unwrap_or("");
                if let Ok(mut template) = storage::load_prompt_from_str(content, None) {
                    template.path = Some(format!("builtin://{}", logical_path));
                    if logical_path.starts_with("system/") {
                        template.metadata.access_tier = crate::prompt_manager::AccessTier::Protected;
                    }
                    prompts_map.insert(logical_path.clone(), template);
                    builtin_count += 1;
                    println!("[Backend]   ✓ Loaded builtin: {} (lang: {})", logical_path, lang_code);
                }
            }
        }
    }

    println!("[Backend] 📦 Builtin prompts loaded: {}", builtin_count);
    println!("[Backend] 📁 Prompts map size after builtin: {}", prompts_map.len());

    // 2. Load Local Overrides (simplified for now to match logical paths)
    // Local prompts override builtin prompts
    let root = get_prompt_root(&project_root);
    println!("[Backend] 📂 Local prompt root: {:?} (exists: {})", root, root.exists());

    if root.exists() {
        for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
            if entry.path().is_file() && entry.path().extension().map_or(false, |ext| ext == "md") {
                if let Ok(rel) = entry.path().strip_prefix(&root) {
                    let rel_path = rel.to_string_lossy().to_string();
                    if let Ok(mut template) = storage::load_prompt(entry.path()) {
                        template.path = Some(rel_path.clone());
                        prompts_map.insert(rel_path.clone(), template);
                        local_count += 1;
                        println!("[Backend]   ✓ Loaded local: {}", rel_path);
                    } else {
                        println!("[Backend]   ✗ Failed to load: {:?}", rel);
                    }
                }
            }
        }
    } else {
        println!("[Backend] ⚠️  Local prompt root does not exist, skipping local prompts");
    }

    println!("[Backend] 📦 Local prompts loaded: {}", local_count);

    let mut result: Vec<_> = prompts_map.into_values().collect();

    // 3. Filter by access tier based on expert mode
    if !expert_mode_enabled {
        let before_count = result.len();
        result.retain(|p| p.metadata.access_tier != crate::prompt_manager::AccessTier::Private);
        let filtered_count = before_count - result.len();
        if filtered_count > 0 {
            println!("[Backend] 🔒 Filtered out {} Private tier prompts (expert mode: OFF)", filtered_count);
        }
    }

    result.sort_by(|a, b| a.metadata.name.cmp(&b.metadata.name));

    println!("[Backend] ✅ Returning {} prompts:", result.len());
    for p in &result {
        println!("[Backend]   - {} ({:?})", p.metadata.name, p.metadata.access_tier);
    }

    Ok(result)
}

#[tauri::command]
pub async fn get_prompt(project_root: String, path: String, locale: Option<String>) -> Result<PromptTemplate, String> {
    let lang = locale.unwrap_or_else(|| "en".to_string());
    let lang_code = if lang.starts_with("zh") { "zh-CN" } else { "en" };

    if path.starts_with("builtin://") {
        let logical_path = &path[10..];
        
        // Try current language first
        let i18n_path = format!("{}/{}", lang_code, logical_path);
        if let Some(content_file) = BuiltinPrompts::get(&i18n_path) {
            let content = std::str::from_utf8(content_file.data.as_ref()).unwrap_or("");
            return storage::load_prompt_from_str(content, Some(path)).map_err(|e| e.to_string());
        }

        // Try raw path
        if let Some(content_file) = BuiltinPrompts::get(logical_path) {
            let content = std::str::from_utf8(content_file.data.as_ref()).unwrap_or("");
            return storage::load_prompt_from_str(content, Some(path)).map_err(|e| e.to_string());
        }
        return Err("Builtin prompt not found".to_string());
    }

    let root = get_prompt_root(&project_root);
    // Local file loading logic
    let i18n_full_path = root.join(lang_code).join(&path);
    if i18n_full_path.exists() {
        return storage::load_prompt(&i18n_full_path).map_err(|e| e.to_string());
    }
    
    let full_path = root.join(&path);
    storage::load_prompt(&full_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_prompt(project_root: String, path: String, content: String, expert_mode: Option<bool>) -> Result<String, String> {
    let expert_mode_enabled = expert_mode.unwrap_or(false);

    // 权限检查：获取当前提示词的访问层级
    if path.starts_with("builtin://") {
        let logical_path = &path[10..];

        // 尝试加载内置提示词以检查其访问层级
        let lang_code = "en"; // 默认语言，可以扩展
        let i18n_path = format!("{}/{}", lang_code, logical_path);

        let access_tier = if let Some(content_file) = BuiltinPrompts::get(&i18n_path) {
            let content_str = std::str::from_utf8(content_file.data.as_ref()).unwrap_or("");
            if let Ok(template) = storage::load_prompt_from_str(content_str, None) {
                template.metadata.access_tier
            } else {
                crate::prompt_manager::AccessTier::Public
            }
        } else if let Some(content_file) = BuiltinPrompts::get(logical_path) {
            let content_str = std::str::from_utf8(content_file.data.as_ref()).unwrap_or("");
            if let Ok(template) = storage::load_prompt_from_str(content_str, None) {
                template.metadata.access_tier
            } else {
                crate::prompt_manager::AccessTier::Public
            }
        } else {
            crate::prompt_manager::AccessTier::Public
        };

        // 权限检查
        match access_tier {
            crate::prompt_manager::AccessTier::Private => {
                if !expert_mode_enabled {
                    return Err("Cannot edit private prompts without expert mode".to_string());
                }
            }
            crate::prompt_manager::AccessTier::Protected => {
                // Protected 提示词只能通过覆盖文件编辑
                // 继续下面的逻辑，会创建 .override.md 文件
            }
            crate::prompt_manager::AccessTier::Public => {
                // Public 提示词可以直接编辑
            }
        }
    }

    storage::validate_prompt_content(&content)?;
    let final_rel_path = if path.starts_with("builtin://") {
        let internal = &path[10..];
        // 对于内置提示词，总是创建覆盖文件
        internal.replace(".md", ".override.md")
    } else {
        path
    };
    let root = get_prompt_root(&project_root);
    let full_path = root.join(&final_rel_path);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(full_path, &content).map_err(|e| e.to_string())?;
    Ok(final_rel_path)
}

#[tauri::command]
pub async fn render_prompt_template(content: String, variables: HashMap<String, String>) -> Result<String, String> {
    template::render_template(&content, &variables).map_err(|e| e.to_string())
}

// === 版本管理命令 ===

use crate::prompt_manager::version::{PromptVersionManager, PromptVersion, VersionDiff};

// === 导入导出命令 ===

use crate::prompt_manager::export::{PromptExporter, PackageInfo, ImportResult};

/// 导出提示词到文件
#[tauri::command]
pub async fn export_prompts(
    project_root: String,
    prompt_paths: Vec<String>,
    package_info: PackageInfo,
    output_path: String,
) -> Result<String, String> {
    let exporter = PromptExporter::new(project_root).map_err(|e| e.to_string())?;
    exporter.export_prompts(prompt_paths, package_info, output_path).map_err(|e| e.to_string())
}

/// 从文件导入提示词
#[tauri::command]
pub async fn import_prompts(
    project_root: String,
    package_path: String,
    overwrite: bool,
) -> Result<ImportResult, String> {
    let exporter = PromptExporter::new(project_root).map_err(|e| e.to_string())?;
    exporter.import_prompts(package_path, overwrite).map_err(|e| e.to_string())
}

/// 获取可导出的提示词列表
#[tauri::command]
pub async fn list_exportable_prompts(project_root: String) -> Result<Vec<crate::prompt_manager::export::PromptExportMetadata>, String> {
    let exporter = PromptExporter::new(project_root).map_err(|e| e.to_string())?;
    exporter.list_available_prompts().map_err(|e| e.to_string())
}

/// 获取提示词版本历史
#[tauri::command]
pub async fn get_prompt_versions(project_root: String, prompt_path: String, limit: Option<usize>) -> Result<Vec<PromptVersion>, String> {
    let manager = PromptVersionManager::new(project_root)?;
    manager.get_versions(&prompt_path, limit)
}

/// 对比两个提示词版本
#[tauri::command]
pub async fn compare_prompt_versions(project_root: String, prompt_path: String, old_version: String, new_version: String) -> Result<VersionDiff, String> {
    let manager = PromptVersionManager::new(project_root)?;
    manager.compare_versions(&prompt_path, &old_version, &new_version)
}

/// 回滚提示词到指定版本
#[tauri::command]
pub async fn rollback_prompt(project_root: String, prompt_path: String, version_id: String) -> Result<String, String> {
    let manager = PromptVersionManager::new(project_root)?;
    manager.rollback(&prompt_path, &version_id)
}

/// 检查提示词文件是否已修改
#[tauri::command]
pub async fn is_prompt_modified(project_root: String, prompt_path: String) -> Result<bool, String> {
    let manager = PromptVersionManager::new(project_root)?;
    Ok(manager.is_file_modified(&prompt_path))
}

/// 读取 Git 状态
#[tauri::command]
pub async fn read_git_status(project_root: String) -> Option<String> {
    let manager = PromptVersionManager::new(project_root).ok()?;
    manager.read_git_status()
}

