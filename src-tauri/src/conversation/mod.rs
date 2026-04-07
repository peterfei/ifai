pub mod token_counter;
pub mod summarizer;
pub mod notes;

#[cfg(test)]
mod tests;

use crate::core_traits::ai::{Message, Content, AIProviderConfig};

pub async fn should_summarize(messages: &[Message]) -> bool {
    // Guard: Don't summarize short conversations regardless of token count
    if messages.len() < 10 {
        return false;
    }

    let token_count = token_counter::count_messages_tokens(messages);
    println!("[Conversation] Check summary: {} messages, {} tokens", messages.len(), token_count);

    // Thresholds: 150k tokens or 100 messages
    token_count > 150_000 || messages.len() > 100
}

/**
 * 压缩对话（保留系统提示词和总结，删除中间消息）
 *
 * @param messages - 原始消息数组
 * @param summary - 总结文本
 * @param keep_last_n - 保留最后 N 条消息
 * @returns 压缩后的消息数组
 */
pub async fn compact_conversation(
    messages: Vec<Message>,
    summary: String,
    keep_last_n: usize,
) -> Result<Vec<Message>, String> {
    let mut new_history = Vec::new();

    // 1. 保留原始系统提示词
    if let Some(first) = messages.first() {
        if first.role == "system" {
            new_history.push(first.clone());
        }
    }

    // 2. 插入总结作为新的系统消息
    new_history.push(Message {
        role: "system".to_string(),
        content: Content::Text(format!(
            "## CONVERSATION SUMMARY\n\n{}\n\n=== End of Summary ===",
            summary
        )),
        tool_calls: None,
        tool_call_id: None,
    });

    // 3. 保留最后 N 条消息
    let tail_size = std::cmp::min(messages.len(), keep_last_n);
    let start_idx = messages.len() - tail_size;
    for i in start_idx..messages.len() {
        new_history.push(messages[i].clone());
    }

    Ok(new_history)
}

use tauri::{AppHandle, Emitter};

pub async fn auto_summarize(
    app: &AppHandle,
    event_id: &str,
    project_root: &str,
    provider_config: &AIProviderConfig,
    messages: &mut Vec<Message>,
) -> Result<(), String> {
    if !should_summarize(messages).await {
        return Ok(());
    }

    println!("[Conversation] Context threshold reached. Starting auto-summarization.");

    // 1. Generate the summary
    let summary = summarizer::generate_summary(project_root, provider_config, messages.clone()).await?;

    // 2. Archive existing messages (Simplified: for now we just log it)
    // TODO: Write to .ifai/sessions/archive/
    
    // 3. Clear middle messages, keeping system prompt and the summary
    // We keep the last 5 messages for immediate continuity
    let mut new_history = Vec::new();
    
    // Keep original system prompt if it exists
    if let Some(first) = messages.first() {
        if first.role == "system" {
            new_history.push(first.clone());
        }
    }

    // Inject the summary as a new system message
    new_history.push(Message {
        role: "system".to_string(),
        content: Content::Text(format!("## CONVERSATION SUMMARY\n\n{}\n\n=== End of Summary ===", summary)),
        tool_calls: None,
        tool_call_id: None,
    });

    // Keep the last 10 messages for context
    let tail_size = std::cmp::min(messages.len(), 10);
    let start_idx = messages.len() - tail_size;
    for i in start_idx..messages.len() {
        new_history.push(messages[i].clone());
    }

    *messages = new_history.clone();
    
    // Notify frontend to update its history
    let _ = app.emit(&format!("{}_compacted", event_id), new_history);
    
    println!("[Conversation] History compacted successfully.");

    Ok(())
}
