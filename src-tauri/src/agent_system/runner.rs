use tauri::{AppHandle, Emitter};
use crate::agent_system::base::{AgentStatus, AgentContext};
use crate::agent_system::supervisor::Supervisor;
use crate::prompt_manager;
use ifainew_core::ai::{Message, Content};

pub async fn run_agent_task(
    app: AppHandle,
    supervisor: Supervisor,
    id: String,
    agent_type: String,
    context: AgentContext,
) {
    println!("[AgentRunner] Starting AI task for agent: {} ({})", id, agent_type);
    
    // 1. Update status to running
    supervisor.update_status(&id, AgentStatus::Running).await;
    let _ = app.emit("agent:status", serde_json::json!({
        "id": id,
        "status": "running",
        "progress": 0.1
    }));

    // 2. Prepare System Prompt
    let system_content = prompt_manager::get_agent_prompt(&agent_type, &context.project_root, &context.task_description);
    
    let messages = vec![
        Message {
            role: "system".to_string(),
            content: Content::Text(system_content),
            tool_calls: None,
            tool_call_id: None,
        },
        Message {
            role: "user".to_string(),
            content: Content::Text(context.task_description.clone()),
            tool_calls: None,
            tool_call_id: None,
        }
    ];

    let event_id = format!("agent_{}", id);
    println!("[AgentRunner] Dispatching AI stream with event_id: {}", event_id);

    // 3. Call AI
    // We use the core library's stream_chat which will emit events to the frontend
    let result = ifainew_core::ai::stream_chat(
        app.clone(), 
        context.provider_config, 
        messages, 
        event_id.clone(), 
        true
    ).await;

    // 4. Handle Final State
    match result {
        Ok(_) => {
            println!("[AgentRunner] Agent {} task completed via AI.", id);
            supervisor.update_status(&id, AgentStatus::Completed).await;
            let _ = app.emit("agent:status", serde_json::json!({
                "id": id,
                "status": "completed",
                "progress": 1.0
            }));
        },
        Err(e) => {
            eprintln!("[AgentRunner] Agent {} failed: {}", id, e);
            supervisor.update_status(&id, AgentStatus::Failed(e.clone())).await;
            let _ = app.emit("agent:status", serde_json::json!({
                "id": id,
                "status": "failed",
                "error": e
            }));
        }
    }
}