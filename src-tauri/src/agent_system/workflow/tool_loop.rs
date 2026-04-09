//! 工具调用循环
//!
//! 参考 claw-code 的 ConversationRuntime 实现，支持 AI 工具调用的循环执行

use super::tools::{ToolExecutor, ToolCall, ToolResult, create_tool_definitions};
use crate::core_traits::ai::{Message, Content};
use serde_json::json;

/// 工具调用循环配置
#[derive(Debug, Clone)]
pub struct ToolLoopConfig {
    pub max_iterations: usize,
    pub max_tools_per_turn: usize,
}

impl Default for ToolLoopConfig {
    fn default() -> Self {
        Self {
            max_iterations: 10,
            max_tools_per_turn: 5,
        }
    }
}

/// 执行带工具调用的 AI 对话循环
///
/// # 参数
/// - `provider_config`: AI 提供商配置
/// - `system_prompt`: 系统提示词
/// - `user_message`: 用户消息
/// - `tool_executor`: 工具执行器
/// - `project_root`: 项目根目录（用于工具执行）
///
/// # 返回
/// AI 的最终响应文本
pub async fn execute_with_tools(
    provider_config: crate::core_traits::ai::AIProviderConfig,
    system_prompt: String,
    user_message: String,
    tool_executor: &dyn ToolExecutor,
    config: ToolLoopConfig,
) -> Result<String, String> {
    let workflow_start = std::time::Instant::now();
    let mut ai_time_total = std::time::Duration::ZERO;
    let mut tool_time_total = std::time::Duration::ZERO;

    println!("[ToolLoop] 🚀 工具循环开始");
    println!("[ToolLoop] 📊 系统提示词长度: {} 字符", system_prompt.len());
    println!("[ToolLoop] 📊 用户消息长度: {} 字符", user_message.len());

    let mut messages = vec![
        Message {
            role: "system".to_string(),
            content: Content::Text(system_prompt),
            tool_calls: None,
            tool_call_id: None,
        },
        Message {
            role: "user".to_string(),
            content: Content::Text(user_message),
            tool_calls: None,
            tool_call_id: None,
        },
    ];

    let mut iterations = 0;
    let mut final_response = String::new();

    loop {
        iterations += 1;
        if iterations > config.max_iterations {
            return Err(format!("超过最大迭代次数: {}", config.max_iterations));
        }

        println!("[ToolLoop] 🔄 迭代 {}/{}", iterations, config.max_iterations);

        // 调用 AI
        let ai_start = std::time::Instant::now();
        let response = call_ai_with_tools_unified(
            provider_config.clone(),
            &messages,
        ).await?;
        let ai_duration = ai_start.elapsed();
        ai_time_total += ai_duration;

        println!("[ToolLoop] ⏱️ AI API 调用耗时: {:?}", ai_duration);

        // 检查是否有工具调用
        let tool_calls = extract_tool_calls(&response)?;

        if tool_calls.is_empty() {
            // 没有工具调用，返回 AI 响应
            final_response = response;
            println!("[ToolLoop] ✅ 完成，最终响应长度: {} 字符", final_response.len());
            break;
        }

        if tool_calls.len() > config.max_tools_per_turn {
            return Err(format!("单次工具调用数量超过限制: {}", tool_calls.len()));
        }

        println!("[ToolLoop] 🔧 检测到 {} 个工具调用", tool_calls.len());

        // 🔥 发送工具调用进度事件
        println!("[ToolLoop] 📤 发送工具调用进度事件: {} 个工具", tool_calls.len());

        // 🔥 并行执行所有工具调用
        use futures::future::join_all;

        let tool_start = std::time::Instant::now();

        let mut tool_tasks = Vec::new();
        for tool_call in &tool_calls {
            println!("[ToolLoop] 🔧 启动工具: {}", tool_call.name);

            let tool_call = tool_call.clone();
            tool_tasks.push(async move {
                // 🔥 执行工具（在独立任务中）
                let result = match tool_executor.execute(&tool_call.name, &tool_call.input).await {
                    Ok(output) => {
                        println!("[ToolLoop] ✅ 工具 {} 成功，输出: {} 字符", tool_call.name, output.len());
                        ToolResult {
                            id: tool_call.id.clone(),
                            name: tool_call.name.clone(),
                            output,
                            is_error: false,
                        }
                    }
                    Err(e) => {
                        println!("[ToolLoop] ❌ 工具 {} 失败: {}", tool_call.name, e);
                        ToolResult {
                            id: tool_call.id.clone(),
                            name: tool_call.name.clone(),
                            output: format!("工具执行失败: {}", e),
                            is_error: true,
                        }
                    }
                };
                (tool_call, result)
            });
        }

        // 🔥 等待所有工具完成（并行执行）
        println!("[ToolLoop] ⏳ 等待 {} 个工具完成...", tool_tasks.len());
        let results = join_all(tool_tasks).await;

        let tool_duration = tool_start.elapsed();
        tool_time_total += tool_duration;
        println!("[ToolLoop] ⏱️ 工具执行总耗时: {:?} ({} 个工具并行)", tool_duration, tool_calls.len());

        // 将工具结果添加到消息历史
        for (tool_call, result) in results {
            messages.push(Message {
                role: "assistant".to_string(),
                content: Content::Text(format!("tool_call:{}", tool_call.name)),
                tool_calls: None,
                tool_call_id: None,
            });

            messages.push(Message {
                role: "user".to_string(),
                content: Content::Text(result.output),
                tool_calls: None,
                tool_call_id: None,
            });
        }
    }

    // 🔥 输出性能统计
    let total_duration = workflow_start.elapsed();
    println!("[ToolLoop] 📊 ========== 性能统计 ==========");
    println!("[ToolLoop] 📊 总执行时长: {:?}", total_duration);
    println!("[ToolLoop] 📊 迭代次数: {}", iterations);
    println!("[ToolLoop] 📊 AI API 调用总时长: {:?} (平均: {:?}/次)", ai_time_total, ai_time_total / iterations as u32);
    println!("[ToolLoop] 📊 工具执行总时长: {:?}", tool_time_total);
    println!("[ToolLoop] 📊 AI 占比: {:.1}%", (ai_time_total.as_secs_f64() / total_duration.as_secs_f64()) * 100.0);
    println!("[ToolLoop] 📊 工具占比: {:.1}%", (tool_time_total.as_secs_f64() / total_duration.as_secs_f64()) * 100.0);
    println!("[ToolLoop] 📊 ================================");

    Ok(final_response)
}

/// 调用 AI（支持工具调用）
async fn call_ai_with_tools(
    provider_config: crate::core_traits::ai::AIProviderConfig,
    messages: &[Message],
) -> Result<String, String> {
    // 构建包含工具定义的请求
    let tools = create_tool_definitions();

    // 🔥 使用 ifainew_core 的 streaming API，但需要支持工具调用
    // 由于 ifainew_core::ai::complete_code 不支持工具，我们需要直接调用 API
    use reqwest::Client;
    use tokio::time::{timeout, Duration};

    let client = Client::new();

    // 获取模型名称
    let model = provider_config.models.first()
        .cloned()
        .unwrap_or_else(|| "glm-4.7".to_string());

    // 构建请求体（参考 stream_chat 的格式）
    let request_body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": false,
        "temperature": 0.7,
        "tools": tools,
        "tool_choice": "auto"
    });

    println!("[ToolLoop] 📤 发送请求到 AI，工具数量: {}", tools.len());

    let response = timeout(
        Duration::from_secs(60),
        client
            .post(&provider_config.base_url)
            .header("Authorization", format!("Bearer {}", provider_config.api_key))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
    )
    .await
    .map_err(|e| format!("请求超时: {}", e))?
    .map_err(|e| format!("请求失败: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API 错误 ({}): {}", status, error_text));
    }

    // 解析响应
    let response_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    // 提取内容或工具调用
    if let Some(choices) = response_json["choices"].as_array() {
        if let Some(choice) = choices.first() {
            if let Some(message) = choice.get("message") {
                // 检查是否有工具调用
                if let Some(tool_calls_value) = message.get("tool_calls") {
                    if let Some(tool_calls) = tool_calls_value.as_array() {
                        if !tool_calls.is_empty() {
                            // 有工具调用，返回原始 JSON 让上层处理
                            return Ok(serde_json::to_string(tool_calls).unwrap_or_default());
                        }
                    }
                }

                // 没有工具调用，返回文本内容
                if let Some(content) = message.get("content").and_then(|c| c.as_str()) {
                    return Ok(content.to_string());
                }
            }
        }
    }

    Err("无法解析 AI 响应".to_string())
}

/// 🔥 调用 AI（支持工具调用）- 使用私有库统一接口
async fn call_ai_with_tools_unified(
    provider_config: crate::core_traits::ai::AIProviderConfig,
    messages: &[Message],
) -> Result<String, String> {
    println!("[ToolLoop] 📤 调用 ifainew_core::ai::chat_with_tools");

    // 🔥 使用私有库的统一接口
    #[cfg(feature = "commercial")]
    {
        let response = ifainew_core::ai::chat_with_tools(
            provider_config,
            messages.to_vec(),
            true, // enable_tools
        ).await.map_err(|e| format!("AI 调用失败: {}", e))?;

        println!("[ToolLoop] ⏱️ AI API 耗时: {}ms", response.metrics.ai_api_duration_ms);

        // 返回工具调用 JSON 或内容
        if let Some(tool_calls) = response.tool_calls {
            let tool_calls_json = serde_json::to_string(&tool_calls)
                .unwrap_or_default();
            println!("[ToolLoop] 🔧 返回工具调用: {} 个", tool_calls.len());
            Ok(tool_calls_json)
        } else {
            println!("[ToolLoop] ✅ 返回内容: {} 字符", response.content.len());
            Ok(response.content)
        }
    }

    // 🔥 Community 版本的降级处理（保持向后兼容）
    #[cfg(not(feature = "commercial"))]
    {
        call_ai_with_tools(provider_config, messages).await
    }
}

/// 从 AI 响应中提取工具调用
fn extract_tool_calls(response: &str) -> Result<Vec<ToolCall>, String> {
    println!("[ToolLoop] 🔍 Parsing tool calls from: {}", response);

    // 尝试解析为工具调用数组
    if let Ok(tool_calls) = serde_json::from_str::<Vec<serde_json::Value>>(response) {
        let mut calls = Vec::new();
        for (index, tool_call) in tool_calls.iter().enumerate() {
            let id = tool_call.get("id")
                .and_then(|v| v.as_str())
                .unwrap_or(&format!("call_{}", index))
                .to_string();

            let name = tool_call.get("function")
                .and_then(|f| f.get("name"))
                .and_then(|v| v.as_str())
                .ok_or("缺少工具名称")?
                .to_string();

            // 🔥 关键修复：arguments 是 JSON 字符串，需要再次解析
            let input = tool_call.get("function")
                .and_then(|f| f.get("arguments"))
                .and_then(|args| args.as_str())
                .and_then(|args_str| serde_json::from_str::<serde_json::Value>(args_str).ok())
                .clone()
                .unwrap_or(serde_json::json!({}));

            println!("[ToolLoop] 🔍 Tool call: {} -> {:?}", name, input);
            calls.push(ToolCall { id, name, input });
        }
        return Ok(calls);
    }

    // 不是工具调用，返回空
    Ok(Vec::new())
}
