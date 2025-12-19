use tiktoken_rs::cl100k_base;
use ifainew_core::ai::{Message, Content};

pub fn count_messages_tokens(messages: &[Message]) -> usize {
    let bpe = match cl100k_base() {
        Ok(b) => b,
        Err(_) => return 0,
    };
    
    let mut total_tokens = 0;
    
    for msg in messages {
        total_tokens += 4; // Role/Metadata overhead
        
        match &msg.content {
            Content::Text(text) => total_tokens += bpe.encode_with_special_tokens(text).len(),
            Content::Parts(parts) => {
                for _part in parts {
                    // Simple estimate for parts
                    total_tokens += 2;
                }
            }
        }
        
        if let Some(tool_calls) = &msg.tool_calls {
            for tc in tool_calls {
                total_tokens += bpe.encode_with_special_tokens(&tc.function.name).len();
                total_tokens += bpe.encode_with_special_tokens(&tc.function.arguments).len();
            }
        }
        
        if let Some(id) = &msg.tool_call_id {
            total_tokens += bpe.encode_with_special_tokens(id).len();
        }
    }
    
    total_tokens
}
