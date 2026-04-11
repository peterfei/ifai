//! 工具调用循环
//!
//! 参考 claw-code 的 ConversationRuntime 实现，支持 AI 工具调用的循环执行

use super::tools::{ToolExecutor, ToolCall, ToolResult, create_tool_definitions};
use super::runner::ToolCallDetails;
use crate::core_traits::ai::{Message, Content};
use serde_json::json;
use std::sync::Arc;
use futures_util::StreamExt;  // 🔥 添加 StreamExt trait

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

/// 🔥 工具调用进度回调类型
pub type ToolProgressCallback = Arc<dyn Fn(ToolCallDetails) + Send + Sync>;

/// 执行带工具调用的 AI 对话循环
///
/// # 参数
/// - `provider_config`: AI 提供商配置
/// - `system_prompt`: 系统提示词
/// - `user_message`: 用户消息
/// - `tool_executor`: 工具执行器
/// - `config`: 工具循环配置
/// - `progress_callback`: 🔥 工具调用进度回调（可选）
///
/// # 返回
/// AI 的最终响应文本
pub async fn execute_with_tools(
    provider_config: crate::core_traits::ai::AIProviderConfig,
    system_prompt: String,
    user_message: String,
    tool_executor: &dyn ToolExecutor,
    config: ToolLoopConfig,
    progress_callback: Option<ToolProgressCallback>,  // 🔥 添加进度回调参数
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

        // 调用 AI（使用流式 API 实现实时工具调用显示）
        let ai_start = std::time::Instant::now();
        let response = call_ai_with_tools_stream(
            provider_config.clone(),
            &messages,
            progress_callback.clone(),  // 🔥 传递进度回调给流式函数
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

        // 🔥 移除单次工具调用数量限制，允许 AI 根据任务需求自由调用工具
        // 参考 claw-code 设计，不限制单次工具调用数量

        println!("[ToolLoop] 🔧 检测到 {} 个工具调用", tool_calls.len());

        // 🔥 发送工具调用进度事件
        println!("[ToolLoop] 📤 发送工具调用进度事件: {} 个工具", tool_calls.len());

        // 🔥 准备进度回调（克隆以在循环中使用）
        let progress_callback_clone = progress_callback.clone();

        // 🔥 并行执行所有工具调用
        use futures::future::join_all;

        let tool_start = std::time::Instant::now();

        let mut tool_tasks = Vec::new();
        for tool_call in &tool_calls {
            println!("[ToolLoop] 🔧 启动工具: {}", tool_call.name);

            let tool_call = tool_call.clone();
            let callback_for_task = progress_callback_clone.clone();  // 🔥 为每个任务克隆回调
            tool_tasks.push(async move {
                // 🔥 执行工具（在独立任务中）
                let tool_start = std::time::Instant::now();
                let input_json = serde_json::to_string_pretty(&tool_call.input).unwrap_or_default();
                let result = match tool_executor.execute(&tool_call.name, &tool_call.input).await {
                    Ok(output) => {
                        let execution_time = tool_start.elapsed().as_millis() as i64;
                        println!("[ToolLoop] ✅ 工具 {} 成功，输出: {} 字符，耗时: {}ms",
                                 tool_call.name, output.len(), execution_time);

                        // 🔥 发送工具调用进度事件
                        if let Some(ref cb) = callback_for_task {
                            let details = ToolCallDetails {
                                tool_name: tool_call.name.clone(),
                                tool_input: input_json.clone(),
                                tool_output: output.clone(),
                                output_length: output.len(),
                                execution_time_ms: Some(execution_time),
                                is_error: false,
                            };
                            cb(details);
                        }

                        ToolResult {
                            id: tool_call.id.clone(),
                            name: tool_call.name.clone(),
                            output,
                            is_error: false,
                            input: Some(input_json),
                            execution_time_ms: Some(execution_time),
                        }
                    }
                    Err(e) => {
                        let execution_time = tool_start.elapsed().as_millis() as i64;
                        let error_msg = format!("工具执行失败: {}", e);
                        println!("[ToolLoop] ❌ 工具 {} 失败: {}，耗时: {}ms",
                                 tool_call.name, e, execution_time);

                        // 🔥 发送工具调用进度事件（错误情况）
                        if let Some(ref cb) = callback_for_task {
                            let details = ToolCallDetails {
                                tool_name: tool_call.name.clone(),
                                tool_input: input_json.clone(),
                                tool_output: error_msg.clone(),
                                output_length: error_msg.len(),
                                execution_time_ms: Some(execution_time),
                                is_error: true,
                            };
                            cb(details);
                        }

                        ToolResult {
                            id: tool_call.id.clone(),
                            name: tool_call.name.clone(),
                            output: error_msg,
                            is_error: true,
                            input: Some(input_json),
                            execution_time_ms: Some(execution_time),
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

/// 🔥 流式工具调用数据结构
#[derive(Debug, Clone, serde::Deserialize)]
struct StreamToolCallChunk {
    index: i32,
    id: Option<String>,
    #[serde(rename = "type")]
    tool_type: Option<String>,
    function: Option<StreamFunction>,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct StreamFunction {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct StreamChoice {
    delta: StreamDelta,
    #[serde(rename = "finish_reason")]
    finish_reason: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct StreamDelta {
    content: Option<String>,
    tool_calls: Option<Vec<StreamToolCallChunk>>,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct OpenAIStreamResponse {
    choices: Vec<StreamChoice>,
}

/// 🔥 流式版本：调用 AI 并实时发送工具调用进度
///
/// 这个函数使用流式 API，在检测到工具调用时立即通过 progress_callback 发送进度
/// 这样用户可以看到工具调用渐进式地出现，而不是等待所有工具调用完成后才显示
async fn call_ai_with_tools_stream(
    provider_config: crate::core_traits::ai::AIProviderConfig,
    messages: &[Message],
    progress_callback: Option<ToolProgressCallback>,
) -> Result<String, String> {
    println!("[ToolLoop] 📤 [STREAM] 调用流式 AI API");

    #[cfg(feature = "commercial")]
    {
        use reqwest::Client;
        use eventsource_stream::Eventsource;
        use tokio::time::{timeout, Duration};
        use std::collections::HashMap;

        // 🔥 步骤1：准备请求
        // 注意：api_key 和 base_url 已经是 String 类型，不是 Option
        let api_key = &provider_config.api_key;
        let base_url = &provider_config.base_url;
        let model = provider_config.models.first()
            .ok_or("缺少模型配置")?
            .clone();

        // 🔥 构建工具定义 - create_tool_definitions 已经返回 Vec<serde_json::Value>
        let tools_value = create_tool_definitions();

        // 构建请求消息
        let messages_for_api: Vec<serde_json::Value> = messages.iter()
            .map(|msg| {
                let mut msg_obj = serde_json::json!({
                    "role": msg.role,
                });
                // 🔥 处理所有 Content 变体
                match &msg.content {
                    Content::Text(text) => {
                        msg_obj["content"] = serde_json::json!(text);
                    }
                    Content::Parts(parts) => {
                        // 如果是多部分内容，连接所有文本部分
                        use ifainew_core::ai::ContentPart;
                        let text: String = parts.iter()
                            .filter_map(|p| match p {
                                ContentPart::Text { text, .. } => Some(text.as_str()),
                                ContentPart::ImageUrl { .. } => None,
                            })
                            .collect();
                        msg_obj["content"] = serde_json::json!(text);
                    }
                }
                msg_obj
            })
            .collect();

        // 🔥 根据 ifainew-core 的实现，base_url 应该已经是完整的 API 端点 URL
        // 例如：https://open.bigmodel.cn/api/paas/v4/chat/completions
        // 不需要再添加 /chat/completions
        let completions_url = base_url.clone();

        let request = serde_json::json!({
            "model": model,
            "messages": messages_for_api,
            "tools": tools_value,
            "tool_choice": "auto",
            "stream": true,
        });

        println!("[ToolLoop] 📤 [STREAM] 发送流式请求到: {}", completions_url);

        // 🔥 步骤2：发送流式请求
        let client = Client::new();
        let response = client
            .post(&completions_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("流式请求失败: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("API 错误: {}", error_text));
        }

        // 🔥 步骤3：处理流式响应
        let mut stream = response.bytes_stream().eventsource();

        // 🔥 步骤4：累积工具调用
        let mut accumulated_tools: HashMap<i32, (String, String, String)> = HashMap::new();
        // (id, name, arguments)

        let mut final_content = String::new();
        let mut chunk_count = 0;
        let mut sent_tool_notifications = std::collections::HashSet::new();

        // 🔥 步骤5：处理每个流式 chunk
        while let Some(event_result) = stream.next().await {
            match event_result {
                Ok(event) => {
                    if event.data == "[DONE]" {
                        println!("[ToolLoop] 📤 [STREAM] 收到 [DONE] 信号");
                        break;
                    }

                    chunk_count += 1;

                    // 解析 JSON
                    if let Ok(stream_response) = serde_json::from_str::<OpenAIStreamResponse>(&event.data) {
                        if let Some(choice) = stream_response.choices.first() {
                            // 处理内容
                            if let Some(content) = &choice.delta.content {
                                final_content.push_str(content);
                            }

                            // 🔥 处理工具调用 - 关键部分！
                            if let Some(tool_calls) = &choice.delta.tool_calls {
                                for chunk in tool_calls {
                                    let index = chunk.index;

                                    // 初始化或获取现有工具调用
                                    let entry = accumulated_tools.entry(index).or_insert_with(|| {
                                        let id = chunk.id.clone().unwrap_or_else(|| {
                                            format!("call_{}", index)
                                        });
                                        let name = chunk.function.as_ref()
                                            .and_then(|f| f.name.clone())
                                            .unwrap_or_default();
                                        let arguments = String::new();
                                        (id, name, arguments)
                                    });

                                    // 更新工具名称（如果有）
                                    if let Some(func) = &chunk.function {
                                        if let Some(name) = &func.name {
                                            entry.1 = name.clone();
                                        }
                                        // 累积 arguments
                                        if let Some(args) = &func.arguments {
                                            entry.2.push_str(args);
                                        }
                                    }

                                    // 🔥 关键：当工具调用有 ID 或名称时，立即发送进度通知！
                                    // 这就是实时显示的魔法所在
                                    let has_id = chunk.id.is_some();
                                    let has_name = chunk.function.as_ref()
                                        .and_then(|f| f.name.as_ref())
                                        .is_some();

                                    if (has_id || has_name) && !sent_tool_notifications.contains(&index) {
                                        sent_tool_notifications.insert(index);

                                        let tool_id = &entry.0;
                                        let tool_name = &entry.1;

                                        println!("[ToolLoop] 🔥 [STREAM] 检测到新工具调用 #{}: {} ({})",
                                            index, tool_name, tool_id);

                                        // 🔥 移除流式处理时的事件发送
                                        // 问题：此时 tool_output 和 execution_time_ms 都是空的/未知的
                                        // 这会导致前端收到不完整的数据，影响工具结果显示
                                        // 解决：只在实际执行完成后发送完整事件（见 tool_loop.rs lines 141-149）
                                        //
                                        // claw-code 的做法：只发送 tool_match 事件（工具名称），不发送执行详情
                                        // 详情在 AI 文本响应中显示
                                        //
                                        // 我们的方案：移除这里的空事件，只保留执行完成后的完整事件
                                    }
                                }
                            }

                            // 检查是否完成
                            if choice.finish_reason.is_some() {
                                println!("[ToolLoop] 📤 [STREAM] 流结束，原因: {:?}",
                                    choice.finish_reason);
                                break;
                            }
                        }
                    }
                }
                Err(e) => {
                    println!("[ToolLoop] ⚠️ [STREAM] 流处理错误: {}", e);
                    break;
                }
            }
        }

        println!("[ToolLoop] 📊 [STREAM] 处理了 {} 个 chunks", chunk_count);
        println!("[ToolLoop] 🔧 [STREAM] 累积了 {} 个工具调用",
            accumulated_tools.len());

        // 🔥 步骤6：构建最终结果
        if !accumulated_tools.is_empty() {
            // 将累积的工具调用转换为最终的 JSON 格式
            let mut final_tool_calls = Vec::new();
            for (_, (id, name, arguments)) in accumulated_tools {
                let tool_call = serde_json::json!({
                    "id": id,
                    "type": "function",
                    "function": {
                        "name": name,
                        "arguments": arguments
                    }
                });
                final_tool_calls.push(tool_call);
            }

            let result_json = serde_json::to_string(&final_tool_calls)
                .map_err(|e| format!("JSON 序列化失败: {}", e))?;

            println!("[ToolLoop] ✅ [STREAM] 返回 {} 个工具调用，总长度: {} 字符",
                final_tool_calls.len(), result_json.len());

            Ok(result_json)
        } else {
            // 没有工具调用，返回内容
            println!("[ToolLoop] ✅ [STREAM] 返回文本内容，长度: {} 字符",
                final_content.len());
            Ok(final_content)
        }
    }

    // 🔥 Community 版本的降级处理
    #[cfg(not(feature = "commercial"))]
    {
        println!("[ToolLoop] ⚠️ [STREAM] Community 版本，回退到非流式 API");
        call_ai_with_tools_unified(provider_config, messages).await
    }
}
