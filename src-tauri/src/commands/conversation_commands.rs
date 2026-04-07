/**
 * Section 5: 对话管理系统 - Tauri 命令
 *
 * 提供对话总结、归档和统计功能的 Tauri 命令接口
 */

use crate::conversation::{self, token_counter};
use crate::core_traits::ai::{Message, AIProviderConfig, Content};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Token 统计信息
#[derive(Debug, Serialize, Deserialize)]
pub struct TokenStats {
    pub total_tokens: usize,
    pub message_count: usize,
    pub estimated_cost_usd: Option<f64>,
}

/// 归档信息
#[derive(Debug, Serialize, Deserialize)]
pub struct ArchiveInfo {
    pub id: String,
    pub timestamp: i64,
    pub message_count: usize,
    pub token_count: usize,
    pub summary_preview: String,
}

/**
 * 计算消息列表的 token 数量
 *
 * @param messages - 消息数组
 * @param model - 模型名称（用于选择正确的编码器）
 * @returns Token 数量
 */
#[tauri::command]
pub async fn count_messages_tokens(
    messages: Vec<Message>,
    model: String,
) -> Result<usize, String> {
    // 参数 model 当前未使用，因为 cl100k_base 适用于大多数 GPT 模型
    // 未来可以根据模型选择不同的编码器
    let token_count = token_counter::count_messages_tokens(&messages);
    Ok(token_count)
}

/**
 * 检查对话是否需要总结
 *
 * @param messages - 消息数组
 * @returns 是否需要总结
 */
#[tauri::command]
pub async fn should_summarize_conversation(
    messages: Vec<Message>,
) -> Result<bool, String> {
    Ok(conversation::should_summarize(&messages).await)
}

/**
 * 生成对话总结
 *
 * @param project_root - 项目根目录
 * @param messages - 消息数组
 * @param provider_config - AI 提供商配置
 * @returns 生成的总结文本
 */
#[tauri::command]
pub async fn summarize_conversation(
    project_root: String,
    messages: Vec<Message>,
    provider_config: AIProviderConfig,
) -> Result<String, String> {
    conversation::summarizer::generate_summary(
        &project_root,
        &provider_config,
        messages,
    ).await
}

/**
 * 压缩对话（保留系统提示词和总结，删除中间消息）
 *
 * @param messages - 原始消息数组
 * @param summary - 总结文本
 * @param keep_last_n - 保留最后 N 条消息
 * @returns 压缩后的消息数组
 */
#[tauri::command]
pub async fn compact_conversation(
    messages: Vec<Message>,
    summary: String,
    keep_last_n: usize,
) -> Result<Vec<Message>, String> {
    conversation::compact_conversation(messages, summary, keep_last_n).await
}

/**
 * 获取对话归档列表
 *
 * @param project_root - 项目根目录
 * @param limit - 返回的最大数量
 * @returns 归档信息列表
 */
#[tauri::command]
pub async fn get_conversation_archives(
    project_root: String,
    limit: usize,
) -> Result<Vec<ArchiveInfo>, String> {
    let mut archives = Vec::new();

    // 归档目录路径
    let archive_dir = PathBuf::from(&project_root)
        .join(".ifai")
        .join("sessions")
        .join("archive");

    // 如果目录不存在，返回空列表
    if !archive_dir.exists() {
        return Ok(archives);
    }

    // 读取目录中的所有归档文件
    let entries = fs::read_dir(&archive_dir)
        .map_err(|e| format!("Failed to read archive directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        // 只处理 JSON 文件
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }

        // 解析文件名获取时间戳
        let file_name = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("");

        // 读取文件内容获取元数据
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(timestamp) = value.get("timestamp").and_then(|v| v.as_i64()) {
                    archives.push(ArchiveInfo {
                        id: file_name.to_string(),
                        timestamp,
                        message_count: value.get("message_count").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
                        token_count: value.get("token_count").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
                        summary_preview: value.get("summary")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .chars()
                            .take(100)
                            .collect(),
                    });
                }
            }
        }

        // 限制返回数量
        if archives.len() >= limit {
            break;
        }
    }

    // 按时间戳降序排序
    archives.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    Ok(archives)
}

/**
 * 获取 token 使用统计
 *
 * @param messages - 消息数组
 * @param model - 模型名称
 * @returns Token 统计信息
 */
#[tauri::command]
pub async fn get_token_stats(
    messages: Vec<Message>,
    model: String,
) -> Result<TokenStats, String> {
    let total_tokens = token_counter::count_messages_tokens(&messages);
    let message_count = messages.len();

    // 估算成本（基于 GPT-4o 定价）
    // Input: $2.50 per 1M tokens
    let estimated_cost = if total_tokens > 0 {
        Some((total_tokens as f64 / 1_000_000.0) * 2.50)
    } else {
        None
    };

    Ok(TokenStats {
        total_tokens,
        message_count,
        estimated_cost_usd: estimated_cost,
    })
}

/**
 * 保存对话归档
 *
 * @param project_root - 项目根目录
 * @param messages - 消息数组
 * @param summary - 总结文本
 * @returns 归档文件路径
 */
#[tauri::command]
pub async fn save_conversation_archive(
    project_root: String,
    messages: Vec<Message>,
    summary: String,
) -> Result<String, String> {
    // 创建归档目录
    let archive_dir = PathBuf::from(&project_root)
        .join(".ifai")
        .join("sessions")
        .join("archive");

    fs::create_dir_all(&archive_dir)
        .map_err(|e| format!("Failed to create archive directory: {}", e))?;

    // 生成文件名（使用时间戳）
    let timestamp = chrono::Utc::now().timestamp();
    let file_name = format!("conversation_{}.json", timestamp);
    let file_path = archive_dir.join(&file_name);

    // 准备归档数据
    let token_count = token_counter::count_messages_tokens(&messages);
    let archive_data = serde_json::json!({
        "timestamp": timestamp,
        "message_count": messages.len(),
        "token_count": token_count,
        "summary": summary,
        "messages": messages,
    });

    // 写入文件
    fs::write(&file_path, serde_json::to_string_pretty(&archive_data).unwrap())
        .map_err(|e| format!("Failed to write archive file: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}
