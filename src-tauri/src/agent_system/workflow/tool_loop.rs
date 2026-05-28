//! 工具调用循环
//!
//! 参考 claw-code 的 ConversationRuntime 实现，支持 AI 工具调用的循环执行

use super::cancellation::CancellationManager;
use super::executor::CollabEventCallback;
use super::events_gen::CollabEvent;
use super::parallel::ParallelDispatcher;
use super::runner::ToolCallDetails;
use super::tools::{create_tool_definitions, wait_for_feedback, ToolCall, ToolExecutor, ToolResult};
use crate::core_traits::ai::{Content, ContentPart, Message};
use futures_util::StreamExt;
use serde_json::json;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

/// 工具调用循环配置
#[derive(Debug, Clone)]
pub struct ToolLoopConfig {
    pub max_iterations: usize,
    pub max_tools_per_turn: usize,
    /// 当前 agent 标识（用于 CollabEvent 发射）
    pub agent_id: Option<String>,
}

impl Default for ToolLoopConfig {
    fn default() -> Self {
        Self {
            max_iterations: 10,
            max_tools_per_turn: 5,
            agent_id: None,
        }
    }
}

/// 🔥 工具调用进度回调类型
pub type ToolProgressCallback = Arc<dyn Fn(ToolCallDetails) + Send + Sync>;

/// 🔥 流式内容回调类型（用于 Doc agent 的渐进式输出）
pub type ContentDeltaCallback = Arc<dyn Fn(String, bool) + Send + Sync>;

/// 执行带工具调用的 AI 对话循环（用于 Explore、Review 等需要工具的 agent）
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
    progress_callback: Option<ToolProgressCallback>,
    cancellation_token: Option<CancellationToken>,
    collab_event_callback: Option<CollabEventCallback>,
) -> Result<String, String> {
    let workflow_start = std::time::Instant::now();
    let mut ai_time_total = std::time::Duration::ZERO;
    let mut tool_time_total = std::time::Duration::ZERO;
    let mut cancel_mgr = CancellationManager::new();

    wf_log!("[ToolLoop] 🚀 工具循环开始");
    wf_log!("[ToolLoop] 📊 系统提示词长度: {} 字符", system_prompt.len());
    wf_log!("[ToolLoop] 📊 用户消息长度: {} 字符", user_message.len());

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
    let mut collected_tool_summary: Vec<(String, String, usize)> = Vec::new(); // (tool_name, input_preview, output_len)

    loop {
        iterations += 1;
        if iterations > config.max_iterations {
            return Err(format!("超过最大迭代次数: {}", config.max_iterations));
        }

        // 检查外部取消
        if let Some(ref token) = cancellation_token {
            if token.is_cancelled() {
                wf_log!("[ToolLoop] 🛑 收到取消信号，中止工具循环");
                return Err("操作已取消".to_string());
            }
        }

        wf_log!(
            "[ToolLoop] 🔄 迭代 {}/{}",
            iterations, config.max_iterations
        );

        // 调用 AI（使用流式 API 实现实时工具调用显示）
        let ai_start = std::time::Instant::now();
        let (response, finish_reason) = call_ai_with_tools_stream(
            provider_config.clone(),
            &messages,
            progress_callback.clone(), // 🔥 传递进度回调给流式函数
            cancellation_token.clone(), // 🔥 传递取消令牌
        )
        .await?;
        let ai_duration = ai_start.elapsed();
        ai_time_total += ai_duration;

        let context_chars: usize = messages
            .iter()
            .map(|m| match &m.content {
                Content::Text(s) => s.len(),
                Content::Parts(parts) => parts.iter().map(|p| match p {
                    ContentPart::Text { text, .. } => text.len(),
                    ContentPart::ImageUrl { .. } => 0,
                }).sum(),
            })
            .sum();
        wf_log!(
            "[ToolLoop] ⏱️ 迭代 {} | AI 调用: {:.1}s | 上下文: {} chars | 消息数: {}",
            iterations,
            ai_duration.as_secs_f64(),
            context_chars,
            messages.len()
        );

        // TUI 风格：LLM 主动发 stop → 立即退出（即使响应中可能包含工具回显）
        if finish_reason.as_deref() == Some("stop") {
            wf_log!("[ToolLoop] ✅ LLM 主动停止 (finish_reason=stop)");
            final_response = response;
            break;
        }

        // 检查是否有工具调用
        let tool_calls = extract_tool_calls(&response)?;

        if tool_calls.is_empty() {
            let trimmed = response.trim();

            // 兜底：过滤工具调用回显（tool_call: 和 [已执行工具:] 格式）
            if trimmed.starts_with("tool_call:") || trimmed.starts_with("[已执行工具:") {
                wf_log!(
                    "[ToolLoop] ⚠️ 检测到工具调用回显，使用工具执行结果汇总: {}",
                    &trimmed[..trimmed.len().min(50)]
                );
                // 用收集的工具执行摘要替代回显
                if !collected_tool_summary.is_empty() {
                    let mut summary = format!("已执行 {} 个工具:\n", collected_tool_summary.len());
                    for (name, path, len) in &collected_tool_summary {
                        if path.is_empty() {
                            summary.push_str(&format!("- {} ({} 字符)\n", name, len));
                        } else {
                            summary.push_str(&format!("- {} {}\n", name, path));
                        }
                    }
                    final_response = summary;
                } else {
                    final_response = String::new();
                }
                break;
            }

            // 没有工具调用，返回 AI 响应
            final_response = response;
            wf_log!(
                "[ToolLoop] ✅ 完成，最终响应长度: {} 字符",
                final_response.len()
            );
            break;
        }

        // 🔥 移除单次工具调用数量限制，允许 AI 根据任务需求自由调用工具
        // 参考 claw-code 设计，不限制单次工具调用数量

        wf_log!("[ToolLoop] 🔧 检测到 {} 个工具调用", tool_calls.len());

        // 🔥 发送工具调用进度事件
        wf_log!(
            "[ToolLoop] 📤 发送工具调用进度事件: {} 个工具",
            tool_calls.len()
        );

        // 🔥 准备进度回调（克隆以在循环中使用）
        let progress_callback_clone = progress_callback.clone();

        // 🔥 并行执行所有工具调用（通过 ParallelDispatcher 进行读写锁调度）
        use futures::future::join_all;

        let tool_start = std::time::Instant::now();
        let dispatcher = ParallelDispatcher::new();

        // 为本批 tool_calls 创建子令牌
        let child_tokens = cancel_mgr.create_child_tokens(tool_calls.len());

        let mut tool_tasks = Vec::new();
        for (idx, tool_call) in tool_calls.iter().enumerate() {
            wf_log!("[ToolLoop] 🔧 启动工具: {}", tool_call.name);

            let tool_call = tool_call.clone();
            let callback_for_task = progress_callback_clone.clone();
            let dispatch_lock = dispatcher.lock.clone();
            let child_token = child_tokens[idx].clone();
            tool_tasks.push(async move {
                // 🔥 通过 ParallelDispatcher 调度 + tokio::select! 取消竞争
                let tool_start = std::time::Instant::now();
                let input_json = serde_json::to_string_pretty(&tool_call.input).unwrap_or_default();
                let tool_name = tool_call.name.clone();

                let result = tokio::select! {
                    // 取消路径
                    _ = child_token.cancelled() => {
                        wf_log!("[ToolLoop] 🛑 工具 {} 被取消", tool_call.name);
                        if let Some(ref cb) = callback_for_task {
                            cb(ToolCallDetails {
                                tool_name: tool_call.name.clone(),
                                tool_input: input_json.clone(),
                                tool_output: "操作已取消".to_string(),
                                output_length: 6,
                                execution_time_ms: Some(tool_start.elapsed().as_millis() as i64),
                                is_error: true,
                            });
                        }
                        ToolResult {
                            id: tool_call.id.clone(),
                            name: tool_call.name.clone(),
                            output: "操作已取消".to_string(),
                            is_error: true,
                            input: Some(input_json),
                            execution_time_ms: Some(tool_start.elapsed().as_millis() as i64),
                        }
                    }
                    // 实际执行路径（带读写锁调度）
                    result = async {
                        let dispatcher_ref = ParallelDispatcher {
                            lock: dispatch_lock,
                        };
                        dispatcher_ref.dispatch(&tool_name, || {
                            let tool_call = tool_call.clone();
                            async move {
                                tool_executor.execute(&tool_call.name, &tool_call.input).await
                            }
                        }).await
                    } => {
                        match result {
                            Ok(output) => {
                                let execution_time = tool_start.elapsed().as_millis() as i64;
                                wf_log!(
                                    "[ToolLoop] ✅ 工具 {} 成功，输出: {} 字符，耗时: {}ms",
                                    tool_call.name,
                                    output.len(),
                                    execution_time
                                );

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
                                wf_log!(
                                    "[ToolLoop] ❌ 工具 {} 失败: {}，耗时: {}ms",
                                    tool_call.name, e, execution_time
                                );

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
                        }
                    }
                };
                (tool_call, result)
            });
        }

        // 🔥 等待所有工具完成（并行执行）
        wf_log!("[ToolLoop] ⏳ 等待 {} 个工具完成...", tool_tasks.len());

        // 🔥 发送并行派发通知（仅当工具数 >= 2 时才有意义）
        if tool_calls.len() >= 2 {
            if let Some(ref cb) = progress_callback {
                let tool_names: Vec<String> = tool_calls.iter().map(|t| t.name.clone()).collect();
                cb(ToolCallDetails {
                    tool_name: String::new(),
                    tool_input: String::new(),
                    tool_output: format!("parallel:{}", tool_names.join(",")),
                    output_length: 0,
                    execution_time_ms: None,
                    is_error: false,
                });
            }
        }

        let results = join_all(tool_tasks).await;

        let tool_duration = tool_start.elapsed();
        tool_time_total += tool_duration;
        wf_log!(
            "[ToolLoop] ⏱️ 工具执行总耗时: {:?} ({} 个工具并行)",
            tool_duration,
            tool_calls.len()
        );

        // 🔥 检测 request_user_input 工具 — 等待用户反馈
        let mut results: Vec<(ToolCall, ToolResult)> = results;
        for (tool_call, ref mut result) in results.iter_mut() {
            if tool_call.name == "request_user_input" && !result.is_error {
                // 从输出中提取 _feedback_req_id
                if let Ok(output_json) = serde_json::from_str::<serde_json::Value>(&result.output) {
                    if let Some(feedback_req_id) = output_json.get("_feedback_req_id").and_then(|v| v.as_str()) {
                        wf_log!("[ToolLoop] 💬 request_user_input: 等待用户反馈 (id={})", feedback_req_id);

                        // 🔥 发射 InteractionBegin 事件
                        let agent_id = config.agent_id.clone().unwrap_or_default();
                        let question = output_json.get("title").and_then(|v| v.as_str()).unwrap_or("交互式提问").to_string();
                        if let Some(ref cb) = collab_event_callback {
                            cb.0(CollabEvent::InteractionBegin {
                                agent_id: agent_id.clone(),
                                question: question.clone(),
                                options: Vec::new(),
                            });
                                        }

                        match wait_for_feedback(feedback_req_id).await {
                            Ok(feedback) => {
                                let feedback_str = serde_json::to_string_pretty(&feedback).unwrap_or_default();
                                wf_log!("[ToolLoop] ✅ 收到用户反馈，长度: {} 字符", feedback_str.len());

                                // 🔥 发射 InteractionEnd 事件
                                if let Some(ref cb) = collab_event_callback {
                                    cb.0(CollabEvent::InteractionEnd {
                                        agent_id,
                                        response: feedback_str.clone(),
                                    });
                                }

                                result.output = feedback_str;
                            }
                            Err(e) => {
                                wf_log!("[ToolLoop] ⚠️ 用户反馈等待失败: {}", e);

                                // 🔥 发射 InteractionEnd 事件（失败）
                                if let Some(ref cb) = collab_event_callback {
                                    cb.0(CollabEvent::InteractionEnd {
                                        agent_id,
                                        response: format!("用户反馈等待失败: {}", e),
                                    });
                                }

                                result.output = format!("用户反馈等待失败: {}", e);
                                result.is_error = true;
                            }
                        }
                    }
                }
            }
        }

        // 将工具结果添加到消息历史
        for (tool_call, result) in results {
            // 收集工具执行摘要用于回显回退（只记工具名+输入摘要+输出长度）
            let input_preview = tool_call.input
                .get("rel_path").or(tool_call.input.get("path")).or(tool_call.input.get("dir"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            collected_tool_summary.push((tool_call.name.clone(), input_preview, result.output.len()));

            messages.push(Message {
                role: "assistant".to_string(),
                content: Content::Text(format!("[已执行工具: {}]", tool_call.name)),
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

        // 🛡️ 空目录检测：连续 agent_scan_project 返回空 → 注入系统消息终止循环
        let consecutive_empty_scans = collected_tool_summary
            .iter()
            .rev()
            .take(2)
            .filter(|(name, _, len)| {
                (name == "agent_scan_project" || name == "agent_list_dir") && *len == 0
            })
            .count();
        if consecutive_empty_scans >= 2 {
            wf_log!("[ToolLoop] 🛡️ 检测到{}次连续空扫描，注入空目录终止指令", consecutive_empty_scans);
            messages.push(Message {
                role: "system".to_string(),
                content: Content::Text(
                    "⚠️ 多次扫描结果为空，项目目录中没有源文件。\
                     无法完成需要分析源代码的任务。请基于已有信息直接给出结论，无需继续尝试。"
                        .to_string(),
                ),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        // 🛡️ 重复扫描守卫：agent_scan_project 已被调用 >= 2 次 → 禁止继续扫描
        let scan_call_count = collected_tool_summary
            .iter()
            .filter(|(name, _, _)| name == "agent_scan_project" || name == "agent_list_dir")
            .count();
        if scan_call_count >= 2 {
            wf_log!(
                "[ToolLoop] 🛡️ agent_scan_project 已调用 {} 次，注入停止扫描指令",
                scan_call_count
            );
            messages.push(Message {
                role: "system".to_string(),
                content: Content::Text(
                    "⚠️ 你已经多次调用 agent_scan_project。项目目录结构已在系统消息中完整提供，\
                     无需重复扫描。请直接使用 agent_read_file 读取目标文件并继续任务。\
                     不要再调用任何扫描工具（agent_scan_project / agent_list_dir）。".to_string(),
                ),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        // 🛡️ 空转检测：最近 4+ 次工具调用全是读取/扫描，没有写入 → 强制输出
        let recent_tools: Vec<&str> = collected_tool_summary
            .iter()
            .rev()
            .take(6)
            .map(|(name, _, _)| name.as_str())
            .collect();
        let has_write = recent_tools.iter().any(|n| *n == "agent_write_file");
        let all_readonly = recent_tools.len() >= 4 && recent_tools.iter().all(|n| {
            matches!(*n, "agent_scan_project" | "agent_list_dir" | "agent_read_file" | "agent_batch_read" | "grep")
        });
        if !has_write && all_readonly {
            wf_log!(
                "[ToolLoop] 🛡️ 检测到空转：连续 {} 次工具调用只有读取/扫描，无写入操作",
                recent_tools.len()
            );
            messages.push(Message {
                role: "system".to_string(),
                content: Content::Text(
                    "⚠️ 你已连续多次只读取文件而没有执行任何写入操作。\
                     请立即停止扫描和读取，基于已获得的信息直接生成最终输出。\
                     如果你有测试代码需要写入，请使用 agent_write_file。\
                     如果不需要写入，直接输出分析结论。".to_string(),
                ),
                tool_calls: None,
                tool_call_id: None,
            });
        }
    }

    // 🔥 输出性能统计
    let total_duration = workflow_start.elapsed();
    wf_log!("[ToolLoop] 📊 ========== 性能统计 ==========");
    wf_log!("[ToolLoop] 📊 总执行时长: {:?}", total_duration);
    wf_log!("[ToolLoop] 📊 迭代次数: {}", iterations);
    wf_log!(
        "[ToolLoop] 📊 AI API 调用总时长: {:?} (平均: {:?}/次)",
        ai_time_total,
        ai_time_total / iterations as u32
    );
    wf_log!("[ToolLoop] 📊 工具执行总时长: {:?}", tool_time_total);
    wf_log!(
        "[ToolLoop] 📊 AI 占比: {:.1}%",
        (ai_time_total.as_secs_f64() / total_duration.as_secs_f64()) * 100.0
    );
    wf_log!(
        "[ToolLoop] 📊 工具占比: {:.1}%",
        (tool_time_total.as_secs_f64() / total_duration.as_secs_f64()) * 100.0
    );
    wf_log!("[ToolLoop] 📊 ================================");

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
    let model = provider_config
        .models
        .first()
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

    wf_log!("[ToolLoop] 📤 发送请求到 AI，工具数量: {}", tools.len());

    let response = timeout(
        Duration::from_secs(60),
        client
            .post(&provider_config.base_url)
            .header(
                "Authorization",
                format!("Bearer {}", provider_config.api_key),
            )
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send(),
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
    wf_log!("[ToolLoop] 📤 调用 ifainew_core::ai::chat_with_tools");

    // 🔥 使用私有库的统一接口
    #[cfg(feature = "commercial")]
    {
        let response = ifainew_core::ai::chat_with_tools(
            provider_config,
            messages.to_vec(),
            true, // enable_tools
        )
        .await
        .map_err(|e| format!("AI 调用失败: {}", e))?;

        wf_log!(
            "[ToolLoop] ⏱️ AI API 耗时: {}ms",
            response.metrics.ai_api_duration_ms
        );

        // 返回工具调用 JSON 或内容
        if let Some(tool_calls) = response.tool_calls {
            let tool_calls_json = serde_json::to_string(&tool_calls).unwrap_or_default();
            wf_log!("[ToolLoop] 🔧 返回工具调用: {} 个", tool_calls.len());
            Ok(tool_calls_json)
        } else {
            wf_log!("[ToolLoop] ✅ 返回内容: {} 字符", response.content.len());
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
    wf_log!("[ToolLoop] 🔍 Parsing tool calls from: {}", response);

    // 尝试解析为工具调用数组
    if let Ok(tool_calls) = serde_json::from_str::<Vec<serde_json::Value>>(response) {
        let mut calls = Vec::new();
        for (index, tool_call) in tool_calls.iter().enumerate() {
            let id = tool_call
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or(&format!("call_{}", index))
                .to_string();

            let name = tool_call
                .get("function")
                .and_then(|f| f.get("name"))
                .and_then(|v| v.as_str())
                .ok_or("缺少工具名称")?
                .to_string();

            // 🔥 关键修复：arguments 是 JSON 字符串，需要再次解析
            let input = tool_call
                .get("function")
                .and_then(|f| f.get("arguments"))
                .and_then(|args| args.as_str())
                .and_then(|args_str| serde_json::from_str::<serde_json::Value>(args_str).ok())
                .clone()
                .unwrap_or(serde_json::json!({}));

            wf_log!("[ToolLoop] 🔍 Tool call: {} -> {:?}", name, input);
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
    cancellation_token: Option<CancellationToken>,
) -> Result<(String, Option<String>), String> {
    wf_log!("[ToolLoop] 📤 [STREAM] 调用流式 AI API");

    #[cfg(feature = "commercial")]
    {
        use eventsource_stream::Eventsource;
        use reqwest::Client;
        use std::collections::HashMap;
        use tokio::time::{timeout, Duration};

        // 🔥 步骤1：准备请求
        // 注意：api_key 和 base_url 已经是 String 类型，不是 Option
        let api_key = &provider_config.api_key;
        let base_url = &provider_config.base_url;
        let model = provider_config
            .models
            .first()
            .ok_or("缺少模型配置")?
            .clone();

        // 🔥 构建工具定义 - create_tool_definitions 已经返回 Vec<serde_json::Value>
        let tools_value = create_tool_definitions();

        // 构建请求消息
        let messages_for_api: Vec<serde_json::Value> = messages
            .iter()
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
                        let text: String = parts
                            .iter()
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

        wf_log!("[ToolLoop] 📤 [STREAM] 发送流式请求到: {}", completions_url);

        // 🔥 步骤2：发送流式请求（配置超时，防止半开连接永久挂起）
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .read_timeout(Duration::from_secs(600))
            .pool_idle_timeout(Duration::from_secs(120))
            .tcp_keepalive(Duration::from_secs(30))
            .build()
            .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;
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
        let mut finish_reason: Option<String> = None;
        let mut chunk_count = 0;
        let mut sent_tool_notifications = std::collections::HashSet::new();

        // 🔥 步骤5：处理每个流式 chunk（带超时保护 + 取消支持）
        let stream_timeout = Duration::from_secs(180);
        loop {
            // 🔥 检查取消状态（在每次迭代开始时）
            if let Some(ref token) = cancellation_token {
                if token.is_cancelled() {
                    wf_log!("[ToolLoop] 🛑 [STREAM] 收到取消信号，中止流式处理");
                    return Err("操作已取消".to_string());
                }
            }

            let event_result = match timeout(stream_timeout, stream.next()).await {
                Ok(Some(result)) => result,
                Ok(None) => {
                    wf_log!("[ToolLoop] 📤 [STREAM] 流正常结束");
                    break;
                }
                Err(_) => {
                    let err_msg = format!(
                        "SSE 流读取超时（{}s），API 可能无响应。已处理 {} 个 chunks",
                        stream_timeout.as_secs(),
                        chunk_count
                    );
                    wf_log!("[ToolLoop] ❌ {}", err_msg);
                    return Err(err_msg);
                }
            };

            match event_result {
                Ok(event) => {
                    if event.data == "[DONE]" {
                        wf_log!("[ToolLoop] 📤 [STREAM] 收到 [DONE] 信号");
                        break;
                    }

                    chunk_count += 1;

                    // 解析 JSON
                    if let Ok(stream_response) =
                        serde_json::from_str::<OpenAIStreamResponse>(&event.data)
                    {
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
                                    let entry =
                                        accumulated_tools.entry(index).or_insert_with(|| {
                                            let id = chunk
                                                .id
                                                .clone()
                                                .unwrap_or_else(|| format!("call_{}", index));
                                            let name = chunk
                                                .function
                                                .as_ref()
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
                                    let has_name = chunk
                                        .function
                                        .as_ref()
                                        .and_then(|f| f.name.as_ref())
                                        .is_some();

                                    if (has_id || has_name)
                                        && !sent_tool_notifications.contains(&index)
                                    {
                                        sent_tool_notifications.insert(index);

                                        let tool_id = &entry.0;
                                        let tool_name = &entry.1;

                                        wf_log!(
                                            "[ToolLoop] 🔥 [STREAM] 检测到新工具调用 #{}: {} ({})",
                                            index, tool_name, tool_id
                                        );

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
                            if let Some(reason) = &choice.finish_reason {
                                finish_reason = Some(reason.clone());
                                wf_log!(
                                    "[ToolLoop] 📤 [STREAM] 流结束，原因: {:?}",
                                    finish_reason
                                );
                                break;
                            }
                        }
                    }
                }
                Err(e) => {
                    let err_msg = format!("SSE 流处理错误（已处理 {} 个 chunks）: {}", chunk_count, e);
                    wf_log!("[ToolLoop] ❌ {}", err_msg);
                    return Err(err_msg);
                }
            }
        }

        wf_log!("[ToolLoop] 📊 [STREAM] 处理了 {} 个 chunks", chunk_count);
        wf_log!(
            "[ToolLoop] 🔧 [STREAM] 累积了 {} 个工具调用",
            accumulated_tools.len()
        );

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

            wf_log!(
                "[ToolLoop] ✅ [STREAM] 返回 {} 个工具调用，总长度: {} 字符",
                final_tool_calls.len(),
                result_json.len()
            );

            Ok((result_json, finish_reason))
        } else {
            // 没有工具调用，返回内容
            wf_log!(
                "[ToolLoop] ✅ [STREAM] 返回文本内容，长度: {} 字符",
                final_content.len()
            );
            Ok((final_content, finish_reason))
        }
    }

    // 🔥 Community 版本的降级处理
    #[cfg(not(feature = "commercial"))]
    {
        wf_log!("[ToolLoop] ⚠️ [STREAM] Community 版本，回退到非流式 API");
        call_ai_with_tools_unified(provider_config, messages)
            .await
            .map(|s| (s, None))
    }
}

/// 🔥 简化版流式 AI 调用（用于 Doc agent 等不需要工具的场景）
///
/// 与 `call_ai_with_tools_stream` 的区别：
/// - 不支持工具调用
/// - 专注于纯文本输出的流式传输
/// - 通过回调实时传递每个内容增量
///
/// # 参数
/// - `provider_config`: AI 提供商配置
/// - `system_prompt`: 系统提示词
/// - `user_message`: 用户消息
/// - `content_callback`: 内容增量回调 (delta_text, is_finished)
/// - `cancellation_token`: 取消令牌（可选）
///
/// # 返回
/// 完整的响应文本
pub async fn call_ai_streaming_simple(
    provider_config: crate::core_traits::ai::AIProviderConfig,
    system_prompt: String,
    user_message: String,
    content_callback: ContentDeltaCallback,
    cancellation_token: Option<CancellationToken>,
) -> Result<String, String> {
    wf_log!("[ToolLoop] 📤 [SIMPLE_STREAM] 调用简化流式 AI API");
    wf_log!("[ToolLoop] 📊 系统提示词长度: {} 字符", system_prompt.len());
    wf_log!("[ToolLoop] 📊 用户消息长度: {} 字符", user_message.len());

    #[cfg(feature = "commercial")]
    {
        use eventsource_stream::Eventsource;
        use reqwest::Client;

        // 🔥 准备请求
        let api_key = &provider_config.api_key;
        let base_url = &provider_config.base_url;
        let model = provider_config
            .models
            .first()
            .ok_or("缺少模型配置")?
            .clone();

        // 构建请求消息
        let messages_for_api = vec![
            serde_json::json!({
                "role": "system",
                "content": system_prompt
            }),
            serde_json::json!({
                "role": "user",
                "content": user_message
            }),
        ];

        let completions_url = base_url.clone();

        let request = serde_json::json!({
            "model": model,
            "messages": messages_for_api,
            "stream": true,
        });

        wf_log!(
            "[ToolLoop] 📤 [SIMPLE_STREAM] 发送流式请求到: {}",
            completions_url
        );

        // 🔥 发送流式请求
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

        // 🔥 处理流式响应
        let mut stream = response.bytes_stream().eventsource();

        let mut final_content = String::new();
        let mut chunk_count = 0;
        let mut last_callback_time = std::time::Instant::now();
        let mut accumulated_delta = String::new();

        // 🔥 节流配置：每 100ms 或累积 30 个字符触发一次回调（优化流式体验）
        const CALLBACK_INTERVAL_MS: u64 = 100;
        const MIN_DELTA_LENGTH: usize = 30;

        wf_log!("[ToolLoop] 📥 [SIMPLE_STREAM] 开始接收流式响应...");

        // 🔥 处理每个流式 chunk（带取消检查）
        while let Some(event_result) = stream.next().await {
            // 🔥 检查取消状态（在每次迭代开始时）
            if let Some(ref token) = cancellation_token {
                if token.is_cancelled() {
                    wf_log!("[ToolLoop] 🛑 [SIMPLE_STREAM] 收到取消信号，中止流式处理");
                    return Err("操作已取消".to_string());
                }
            }

            match event_result {
                Ok(event) => {
                    if event.data == "[DONE]" {
                        wf_log!("[ToolLoop] 📤 [SIMPLE_STREAM] 收到 [DONE] 信号");
                        break;
                    }

                    chunk_count += 1;

                    // 解析 JSON
                    if let Ok(stream_response) =
                        serde_json::from_str::<OpenAIStreamResponse>(&event.data)
                    {
                        if let Some(choice) = stream_response.choices.first() {
                            // 处理内容
                            if let Some(content) = &choice.delta.content {
                                final_content.push_str(content);
                                accumulated_delta.push_str(content);

                                // 🔥 节流：检查是否应该触发回调
                                let now = std::time::Instant::now();
                                let should_callback = accumulated_delta.len() >= MIN_DELTA_LENGTH
                                    || now.duration_since(last_callback_time).as_millis()
                                        >= CALLBACK_INTERVAL_MS as u128;

                                if should_callback && !accumulated_delta.is_empty() {
                                    // 发送内容增量
                                    content_callback(accumulated_delta.clone(), false);
                                    accumulated_delta.clear();
                                    last_callback_time = now;
                                }

                                chunk_count += 1;
                            }

                            // 检查是否完成
                            if choice.finish_reason.is_some() {
                                wf_log!(
                                    "[ToolLoop] 📤 [SIMPLE_STREAM] 流结束，原因: {:?}",
                                    choice.finish_reason
                                );

                                // 🔥 发送剩余的累积内容
                                if !accumulated_delta.is_empty() {
                                    content_callback(accumulated_delta.clone(), false);
                                }

                                // 🔥 发送完成信号
                                content_callback(String::new(), true);

                                break;
                            }
                        }
                    }
                }
                Err(e) => {
                    wf_log!("[ToolLoop] ⚠️ [SIMPLE_STREAM] 流处理错误: {}", e);

                    // 🔥 出错时也要发送剩余的累积内容
                    if !accumulated_delta.is_empty() {
                        content_callback(accumulated_delta.clone(), false);
                    }

                    // 发送完成信号
                    content_callback(String::new(), true);

                    break;
                }
            }
        }

        wf_log!(
            "[ToolLoop] 📊 [SIMPLE_STREAM] 处理了 {} 个 chunks",
            chunk_count
        );
        wf_log!(
            "[ToolLoop] ✅ [SIMPLE_STREAM] 返回完整内容，长度: {} 字符",
            final_content.len()
        );

        Ok(final_content)
    }

    // 🔥 Community 版本的降级处理
    #[cfg(not(feature = "commercial"))]
    {
        wf_log!("[ToolLoop] ⚠️ [SIMPLE_STREAM] Community 版本，回退到非流式 API");
        // Community 版本使用非流式调用
        let messages = vec![
            crate::core_traits::ai::Message {
                role: "system".to_string(),
                content: crate::core_traits::ai::Content::Text(system_prompt),
                tool_calls: None,
                tool_call_id: None,
            },
            crate::core_traits::ai::Message {
                role: "user".to_string(),
                content: crate::core_traits::ai::Content::Text(user_message),
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        // 使用 ai_utils::fetch_ai_completion_simple 进行非流式调用
        let result_msg =
            crate::ai_utils::fetch_ai_completion_simple(&provider_config, messages).await?;

        // 从 Message 提取文本内容
        let content_str = match &result_msg.content {
            crate::core_traits::ai::Content::Text(s) => s.clone(),
            crate::core_traits::ai::Content::Parts(parts) => parts
                .iter()
                .filter_map(|p| match p {
                    crate::core_traits::ai::ContentPart::Text { text, .. } => Some(text.clone()),
                    crate::core_traits::ai::ContentPart::ImageUrl { .. } => None,
                })
                .collect::<Vec<_>>()
                .join(""),
        };

        Ok(content_str)
    }
}

// ============================================================================
// 🔥 Explore Agent 分段执行器（强制 3 轮探索）
// ============================================================================

/// 🔥 Explore Agent 分段执行器
///
/// 问题：DeepSeek 模型即使明确指示，也会在第 3 轮继续使用 agent_read_file 而不是 agent_search
/// 解决：通过代码级别的工具过滤，强制每轮只使用特定工具
///
/// 执行流程：
/// - Round 1: 只提供 agent_read_file，读取初始文件
/// - Round 2: 只提供 agent_read_file，读取核心模块
/// - Round 3: 只提供 agent_search、agent_list_dir，搜索代码
/// - Round 4: 不提供工具，生成最终报告
pub async fn execute_explore_agent_staged(
    provider_config: crate::core_traits::ai::AIProviderConfig,
    system_prompt: String,
    user_message: String,
    tool_executor: &dyn ToolExecutor,
    progress_callback: Option<ToolProgressCallback>,
    cancellation_token: Option<CancellationToken>,
) -> Result<String, String> {
    wf_log!("[ExploreStaged] 🚀 开始分段执行 Explore Agent");

    // Round 1: 读取初始文件
    wf_log!("[ExploreStaged] 📍 Round 1: 读取初始文件");
    let round1_tools = vec!["agent_read_file"];
    let round1_prompt = format!(
        "{}\n\n**当前阶段：第 1 轮**\n只读取这些文件：\n- Cargo.toml\n- src/main.rs\n- src/lib.rs\n- README.md\n\n读取后继续第 2 轮，不要输出总结。",
        system_prompt
    );
    let (round1_response, round1_tools_used) = execute_single_stage(
        provider_config.clone(),
        round1_prompt,
        user_message.clone(),
        tool_executor,
        round1_tools,
        progress_callback.clone(),
        cancellation_token.clone(),
        "Round 1".to_string(),
    ).await?;

    wf_log!(
        "[ExploreStaged] ✅ Round 1 完成，使用了 {} 个工具",
        round1_tools_used
    );

    // Round 2: 读取核心模块（限制 10 个文件）
    wf_log!("[ExploreStaged] 📍 Round 2: 读取核心模块文件");
    let round2_tools = vec!["agent_read_file"];
    let round2_prompt = format!(
        "{}\n\n**当前阶段：第 2 轮**\n基于第 1 轮的结果，读取项目的核心模块文件。\n\n🔴 **严格限制：最多读取 10 个文件**\n\n优先级顺序：\n1. 主要业务逻辑模块（如 agent_system/、commands/、ai/）\n2. 核心工具和实用模块\n3. 避免读取测试文件、示例代码、构建脚本\n\n读取后继续第 3 轮，不要输出总结。如果已读取 10 个文件，立即进入第 3 轮。",
        system_prompt
    );
    let round2_user_msg = format!(
        "{}\n\n第 1 轮已完成，读取了 {} 个文件。现在读取核心模块文件，最多 10 个。",
        user_message, round1_tools_used
    );
    let (round2_response, round2_tools_used) = execute_single_stage(
        provider_config.clone(),
        round2_prompt,
        round2_user_msg,
        tool_executor,
        round2_tools,
        progress_callback.clone(),
        cancellation_token.clone(),
        "Round 2".to_string(),
    ).await?;

    wf_log!(
        "[ExploreStaged] ✅ Round 2 完成，使用了 {} 个工具",
        round2_tools_used
    );

    // Round 3: 搜索代码（限制范围到 src/）
    wf_log!("[ExploreStaged] 📍 Round 3: 搜索代码");
    let round3_tools = vec!["agent_search", "agent_list_dir"];
    let round3_prompt = format!(
        "{}\n\n**当前阶段：第 3 轮**\n使用搜索工具搜索代码模式。\n\n🔴 **严格限制：只在 src/ 目录内搜索**（避免搜索测试文件和示例代码）\n\n执行这些搜索：\n- agent_search(\"TODO|FIXME\", \"src/\")\n- agent_search(\"async fn\", \"src/\")\n- agent_search(\"pub fn\", \"src/\")\n- agent_search(\"Result|Err\", \"src/\")\n- agent_search(\"struct\\w+\", \"src/\")\n- agent_search(\"impl\\w+\", \"src/\")\n\n搜索后继续第 4 轮，不要输出总结。",
        system_prompt
    );
    let round3_user_msg = format!(
        "{}\n\n第 2 轮已完成，读取了 {} 个文件。现在使用搜索工具搜索 src/ 目录。",
        user_message, round2_tools_used
    );
    let (_round3_response, round3_tools_used) = execute_single_stage(
        provider_config.clone(),
        round3_prompt,
        round3_user_msg,
        tool_executor,
        round3_tools,
        progress_callback.clone(),
        cancellation_token.clone(),
        "Round 3".to_string(),
    ).await?;

    wf_log!(
        "[ExploreStaged] ✅ Round 3 完成，使用了 {} 个工具",
        round3_tools_used
    );

    // Round 4: 生成最终报告（无工具）
    wf_log!("[ExploreStaged] 📍 Round 4: 生成最终报告");
    let round4_tools = vec![]; // 不提供任何工具
    let round4_prompt = format!(
        "{}\n\n**当前阶段：第 4 轮（最终报告）**\n基于以上 3 轮探索的结果，生成完整的项目分析报告。\n第 1 轮读取了 {} 个文件。\n第 2 轮读取了 {} 个文件。\n第 3 轮使用了 {} 个搜索。\n\n现在生成最终的项目分析报告。",
        system_prompt, round1_tools_used, round2_tools_used, round3_tools_used
    );
    let round4_user_msg = format!(
        "{}\n\n已完成 3 轮探索。现在生成最终的项目分析报告。",
        user_message
    );
    let (final_report, _) = execute_single_stage(
        provider_config,
        round4_prompt,
        round4_user_msg,
        tool_executor,
        round4_tools,
        progress_callback,
        cancellation_token,
        "Round 4 (Final)".to_string(),
    ).await?;

    wf_log!("[ExploreStaged] ✅ 所有 4 轮完成，生成最终报告");
    wf_log!(
        "[ExploreStaged] 📊 总计：R1={} 个工具, R2={} 个工具, R3={} 个工具",
        round1_tools_used, round2_tools_used, round3_tools_used
    );

    Ok(final_report)
}

/// 🔥 执行单个阶段（带工具过滤）
///
/// 只提供指定的工具列表，强制 AI 只使用这些工具
async fn execute_single_stage(
    provider_config: crate::core_traits::ai::AIProviderConfig,
    system_prompt: String,
    user_message: String,
    tool_executor: &dyn ToolExecutor,
    allowed_tools: Vec<&str>,
    progress_callback: Option<ToolProgressCallback>,
    cancellation_token: Option<CancellationToken>,
    stage_name: String,
) -> Result<(String, usize), String> {
    wf_log!(
        "[ExploreStaged] 📍 {} - 允许的工具: {:?}",
        stage_name,
        allowed_tools
    );

    // 创建过滤后的工具定义
    let all_tools = super::tools::create_tool_definitions();
    let filtered_tools: Vec<serde_json::Value> = all_tools
        .into_iter()
        .filter(|tool| {
            let tool_name = tool
                .get("function")
                .and_then(|f| f.get("name"))
                .and_then(|n| n.as_str())
                .unwrap_or("");
            allowed_tools.contains(&tool_name)
        })
        .collect();

    wf_log!(
        "[ExploreStaged] 🔧 {} - 过滤后工具数: {}",
        stage_name,
        filtered_tools.len()
    );

    // 使用过滤后的工具定义执行
    execute_with_tools_filtered(
        provider_config,
        system_prompt,
        user_message,
        tool_executor,
        ToolLoopConfig::default(),
        progress_callback,
        cancellation_token,
        filtered_tools,
        stage_name,
    )
    .await
}

/// 🔥 带工具过滤的工具循环执行
async fn execute_with_tools_filtered(
    provider_config: crate::core_traits::ai::AIProviderConfig,
    system_prompt: String,
    user_message: String,
    tool_executor: &dyn ToolExecutor,
    config: ToolLoopConfig,
    progress_callback: Option<ToolProgressCallback>,
    cancellation_token: Option<CancellationToken>,
    tools: Vec<serde_json::Value>, // 🔥 使用过滤后的工具定义
    stage_name: String,
) -> Result<(String, usize), String> {
    let mut messages = vec![
        crate::core_traits::ai::Message {
            role: "system".to_string(),
            content: crate::core_traits::ai::Content::Text(system_prompt),
            tool_calls: None,
            tool_call_id: None,
        },
        crate::core_traits::ai::Message {
            role: "user".to_string(),
            content: crate::core_traits::ai::Content::Text(user_message),
            tool_calls: None,
            tool_call_id: None,
        },
    ];

    let mut iterations = 0;
    let mut total_tools_used = 0;

    loop {
        iterations += 1;
        if iterations > config.max_iterations {
            return Err(format!(
                "[{}] 超过最大迭代次数: {}",
                stage_name, config.max_iterations
            ));
        }

        // 检查外部取消
        if let Some(ref token) = cancellation_token {
            if token.is_cancelled() {
                wf_log!("[ExploreStaged] 🛑 {} - 收到取消信号", stage_name);
                return Err("操作已取消".to_string());
            }
        }

        wf_log!("[ExploreStaged] 🔄 {} - 迭代 {}", stage_name, iterations);

        // 调用 AI（使用过滤后的工具定义）
        let response = call_ai_with_tools_filtered(
            provider_config.clone(),
            &messages,
            tools.clone(), // 🔥 使用过滤后的工具
        )
        .await?;

        // 检查是否有工具调用
        let tool_calls = extract_tool_calls(&response)?;

        if tool_calls.is_empty() {
            wf_log!(
                "[ExploreStaged] ✅ {} - 完成，未检测到工具调用",
                stage_name
            );
            return Ok((response, total_tools_used));
        }

        wf_log!(
            "[ExploreStaged] 🔧 {} - 检测到 {} 个工具调用",
            stage_name,
            tool_calls.len()
        );
        total_tools_used += tool_calls.len();

        // 并行执行工具
        use futures::future::join_all;
        let mut tool_tasks = Vec::new();
        for tool_call in tool_calls.iter() {
            let tool_call = tool_call.clone();
            let callback_for_task = progress_callback.clone();
            let tool_start = std::time::Instant::now();

            tool_tasks.push(async move {
                let exec_result = tool_executor.execute(&tool_call.name, &tool_call.input).await;

                let tool_result = match exec_result {
                    Ok(output) => {
                        let execution_time = tool_start.elapsed().as_millis() as i64;
                        wf_log!(
                            "[ExploreStaged] ✅ 工具 {} 成功，耗时: {}ms",
                            tool_call.name,
                            execution_time
                        );

                        if let Some(ref cb) = callback_for_task {
                            let input_json = serde_json::to_string_pretty(&tool_call.input)
                                .unwrap_or_default();
                            cb(super::runner::ToolCallDetails {
                                tool_name: tool_call.name.clone(),
                                tool_input: input_json,
                                tool_output: output.clone(),
                                output_length: output.len(),
                                execution_time_ms: Some(execution_time),
                                is_error: false,
                            });
                        }

                        super::tools::ToolResult {
                            id: tool_call.id.clone(),
                            name: tool_call.name.clone(),
                            output,
                            is_error: false,
                            input: None,
                            execution_time_ms: Some(execution_time),
                        }
                    }
                    Err(e) => {
                        let execution_time = tool_start.elapsed().as_millis() as i64;
                        let error_msg = format!("工具执行失败: {}", e);
                        wf_log!(
                            "[ExploreStaged] ❌ 工具 {} 失败: {}",
                            tool_call.name, e
                        );

                        if let Some(ref cb) = callback_for_task {
                            let input_json = serde_json::to_string_pretty(&tool_call.input)
                                .unwrap_or_default();
                            cb(super::runner::ToolCallDetails {
                                tool_name: tool_call.name.clone(),
                                tool_input: input_json,
                                tool_output: error_msg.clone(),
                                output_length: error_msg.len(),
                                execution_time_ms: Some(execution_time),
                                is_error: true,
                            });
                        }

                        super::tools::ToolResult {
                            id: tool_call.id.clone(),
                            name: tool_call.name.clone(),
                            output: error_msg,
                            is_error: true,
                            input: None,
                            execution_time_ms: Some(execution_time),
                        }
                    }
                };

                (tool_call, tool_result)
            });
        }

        // 🔥 发送并行派发通知（仅当工具数 >= 2 时才有意义）
        if tool_calls.len() >= 2 {
            if let Some(ref cb) = progress_callback {
                let tool_names: Vec<String> = tool_calls.iter().map(|t| t.name.clone()).collect();
                cb(super::runner::ToolCallDetails {
                    tool_name: String::new(),
                    tool_input: String::new(),
                    tool_output: format!("parallel:{}", tool_names.join(",")),
                    output_length: 0,
                    execution_time_ms: None,
                    is_error: false,
                });
            }
        }

        let results = join_all(tool_tasks).await;

        // 将工具结果添加到消息历史
        for (tool_call, result) in results {
            messages.push(crate::core_traits::ai::Message {
                role: "assistant".to_string(),
                content: crate::core_traits::ai::Content::Text(format!(
                    "[已执行工具: {}]",
                    tool_call.name
                )),
                tool_calls: None,
                tool_call_id: None,
            });

            messages.push(crate::core_traits::ai::Message {
                role: "user".to_string(),
                content: crate::core_traits::ai::Content::Text(result.output),
                tool_calls: None,
                tool_call_id: None,
            });
        }
    }
}

/// 🔥 调用 AI（支持自定义工具列表）
async fn call_ai_with_tools_filtered(
    provider_config: crate::core_traits::ai::AIProviderConfig,
    messages: &[crate::core_traits::ai::Message],
    tools: Vec<serde_json::Value>, // 🔥 自定义工具列表
) -> Result<String, String> {
    use reqwest::Client;
    use tokio::time::{timeout, Duration};

    let client = Client::new();

    // 获取模型名称
    let model = provider_config
        .models
        .first()
        .cloned()
        .unwrap_or_else(|| "glm-4.7".to_string());

    // 构建请求体
    let request_body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": false,
        "temperature": 0.7,
        "tools": tools, // 🔥 使用自定义工具列表
        "tool_choice": "auto"
    });

    wf_log!(
        "[ExploreStaged] 📤 发送请求到 AI，工具数量: {}",
        tools.len()
    );

    let response = timeout(
        Duration::from_secs(60),
        client
            .post(&provider_config.base_url)
            .header(
                "Authorization",
                format!("Bearer {}", provider_config.api_key),
            )
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send(),
    )
    .await
    .map_err(|e| format!("AI 请求超时: {}", e))?
    .map_err(|e| format!("AI 请求失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("AI 返回错误: {} - {}", status, error_text));
    }

    let response_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析 AI 响应失败: {}", e))?;

    // 🔥 提取响应内容或工具调用
    let message = response_json
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"));

    if let Some(msg) = message {
        // 🔥 优先检查是否有工具调用
        if let Some(tool_calls) = msg.get("tool_calls").and_then(|tc| tc.as_array()) {
            if !tool_calls.is_empty() {
                // 返回工具调用的 JSON 字符串
                return Ok(serde_json::to_string(tool_calls).map_err(|e| format!("序列化工具调用失败: {}", e))?);
            }
        }

        // 🔥 没有工具调用，返回 content
        if let Some(content) = msg.get("content").and_then(|c| c.as_str()) {
            Ok(content.to_string())
        } else {
            // content 为 null，返回空字符串
            Ok(String::new())
        }
    } else {
        Err("AI 响应格式错误".to_string())
    }
}

// ============================================================================
// E2E 高保真测试 — 使用 wiremock 模拟 LLM API，验证完整工具循环
// ============================================================================

#[cfg(test)]
#[cfg(not(feature = "commercial"))]
mod e2e_tests {
    use super::*;
    use crate::agent_system::workflow::tools::DefaultToolExecutor;
    use crate::core_traits::ai::AIProviderConfig;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tempfile::TempDir;
    use wiremock::{Mock, MockServer, Request, Respond, ResponseTemplate};
    use wiremock::matchers::{method, path};

    /// E2E 测试响应器：多轮非流式响应
    ///
    /// 模拟 LLM 的三轮对话（不解析请求体，按调用次数返回固定响应）：
    /// - Turn 0: 返回 agent_read_file 工具调用
    /// - Turn 1: 返回 agent_write_file 工具调用
    /// - Turn 2+: 返回文本完成响应
    struct E2EMockResponder {
        turn: AtomicUsize,
    }

    impl E2EMockResponder {
        fn new() -> Self {
            Self {
                turn: AtomicUsize::new(0),
            }
        }
    }

    impl Respond for E2EMockResponder {
        fn respond(&self, _request: &Request) -> ResponseTemplate {
            let turn = self.turn.fetch_add(1, Ordering::SeqCst);

            match turn {
                0 => {
                    // Turn 0: 模拟 LLM 首次调用 agent_read_file
                    let response = json!({
                        "id": "chatcmpl-e2e-0",
                        "object": "chat.completion",
                        "created": 1234567890,
                        "model": "gpt-4",
                        "choices": [{
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": null,
                                "tool_calls": [{
                                    "id": "call_read_main",
                                    "type": "function",
                                    "function": {
                                        "name": "agent_read_file",
                                        "arguments": json!({"rel_path": "src/main.rs"}).to_string()
                                    }
                                }]
                            },
                            "finish_reason": "tool_calls"
                        }]
                    });
                    ResponseTemplate::new(200)
                        .set_body_json(response)
                        .insert_header("Content-Type", "application/json")
                }
                1 => {
                    // Turn 1: 模拟 LLM 读取源码后调用 agent_write_file
                    let response = json!({
                        "id": "chatcmpl-e2e-1",
                        "object": "chat.completion",
                        "created": 1234567890,
                        "model": "gpt-4",
                        "choices": [{
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": null,
                                "tool_calls": [{
                                    "id": "call_write_test",
                                    "type": "function",
                                    "function": {
                                        "name": "agent_write_file",
                                        "arguments": json!({
                                            "rel_path": "tests/test_e2e_generated.rs",
                                            "content": "// E2E generated test\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn test_generated_by_llm() {\n        assert_eq!(1 + 1, 2);\n    }\n}\n"
                                        }).to_string()
                                    }
                                }]
                            },
                            "finish_reason": "tool_calls"
                        }]
                    });
                    ResponseTemplate::new(200)
                        .set_body_json(response)
                        .insert_header("Content-Type", "application/json")
                }
                _ => {
                    // Turn 2+: 模拟 LLM 最终文本响应
                    let response = json!({
                        "id": "chatcmpl-e2e-2",
                        "object": "chat.completion",
                        "created": 1234567890,
                        "model": "gpt-4",
                        "choices": [{
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": "✅ 测试文件已成功生成。"
                            },
                            "finish_reason": "stop"
                        }]
                    });
                    ResponseTemplate::new(200)
                        .set_body_json(response)
                        .insert_header("Content-Type", "application/json")
                }
            }
        }
    }

    /// 高保真 E2E 测试：模拟 LLM 通过工具循环读取源码 → 生成测试 → 写入文件
    ///
    /// 验证完整链路：
    /// 1. `execute_with_tools` 正确发送 HTTP POST 到 LLM API（wiremock 验证请求到达）
    /// 2. tool_loop 正确解析 LLM 返回的工具调用 JSON
    /// 3. ParallelDispatcher 正确调度 agent_read_file 并读取源文件
    /// 4. tool_loop 将读取结果发回"LLM"后，"LLM"返回 agent_write_file
    /// 5. DefaultToolExecutor.write_file() 正确将测试文件写入磁盘
    /// 6. 文件系统上确实存在写入的文件，且内容正确
    #[tokio::test]
    async fn test_e2e_llm_tool_call_read_and_write_files() {
        // ── 1. 创建临时项目目录 ──────────────────────────────────
        let temp_dir = TempDir::new().unwrap();
        let project_root = temp_dir.path().to_str().unwrap().to_string();

        // 创建源文件（待读取）
        let src_dir = temp_dir.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("main.rs"), "fn main() { println!(\"Hello\"); }\n").unwrap();

        // 创建目标写入目录
        let tests_dir = temp_dir.path().join("tests");
        std::fs::create_dir_all(&tests_dir).unwrap();

        // ── 2. 启动 wiremock 服务器 ──────────────────────────────
        let mock_server = MockServer::start().await;
        let mock_uri = mock_server.uri();

        // 设置多轮非流式响应
        let responder = E2EMockResponder::new();

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(responder)
            .mount(&mock_server)
            .await;

        // ── 3. 配置 AIProviderConfig 指向 wiremock ──────────────
        let provider_config = AIProviderConfig {
            id: "mock".to_string(),
            name: "Mock LLM".to_string(),
            api_key: "test-key".to_string(),
            base_url: format!("{}/v1/chat/completions", mock_uri),
            models: vec!["gpt-4".to_string()],
            protocol: crate::core_traits::ai::AIProtocol::OpenAI,
            enabled: true,
        };

        // ── 4. 创建 DefaultToolExecutor ──────────────────────────
        let executor = DefaultToolExecutor::new(project_root.clone());

        // ── 5. 执行工具循环 ──────────────────────────────────────
        let result = execute_with_tools(
            provider_config,
            "你是一个测试生成助手。请读取源代码并生成对应的测试文件。".to_string(),
            "请为 src/main.rs 生成测试文件".to_string(),
            &executor,
            ToolLoopConfig {
                max_iterations: 10,
                max_tools_per_turn: 5,
                agent_id: None,
            },
            None,  // progress_callback
            None,  // cancellation_token
            None,  // collab_event_callback
        ).await;

        // ── 6. 验证工具循环执行结果 ──────────────────────────────
        assert!(result.is_ok(),
            "工具循环应该成功完成，但收到错误: {:?}", result.err());
        let response_text = result.unwrap();
        assert!(response_text.contains("测试文件已成功生成") || response_text.contains("已执行"),
            "最终响应应该包含完成消息，实际内容: {}", response_text);

        // ── 7. 验证 agent_write_file 确实写入文件到磁盘 ──────────
        let written_file = temp_dir.path().join("tests/test_e2e_generated.rs");
        assert!(written_file.exists(),
            "agent_write_file 应该创建文件: {:?}", written_file);

        let written_content = std::fs::read_to_string(&written_file)
            .expect("应该能读取写入的测试文件");
        assert!(written_content.contains("test_generated_by_llm"),
            "写入的内容应该包含测试函数名，实际内容:\n{}", written_content);
        assert!(written_content.contains("assert_eq!(1 + 1, 2)"),
            "写入的内容应该包含断言，实际内容:\n{}", written_content);

        // ── 8. 验证原始源文件未被修改 ──────────────────────────
        let original_source = std::fs::read_to_string(temp_dir.path().join("src/main.rs"))
            .expect("应该能读取原始源文件");
        assert_eq!(original_source, "fn main() { println!(\"Hello\"); }\n",
            "原始源文件不应被修改");
    }
}

// ============================================================================
// 真实 LLM E2E 测试 — 加载实际 test.md 提示词，使用真实 LLM API 高保真还原
// ============================================================================
//
// 与 wiremock 测试不同，本测试直接调用真实 LLM API：
// 1. 加载 .ifai/prompts/agents/test.md（用户实际使用的提示词文件）
// 2. 配置真实 LLM（从环境变量读取 API key）
// 3. 完整执行 execute_with_tools 工具循环
// 4. 验证 LLM 确实调用了 agent_write_file 并写入文件到磁盘
//
// 运行方法：
//   export IFAI_API_KEY="your-api-key"
//   cargo test -p ifainew --lib real_llm -- --nocapture --ignored
//
// 环境变量说明：
//   IFAI_API_KEY | ZHIPU_API_KEY | DEEPSEEK_API_KEY | OPENAI_API_KEY  (必填)
//   IFAI_API_BASE                                                (可选，默认智谱)
//   IFAI_MODEL                                                   (可选，默认 glm-4.6)

#[cfg(test)]
mod real_llm_e2e_tests {
    use super::*;
    use crate::agent_system::workflow::prompt_loader::{AgentPromptLoader, PromptContext};
    use crate::agent_system::workflow::tools::DefaultToolExecutor;
    use crate::agent_system::workflow::types::AgentType;
    use crate::core_traits::ai::AIProviderConfig;
    use std::collections::HashMap;
    use std::path::PathBuf;
    use tempfile::TempDir;

    /// 从环境变量构建 AIProviderConfig
    fn build_provider_config_from_env() -> Option<AIProviderConfig> {
        let api_key = std::env::var("IFAI_API_KEY")
            .or_else(|_| std::env::var("ZHIPU_API_KEY"))
            .or_else(|_| std::env::var("DEEPSEEK_API_KEY"))
            .or_else(|_| std::env::var("OPENAI_API_KEY"))
            .ok()?;

        let base_url = std::env::var("IFAI_API_BASE").unwrap_or_else(|_| {
            "https://open.bigmodel.cn/api/paas/v4/chat/completions".to_string()
        });

        let model = std::env::var("IFAI_MODEL").unwrap_or_else(|_| "glm-4.6".to_string());

        Some(AIProviderConfig {
            id: "e2e-test".to_string(),
            name: "E2E Test Provider".to_string(),
            api_key,
            base_url,
            models: vec![model],
            protocol: crate::core_traits::ai::AIProtocol::OpenAI,
            enabled: true,
        })
    }

    /// 真实 LLM E2E 测试：加载实际 test.md 提示词 → 调用真实 LLM → 验证文件写入
    ///
    /// ## 测试覆盖
    /// - 提示词加载链路：AgentPromptLoader → 读取 test.md → 替换变量
    /// - LLM API 调用链路：execute_with_tools → HTTP POST → LLM → 解析 tool_calls
    /// - 工具执行链路：agent_read_file → 读取源码 → agent_write_file → 写入磁盘
    ///
    /// ## 验证点
    /// 1. test.md 提示词能正确加载并包含 agent_write_file 指令
    /// 2. 真实 LLM 收到提示词后调用 agent_write_file
    /// 3. agent_write_file 写入的文件在文件系统中物理存在
    /// 4. 生成的测试文件是有效的 Rust 测试代码
    #[ignore]
    #[tokio::test]
    async fn test_real_llm_test_agent_writes_files() {
        // ── 1. 检查 API key 配置 ──────────────────────────────────
        let Some(provider_config) = build_provider_config_from_env() else {
            eprintln!("⚠️  跳过真实 LLM 测试：未设置 API key 环境变量");
            eprintln!("   请设置 IFAI_API_KEY、ZHIPU_API_KEY、DEEPSEEK_API_KEY 或 OPENAI_API_KEY");
            return;
        };

        let used_base_url = provider_config.base_url.clone();
        let used_model = provider_config.models.first().cloned().unwrap_or_default();
        eprintln!("🔑 API key 已配置");
        eprintln!("🌐 API Base: {}", used_base_url);
        eprintln!("🤖 Model: {}", used_model);

        // ── 2. 创建临时项目目录 ──────────────────────────────────
        let temp_dir = TempDir::new().unwrap();
        let project_root = temp_dir.path().to_str().unwrap().to_string();

        // 创建源文件（有实际内容的计算器模块）
        let src_dir = temp_dir.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(
            src_dir.join("main.rs"),
            r#"/// 计算器模块
fn add(a: i32, b: i32) -> i32 { a + b }
fn subtract(a: i32, b: i32) -> i32 { a - b }
fn multiply(a: i32, b: i32) -> i32 { a * b }
fn divide(a: i32, b: i32) -> i32 {
    if b == 0 { panic!("除数不能为0") }
    a / b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
    }
}
"#,
        ).unwrap();

        // 创建 tests 目录
        let tests_dir = temp_dir.path().join("tests");
        std::fs::create_dir_all(&tests_dir).unwrap();

        // ── 3. 确定项目根目录（查找 .ifai/prompts/agents/test.md）─
        let cargo_manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let repo_root = cargo_manifest.parent().unwrap().to_str().unwrap().to_string();
        let test_md_path = PathBuf::from(&repo_root).join(".ifai/prompts/agents/test.md");
        assert!(
            test_md_path.exists(),
            "test.md 文件不存在: {:?}",
            test_md_path
        );
        eprintln!("📄 加载提示词文件: {:?}", test_md_path);

        // ── 4. 加载实际 test.md 提示词（与生产代码完全一致） ──────
        let mut variables = HashMap::new();
        variables.insert("test_target".to_string(), "src/main.rs".to_string());

        let prompt_context = PromptContext {
            project_root: project_root.clone(),
            task_description: "为 src/main.rs 中的计算器模块生成完整的单元测试".to_string(),
            variables,
        };

        let loader = AgentPromptLoader::new(&repo_root);
        let system_prompt = loader.load_for(&AgentType::Test, &prompt_context);

        // 验证提示词确实包含了 agent_write_file 指令
        assert!(
            system_prompt.contains("agent_write_file"),
            "加载的 test.md 提示词必须包含 agent_write_file 指令\n实际内容前 500 字符:\n{}",
            &system_prompt[..system_prompt.len().min(500)]
        );
        assert!(
            system_prompt.contains("写入") || system_prompt.contains("agent_write_file"),
            "加载的 test.md 提示词必须包含写入指令"
        );

        eprintln!("✅ 提示词加载成功 ({} 字符)", system_prompt.len());

        // ── 5. 创建 DefaultToolExecutor ──────────────────────────
        let executor = DefaultToolExecutor::new(project_root.clone());

        // ── 6. 执行工具循环 — 调用真实 LLM ───────────────────────
        eprintln!("⏳ 开始调用真实 LLM...（可能需要 15-60 秒）");
        let start = std::time::Instant::now();

        let result = execute_with_tools(
            provider_config,
            system_prompt,
            "请为 src/main.rs 中的计算器函数生成单元测试文件，覆盖 add/subtract/multiply/divide 四个函数。"
                .to_string(),
            &executor,
            ToolLoopConfig {
                max_iterations: 8,
                max_tools_per_turn: 5,
                agent_id: None,
            },
            None, // progress_callback
            None, // cancellation_token
            None, // collab_event_callback
        )
        .await;

        let elapsed = start.elapsed();
        eprintln!("⏱️  LLM 调用耗时: {:.1}s", elapsed.as_secs_f64());

        // ── 7. 验证工具循环执行成功 ──────────────────────────────
        assert!(
            result.is_ok(),
            "工具循环应该成功完成，收到错误: {:?}",
            result.err()
        );

        let response_text = result.unwrap();
        eprintln!(
            "✅ LLM 最终响应 (前 300 字符): {}",
            &response_text[..response_text.len().min(300)]
        );

        // ── 8. 验证文件被写入磁盘 ────────────────────────────────
        let test_files: Vec<_> = std::fs::read_dir(&tests_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map_or(false, |ext| ext == "rs"))
            .collect();

        assert!(
            !test_files.is_empty(),
            "❌ LLM 应该通过 agent_write_file 创建至少一个测试文件，但 tests/ 目录为空\n\
             LLM 最终响应: {}\n\
             这意味着 test.md 提示词未能让 LLM 调用 agent_write_file。",
            &response_text[..response_text.len().min(500)]
        );

        for file in &test_files {
            let path = file.path();
            let content = std::fs::read_to_string(&path).unwrap();
            eprintln!(
                "📄 生成的文件: {:?} ({} 字符)",
                path.file_name().unwrap(),
                content.len()
            );

            // 验证是有效的 Rust 测试代码
            assert!(
                content.contains("#[test]") || content.contains("#[cfg(test)]"),
                "生成的测试文件应该包含测试属性 (#[test] 或 #[cfg(test)]): {:?}\n文件内容:\n{}",
                path,
                &content[..content.len().min(300)]
            );
        }

        eprintln!(
            "🎉 高保真 E2E 测试通过！LLM ({} -> {}) 成功生成并写入了 {} 个测试文件",
            used_base_url,
            used_model,
            test_files.len()
        );
    }
}
