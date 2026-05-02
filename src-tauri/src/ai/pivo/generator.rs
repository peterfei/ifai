use crate::ai::pivo::commands::TaskNode;
use std::fs;
use std::path::PathBuf;

pub struct PivoGenerator;

impl PivoGenerator {
    pub fn load_planner_prompt(project_root: &str) -> Result<String, String> {
        let mut path = PathBuf::from(project_root);
        path.push(".ifai");
        path.push("prompts");

        // 1. 优先尝试 zh-CN 路径 (对标截图规范)
        let mut zh_path = path.clone();
        zh_path.push("zh-CN");
        zh_path.push("pivo");
        zh_path.push("planner.md");

        if zh_path.exists() {
            return fs::read_to_string(zh_path).map_err(|e| format!("读取中文规划器失败: {}", e));
        }

        // 2. 尝试默认路径
        path.push("pivo");
        path.push("planner.md");
        if path.exists() {
            return fs::read_to_string(path).map_err(|e| format!("读取规划器失败: {}", e));
        }

        // 3. 兜底：返回内置提示词
        println!("[PIVO] 未发现本地提示词，使用内置兜底方案");
        Ok(crate::ai::pivo::prompts::DEFAULT_PLANNER_PROMPT.to_string())
    }

    // 在实际开发中，这里会调用 LLM 接口
    pub async fn generate_tasks(_intent: &str, _prompt: &str) -> Result<Vec<TaskNode>, String> {
        // TODO: 真正的 LLM 调用逻辑
        // 这里暂时返回模拟数据
        Ok(vec![])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_load_planner_prompt() {
        let dir = tempdir().unwrap();
        let project_root = dir.path().to_str().unwrap();

        // 创建模拟的 .ifai 结构
        let prompt_path = dir.path().join(".ifai/prompts/pivo");
        fs::create_dir_all(&prompt_path).unwrap();
        let file_path = prompt_path.join("planner.md");
        let expected_content = "# Test Prompt 内容";
        fs::write(file_path, expected_content).unwrap();

        // 执行测试
        let result = PivoGenerator::load_planner_prompt(project_root);

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), expected_content);
    }
}
