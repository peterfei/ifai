use serde::{Deserialize, Serialize};
use tauri::command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskNode {
    pub id: String,
    pub label: String,
    pub status: String,    // "pending", "running", "success", "failed", "healing"
    pub task_type: String, // "Plan", "Implement", "Verify", "Optimize"
    pub children: Vec<TaskNode>,
}

#[command]
pub async fn pivo_generate_tasks(intent: String) -> Result<Vec<TaskNode>, String> {
    println!("[PIVO] Generating tasks for intent: {}", intent);

    // TODO: 调用 generator 模块加载 prompt 并通过 LLM 生成任务树
    // 目前返回一个模拟的初始结构以供前端调试
    let mock_tasks = vec![
        TaskNode {
            id: "1".to_string(),
            label: "初始化项目结构".to_string(),
            status: "success".to_string(),
            task_type: "Plan".to_string(),
            children: vec![],
        },
        TaskNode {
            id: "2".to_string(),
            label: format!("实施: {}", intent),
            status: "pending".to_string(),
            task_type: "Implement".to_string(),
            children: vec![],
        },
        TaskNode {
            id: "3".to_string(),
            label: "验证实施结果".to_string(),
            status: "pending".to_string(),
            task_type: "Verify".to_string(),
            children: vec![],
        },
    ];

    Ok(mock_tasks)
}

#[command]
pub async fn pivo_execute_task(task_id: String) -> Result<String, String> {
    println!("[PIVO] Executing task: {}", task_id);

    // TODO: 从 .ifai/skills/ 加载对应的中文技能定义并执行
    // 模拟执行成功
    Ok(format!("Task {} completed successfully", task_id))
}

#[command]
pub async fn pivo_init_assets(project_root: String) -> Result<(), String> {
    println!("[PIVO] 强制检查并补全资产: {}", project_root);
    let root = PathBuf::from(&project_root);

    // 1. 初始化 Prompts 目录 (支持层级检查)
    let prompt_base = root.join(".ifai").join("prompts");
    let pivo_prompt_path = prompt_base.join("pivo");
    fs::create_dir_all(&pivo_prompt_path).ok();

    let planner_file = pivo_prompt_path.join("planner.md");
    if !planner_file.exists() {
        let _ = fs::write(
            planner_file,
            crate::ai::pivo::prompts::DEFAULT_PLANNER_PROMPT,
        );
    }

    // 2. 初始化 Skills 目录 (按照子目录 + skill.json 规范)
    let skill_base = root.join(".ifai").join("skills");
    fs::create_dir_all(&skill_base).ok();

    // 定义技能分发清单 (目录名, JSON 内容)
    let skills_to_init = vec![
        (
            "pivo-implement",
            crate::ai::pivo::prompts::SKILL_IMPLEMENT_JSON,
        ),
        ("pivo-verify", crate::ai::pivo::prompts::SKILL_VERIFY_JSON),
        ("pivo-heal", crate::ai::pivo::prompts::SKILL_HEAL_JSON),
    ];

    for (dir_name, json_content) in skills_to_init {
        let skill_dir = skill_base.join(dir_name);
        fs::create_dir_all(&skill_dir).ok();

        let config_file = skill_dir.join("skill.json");
        if !config_file.exists() {
            let _ = fs::write(config_file, json_content);
        }

        // 🏆 清理旧版错误的 .skill.md 文件
        let old_md_name = format!("{}.skill.md", dir_name);
        let old_md_path = skill_base.join(old_md_name);
        if old_md_path.exists() {
            let _ = fs::remove_file(old_md_path);
        }
    }

    Ok(())
}

use std::fs;
use std::path::PathBuf;
