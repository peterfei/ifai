pub mod token_counter;
pub mod summarizer;

use crate::core_traits::ai::{Message, Content, AIProviderConfig};

pub async fn should_summarize(messages: &[Message]) -> bool {
    let token_count = token_counter::count_messages_tokens(messages);
    // Thresholds: 150k tokens or 100 messages
    token_count > 150_000 || messages.len() > 100
}

pub async fn auto_summarize(
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
        tool_call_id: String::new(),
        id: String::new(),
    });

    // Keep the last 10 messages for context
    let tail_size = std::cmp::min(messages.len(), 10);
    let start_idx = messages.len() - tail_size;
    for i in start_idx..messages.len() {
        new_history.push(messages[i].clone());
    }

    *messages = new_history;
    println!("[Conversation] History compacted successfully.");

    Ok(())
}
