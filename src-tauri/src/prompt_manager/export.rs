use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/**
 * 提示词导出和导入模块
 *
 * 功能：
 * - 导出提示词为 ZIP 包
 * - 从 ZIP 包导入提示词
 * - 版本兼容性检查
 * - 覆盖逻辑处理
 */

/// 提示词包导出项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptExportItem {
    pub name: String,
    pub path: String,
    pub content: String,
    pub metadata: PromptExportMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptExportMetadata {
    pub name: String,
    pub description: String,
    pub version: String,
    pub author: Option<String>,
    pub access_tier: String,
    pub variables: Vec<String>,
    pub tools: Vec<String>,
}

/// 提示词包
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptPackage {
    pub package_info: PackageInfo,
    pub prompts: Vec<PromptExportItem>,
    pub exported_at: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageInfo {
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub ifai_version: String,
}

/// 导入结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported: Vec<String>,
    pub skipped: Vec<String>,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

/// 提示词导出器
pub struct PromptExporter {
    project_root: PathBuf,
}

impl PromptExporter {
    pub fn new(project_root: String) -> Result<Self> {
        let root = PathBuf::from(&project_root);

        if !root.exists() {
            return Err(anyhow::anyhow!("项目根目录不存在: {}", project_root));
        }

        Ok(Self { project_root: root })
    }

    /// 导出提示词到 ZIP 文件
    pub fn export_prompts(
        &self,
        prompt_paths: Vec<String>,
        package_info: PackageInfo,
        output_path: String,
    ) -> Result<String> {
        // 1. 读取所有提示词
        let mut export_items = Vec::new();

        for path in &prompt_paths {
            let prompt_path = self.project_root.join(".ifai/prompts").join(path);

            if !prompt_path.exists() {
                return Err(anyhow::anyhow!("提示词文件不存在: {}", path));
            }

            let content = fs::read_to_string(&prompt_path)
                .with_context(|| format!("读取提示词失败: {}", path))?;

            // 解析 metadata（从 YAML Front Matter）
            let metadata = self.parse_metadata(&content, path)?;

            export_items.push(PromptExportItem {
                name: metadata.name.clone(),
                path: path.clone(),
                content,
                metadata,
            });
        }

        // 2. 创建提示词包
        let package = PromptPackage {
            package_info,
            prompts: export_items,
            exported_at: Utc::now().to_rfc3339(),
            version: "1.0.0".to_string(),
        };

        // 3. 序列化为 JSON
        let json = serde_json::to_string_pretty(&package).with_context(|| "序列化提示词包失败")?;

        // 4. 写入文件（暂时使用 JSON，后续可改为 ZIP）
        let output_file = PathBuf::from(output_path);

        // 确保输出目录存在
        if let Some(parent) = output_file.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("创建输出目录失败: {:?}", parent))?;
        }

        fs::write(&output_file, json)
            .with_context(|| format!("写入导出文件失败: {:?}", output_file))?;

        Ok(format!(
            "成功导出 {} 个提示词到 {}",
            prompt_paths.len(),
            output_file.display()
        ))
    }

    /// 从文件导入提示词
    pub fn import_prompts(&self, package_path: String, overwrite: bool) -> Result<ImportResult> {
        let package_file = PathBuf::from(&package_path);

        if !package_file.exists() {
            return Err(anyhow::anyhow!("包文件不存在: {}", package_path));
        }

        // 1. 读取并解析包
        let json = fs::read_to_string(&package_file)
            .with_context(|| format!("读取包文件失败: {}", package_path))?;

        let package: PromptPackage =
            serde_json::from_str(&json).with_context(|| "解析提示词包失败")?;

        // 2. 版本兼容性检查
        self.check_version_compatibility(&package)?;

        // 3. 导入提示词
        let mut imported = Vec::new();
        let mut skipped = Vec::new();
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        let prompts_dir = self.project_root.join(".ifai/prompts");

        for item in &package.prompts {
            let prompt_path = prompts_dir.join(&item.path);

            // 检查文件是否已存在
            if prompt_path.exists() && !overwrite {
                skipped.push(item.name.clone());
                warnings.push(format!(
                    "提示词 '{}' 已存在，跳过（使用 overwrite=true 覆盖）",
                    item.name
                ));
                continue;
            }

            // 确保目录存在
            if let Some(parent) = prompt_path.parent() {
                fs::create_dir_all(parent)
                    .with_context(|| format!("创建目录失败: {:?}", parent))?;
            }

            // 写入文件
            fs::write(&prompt_path, &item.content)
                .with_context(|| format!("写入提示词失败: {}", item.name))?;

            imported.push(item.name.clone());
        }

        Ok(ImportResult {
            imported,
            skipped,
            errors,
            warnings,
        })
    }

    /// 解析提示词的 YAML Front Matter
    fn parse_metadata(&self, content: &str, path: &str) -> Result<PromptExportMetadata> {
        // 查找 YAML Front Matter
        if !content.starts_with("---") {
            return Err(anyhow::anyhow!("提示词缺少 YAML Front Matter: {}", path));
        }

        let parts: Vec<&str> = content.splitn(3, "---").collect();
        if parts.len() < 3 {
            return Err(anyhow::anyhow!("YAML Front Matter 格式错误: {}", path));
        }

        let yaml_content = parts[1];

        // 解析 YAML
        let metadata: PromptExportMetadata = serde_yaml::from_str(yaml_content)
            .with_context(|| format!("解析 YAML Front Matter 失败: {}", path))?;

        Ok(metadata)
    }

    /// 检查版本兼容性
    fn check_version_compatibility(&self, package: &PromptPackage) -> Result<()> {
        // 检查包版本
        if package.version != "1.0.0" {
            return Err(anyhow::anyhow!(
                "不支持的包版本: {}. 当前支持版本: 1.0.0",
                package.version
            ));
        }

        // 检查 ifai 版本兼容性
        let supported_versions = vec!["0.3.0", "0.3.1", "0.3.2"];
        if !supported_versions.contains(&package.package_info.ifai_version.as_str()) {
            return Err(anyhow::anyhow!(
                "IfAI 版本不兼容: 包版本 {}, 当前支持: {:?}",
                package.package_info.ifai_version,
                supported_versions
            ));
        }

        Ok(())
    }

    /// 获取提示词列表（用于导出选择）
    pub fn list_available_prompts(&self) -> Result<Vec<PromptExportMetadata>> {
        let prompts_dir = self.project_root.join(".ifai/prompts");

        if !prompts_dir.exists() {
            return Ok(Vec::new());
        }

        let mut prompts = Vec::new();

        // 递归查找所有 .md 文件
        self.scan_directory(&prompts_dir, &mut prompts)?;

        Ok(prompts)
    }

    fn scan_directory(&self, dir: &Path, prompts: &mut Vec<PromptExportMetadata>) -> Result<()> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_dir() {
                self.scan_directory(&path, prompts)?;
            } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
                // 读取并解析提示词
                let content = fs::read_to_string(&path)?;

                // 获取相对路径
                let rel_path = path
                    .strip_prefix(&self.project_root)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| path.display().to_string());

                match self.parse_metadata(&content, &rel_path) {
                    Ok(metadata) => prompts.push(metadata),
                    Err(e) => {
                        eprintln!("警告: 跳过文件 {} - {}", rel_path, e);
                    }
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_export_import_prompts() {
        // 创建临时目录
        let temp_dir = TempDir::new().unwrap();
        let project_root = temp_dir.path().to_string_lossy().to_string();

        // 创建测试提示词
        let prompts_dir = temp_dir.path().join(".ifai/prompts");
        fs::create_dir_all(&prompts_dir).unwrap();

        let test_prompt = r#"---
name: "Test Prompt"
description: "A test prompt"
version: "1.0.0"
access_tier: "public"
variables: []
tools: []
---

This is a test prompt."#;

        fs::write(prompts_dir.join("test.md"), test_prompt).unwrap();

        // 创建导出器
        let exporter = PromptExporter::new(project_root.clone()).unwrap();

        // 测试导出
        let output_path = temp_dir.path().join("export.json");
        let package_info = PackageInfo {
            name: "Test Package".to_string(),
            description: "Test description".to_string(),
            author: "Test Author".to_string(),
            version: "1.0.0".to_string(),
            ifai_version: "0.3.0".to_string(),
        };

        let result = exporter.export_prompts(
            vec!["test.md".to_string()],
            package_info,
            output_path.to_string_lossy().to_string(),
        );

        assert!(result.is_ok());

        // 测试导入（使用 overwrite=true 覆盖已存在的文件）
        let import_result = exporter.import_prompts(
            output_path.to_string_lossy().to_string(),
            true, // overwrite=true
        );

        assert!(import_result.is_ok());
        let result_data = import_result.unwrap();
        assert_eq!(result_data.imported.len(), 1);
        assert_eq!(result_data.imported[0], "Test Prompt");
    }
}
