use crate::prompt_manager;
use crate::ai_utils;
use crate::core_traits::ai::{Message, Content, AIProviderConfig};

pub async fn generate_summary(
    project_root: &str,
    provider_config: &AIProviderConfig,
    history: Vec<Message>,
) -> Result<String, String> {
    println!("[Summarizer] Triggering conversation summarization...");
    
    // 1. Load the summary prompt template
    // Note: We use "conversation-summary" as the type to match our filename
    let summary_instruction = prompt_manager::get_agent_prompt(
        "conversation-summary", 
        project_root, 
        "Please provide a structured summary of our conversation so far."
    );

    // 2. Prepare the messages for the summary request
    // We send the entire history + the summary instruction
    let mut messages = history.clone();
    messages.push(Message {
        role: "user".to_string(),
        content: Content::Text(summary_instruction),
        tool_calls: None,
        tool_call_id: None,
    });

    // 3. Call AI
    println!("[Summarizer] Sending request to AI (Model: {})...", provider_config.models[0]);
    match ai_utils::fetch_ai_completion(provider_config, messages, None).await {
        Ok(res_msg) => {
            if let Content::Text(summary_text) = res_msg.content {
                println!("[Summarizer] Summary generated successfully ({} chars)", summary_text.len());
                Ok(summary_text)
            } else {
                let err = "AI returned multimodal content instead of text for summary".to_string();
                eprintln!("[Summarizer] Error: {}", err);
                Err(err)
            }
        },
        Err(e) => {
            eprintln!("[Summarizer] AI request failed: {}", e);
            Err(format!("AI request for summary failed: {}", e))
        }
    }
}
