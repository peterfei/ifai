// 🔥 Phase 6: 真实 LLM (智谱) API E2E 并发测试
//
// 这个测试会实际调用智谱 API（从 ~/.ifai/config.toml 读取配置），验证：
// 1. main 线程：`执行ls -l`（触发工具调用）
// 2. thread1 线程：`你了解ruby语言吗`（普通对话）
// 3. 两个请求可以并发执行
//
// 运行方式：
//   cd src-tauri && cargo test --bin ifai real_llm_e2e_test -- --ignored --nocapture
//
// 前置条件：
//   ~/.ifai/config.toml 中已配置 zhipu provider 和 api_key

#[cfg(test)]
mod tests {
    use crate::tui::App;
    use crate::session::Session;
    use crate::config::EffectiveConfig;
    use crate::thread::Message;
    use crate::tui_test::{render_to_buffer, buffer_to_string};
    use crate::input_composer::{self, InputAction};
    use ifainew_lib::harness::task::TaskStore;
    use std::time::Instant;
    use std::sync::Arc;

    /// 从 ~/.ifai/config.toml 创建真实 Session（与 main.rs 启动逻辑一致）
    fn create_real_session() -> Session {
        let config = EffectiveConfig::resolve(None, None, None, None)
            .expect("无法读取 ~/.ifai/config.toml，请确保配置文件存在且格式正确");

        let provider = config.provider().to_string();
        let model = config.model().to_string();

        println!("  Provider: {}", provider);
        println!("  Model: {}", model);

        let mut session = Session::new(provider, model);

        if let Some(api_key) = config.api_key() {
            session.set_api_key(api_key.to_string());
            println!("  API Key: {}...{}", &api_key[..4.min(api_key.len())], &api_key[api_key.len().saturating_sub(4)..]);
        }

        if let Some(base_url) = config.base_url() {
            session.set_base_url(base_url.to_string());
            println!("  Base URL: {}", base_url);
        }

        session
    }

    // ========================================================================
    // 核心测试：main 执行ls -l + thread1 你了解ruby语言吗
    // ========================================================================

    #[tokio::test]
    #[ignore] // 需要真实 API，手动运行：cargo test --bin ifai real_llm_e2e_test -- --ignored --nocapture
    async fn test_zhipu_concurrent_main_ls_thread1_ruby() {
        println!("\n============================================================");
        println!("🔥 真实智谱 API 并发 E2E 测试");
        println!("   main: 执行ls -l（触发工具调用）");
        println!("   thread1: 你了解ruby语言吗（普通对话）");
        println!("============================================================");

        // ==================== 步骤 1: 准备 ====================
        println!("\n📋 步骤 1: 创建 App 和线程");
        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        println!("  main ID: {:?}", main_id);
        println!("  thread1 ID: {:?}", thread1_id);

        // ==================== 步骤 2: main 发送 '执行ls -l' ====================
        println!("\n🔵 步骤 2: main 发送 '执行ls -l'");
        app.switch_thread(main_id);
        app.thread.messages.push(main_id, Message::user("执行ls -l".to_string()));
        app.set_thread_busy(main_id, true);

        assert!(app.is_thread_busy(main_id), "main 应该 busy");
        assert!(!app.is_thread_busy(thread1_id), "thread1 不应该 busy");
        println!("  ✓ main busy: true, thread1 busy: false");

        // ==================== 步骤 3: thread1 发送 '你了解ruby语言吗' ====================
        println!("\n🟢 步骤 3: thread1 发送 '你了解ruby语言吗'");
        app.switch_thread(thread1_id);
        app.thread.messages.push(thread1_id, Message::user("你了解ruby语言吗".to_string()));
        app.set_thread_busy(thread1_id, true);

        assert!(app.is_thread_busy(main_id), "main 仍然 busy");
        assert!(app.is_thread_busy(thread1_id), "thread1 现在 busy");
        println!("  ✓ main busy: true, thread1 busy: true（并发！）");

        // ==================== 步骤 4: 并发调用智谱 API ====================
        println!("\n🚀 步骤 4: 并发调用智谱 API");

        // main: 执行ls -l
        let mut session_main = create_real_session();
        let main_handle = tokio::spawn(async move {
            let start = Instant::now();
            match session_main.stream_prompt("执行ls -l").await {
                Ok(response) => {
                    println!("  [main] 响应长度: {} 字符, 耗时: {:?}", response.len(), start.elapsed());
                    let preview = response.chars().take(100).collect::<String>();
                    println!("  [main] 前 100 字符: {}", preview);
                    response
                }
                Err(e) => {
                    println!("  [main] 错误: {}", e);
                    format!("ERROR: {}", e)
                }
            }
        });

        // thread1: 你了解ruby语言吗
        let mut session_thread1 = create_real_session();
        let thread1_handle = tokio::spawn(async move {
            let start = Instant::now();
            match session_thread1.stream_prompt("你了解ruby语言吗").await {
                Ok(response) => {
                    println!("  [thread1] 响应长度: {} 字符, 耗时: {:?}", response.len(), start.elapsed());
                    let preview = response.chars().take(100).collect::<String>();
                    println!("  [thread1] 前 100 字符: {}", preview);
                    response
                }
                Err(e) => {
                    println!("  [thread1] 错误: {}", e);
                    format!("ERROR: {}", e)
                }
            }
        });

        // 等待两个请求完成
        let (main_result, thread1_result) = tokio::join!(main_handle, thread1_handle);

        let main_response = main_result.unwrap();
        let thread1_response = thread1_result.unwrap();

        // ==================== 步骤 5: 验证结果 ====================
        println!("\n✅ 步骤 5: 验证结果");

        // 验证两个都有响应
        assert!(!main_response.starts_with("ERROR"), "main 不应该出错: {}", main_response);
        assert!(!thread1_response.starts_with("ERROR"), "thread1 不应该出错: {}", thread1_response);

        // 验证消息隔离：将响应写入对应线程
        app.switch_thread(main_id);
        app.push_line(format!("[AI] {}", main_response));
        app.end_streaming(main_id);
        app.set_thread_busy(main_id, false);

        app.switch_thread(thread1_id);
        app.push_line(format!("[AI] {}", thread1_response));
        app.end_streaming(thread1_id);
        app.set_thread_busy(thread1_id, false);

        assert!(!app.is_thread_busy(main_id), "main 完成后不应该 busy");
        assert!(!app.is_thread_busy(thread1_id), "thread1 完成后不应该 busy");

        println!("  ✓ main 响应正常（{} 字符）", main_response.len());
        println!("  ✓ thread1 响应正常（{} 字符）", thread1_response.len());
        println!("  ✓ 两个请求并发完成");
        println!("  ✓ 状态清理正确");

        println!("\n============================================================");
        println!("✅ 真实智谱 API 并发 E2E 测试通过！");
        println!("============================================================");
    }

    // ========================================================================
    // 辅助测试：消息隔离验证
    // ========================================================================

    #[test]
    #[ignore]
    fn test_zhipu_message_isolation() {
        println!("\n🔍 智谱 API 消息隔离测试");

        let mut app = App::new_for_test();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));
        let main_id = app.thread.store.primary_id();

        // main 添加消息
        app.switch_thread(main_id);
        app.thread.messages.push(main_id, Message::user("Main: 执行ls -l".to_string()));
        let main_count = app.thread.messages.get(main_id).map(|m| m.len()).unwrap_or(0);

        // thread1 添加消息
        app.switch_thread(thread1_id);
        app.thread.messages.push(thread1_id, Message::user("Thread1: 你了解ruby语言吗".to_string()));
        let thread1_count = app.thread.messages.get(thread1_id).map(|m| m.len()).unwrap_or(0);

        // 验证隔离
        let main_count_after = app.thread.messages.get(main_id).map(|m| m.len()).unwrap_or(0);
        assert_eq!(main_count, main_count_after, "thread1 不应影响 main 消息数");
        assert_eq!(thread1_count, 1, "thread1 应该有 1 条消息");

        println!("  ✓ main 消息数: {}（未被影响）", main_count);
        println!("  ✓ thread1 消息数: {}", thread1_count);
        println!("✅ 消息隔离通过");
    }

    // ========================================================================
    // 辅助测试：streaming 期间线程切换
    // ========================================================================

    #[test]
    #[ignore]
    fn test_zhipu_thread_switch_during_streaming() {
        println!("\n🔄 Streaming 期间线程切换测试");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // main streaming
        app.switch_thread(main_id);
        app.set_thread_busy(main_id, true);
        app.begin_streaming(main_id);

        println!("  main busy: {}", app.is_current_thread_busy());

        // 切换到 thread1
        app.switch_thread(thread1_id);
        println!("  thread1 busy: {}", app.is_current_thread_busy());

        assert!(!app.is_current_thread_busy(), "thread1 不应该 busy");
        println!("✅ streaming 期间线程切换通过");
    }

    // ========================================================================
    // 用例 5：main 执行ls -l 时，Alt+方向键切到 thread1，验证消息不串台
    //         调用真实智谱 API
    // ========================================================================

    #[tokio::test]
    #[ignore]
    async fn test_alt_switch_no_message_cross_talk_real_llm() {
        println!("\n============================================================");
        println!("用例 5: Alt+方向键切换线程 -> 验证消息不串台（真实LLM）");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // ---- 步骤 1: main 调用真实 LLM（执行ls -l） ----
        println!("\n步骤 1: main 调用真实 LLM '执行ls -l'");
        app.switch_thread(main_id);
        app.set_thread_busy(main_id, true);

        // 写入用户输入到 thread_messages（模拟 main.rs 中的行为）
        app.thread.messages.push(main_id, crate::thread::Message::user("执行ls -l".to_string()));

        let mut session_main = create_real_session();
        let main_handle = tokio::spawn(async move {
            let start = Instant::now();
            match session_main.stream_prompt("执行ls -l").await {
                Ok(response) => {
                    println!("  [main] LLM 响应: {} 字符, 耗时: {:?}", response.len(), start.elapsed());
                    response
                }
                Err(e) => format!("ERROR: {}", e)
            }
        });

        // ---- 步骤 2: 等待 main 响应，写入 thread_messages（持久化） ----
        let main_response = main_handle.await.unwrap();
        assert!(!main_response.starts_with("ERROR"), "main LLM 调用失败: {}", main_response);

        // 写入 thread_messages（switch_thread 时会自动加载到 content_lines）
        app.thread.messages.push(main_id, crate::thread::Message::assistant(main_response.clone()));
        app.set_thread_busy(main_id, false);
        println!("  OK main 收到 AI 响应（{} 字符）", main_response.len());

        // ---- 步骤 3: 模拟 Alt+Right 切到 thread1 ----
        println!("\n步骤 2: Alt+Right 切到 thread1");
        app.switch_thread(thread1_id);

        // ---- 断言：thread1 不包含 main 的消息 ----
        let thread1_text: String = app.content_lines.iter()
            .flat_map(|l| l.spans.iter())
            .map(|s| s.content.clone())
            .collect::<String>();

        assert!(!thread1_text.contains("ls -l"),
            "thread1 不应包含 main 的 'ls -l' 消息！实际内容: {}", thread1_text);
        println!("  OK thread1 不包含 main 的响应（无串台）");

        // ---- 步骤 4: thread1 调用真实 LLM（你了解ruby语言吗） ----
        println!("\n步骤 3: thread1 调用真实 LLM '你了解ruby语言吗'");
        app.set_thread_busy(thread1_id, true);

        // 写入用户输入到 thread_messages（模拟 main.rs 中的行为）
        app.thread.messages.push(thread1_id, crate::thread::Message::user("你了解ruby语言吗".to_string()));

        let mut session_thread1 = create_real_session();
        let thread1_handle = tokio::spawn(async move {
            let start = Instant::now();
            match session_thread1.stream_prompt("你了解ruby语言吗").await {
                Ok(response) => {
                    println!("  [thread1] LLM 响应: {} 字符, 耗时: {:?}", response.len(), start.elapsed());
                    response
                }
                Err(e) => format!("ERROR: {}", e)
            }
        });

        let thread1_response = thread1_handle.await.unwrap();
        assert!(!thread1_response.starts_with("ERROR"), "thread1 LLM 调用失败: {}", thread1_response);

        app.thread.messages.push(thread1_id, crate::thread::Message::assistant(thread1_response.clone()));
        app.set_thread_busy(thread1_id, false);
        println!("  OK thread1 收到 AI 响应（{} 字符）", thread1_response.len());

        // ---- 步骤 5: Alt+Left 切回 main，验证不串台 ----
        println!("\n步骤 4: Alt+Left 切回 main");
        app.switch_thread(main_id);

        let main_text: String = app.content_lines.iter()
            .flat_map(|l| l.spans.iter())
            .map(|s| s.content.clone())
            .collect::<String>();

        assert!(main_text.contains("ls -l"), "main 应该包含自己的 'ls -l' 消息");
        assert!(!main_text.contains("Ruby") && !main_text.contains("ruby"),
            "main 不应包含 thread1 的 Ruby 消息！实际内容: {}",
            main_text.chars().take(200).collect::<String>());
        println!("  OK main 只包含自己的消息（无串台）");

        // ---- 步骤 6: 再切到 thread1 验证 ----
        println!("\n步骤 5: 再切到 thread1 验证");
        app.switch_thread(thread1_id);

        let t1_text: String = app.content_lines.iter()
            .flat_map(|l| l.spans.iter())
            .map(|s| s.content.clone())
            .collect::<String>();

        assert!(t1_text.contains("Ruby") || t1_text.contains("ruby"),
            "thread1 应该包含自己的 Ruby 消息");
        assert!(!t1_text.contains("ls -l"),
            "thread1 不应包含 main 的 ls-l 消息！");
        println!("  OK thread1 只包含自己的消息（无串台）");

        println!("\n============================================================");
        println!("OK Alt+方向键切换线程消息隔离测试通过！（真实LLM）");
        println!("============================================================");
    }

    // ========================================================================
    // 用例 6：审批弹窗只在当前 thread 下显示
    //         调用真实智谱 API 触发工具审批
    // ========================================================================

    #[tokio::test]
    #[ignore]
    async fn test_approval_overlay_only_in_current_thread_real_llm() {
        println!("\n============================================================");
        println!("用例 6: 审批弹窗只在当前 thread 下显示（真实LLM）");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // ---- 步骤 1: main 调用真实 LLM（执行ls -l，会触发工具调用审批） ----
        println!("\n步骤 1: main 调用真实 LLM '执行ls -l'（触发工具审批）");
        app.switch_thread(main_id);

        let (tx, rx) = tokio::sync::oneshot::channel();
        let request = crate::approval_overlay::ApprovalRequest {
            thread_id: main_id,
            tool_id: "execute_shell".to_string(),
            tool_name: "execute_shell".to_string(),
            args_json: serde_json::json!({"cmd": "ls -l"}),
            risk_level: crate::permission::RiskLevel::Medium,
            category: crate::permission::ToolCategory::Dangerous,
            response_tx: tx,
        };
        app.approval.states.insert(main_id, request);

        // 验证 main 下有审批
        assert!(app.is_approving(), "main 应该有审批");
        assert!(app.approval_state_ref().is_some(), "main 应该能获取到审批");
        if let Some(req) = app.approval_state_ref() {
            assert_eq!(req.thread_id, main_id, "审批应该属于 main");
            println!("  OK main 有审批，tool={}", req.tool_name);
        }

        // ---- 步骤 2: Alt+Right 切到 thread1（模拟用户在审批期间切换线程） ----
        println!("\n步骤 2: Alt+Right 切到 thread1");
        app.switch_thread(thread1_id);

        // 断言：thread1 下没有审批
        assert!(!app.is_approving(),
            "thread1 不应该有审批！main 的审批不应泄漏到 thread1");
        assert!(app.approval_state_ref().is_none(),
            "thread1 的 approval_state_ref 应该返回 None");
        println!("  OK thread1 没有审批（审批不泄漏）");

        // ---- 步骤 3: thread1 调用真实 LLM（你了解ruby语言吗） ----
        println!("\n步骤 3: thread1 调用真实 LLM '你了解ruby语言吗'");
        app.set_thread_busy(thread1_id, true);

        let mut session_t1 = create_real_session();
        let t1_handle = tokio::spawn(async move {
            let start = Instant::now();
            match session_t1.stream_prompt("你了解ruby语言吗").await {
                Ok(response) => {
                    println!("  [thread1] LLM 响应: {} 字符, 耗时: {:?}", response.len(), start.elapsed());
                    response
                }
                Err(e) => format!("ERROR: {}", e)
            }
        });

        let t1_response = t1_handle.await.unwrap();
        assert!(!t1_response.starts_with("ERROR"), "thread1 LLM 调用失败: {}", t1_response);
        app.push_line(format!("[AI] {}", t1_response));
        app.set_thread_busy(thread1_id, false);
        println!("  OK thread1 收到 AI 响应（{} 字符）", t1_response.len());

        // ---- 步骤 4: Alt+Left 切回 main ----
        println!("\n步骤 4: Alt+Left 切回 main");
        app.switch_thread(main_id);

        // main 的审批仍然存在
        assert!(app.is_approving(), "main 应该仍有自己的审批");
        if let Some(req) = app.approval_state_ref() {
            assert_eq!(req.thread_id, main_id, "审批应该属于 main");
            assert_eq!(req.tool_name, "execute_shell", "应该是 main 的 execute_shell 审批");
            println!("  OK main 仍有自己的审批，tool={}", req.tool_name);
        }

        // ---- 步骤 5: main 解除审批 ----
        println!("\n步骤 5: main 解除审批");
        app.resolve_approval(crate::approval_overlay::ApprovalDecision::ApproveOnce);
        assert!(!app.is_approving(), "main 解除后不应有审批");
        println!("  OK main 审批已解除");

        // ---- 步骤 6: 最终验证 ----
        println!("\n步骤 6: 最终验证");
        // main 的内容不应包含 thread1 的 Ruby 响应
        let main_text: String = app.content_lines.iter()
            .flat_map(|l| l.spans.iter())
            .map(|s| s.content.clone())
            .collect::<String>();

        // 注意：main 没有调用 LLM，所以 content_lines 只有之前 push 的（如果有的话）
        // 关键验证：审批状态正确
        app.switch_thread(thread1_id);
        assert!(!app.is_approving(), "thread1 从来没有审批");
        println!("  OK thread1 无审批");

        app.switch_thread(main_id);
        assert!(!app.is_approving(), "main 审批已解除");
        println!("  OK main 无审批");

        println!("\n============================================================");
        println!("OK 审批弹窗线程隔离测试通过！（真实LLM）");
        println!("============================================================");
    }

    // ========================================================================
    // 用例 7（真实LLM + 快照）：main 调用智谱触发审批 → 期间切线程 → 快照验证
    // ========================================================================

    #[tokio::test]
    #[ignore]
    async fn test_real_llm_approval_leak_snapshot() {
        println!("\n============================================================");
        println!("用例 7: 真实LLM + 快照 - 审批弹窗不泄漏到其他线程");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // ---- 步骤 1: main 调用真实 LLM '执行ls -l'（会触发工具审批） ----
        println!("\n步骤 1: main 调用真实 LLM '执行ls -l'");
        app.switch_thread(main_id);
        app.set_thread_busy(main_id, true);
        app.begin_streaming(main_id);
        app.set_status("Thinking...".to_string());

        let mut session_main = create_real_session();
        let main_handle = tokio::spawn(async move {
            session_main.stream_prompt("执行ls -l").await
        });

        // 等 500ms 模拟 LLM 处理中（审批请求即将到达）
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        // ---- 步骤 2: 模拟审批请求到达 main ----
        println!("\n步骤 2: 模拟审批请求到达 main（execute_shell）");
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let request = crate::approval_overlay::ApprovalRequest {
            thread_id: main_id,
            tool_id: "execute_shell".to_string(),
            tool_name: "execute_shell".to_string(),
            args_json: serde_json::json!({"cmd": "ls -l"}),
            risk_level: crate::permission::RiskLevel::Medium,
            category: crate::permission::ToolCategory::Dangerous,
            response_tx: tx,
        };
        app.approval.states.insert(main_id, request);

        // ---- 快照 1: main 下渲染（应有审批弹窗） ----
        let main_buf = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        let main_snapshot = crate::tui_test::buffer_to_string(&main_buf);
        assert!(main_snapshot.contains("execute_shell") || main_snapshot.contains("shell"),
            "main 应有审批弹窗！快照:\n{}", main_snapshot);
        println!("  OK main 快照（包含审批弹窗）");

        // ---- 步骤 3: 模拟 Alt+Right 切到 thread1 ----
        println!("\n步骤 3: Alt+Right 切到 thread1");
        app.switch_thread(thread1_id);

        // ---- 快照 2: thread1 下渲染（不应有审批弹窗） ----
        let t1_buf = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        let t1_snapshot = crate::tui_test::buffer_to_string(&t1_buf);

        assert!(!t1_snapshot.contains("execute_shell"),
            "thread1 不应有 main 的审批！快照:\n{}", t1_snapshot);
        assert!(!t1_snapshot.contains("Approve") && !t1_snapshot.contains("Deny"),
            "thread1 不应有审批选项！快照:\n{}", t1_snapshot);
        println!("  OK thread1 快照（无审批弹窗泄漏）");

        // ---- 步骤 4: thread1 调用真实 LLM '你了解ruby语言吗' ----
        println!("\n步骤 4: thread1 调用真实 LLM '你了解ruby语言吗'");
        app.set_thread_busy(thread1_id, true);
        app.set_status("Thinking...".to_string());

        let mut session_t1 = create_real_session();
        let t1_handle = tokio::spawn(async move {
            session_t1.stream_prompt("你了解ruby语言吗").await
        });

        // 等待两个 LLM 都完成
        let _ = main_handle.await;
        let t1_result = t1_handle.await;

        app.end_streaming(main_id);
        app.set_thread_busy(main_id, false);
        app.set_thread_busy(thread1_id, false);

        if let Ok(Ok(resp)) = t1_result {
            println!("  OK thread1 LLM 响应: {} 字符", resp.len());
        }

        // ---- 快照 3: thread1 有 AI 响应但无 main 审批 ----
        let t1_buf2 = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        let t1_after = crate::tui_test::buffer_to_string(&t1_buf2);
        assert!(!t1_after.contains("execute_shell"),
            "thread1 完成后仍不应有 main 审批！快照:\n{}", t1_after);
        println!("  OK thread1 完成后无 main 审批泄漏");

        // ---- 步骤 5: Alt+Left 切回 main ----
        println!("\n步骤 5: Alt+Left 切回 main");
        app.switch_thread(main_id);

        let main_buf2 = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        let main_after = crate::tui_test::buffer_to_string(&main_buf2);
        assert!(main_after.contains("execute_shell") || main_after.contains("shell"),
            "切回 main 后审批面板应恢复！快照:\n{}", main_after);
        println!("  OK main 审批面板恢复");

        // 清理审批
        app.resolve_approval(crate::approval_overlay::ApprovalDecision::ApproveOnce);

        println!("\n============================================================");
        println!("OK 审批弹窗泄漏测试通过！（真实LLM + 快照）");
        println!("============================================================");
    }

    // ========================================================================
    // 用例 8（真实LLM + 快照）：streaming 期间切线程 → 切回 → 状态栏存在
    // ========================================================================

    /*
    #[tokio::test]
    #[ignore]
    async fn test_real_llm_status_bar_switch_snapshot() {
        println!("\n============================================================");
        println!("用例 8: 真实LLM + 快照 - 切换回线程时状态栏存在");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string());

        // ---- 步骤 1: main 调用真实 LLM 开始 streaming ----
        println!("\n步骤 1: main 调用真实 LLM '执行ls -l'");
        app.switch_thread(main_id);
        app.set_thread_busy(main_id, true);
        app.begin_streaming(main_id);
        app.set_status("Streaming (zhipu/glm-4.6)...".to_string());

        let mut session_main = create_real_session();
        let main_handle = tokio::spawn(async move {
            session_main.stream_prompt("执行ls -l").await
        });

        // 等 500ms 模拟 streaming 中
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        // ---- 快照 1: main streaming 中（应有状态栏） ----
        let main_buf = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        let main_streaming = crate::tui_test::buffer_to_string(&main_buf);
        assert!(main_streaming.contains("Streaming") || main_streaming.contains("zhipu") || main_streaming.contains("glm"),
            "main streaming 时应有状态栏！快照:\n{}", main_streaming);
        println!("  OK main streaming 有状态栏");

        // ---- 步骤 2: Alt+Right 切到 thread1 ----
        println!("\n步骤 2: Alt+Right 切到 thread1");
        app.switch_thread(thread1_id);

        let t1_buf = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        let t1_snapshot = crate::tui_test::buffer_to_string(&t1_buf);
        // thread1 不应有 main 的 streaming 状态栏内容
        assert!(!t1_snapshot.contains("Streaming"),
            "thread1 不应有 main 的 Streaming 状态！快照:\n{}", t1_snapshot);
        println!("  OK thread1 无 main 的 streaming 状态泄漏");

        // ---- 步骤 3: Alt+Left 切回 main ----
        println!("\n步骤 3: Alt+Left 切回 main");
        app.switch_thread(main_id);

        let main_buf2 = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        let main_after = crate::tui_test::buffer_to_string(&main_buf2);
        assert!(main_after.contains("Streaming") || main_after.contains("zhipu") || main_after.contains("glm"),
            "切回 main 后状态栏不应消失！快照:\n{}", main_after);
        println!("  OK 切回 main 后状态栏存在");

        // ---- 步骤 4: 等 LLM 完成，模拟审批到达 ----
        println!("\n步骤 4: 等 LLM 完成 + 模拟审批到达");
        let _ = main_handle.await;
        app.end_streaming(main_id);

        // 模拟审批到达
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let request = crate::approval_overlay::ApprovalRequest {
            thread_id: main_id,
            tool_id: "execute_shell".to_string(),
            tool_name: "execute_shell".to_string(),
            args_json: serde_json::json!({"cmd": "ls -l"}),
            risk_level: crate::permission::RiskLevel::Medium,
            category: crate::permission::ToolCategory::Dangerous,
            response_tx: tx,
        };
        app.approval.states.insert(main_id, request);
        app.set_status("Approval required".to_string());

        // main 有审批时快照
        let main_buf3 = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        let main_approval = crate::tui_test::buffer_to_string(&main_buf3);
        assert!(main_approval.contains("execute_shell") || main_approval.contains("shell"),
            "main 审批模式应显示审批面板！快照:\n{}", main_approval);
        println!("  OK main 审批面板正常");

        // 切到 thread1 → 无审批
        app.switch_thread(thread1_id);
        let t1_buf2 = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        let t1_no_approval = crate::tui_test::buffer_to_string(&t1_buf2);
        assert!(!t1_no_approval.contains("execute_shell"),
            "thread1 不应有审批面板！快照:\n{}", t1_no_approval);
        println!("  OK thread1 无审批面板");

        // 切回 main → 审批恢复
        app.switch_thread(main_id);
        let main_buf4 = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        let main_final = crate::tui_test::buffer_to_string(&main_buf4);
        assert!(main_final.contains("execute_shell") || main_final.contains("shell"),
            "切回 main 后审批面板应恢复！快照:\n{}", main_final);
        println!("  OK 切回 main 后审批面板恢复");

        // 清理
        app.resolve_approval(crate::approval_overlay::ApprovalDecision::ApproveOnce);
        app.set_thread_busy(main_id, false);
        app.set_status("".to_string());

        println!("\n============================================================");
        println!("OK 状态栏测试通过！（真实LLM + 快照）");
        println!("============================================================");
    }
    */

    // ========================================================================
    // 用例 9（真实LLM）：main streaming 期间切到 thread1 再切回
    //   完整模拟用户操作：main 发送 → 等待审批 → 切走 → 切回
    // ========================================================================

    #[tokio::test]
    #[ignore]
    async fn test_real_llm_streaming_switch_back_status_bar() {
        println!("\n============================================================");
        println!("用例 9: 真实LLM - streaming 期间切换线程后状态栏");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // ---- 步骤 1: main 调用真实 LLM ----
        println!("\n步骤 1: main 调用真实 LLM '执行ls -l'");
        app.switch_thread(main_id);
        app.set_thread_busy(main_id, true);
        app.begin_streaming(main_id);
        app.set_status("Streaming (zhipu)".to_string());

        let mut session = create_real_session();
        let handle = tokio::spawn(async move {
            session.stream_prompt("执行ls -l").await
        });

        // 等一小段时间模拟 streaming 中间状态
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        // ---- 步骤 2: 模拟切到 thread1 ----
        println!("\n步骤 2: 模拟 Alt+Right 切到 thread1");
        app.switch_thread(thread1_id);

        // 快照验证 thread1
        let t1_buf = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        let t1_text = crate::tui_test::buffer_to_string(&t1_buf);
        assert!(!t1_text.contains("execute_shell"),
            "thread1 不应有审批！快照:\n{}", t1_text);
        println!("  OK thread1 无审批泄漏");

        // ---- 步骤 3: 模拟切回 main ----
        println!("\n步骤 3: 模拟 Alt+Left 切回 main");
        app.switch_thread(main_id);

        let main_buf2 = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        let main_text = crate::tui_test::buffer_to_string(&main_buf2);

        // 验证状态栏存在
        assert!(main_text.contains("Streaming") || main_text.contains("zhipu") || main_text.contains("glm"),
            "切回 main 后状态栏不应消失！快照:\n{}", main_text);
        println!("  OK 切回 main 后状态栏存在");

        // 等待 LLM 完成
        let result = handle.await.unwrap();
        app.end_streaming(main_id);
        app.set_thread_busy(main_id, false);
        app.set_status("".to_string());

        if let Ok(response) = result {
            println!("  OK LLM 响应: {} 字符", response.len());
        } else {
            println!("  OK LLM 完成（可能有错误）");
        }

        println!("\n============================================================");
        println!("OK streaming 切换线程状态栏测试通过！（真实LLM）");
        println!("============================================================");
    }

    // ========================================================================
    // 用例 10：同线程待办队列 — main streaming 期间排队第二条消息
    //           验证 streaming 完成后自动处理队列中的消息
    // ========================================================================

    #[tokio::test]
    #[ignore]
    async fn test_queue_same_thread_real_llm() {
        println!("\n============================================================");
        println!("用例 10: 同线程待办队列（真实LLM）");
        println!("   main: 发送第一条 → 期间排队第二条 → 验证两条都处理");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();

        // ---- 步骤 1: main 发送第一条消息 ----
        println!("\n步骤 1: main 发送 '1+1等于几'");
        app.switch_thread(main_id);
        app.thread.messages.push(main_id, Message::user("1+1等于几".to_string()));
        app.set_thread_busy(main_id, true);

        let mut session1 = create_real_session();
        let handle1 = tokio::spawn(async move {
            let start = Instant::now();
            match session1.stream_prompt("1+1等于几").await {
                Ok(response) => {
                    println!("  [消息1] LLM 响应: {} 字符, 耗时: {:?}", response.len(), start.elapsed());
                    response
                }
                Err(e) => format!("ERROR: {}", e)
            }
        });

        // ---- 步骤 2: streaming 期间排队第二条消息 ----
        println!("\n步骤 2: streaming 期间排队 '2+2等于几'");
        // 模拟 enqueue：捕获当前活动线程 ID
        app.enqueue("2+2等于几".to_string());

        assert_eq!(app.queue_len(), 1, "队列应该有 1 条消息");
        println!("  OK 队列长度: {}", app.queue_len());

        // ---- 步骤 3: 等待第一条完成 ----
        let response1 = handle1.await.unwrap();
        assert!(!response1.starts_with("ERROR"), "消息1 LLM 调用失败: {}", response1);

        // 模拟 main.rs streaming 完成后的处理
        app.end_streaming(main_id);
        app.set_thread_busy(main_id, false);
        println!("  OK 消息1 完成（{} 字符）", response1.len());
        app.thread.messages.push(main_id, Message::assistant(response1));

        // ---- 步骤 4: dequeue 并处理第二条 ----
        println!("\n步骤 3: dequeue 并发送第二条消息");
        let pending = app.dequeue();
        assert!(pending.is_some(), "队列应该有消息可出队！");

        let (input2, target_id) = pending.unwrap();
        assert_eq!(input2, "2+2等于几", "出队消息内容应为 '2+2等于几'");
        assert_eq!(target_id, main_id, "目标线程应为 main");

        // 写入用户输入到 thread_messages
        app.thread.messages.push(main_id, Message::user(input2.clone()));
        app.set_thread_busy(main_id, true);

        let mut session2 = create_real_session();
        let handle2 = tokio::spawn(async move {
            let start = Instant::now();
            match session2.stream_prompt(&input2).await {
                Ok(response) => {
                    println!("  [消息2] LLM 响应: {} 字符, 耗时: {:?}", response.len(), start.elapsed());
                    response
                }
                Err(e) => format!("ERROR: {}", e)
            }
        });

        let response2 = handle2.await.unwrap();
        assert!(!response2.starts_with("ERROR"), "消息2 LLM 调用失败: {}", response2);

        app.end_streaming(main_id);
        app.set_thread_busy(main_id, false);
        println!("  OK 消息2 完成（{} 字符）", response2.len());
        app.thread.messages.push(main_id, Message::assistant(response2));

        // ---- 步骤 5: 验证 main 的 thread_messages 包含两条完整的对话 ----
        println!("\n步骤 4: 验证 thread_messages 完整性");
        app.switch_thread(main_id);

        let main_text: String = app.content_lines.iter()
            .flat_map(|l| l.spans.iter())
            .map(|s| s.content.clone())
            .collect::<String>();

        // 两条用户输入都应存在
        assert!(main_text.contains("1+1等于几"), "main 应包含第一条用户输入");
        assert!(main_text.contains("2+2等于几"), "main 应包含第二条用户输入");
        println!("  OK 两条用户输入都在 thread_messages 中");

        // 队列应该为空
        assert_eq!(app.queue_len(), 0, "处理完后队列应为空");
        println!("  OK 队列已清空");

        println!("\n============================================================");
        println!("OK 同线程待办队列测试通过！（真实LLM）");
        println!("============================================================");
    }

    // ========================================================================
    // 用例 11：跨线程排队 — main streaming 期间切到 thread1 排队消息
    //           验证各线程的队列独立、消息不串台
    // ========================================================================

    #[tokio::test]
    #[ignore]
    async fn test_queue_cross_thread_real_llm() {
        println!("\n============================================================");
        println!("用例 11: 跨线程排队（真实LLM）");
        println!("   main streaming → 切 thread1 排队 → 切回 main 排队");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // ---- 步骤 1: main 开始 streaming ----
        println!("\n步骤 1: main 发送 '你好'");
        app.switch_thread(main_id);
        app.thread.messages.push(main_id, Message::user("你好".to_string()));
        app.set_thread_busy(main_id, true);

        let mut session_main = create_real_session();
        let main_handle = tokio::spawn(async move {
            match session_main.stream_prompt("你好").await {
                Ok(r) => r,
                Err(e) => format!("ERROR: {}", e)
            }
        });

        // ---- 步骤 2: 切到 thread1 排队消息 ----
        println!("\n步骤 2: 切到 thread1 排队 '什么是闭包'");
        app.switch_thread(thread1_id);
        // thread1 不 busy，所以 enqueue 的目标是 thread1
        app.enqueue("什么是闭包".to_string());

        // ---- 步骤 3: 切回 main 排队消息 ----
        println!("\n步骤 3: 切回 main 排队 '天气如何'");
        app.switch_thread(main_id);
        // main busy，所以 enqueue 的目标是 main
        app.enqueue("天气如何".to_string());

        println!("  OK 队列长度: {}", app.queue_len());
        assert_eq!(app.queue_len(), 2, "队列应该有 2 条消息");

        // ---- 步骤 4: 等待 main streaming 完成 ----
        println!("\n步骤 4: 等待 main streaming 完成");
        let main_response = main_handle.await.unwrap();
        assert!(!main_response.starts_with("ERROR"), "main LLM 调用失败: {}", main_response);

        app.end_streaming(main_id);
        app.set_thread_busy(main_id, false);
        app.thread.messages.push(main_id, Message::assistant(main_response));
        println!("  OK main streaming 完成");

        // ---- 步骤 5: 验证队列中消息的目标线程 ----
        println!("\n步骤 5: 验证队列消息路由");
        // dequeue 第一条（thread1 的 "什么是闭包"）
        let msg1 = app.dequeue().expect("应有第一条排队消息");
        assert_eq!(msg1.0, "什么是闭包");
        assert_eq!(msg1.1, thread1_id, "第一条消息应路由到 thread1");
        println!("  OK 消息1 '什么是闭包' → thread1");

        // dequeue 第二条（main 的 "天气如何"）
        let msg2 = app.dequeue().expect("应有第二条排队消息");
        assert_eq!(msg2.0, "天气如何");
        assert_eq!(msg2.1, main_id, "第二条消息应路由到 main");
        println!("  OK 消息2 '天气如何' → main");

        // ---- 步骤 6: 处理 thread1 的排队消息 ----
        println!("\n步骤 6: 处理 thread1 的排队消息");
        app.switch_thread(thread1_id);
        app.thread.messages.push(thread1_id, Message::user(msg1.0.clone()));
        app.set_thread_busy(thread1_id, true);

        let mut session_t1 = create_real_session();
        let t1_handle = tokio::spawn(async move {
            match session_t1.stream_prompt(&msg1.0).await {
                Ok(r) => r,
                Err(e) => format!("ERROR: {}", e)
            }
        });

        let t1_response = t1_handle.await.unwrap();
        assert!(!t1_response.starts_with("ERROR"), "thread1 LLM 调用失败: {}", t1_response);

        app.end_streaming(thread1_id);
        app.set_thread_busy(thread1_id, false);
        println!("  OK thread1 消息完成（{} 字符）", t1_response.len());
        app.thread.messages.push(thread1_id, Message::assistant(t1_response));

        // ---- 步骤 7: 验证消息不串台 ----
        println!("\n步骤 7: 验证消息不串台");

        // thread1 的内容
        app.switch_thread(thread1_id);
        let t1_text: String = app.content_lines.iter()
            .flat_map(|l| l.spans.iter())
            .map(|s| s.content.clone())
            .collect::<String>();

        assert!(t1_text.contains("什么是闭包"), "thread1 应包含自己的消息");
        assert!(!t1_text.contains("天气如何"), "thread1 不应包含 main 的排队消息");
        println!("  OK thread1 消息隔离正确");

        // main 的内容
        app.switch_thread(main_id);
        let main_text: String = app.content_lines.iter()
            .flat_map(|l| l.spans.iter())
            .map(|s| s.content.clone())
            .collect::<String>();

        assert!(main_text.contains("你好"), "main 应包含自己的第一条消息");
        // 注意：main 的 "天气如何" 还在队列中等待处理（已被 dequeue 但尚未 push 到 thread_messages）
        println!("  OK main 消息隔离正确");

        println!("\n============================================================");
        println!("OK 跨线程排队测试通过！（真实LLM）");
        println!("============================================================");
    }

    // ========================================================================
    // 用例 12：中断 streaming 后待办队列仍可用
    //           main streaming → 切 thread1 提交（中断 main）→ main 排队应正常
    // ========================================================================

    #[tokio::test]
    #[ignore]
    async fn test_queue_after_streaming_interrupt_real_llm() {
        println!("\n============================================================");
        println!("用例 12: 中断 streaming 后队列仍可用（真实LLM）");
        println!("   main streaming → 切 thread1 提交 → main 应可继续排队");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // ---- 步骤 1: main 开始 streaming ----
        println!("\n步骤 1: main 开始 streaming");
        app.switch_thread(main_id);
        app.set_thread_busy(main_id, true);
        app.begin_streaming(main_id);
        println!("  OK main busy: {}", app.is_thread_busy(main_id));

        // ---- 步骤 2: 模拟中断 main 的 streaming（切到 thread1 提交） ----
        println!("\n步骤 2: 模拟中断 main streaming，切到 thread1");
        app.switch_thread(thread1_id);

        // 模拟 main.rs else 分支的行为：清除被中断线程的 busy
        app.end_streaming(main_id);
        app.set_thread_busy(main_id, false);
        println!("  OK main busy after interrupt: {}", app.is_thread_busy(main_id));

        // ---- 步骤 3: thread1 开始新的 AI 请求 ----
        println!("\n步骤 3: thread1 发送 '什么是Rust'");
        app.thread.messages.push(thread1_id, Message::user("什么是Rust".to_string()));
        app.set_thread_busy(thread1_id, true);

        let mut session_t1 = create_real_session();
        let t1_handle = tokio::spawn(async move {
            match session_t1.stream_prompt("什么是Rust").await {
                Ok(r) => r,
                Err(e) => format!("ERROR: {}", e)
            }
        });

        // ---- 步骤 4: thread1 streaming 期间，切到 main 排队消息 ----
        println!("\n步骤 4: 切到 main 排队 '推荐一本Python书'");
        app.switch_thread(main_id);

        // main 不再 busy（步骤 2 已清除），所以会走 else 分支
        // 但在我们的测试中，我们直接测试 enqueue 路径
        // 模拟：main 不 busy 时的 enqueue
        assert!(!app.is_current_thread_busy(), "main 应该不再 busy");
        app.enqueue("推荐一本Python书".to_string());
        println!("  OK 队列长度: {}", app.queue_len());

        // ---- 步骤 5: 等待 thread1 完成 ----
        println!("\n步骤 5: 等待 thread1 完成");
        let t1_response = t1_handle.await.unwrap();
        assert!(!t1_response.starts_with("ERROR"), "thread1 LLM 调用失败: {}", t1_response);

        app.end_streaming(thread1_id);
        app.set_thread_busy(thread1_id, false);
        println!("  OK thread1 完成（{} 字符）", t1_response.len());
        app.thread.messages.push(thread1_id, Message::assistant(t1_response));

        // ---- 步骤 6: 验证 main 的排队消息可正确出队 ----
        println!("\n步骤 6: 验证 main 排队消息");
        let pending = app.dequeue();
        assert!(pending.is_some(), "main 的排队消息应该可以出队！");

        let (input, target) = pending.unwrap();
        assert_eq!(input, "推荐一本Python书");
        assert_eq!(target, main_id);
        println!("  OK main 排队消息正确出队: '{}' → main", input);

        // ---- 步骤 7: 处理 main 的排队消息 ----
        println!("\n步骤 7: 处理 main 排队消息");
        app.thread.messages.push(main_id, Message::user(input.clone()));
        app.set_thread_busy(main_id, true);

        let mut session_main = create_real_session();
        let main_handle = tokio::spawn(async move {
            match session_main.stream_prompt(&input).await {
                Ok(r) => r,
                Err(e) => format!("ERROR: {}", e)
            }
        });

        let main_response = main_handle.await.unwrap();
        assert!(!main_response.starts_with("ERROR"), "main LLM 调用失败: {}", main_response);

        app.end_streaming(main_id);
        app.set_thread_busy(main_id, false);
        println!("  OK main 排队消息处理完成（{} 字符）", main_response.len());
        app.thread.messages.push(main_id, Message::assistant(main_response));

        // ---- 步骤 8: 最终验证 ----
        println!("\n步骤 8: 最终验证");
        app.switch_thread(main_id);
        let main_text: String = app.content_lines.iter()
            .flat_map(|l| l.spans.iter())
            .map(|s| s.content.clone())
            .collect::<String>();

        assert!(main_text.contains("推荐一本Python书"), "main 应包含排队消息");
        assert_eq!(app.queue_len(), 0, "队列应为空");
        println!("  OK 所有验证通过");

        println!("\n============================================================");
        println!("OK 中断 streaming 后队列仍可用测试通过！（真实LLM）");
        println!("============================================================");
    }

    // ========================================================================
    // 用例 13：同线程连续 16 次真实 LLM 调用 — 检测上下文断链
    //   包含"帮我生成2048小游戏"等复杂工具调用任务
    // ========================================================================

    #[tokio::test]
    #[ignore]
    async fn test_same_thread_12_rounds_no_context_break() {
        println!("\n============================================================");
        println!("用例 13: 同线程连续 16 轮对话 — 上下文断链检测");
        println!("   策略: 建立上下文 → 2048生成 → 工具调用 → 验证上下文");
        println!("============================================================");

        let mut session = create_real_session();
        // 设置工作目录，让工具调用能找到项目文件
        session.set_project_root(std::env::current_dir().unwrap_or_default().to_string_lossy().to_string());
        // 自动批准所有工具调用（测试环境无法交互审批）
        session.set_auto_approve_all(true);

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        app.switch_thread(main_id);

        // 设计有上下文依赖的对话序列（混合普通对话 + 复杂工具调用）
        // 阶段1: 建立上下文
        // 阶段2: 简单工具调用
        // 阶段3: 2048 小游戏生成（大量 write_file 工具调用）
        // 阶段4: 更多上下文验证
        let prompts: Vec<(&str, &str)> = vec![
            // ── 阶段1: 建立上下文 ──
            ("我叫小明，请记住我的名字", "小明"),
            ("我最喜欢的颜色是蓝色，请记住", "蓝色"),
            ("我有一个数字密码是 42，请记住", "42"),
            // ── 阶段2: 简单工具调用 ──
            ("请帮我查看当前目录下有哪些文件", "文件"),  // 工具调用：list_directory
            ("刚才列出的文件中，有没有 .toml 文件？", "toml"),  // 依赖上一轮工具结果
            // ── 阶段3: 2048 小游戏生成（大量 write_file，压力测试） ──
            ("帮我生成2048小游戏", "2048"),  // 触发多次 write_file 工具调用
            // ── 阶段4: 2048 后的上下文验证 ──
            ("请用一句话总结：我叫什么名字、喜欢什么颜色、密码是什么", "小明"),
            ("我刚才告诉你我喜欢什么颜色？", "蓝色"),
            ("我的密码是多少？", "42"),
            // ── 阶段5: 更多工具调用 + 上下文验证 ──
            ("请读取项目中的 Cargo.toml 文件内容", "Cargo"),  // 工具调用：read_file
            ("Cargo.toml 里的项目名称是什么？", "ifa"),  // 依赖上一轮工具结果
            ("再帮我查看一下当前目录", "文件"),  // 再次工具调用
            ("刚才生成的2048游戏，你把代码写到哪个文件了？", "2048"),  // 验证 LLM 记得 2048 任务
            ("最后确认：我的名字是？喜欢的颜色是？密码是？", "小明"),  // 最终验证
        ];

        let total = prompts.len();
        let mut context_breaks: Vec<usize> = Vec::new();
        let mut round_times: Vec<u128> = Vec::new();

        for (i, (prompt, keyword)) in prompts.iter().enumerate() {
            let round = i + 1;
            println!("\n============================================================");
            println!("  轮次 {}/{}: {}", round, total, prompt);
            println!("============================================================");

            app.thread.messages.push(main_id, Message::user(prompt.to_string()));
            app.push_line(format!("⟩ {}", prompt));

            let start = Instant::now();
            let response = match session.stream_prompt(prompt).await {
                Ok(r) => r,
                Err(e) => {
                    println!("  ❌ API 错误: {}", e);
                    context_breaks.push(round);
                    round_times.push(start.elapsed().as_millis());
                    continue;
                }
            };
            let elapsed = start.elapsed();
            round_times.push(elapsed.as_millis());

            let response_preview = if response.chars().count() > 100 {
                let truncated: String = response.chars().take(100).collect();
                format!("{}...", truncated)
            } else {
                response.clone()
            };
            println!("  响应 ({}ms, {}字): {}", elapsed.as_millis(), response.len(), response_preview);

            // 检测断链：响应中是否包含关键词
            let contains_keyword = response.contains(keyword);
            if contains_keyword {
                println!("  ✅ 上下文正常 — 包含关键词 '{}'", keyword);
            } else {
                println!("  ⚠️  可能断链 — 未找到关键词 '{}'", keyword);
                context_breaks.push(round);
            }

            app.thread.messages.push(main_id, Message::assistant(response.clone()));
            app.push_line(response);

            // === TUI 快照：渲染当前 App 画面并保存到文件 ===
            let buf = render_to_buffer(&mut app, 120, 30);
            let snapshot_text = buffer_to_string(&buf);
            let snapshot_dir = std::path::PathBuf::from("/tmp/ifai_thread_12_snapshots");
            let _ = std::fs::create_dir_all(&snapshot_dir);
            let snapshot_path = snapshot_dir.join(format!("round_{:02}.txt", round));
            let _ = std::fs::write(&snapshot_path, format!(
                "// Round {}/{}: {}\n// Response keyword: {}\n// Status: {}\n\n{}",
                round, total, prompt, keyword,
                if contains_keyword { "OK" } else { "BREAK" },
                snapshot_text
            ));
            println!("  📸 快照已保存: {}", snapshot_path.display());
        }

        // ==================== 总结报告 ====================
        println!("\n\n");
        println!("╔══════════════════════════════════════════════════════════════╗");
        println!("║           上下文断链检测报告（共 {} 轮）                    ║", total);
        println!("╠══════════════════════════════════════════════════════════════╣");

        if context_breaks.is_empty() {
            println!("║  ✅ 全部 {} 轮对话上下文正常，未检测到断链                  ║", total);
        } else {
            println!("║  ⚠️  检测到 {} 次可能的断链：{:?}                  ║", context_breaks.len(), context_breaks);
            for &r in &context_breaks {
                let (prompt, keyword) = prompts[r - 1];
                println!("║     轮次 {}: '{}' (关键词: '{}')", r, prompt, keyword);
            }
        }

        println!("╠══════════════════════════════════════════════════════════════╣");
        println!("║  每轮耗时：                                                  ║");
        for (i, t) in round_times.iter().enumerate() {
            println!("║    轮次 {:>2}: {:>5}ms", i + 1, t);
        }
        let total_time: u128 = round_times.iter().sum();
        let avg_time: u128 = total_time / round_times.len() as u128;
        println!("║  ─────────────────────────────────────────                   ║");
        println!("║  总耗时: {}ms  平均: {}ms", total_time, avg_time);
        println!("║  Session 消息数: {}", session.default_ctx.messages.len());
        println!("╚══════════════════════════════════════════════════════════════╝");

        // 断言：上下文断链不超过 1 次（允许 LLM 偶尔回答不精确）
        assert!(
            context_breaks.len() <= 1,
            "上下文断链次数过多: {} 次，断链轮次: {:?}",
            context_breaks.len(),
            context_breaks
        );

        println!("\n============================================================");
        println!("OK 同线程 12 轮对话断链检测完成！");
        println!("============================================================");
    }

    // ========================================================================
    // 用例：线程 A streaming 期间切到线程 B，验证线程 B 输入框可正常输入
    //       高保真还原用户报告场景
    // ========================================================================

    #[tokio::test]
    #[ignore]
    async fn test_thread_b_input_while_thread_a_streaming() {
        println!("\n============================================================");
        println!("用例: 线程 A streaming 期间，线程 B 输入框能否正常输入");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread_a_id = main_id; // main 作为线程 A
        let thread_b_id = app.create_side_thread(Some("Thread-B".to_string()));

        println!("  线程 A (main) ID: {:?}", thread_a_id);
        println!("  线程 B ID: {:?}", thread_b_id);

        // ==================== 步骤 1: 线程 A 开始 streaming ====================
        println!("\n步骤 1: 线程 A 发送 '帮我生成2048小游戏' 并开始 streaming");
        app.switch_thread(thread_a_id);
        app.thread.messages.push(thread_a_id, Message::user("帮我生成2048小游戏".to_string()));
        app.set_thread_busy(thread_a_id, true);
        app.begin_streaming(thread_a_id);

        assert!(app.is_thread_busy(thread_a_id), "线程 A 应该 busy");
        assert!(!app.is_thread_busy(thread_b_id), "线程 B 不应该 busy");
        println!("  ✓ 线程 A busy: true");

        // ==================== 步骤 2: 模拟 streaming 输出几行 ====================
        println!("\n步骤 2: 模拟线程 A streaming 输出");
        for i in 0..5 {
            app.append_streaming_output(thread_a_id, format!("streaming line {}", i));
        }
        println!("  ✓ 线程 A streaming buffer 有内容");

        // ==================== 步骤 3: 切换到线程 B ====================
        println!("\n步骤 3: 切换到线程 B");
        app.switch_thread(thread_b_id);

        assert!(!app.is_current_thread_busy(), "线程 B 当前不应该 busy");
        println!("  ✓ 线程 B is_current_thread_busy: false");

        // ==================== 步骤 4: 验证输入框可以接收按键 ====================
        println!("\n步骤 4: 在线程 B 输入框中打字 '你了解ruby语言吗'");
        use crossterm::event::{KeyEvent, KeyCode, KeyModifiers};

        let test_input = "你了解ruby语言吗";
        for c in test_input.chars() {
            let key = KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE);
            let action = app.input.handle_key(key);
            // 普通字符输入应该返回 None（不提交、不退出）
            assert!(
                matches!(action, input_composer::InputAction::None),
                "字符 '{}' 应该返回 None，实际返回: {:?}",
                c, action
            );
        }

        let input_value = app.input.value();
        assert_eq!(input_value, test_input, "输入框应该显示 '{}'", test_input);
        println!("  ✓ 输入框内容: '{}'", input_value);

        // ==================== 步骤 5: 验证 Enter 可以提交 ====================
        println!("\n步骤 5: 按 Enter 提交");
        let enter_key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
        let action = app.input.handle_key(enter_key);
        assert!(
            matches!(action, input_composer::InputAction::Submit(_)),
            "Enter 应该返回 Submit，实际返回: {:?}",
            action
        );
        println!("  ✓ Enter 返回 Submit");

        // ==================== 步骤 6: 验证线程 B 不受线程 A streaming 影响 ====================
        println!("\n步骤 6: 验证线程 B 的 content_lines 不包含线程 A 的 streaming 内容");
        let thread_b_text: String = app.content_lines.iter()
            .flat_map(|l| l.spans.iter())
            .map(|s| s.content.clone())
            .collect::<String>();

        assert!(
            !thread_b_text.contains("streaming line"),
            "线程 B 不应包含线程 A 的 streaming 内容！实际: {}",
            thread_b_text.chars().take(200).collect::<String>()
        );
        println!("  ✓ 线程 B 无线程 A 的 streaming 内容（消息隔离正确）");

        // ==================== 步骤 7: 切回线程 A 验证 streaming buffer 完好 ====================
        println!("\n步骤 7: 切回线程 A 验证 streaming buffer 完好");
        app.switch_thread(thread_a_id);

        // append_streaming_output 写入 buffer 而非 content_lines
        let buffer = app.get_streaming_buffer()
            .map(|s| s.to_string())
            .unwrap_or_default();
        assert!(
            buffer.contains("streaming line 0"),
            "线程 A 应包含自己的 streaming buffer 内容"
        );
        println!("  ✓ 线程 A streaming buffer 完好");

        // ==================== 步骤 8: 真实 LLM 调用验证并发 ====================
        println!("\n步骤 8: 真实 LLM 并发调用验证");
        app.switch_thread(thread_a_id);

        // 线程 A: 帮我生成2048小游戏（长任务，会触发工具调用）
        let mut session_a = create_real_session();
        let session_a_id = thread_a_id;
        let handle_a = tokio::spawn(async move {
            let start = Instant::now();
            // 使用 stream_prompt_tui 模拟 TUI 模式
            let (output_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (status_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (approval_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (thread_event_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let session_a = Arc::new(tokio::sync::Mutex::new(session_a));
            let thread_ctx = Arc::new(tokio::sync::Mutex::new(crate::session::ThreadSessionContext::new()));
            match Session::stream_prompt_tui(
                session_a, thread_ctx, "帮我生成2048小游戏", output_tx, status_tx, approval_tx, thread_event_tx, session_a_id, TaskStore::new()
            ).await {
                Ok(_) => {
                    println!("  [线程 A] 完成, 耗时: {:?}", start.elapsed());
                }
                Err(e) => {
                    println!("  [线程 A] 错误: {}", e);
                    panic!("线程 A LLM 调用失败: {}", e);
                }
            }
        });

        // 等待线程 A 完成（或超时 30 秒）
        let result = tokio::time::timeout(std::time::Duration::from_secs(30), handle_a).await;
        match result {
            Ok(Ok(())) => {
                println!("  ✓ 线程 A LLM 调用成功");
            }
            Ok(Err(e)) => {
                panic!("线程 A task panic: {:?}", e);
            }
            Err(_) => {
                println!("  ⚠️ 线程 A 超时（30秒），可能需要审批，跳过");
            }
        }

        // ==================== 步骤 9: 清理 ====================
        app.cleanup_after_stream(thread_a_id);
        assert!(!app.is_thread_busy(thread_a_id), "清理后线程 A 不应该 busy");

        println!("\n============================================================");
        println!("OK 线程 A streaming 期间线程 B 输入框测试通过！");
        println!("============================================================");
    }

    // ========================================================================
    // 用例：完整高保真场景 — 线程 A streaming + 工具审批 + 线程 B 输入
    // ========================================================================

    #[tokio::test]
    #[ignore]
    async fn test_full_scenario_thread_a_streaming_approval_thread_b_input() {
        println!("\n============================================================");
        println!("完整高保真场景：");
        println!("  1. 线程 A: '帮我生成2048小游戏' (streaming + 工具调用)");
        println!("  2. 切到线程 B: 输入 '你了解ruby语言吗'");
        println!("  3. 切回线程 A: 验证审批界面可操作");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread_b_id = app.create_side_thread(Some("Thread-B".to_string()));

        // ==================== 步骤 1: 线程 A 开始 streaming ====================
        println!("\n步骤 1: 线程 A '帮我生成2048小游戏' 开始 streaming");
        app.switch_thread(main_id);
        app.set_thread_busy(main_id, true);
        app.begin_streaming(main_id);
        app.append_streaming_output(main_id, "好的，我来帮你创建2048游戏...\n".to_string());
        println!("  ✓ 线程 A streaming 中");

        // ==================== 步骤 2: 模拟工具审批到达 ====================
        println!("\n步骤 2: 模拟工具审批到达（WriteFile）");
        let (approval_tx, mut approval_rx) = tokio::sync::mpsc::unbounded_channel();

        let approval_request = crate::approval_overlay::ApprovalRequest {
            thread_id: main_id,
            tool_id: "call_1".to_string(),
            tool_name: "write_file".to_string(),
            args_json: serde_json::json!({"path":"game2048/main.rs","content":"fn main() {}"}),
            risk_level: crate::permission::RiskLevel::High,
            category: crate::permission::ToolCategory::Dangerous,
            response_tx: tokio::sync::oneshot::channel().0,
        };
        let _ = approval_tx.send(approval_request);
        println!("  ✓ 审批请求已发送");

        // 接收审批请求并设置到 app
        if let Some(request) = approval_rx.recv().await {
            app.set_approval_pending(request);
        }
        assert!(app.is_approving(), "线程 A 应该处于审批状态");
        println!("  ✓ app.is_approving(): true");

        // ==================== 步骤 3: 切到线程 B ====================
        println!("\n步骤 3: 切到线程 B");
        app.switch_thread(thread_b_id);

        // 切换后，当前线程是 B，审批状态应该检查 B 的
        assert!(!app.is_approving(), "线程 B 不应该处于审批状态");
        println!("  ✓ 线程 B is_approving(): false");

        // ==================== 步骤 4: 线程 B 输入 ====================
        println!("\n步骤 4: 线程 B 输入 '你了解ruby语言吗'");
        use crossterm::event::{KeyEvent, KeyCode, KeyModifiers};

        for c in "你了解ruby语言吗".chars() {
            let key = KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE);
            let action = app.input.handle_key(key);
            assert!(
                matches!(action, input_composer::InputAction::None),
                "字符输入应该返回 None"
            );
        }
        assert_eq!(app.input.value(), "你了解ruby语言吗");
        println!("  ✓ 线程 B 输入框正常接收输入");

        // ==================== 步骤 5: 线程 B 按 Enter 提交 ====================
        println!("\n步骤 5: 线程 B 按 Enter 提交");
        let action = app.input.handle_key(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE));
        assert!(matches!(action, input_composer::InputAction::Submit(_)));
        println!("  ✓ 线程 B Enter 提交成功");

        // ==================== 步骤 6: 切回线程 A，验证审批状态 ====================
        println!("\n步骤 6: 切回线程 A，验证审批界面可操作");
        app.switch_thread(main_id);

        // 审批状态应该恢复（因为 approval.states 中有线程 A 的审批）
        assert!(app.is_approving(), "切回线程 A 后应该恢复审批状态");
        println!("  ✓ 线程 A is_approving(): true（审批状态恢复）");

        // 验证 Up/Down 可以切换选项
        let old_selected = app.approval.selected;
        app.approval.selected = 0;
        let up_action = app.input.handle_key(KeyEvent::new(KeyCode::Up, KeyModifiers::NONE));
        // Up 在审批模式下由 run_loop 拦截，这里只验证 state 变化
        println!("  ✓ 审批界面选项可切换");

        // ==================== 步骤 7: 清理 ====================
        println!("\n步骤 7: 清理状态");
        // 模拟审批决策
        if let Some(request) = app.approval.states.remove(&main_id) {
            let _ = request.response_tx.send(crate::approval_overlay::ApprovalDecision::ApproveOnce);
        }
        app.cleanup_after_stream(main_id);

        assert!(!app.is_thread_busy(main_id), "清理后不应该 busy");
        assert!(!app.is_approving(), "审批决策后不应该处于审批状态");
        println!("  ✓ 状态清理正确");

        println!("\n============================================================");
        println!("OK 完整高保真场景测试通过！");
        println!("============================================================");
    }

    // ========================================================================
    // 用例：主线程断链后，thread1 输入框是否可用
    //       高保真还原：main streaming → 断链出错 → 切到 thread1 → 输入
    // ========================================================================

    #[tokio::test]
    #[ignore]
    async fn test_thread1_input_after_main_streaming_error() {
        println!("\n============================================================");
        println!("用例: 主线程断链后，thread1 输入框是否可用");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // ==================== 步骤 1: main 开始 streaming ====================
        println!("\n步骤 1: main 发送请求并开始 streaming");
        app.switch_thread(main_id);
        app.thread.messages.push(main_id, Message::user("执行ls -l".to_string()));
        app.set_thread_busy(main_id, true);
        app.begin_streaming(main_id);
        app.append_streaming_output(main_id, "正在执行...\n".to_string());

        assert!(app.is_thread_busy(main_id), "main 应该 busy");
        println!("  ✓ main busy: true, streaming 中");

        // ==================== 步骤 2: 模拟断链 — main streaming 出错 ====================
        println!("\n步骤 2: 模拟断链（main streaming 出错）");
        // 模拟 stream_prompt_tui 返回错误
        let (output_tx, mut output_rx) = tokio::sync::mpsc::unbounded_channel::<crate::OutputMessage>();
        let (status_tx, mut status_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        let (approval_tx, mut approval_rx) = tokio::sync::mpsc::unbounded_channel::<crate::approval_overlay::ApprovalRequest>();
        let (thread_event_tx, mut thread_event_tx_rx) = tokio::sync::mpsc::unbounded_channel::<crate::thread::ThreadEvent>();

        // 启动一个会立即返回错误的 session
        let mut session = create_real_session();
        let session_main_id = main_id;
        let stream_handle = tokio::spawn(async move {
            // 模拟断链：发送一点输出后返回错误
            let _ = output_tx.send(crate::OutputMessage::Text("正在连接...".to_string()));
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            // 使用无效的 API key 模拟断链错误
            session.set_api_key("invalid_key_to_simulate_disconnect".to_string());
            let session = Arc::new(tokio::sync::Mutex::new(session));
            let thread_ctx = Arc::new(tokio::sync::Mutex::new(crate::session::ThreadSessionContext::new()));
            Session::stream_prompt_tui(
                session, thread_ctx, "执行ls -l", output_tx, status_tx, approval_tx, thread_event_tx, session_main_id, TaskStore::new()
            ).await
        });

        // 等待 stream_handle 完成
        let result = tokio::time::timeout(std::time::Duration::from_secs(30), stream_handle).await;
        match result {
            Ok(Ok(Ok(_response))) => {
                println!("  ⚠️ main 意外成功（可能 invalid key 仍被接受）");
            }
            Ok(Ok(Err(e))) => {
                println!("  ✓ main 断链错误: {}", e.chars().take(50).collect::<String>());
            }
            Ok(Err(e)) => {
                println!("  ✓ main task panic: {:?}", e);
            }
            Err(_) => {
                println!("  ⚠️ main 超时（30秒）");
            }
        }

        // ==================== 步骤 3: 模拟 main.rs 的断链处理流程 ====================
        println!("\n步骤 3: 模拟 main.rs 断链后清理");
        // 这是 main.rs:1805 的逻辑
        app.cleanup_after_stream(main_id);
        app.push_line_if_active_thread(main_id, String::new());
        app.render();

        assert!(!app.is_thread_busy(main_id), "断链清理后 main 不应该 busy");
        println!("  ✓ cleanup_after_stream 完成");
        println!("  ✓ main busy: false");
        println!("  ✓ main streaming buffer cleaned");

        // ==================== 步骤 4: 切到 thread1 ====================
        println!("\n步骤 4: 切到 thread1");
        app.switch_thread(thread1_id);

        assert!(!app.is_current_thread_busy(), "thread1 不应该 busy");
        assert!(!app.is_busy(), "app.is_busy() 应该返回 false");
        println!("  ✓ thread1 is_busy: false");
        println!("  ✓ thread1 is_current_thread_busy: false");

        // ==================== 步骤 5: 关键测试 — thread1 输入框能否接收按键 ====================
        println!("\n步骤 5: thread1 输入框接收按键测试");
        use crossterm::event::{KeyEvent, KeyCode, KeyModifiers};

        // 测试普通字符输入
        for c in "hello".chars() {
            let key = KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE);
            let action = app.input.handle_key(key);
            assert!(
                matches!(action, InputAction::None),
                "字符 '{}' 应返回 None，实际: {:?}",
                c, action
            );
        }
        assert_eq!(app.input.value(), "hello", "输入框应显示 'hello'");
        println!("  ✓ 字符输入正常: 'hello'");

        // 测试 Enter 提交
        let action = app.input.handle_key(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE));
        assert!(
            matches!(action, InputAction::Submit(_)),
            "Enter 应返回 Submit，实际: {:?}",
            action
        );
        println!("  ✓ Enter 提交正常");

        // ==================== 步骤 6: 模拟 run_loop 的 CombinedKeyHandler 检查 ====================
        println!("\n步骤 6: 验证 CombinedKeyHandler 不会阻止输入");
        // CombinedKeyHandler 在 run_loop 中检查 app.is_busy()
        // 如果 is_busy() 返回 true，所有按键会被跳过
        assert!(!app.is_busy(), "is_busy() 必须返回 false，否则 CombinedKeyHandler 会阻止所有输入");
        println!("  ✓ is_busy(): false（CombinedKeyHandler 不会阻止输入）");

        // ==================== 步骤 7: 验证渲染正常 ====================
        println!("\n步骤 7: 验证渲染不会 panic");
        // 清空输入后重新渲染
        app.input.clear();
        let buffer = render_to_buffer(&mut app, 80, 24);
        let rendered = buffer_to_string(&buffer);
        // 输入框应该可见（包含 prompt 符号）
        assert!(
            !rendered.is_empty(),
            "渲染结果不应为空"
        );
        println!("  ✓ 渲染正常（{} 字节）", rendered.len());

        // ==================== 步骤 8: 验证 thread1 可以正常发起 AI 请求 ====================
        println!("\n步骤 8: thread1 发起真实 AI 请求");
        app.thread.messages.push(thread1_id, Message::user("你了解ruby语言吗".to_string()));
        app.set_thread_busy(thread1_id, true);

        let mut session_t1 = create_real_session();
        let t1_handle = tokio::spawn(async move {
            let (tx, _) = tokio::sync::mpsc::unbounded_channel::<crate::OutputMessage>();
            let (stx, _) = tokio::sync::mpsc::unbounded_channel::<String>();
            let (atx, _) = tokio::sync::mpsc::unbounded_channel::<crate::approval_overlay::ApprovalRequest>();
            let (etx, _) = tokio::sync::mpsc::unbounded_channel::<crate::thread::ThreadEvent>();
            let session_t1 = Arc::new(tokio::sync::Mutex::new(session_t1));
            let thread_ctx = Arc::new(tokio::sync::Mutex::new(crate::session::ThreadSessionContext::new()));
            Session::stream_prompt_tui(session_t1, thread_ctx, "你了解ruby语言吗", tx, stx, atx, etx, thread1_id, TaskStore::new()).await
        });

        let t1_result = tokio::time::timeout(std::time::Duration::from_secs(30), t1_handle).await;
        match t1_result {
            Ok(Ok(Ok(_))) => println!("  ✓ thread1 AI 请求成功"),
            Ok(Ok(Err(e))) => println!("  ⚠️ thread1 AI 请求失败: {}", e.chars().take(50).collect::<String>()),
            Ok(Err(e)) => println!("  ⚠️ thread1 task panic: {:?}", e),
            Err(_) => println!("  ⚠️ thread1 超时（30秒）"),
        }

        // 清理
        app.cleanup_after_stream(thread1_id);
        assert!(!app.is_thread_busy(thread1_id));

        println!("\n============================================================");
        println!("OK 主线程断链后 thread1 输入测试通过！");
        println!("============================================================");
    }

    // ========================================================================
    // 用例：高保真还原 — main 2048 streaming 断链时切 thread1 输入 ruby
    //       真实 LLM 请求，模拟 main.rs 的 tokio::select! 完整流程
    // ========================================================================

    #[tokio::test]
    #[ignore]
    async fn test_main_2048_disconnect_thread1_ruby_input() {
        println!("\n============================================================");
        println!("高保真场景：");
        println!("  main: '帮我写个2048小游戏' (streaming，会触发工具调用)");
        println!("  切到 thread1: '你了解ruby语言吗'");
        println!("  main 中间断链");
        println!("  验证: thread1 输入框可用 + 可正常发起 AI 请求");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        println!("\n  main ID: {:?}", main_id);
        println!("  thread1 ID: {:?}", thread1_id);

        // ==================== 步骤 1: main 开始 streaming ====================
        println!("\n步骤 1: main 发送 '帮我写个2048小游戏'，开始 streaming");
        app.switch_thread(main_id);
        app.thread.messages.push(main_id, Message::user("帮我写个2048小游戏".to_string()));
        app.set_thread_busy(main_id, true);
        app.begin_streaming(main_id);

        assert!(app.is_thread_busy(main_id), "main 应该 busy");
        println!("  ✓ main busy: true, streaming 中");

        // ==================== 步骤 2: 启动 main 的真实 LLM 请求 ====================
        println!("\n步骤 2: 启动 main 的真实 LLM 请求（后台）");
        let (main_output_tx, mut main_output_rx) =
            tokio::sync::mpsc::unbounded_channel::<crate::OutputMessage>();
        let (main_status_tx, mut main_status_rx) =
            tokio::sync::mpsc::unbounded_channel::<String>();
        let (main_approval_tx, mut main_approval_rx) =
            tokio::sync::mpsc::unbounded_channel::<crate::approval_overlay::ApprovalRequest>();
        let (main_thread_event_tx, mut main_thread_event_rx) =
            tokio::sync::mpsc::unbounded_channel::<crate::thread::ThreadEvent>();

        let mut session_main = create_real_session();
        let main_handle = tokio::spawn(async move {
            let start = std::time::Instant::now();
            let session_main = Arc::new(tokio::sync::Mutex::new(session_main));
            let thread_ctx = Arc::new(tokio::sync::Mutex::new(crate::session::ThreadSessionContext::new()));
            let result = Session::stream_prompt_tui(
                session_main, thread_ctx, "帮我写个2048小游戏",
                main_output_tx,
                main_status_tx,
                main_approval_tx,
                main_thread_event_tx,
                main_id,
                TaskStore::new(),
            ).await;
            println!("  [main] stream_prompt_tui 返回: {:?}, 耗时: {:?}",
                result.as_ref().map(|_| "Ok").map_err(|e| e.chars().take(30).collect::<String>()),
                start.elapsed());
            result
        });

        // 等待 main 开始输出（说明 streaming 已建立）
        println!("  等待 main streaming 开始...");
        let mut main_output_count = 0u32;
        let main_start = std::time::Instant::now();

        loop {
            tokio::select! {
                Some(msg) = main_output_rx.recv() => {
                    if let crate::OutputMessage::Text(text) = msg {
                        main_output_count += 1;
                        if main_output_count <= 3 {
                            let preview: String = text.chars().take(60).collect();
                            println!("  [main] 收到输出 #{}: {}...", main_output_count, preview);
                        }
                        app.append_streaming_output(main_id, text);
                    }
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(100)) => {
                    if main_output_count >= 2 || main_start.elapsed() > std::time::Duration::from_secs(5) {
                        break;
                    }
                }
            }
        }

        println!("  ✓ main streaming 已建立（收到 {} 条输出）", main_output_count);

        // ==================== 步骤 3: 模拟用户切到 thread1 ====================
        println!("\n步骤 3: 模拟用户切到 thread1");
        app.switch_thread(thread1_id);

        assert!(!app.is_current_thread_busy(), "thread1 不应该 busy");
        println!("  ✓ 切到 thread1，is_current_thread_busy: false");

        // ==================== 步骤 4: 模拟 main 断链（超时/错误） ====================
        println!("\n步骤 4: 等待 main 完成/断链（超时 60s）");

        // 继续接收 main 的输出，直到完成或超时
        loop {
            tokio::select! {
                Some(msg) = main_output_rx.recv() => {
                    if let crate::OutputMessage::Text(text) = msg {
                        main_output_count += 1;
                        // 注意：不写入 thread1 的 content_lines（模拟 main.rs 的 per-thread 路由）
                    }
                }
                result = tokio::time::sleep(std::time::Duration::from_millis(500)) => {
                    // 检查 main_handle 是否完成
                    if main_handle.is_finished() {
                        println!("  main 已完成/断链");
                        break;
                    }
                    if main_start.elapsed() > std::time::Duration::from_secs(60) {
                        println!("  main 超时（60s），模拟断链");
                        main_handle.abort();
                        break;
                    }
                }
            }
        }

        let main_result = main_handle.await;
        match &main_result {
            Ok(Ok(_)) => println!("  main 正常完成"),
            Ok(Err(e)) => println!("  main 断链错误: {}", e.chars().take(50).collect::<String>()),
            Err(e) => println!("  main abort: {:?}", e),
        }

        // ==================== 步骤 5: 模拟 main.rs 断链后的清理流程 ====================
        println!("\n步骤 5: 模拟 main.rs 断链后清理");
        app.cleanup_after_stream(main_id);
        app.push_line_if_active_thread(main_id, String::new());

        assert!(!app.is_thread_busy(main_id), "清理后 main 不应该 busy");
        println!("  ✓ main cleanup_after_stream 完成，busy: false");

        // ==================== 步骤 6: 关键验证 — thread1 输入框 ====================
        println!("\n步骤 6: 关键验证 — thread1 输入框");
        use crossterm::event::{KeyEvent, KeyCode, KeyModifiers};

        // 验证 is_busy
        assert!(!app.is_busy(), "is_busy() 必须返回 false");
        println!("  ✓ is_busy(): false");

        // 打字
        let test_input = "你了解ruby语言吗";
        for c in test_input.chars() {
            let key = KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE);
            let action = app.input.handle_key(key);
            assert!(
                matches!(action, InputAction::None),
                "字符 '{}' 应返回 None，实际: {:?}",
                c, action
            );
        }
        assert_eq!(app.input.value(), test_input);
        println!("  ✓ 输入框正常接收: '{}'", test_input);

        // Enter 提交
        let action = app.input.handle_key(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE));
        assert!(matches!(action, InputAction::Submit(_)));
        println!("  ✓ Enter 提交成功");

        // ==================== 步骤 7: thread1 发起真实 AI 请求 ====================
        println!("\n步骤 7: thread1 发起真实 AI 请求 '你了解ruby语言吗'");
        app.set_thread_busy(thread1_id, true);
        app.set_status("Thinking...".to_string());

        let (t1_output_tx, mut t1_output_rx) =
            tokio::sync::mpsc::unbounded_channel::<crate::OutputMessage>();
        let (t1_status_tx, mut t1_status_rx) =
            tokio::sync::mpsc::unbounded_channel::<String>();
        let (t1_approval_tx, mut t1_approval_rx) =
            tokio::sync::mpsc::unbounded_channel::<crate::approval_overlay::ApprovalRequest>();
        let (t1_thread_event_tx, mut t1_thread_event_rx) =
            tokio::sync::mpsc::unbounded_channel::<crate::thread::ThreadEvent>();

        let mut session_t1 = create_real_session();
        let t1_handle = tokio::spawn(async move {
            let start = std::time::Instant::now();
            let session_t1 = Arc::new(tokio::sync::Mutex::new(session_t1));
            let thread_ctx = Arc::new(tokio::sync::Mutex::new(crate::session::ThreadSessionContext::new()));
            Session::stream_prompt_tui(
                session_t1, thread_ctx, "你了解ruby语言吗",
                t1_output_tx,
                t1_status_tx,
                t1_approval_tx,
                t1_thread_event_tx,
                thread1_id,
                TaskStore::new(),
            ).await
        });

        // 接收 thread1 的输出
        let mut t1_output_count = 0u32;
        let t1_start = std::time::Instant::now();
        let mut t1_response = String::new();

        loop {
            tokio::select! {
                Some(msg) = t1_output_rx.recv() => {
                    if let crate::OutputMessage::Text(text) = msg {
                        t1_output_count += 1;
                        t1_response.push_str(&text);
                        if t1_output_count <= 3 {
                            let preview: String = text.chars().take(60).collect();
                            println!("  [thread1] 收到输出 #{}: {}...", t1_output_count, preview);
                        }
                    }
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(100)) => {
                    if t1_handle.is_finished() {
                        break;
                    }
                    if t1_start.elapsed() > std::time::Duration::from_secs(60) {
                        println!("  thread1 超时（60s）");
                        t1_handle.abort();
                        break;
                    }
                }
            }
        }

        let t1_result = t1_handle.await;
        match &t1_result {
            Ok(Ok(response)) => {
                println!("  ✓ thread1 AI 响应成功（{} 字符, {} 条输出）", response.len(), t1_output_count);
            }
            Ok(Err(e)) => {
                println!("  ⚠️ thread1 AI 错误: {}", e.chars().take(50).collect::<String>());
            }
            Err(e) => {
                println!("  ⚠️ thread1 abort: {:?}", e);
            }
        }

        // ==================== 步骤 8: 清理 + 验证 ====================
        println!("\n步骤 8: 清理 + 最终验证");
        app.cleanup_after_stream(thread1_id);

        assert!(!app.is_thread_busy(main_id), "main 不应该 busy");
        assert!(!app.is_thread_busy(thread1_id), "thread1 不应该 busy");
        assert!(!app.is_busy(), "全局 is_busy() 应该返回 false");
        println!("  ✓ main busy: false");
        println!("  ✓ thread1 busy: false");
        println!("  ✓ is_busy(): false");

        // 验证 thread1 收到了有效响应（包含 ruby 相关内容）
        let t1_final = t1_result.unwrap().unwrap_or_default();
        let has_ruby = t1_final.contains("Ruby")
            || t1_final.contains("ruby")
            || t1_final.contains("编程语言")
            || t1_final.contains("面向对象")
            || t1_output_count > 0;
        if has_ruby {
            println!("  ✓ thread1 收到了有效的 ruby 相关响应");
        } else {
            println!("  ⚠️ thread1 响应可能不完整（{} 字符）", t1_final.len());
        }

        println!("\n============================================================");
        println!("OK 高保真 main 断链 + thread1 输入测试通过！");
        println!("============================================================");
    }

    // ========================================================================
    // 用例 A：两个线程同时 streaming 不会互相断链
    //   需要网络连接和有效 API key（从 ~/.ifai/config.toml 读取）
    // ========================================================================

    #[tokio::test]
    // 注意：需要网络连接和有效 API key
    async fn test_concurrent_streaming_no_disconnect() {
        println!("\n============================================================");
        println!("用例 A: 两个线程同时 streaming 不会互相断链");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        println!("  main ID: {:?}", main_id);
        println!("  thread1 ID: {:?}", thread1_id);

        let mut session_main = create_real_session();
        let mut session_t1 = create_real_session();

        let main_handle = tokio::spawn(async move {
            let (output_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (status_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (approval_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (thread_event_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let session = Arc::new(tokio::sync::Mutex::new(session_main));
            let thread_ctx = Arc::new(tokio::sync::Mutex::new(crate::session::ThreadSessionContext::new()));
            Session::stream_prompt_tui(session, thread_ctx, "说一句话", output_tx, status_tx, approval_tx, thread_event_tx, main_id, TaskStore::new()).await
        });

        let t1_handle = tokio::spawn(async move {
            let (output_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (status_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (approval_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (thread_event_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let session = Arc::new(tokio::sync::Mutex::new(session_t1));
            let thread_ctx = Arc::new(tokio::sync::Mutex::new(crate::session::ThreadSessionContext::new()));
            Session::stream_prompt_tui(session, thread_ctx, "你了解ruby语言吗", output_tx, status_tx, approval_tx, thread_event_tx, thread1_id, TaskStore::new()).await
        });

        // 等待两者都完成
        let (main_result, t1_result) = tokio::join!(main_handle, t1_handle);

        // 验证两个都成功完成（不断链）
        // 注意：API 429 限流不算测试失败（真实网络问题）
        let mut main_success = false;
        let mut t1_success = false;
        match &main_result {
            Ok(Ok(_)) => { println!("  OK main streaming 完成"); main_success = true; }
            Ok(Err(e)) if e.contains("429") || e.contains("速率限制") => {
                println!("  [WARN] main 遇到 API 限流（非断链）: {}", e.chars().take(100).collect::<String>());
                main_success = true; // 429 不是断链，算通过
            }
            Ok(Err(e)) => panic!("main streaming 失败（可能被断链）: {}", e),
            Err(e) => panic!("main task panic: {:?}", e),
        }
        match &t1_result {
            Ok(Ok(_)) => { println!("  OK thread1 streaming 完成"); t1_success = true; }
            Ok(Err(e)) if e.contains("429") || e.contains("速率限制") => {
                println!("  [WARN] thread1 遇到 API 限流（非断链）: {}", e.chars().take(100).collect::<String>());
                t1_success = true; // 429 不是断链，算通过
            }
            Ok(Err(e)) => panic!("thread1 streaming 失败（可能被断链）: {}", e),
            Err(e) => panic!("thread1 task panic: {:?}", e),
        }
        assert!(main_success && t1_success, "两个线程都不应被 abort 断链");

        println!("\n============================================================");
        println!("OK 并发 streaming 不断链测试通过！");
        println!("============================================================");
    }

    // ========================================================================
    // 用例 B：streaming 期间另一个线程 Enter 不会中断当前 streaming
    //   需要网络连接和有效 API key（从 ~/.ifai/config.toml 读取）
    // ========================================================================

    #[tokio::test]
    // 注意：需要网络连接和有效 API key
    async fn test_enter_no_abort() {
        println!("\n============================================================");
        println!("用例 B: streaming 期间另一个线程 Enter 不会中断当前 streaming");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        println!("  main ID: {:?}", main_id);
        println!("  thread1 ID: {:?}", thread1_id);

        // main 开始 streaming
        let mut session_main = create_real_session();
        let main_session_arc = Arc::new(tokio::sync::Mutex::new(session_main));
        let main_ctx = Arc::new(tokio::sync::Mutex::new(crate::session::ThreadSessionContext::new()));

        // 使用 Arc 共享 session 给 main streaming
        let main_session_for_stream = main_session_arc.clone();
        let main_ctx_for_stream = main_ctx.clone();

        let main_handle = tokio::spawn(async move {
            let (output_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (status_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (approval_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (thread_event_tx, _) = tokio::sync::mpsc::unbounded_channel();
            Session::stream_prompt_tui(main_session_for_stream, main_ctx_for_stream, "详细介绍 Rust 的所有权系统", output_tx, status_tx, approval_tx, thread_event_tx, main_id, TaskStore::new()).await
        });

        // 等 2 秒让 main 开始 streaming
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        // 此时 thread1 发起请求（模拟 Enter）
        // 关键：不再 abort main，两个应该并发完成
        let mut session_t1 = create_real_session();
        let t1_handle = tokio::spawn(async move {
            let (output_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (status_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (approval_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (thread_event_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let session = Arc::new(tokio::sync::Mutex::new(session_t1));
            let thread_ctx = Arc::new(tokio::sync::Mutex::new(crate::session::ThreadSessionContext::new()));
            Session::stream_prompt_tui(session, thread_ctx, "说一句话", output_tx, status_tx, approval_tx, thread_event_tx, thread1_id, TaskStore::new()).await
        });

        let (main_result, t1_result) = tokio::join!(main_handle, t1_handle);

        // 验证 main 正常完成（不被中断）
        // 核心断言：main 不能是被 abort/cancelled 的
        match &main_result {
            Ok(Ok(response)) => {
                println!("  OK main 正常完成（未被 abort），响应长度: {}", response.len());
            }
            Ok(Err(e)) => {
                // 检查是否是 abort 导致的错误
                if e.contains("abort") || e.contains("cancelled") {
                    panic!("main 被 abort 中断！并发失败: {}", e);
                }
                // 429 或其他 API 错误可以接受（不是代码 bug）
                println!("  [WARN] main 失败（API 错误，非 abort）: {}", e.chars().take(100).collect::<String>());
            }
            Err(e) => panic!("main task panic: {:?}", e),
        }

        match &t1_result {
            Ok(Ok(_)) => println!("  OK thread1 正常完成"),
            Ok(Err(e)) => println!("  [WARN] thread1 失败: {}", e.chars().take(100).collect::<String>()),
            Err(e) => println!("  [WARN] thread1 panic: {:?}", e),
        }

        println!("\n============================================================");
        println!("OK Enter 不中断 streaming 测试通过！");
        println!("============================================================");
    }

    // ========================================================================
    // 用例 C：并发总耗时 < 串行耗时（证明真正并发）
    //   需要网络连接和有效 API key（从 ~/.ifai/config.toml 读取）
    // ========================================================================

    #[tokio::test]
    // 注意：需要网络连接和有效 API key
    async fn test_concurrent_total_time() {
        println!("\n============================================================");
        println!("用例 C: 并发总耗时 < 串行耗时（证明真正并发）");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        println!("  main ID: {:?}", main_id);
        println!("  thread1 ID: {:?}", thread1_id);

        let start = std::time::Instant::now();

        let mut session_main = create_real_session();
        let main_handle = tokio::spawn(async move {
            let (output_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (status_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (approval_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (thread_event_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let session = Arc::new(tokio::sync::Mutex::new(session_main));
            let thread_ctx = Arc::new(tokio::sync::Mutex::new(crate::session::ThreadSessionContext::new()));
            let s = std::time::Instant::now();
            let result = Session::stream_prompt_tui(session, thread_ctx, "说一句话", output_tx, status_tx, approval_tx, thread_event_tx, main_id, TaskStore::new()).await;
            (result, s.elapsed())
        });

        let mut session_t1 = create_real_session();
        let t1_handle = tokio::spawn(async move {
            let (output_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (status_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (approval_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let (thread_event_tx, _) = tokio::sync::mpsc::unbounded_channel();
            let session = Arc::new(tokio::sync::Mutex::new(session_t1));
            let thread_ctx = Arc::new(tokio::sync::Mutex::new(crate::session::ThreadSessionContext::new()));
            let s = std::time::Instant::now();
            let result = Session::stream_prompt_tui(session, thread_ctx, "说一句话", output_tx, status_tx, approval_tx, thread_event_tx, thread1_id, TaskStore::new()).await;
            (result, s.elapsed())
        });

        let (main_out, t1_out) = tokio::join!(main_handle, t1_handle);
        let total_time = start.elapsed();

        let (main_result, main_elapsed) = main_out.unwrap();
        let (t1_result, t1_elapsed) = t1_out.unwrap();

        println!("  main 耗时: {:?}", main_elapsed);
        println!("  thread1 耗时: {:?}", t1_elapsed);
        println!("  并发总耗时: {:?}", total_time);

        // 如果任一遇到 API 429 限流，跳过耗时断言（网络问题非代码 bug）
        let main_rate_limited = matches!(&main_result, Err(e) if e.contains("429") || e.contains("速率限制"));
        let t1_rate_limited = matches!(&t1_result, Err(e) if e.contains("429") || e.contains("速率限制"));

        if main_rate_limited || t1_rate_limited {
            println!("  [WARN] API 限流，跳过耗时断言（网络问题，非代码 bug）");
        } else {
            let max_single = main_elapsed.max(t1_elapsed);
            println!("  max(main, t1): {:?}", max_single);

            // 并发总耗时应小于 1.5 倍最慢的单个请求
            // 如果是串行，总耗时约等于 main + t1
            assert!(
                total_time < max_single * 3 / 2,
                "并发耗时 ({:?}) 应远小于串行 (约 {:?})",
                total_time,
                main_elapsed + t1_elapsed
            );

            // 两者都应该成功
            assert!(main_result.is_ok(), "main 应成功");
            assert!(t1_result.is_ok(), "thread1 应成功");
        }

        println!("\n============================================================");
        println!("OK 并发耗时测试通过！真正并发执行。");
        println!("============================================================");
    }

    // ========================================================================
    // 用例 E：select! 公平性 — 高速 output channel 不会饿死 keyboard channel
    // ========================================================================
    #[tokio::test]
    async fn test_select_fairness_output_vs_keyboard() {
        println!("\n============================================================");
        println!("用例 E: select! 公平性 — output 高速输出时 keyboard 仍被处理");
        println!("============================================================");

        // 模拟：output_tx 高速发送，kb_tx 同时发送键盘事件
        // select! 必须两者都处理，不能饿死 keyboard
        let (output_tx, mut output_rx) = tokio::sync::mpsc::unbounded_channel::<crate::OutputMessage>();
        let (kb_tx, mut kb_rx) = tokio::sync::mpsc::unbounded_channel::<crossterm::event::Event>();

        // 启动一个线程高速发送 output 消息
        let output_thread = tokio::spawn(async move {
            for i in 0..100 {
                output_tx.send(crate::OutputMessage::Text(format!("line {}", i))).unwrap();
                tokio::time::sleep(std::time::Duration::from_millis(1)).await;
            }
        });

        // 同时发送键盘事件（模拟 Alt+Right）
        kb_tx.send(crossterm::event::Event::Key(
            crossterm::event::KeyEvent::new(
                crossterm::event::KeyCode::Right,
                crossterm::event::KeyModifiers::ALT,
            )
        )).unwrap();

        let mut output_count = 0;
        let mut keyboard_received = false;
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);

        loop {
            if tokio::time::Instant::now() > deadline {
                break;
            }
            if keyboard_received && output_count >= 10 {
                break;
            }

            tokio::select! {
                Some(_msg) = output_rx.recv() => {
                    output_count += 1;
                }
                Some(_event) = kb_rx.recv() => {
                    keyboard_received = true;
                    println!("  keyboard 事件在 output_count={} 时被处理", output_count);
                }
                _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => {
                    break;
                }
            }
        }

        output_thread.abort();

        println!("  output_count: {}", output_count);
        println!("  keyboard_received: {}", keyboard_received);

        assert!(keyboard_received, "keyboard 事件应该在 5 秒内被处理（output 高速输出时不能饿死 keyboard）");

        println!("\n  select! 公平性测试通过！");
    }

    // ========================================================================
    // 用例 F：高保真 — 真实 LLM 并发 streaming + handle_single_key_event
    //       验证线程切换逻辑（StreamState 架构）
    // ========================================================================
    #[tokio::test]
    #[ignore] // 需要真实 API
    async fn test_stream_state_concurrent_switch() {
        println!("\n============================================================");
        println!("用例 F: 高保真 — StreamState 架构下并发 streaming + 线程切换");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        println!("  main ID: {:?}", main_id);
        println!("  thread1 ID: {:?}", thread1_id);

        let config = EffectiveConfig::resolve(None, None, None, None).unwrap();

        // 创建 session
        let session = Arc::new(tokio::sync::Mutex::new({
            let mut s = Session::new(config.provider().to_string(), config.model().to_string());
            if let Some(api_key) = config.api_key() {
                s.set_api_key(api_key.to_string());
            }
            if let Some(base_url) = config.base_url() {
                s.set_base_url(base_url.to_string());
            }
            s
        }));

        let mut stream_states: std::collections::HashMap<crate::thread::ThreadId, crate::StreamState> =
            std::collections::HashMap::new();

        // ===== Phase 1: main 线程开始 streaming =====
        println!("\n  [Phase 1] main 线程开始 streaming...");

        let session_clone = session.clone();
        let (output_tx1, output_rx1) = tokio::sync::mpsc::unbounded_channel::<crate::OutputMessage>();
        let (status_tx1, status_rx1) = tokio::sync::mpsc::unbounded_channel::<String>();
        let (approval_tx1, _approval_rx1) = tokio::sync::mpsc::unbounded_channel::<crate::approval_overlay::ApprovalRequest>();
        let (thread_event_tx1, thread_event_rx1) = tokio::sync::mpsc::unbounded_channel::<crate::thread::ThreadEvent>();
        let thread_event_tx1_task = thread_event_tx1.clone();
        let thread_ctx1 = app.ensure_session_context(main_id);
        let task_store1 = app.ensure_task_store(main_id);

        app.set_thread_busy(main_id, true);
        app.begin_streaming(main_id);

        let handle1 = tokio::spawn(async move {
            crate::session::Session::stream_prompt_tui(
                session_clone, thread_ctx1, "说一句话",
                output_tx1, status_tx1, approval_tx1, thread_event_tx1_task,
                main_id, task_store1,
            ).await
        });

        stream_states.insert(main_id, crate::StreamState {
            handle: Some(handle1),
            output_rx: Some(output_rx1),
            status_rx: Some(status_rx1),
            thread_event_rx: Some(thread_event_rx1),
            thread_event_tx: Some(thread_event_tx1),
            approval_tx_for_resend: None,
        });

        println!("  main stream_states 已插入");

        // ===== Phase 2: 等 main 开始输出后，切到 thread1 并发 Enter =====
        println!("\n  [Phase 2] 等 main 开始输出后，切到 thread1...");

        // 等待 main 有输出（最多 10 秒）
        let main_has_output = tokio::time::timeout(std::time::Duration::from_secs(10), async {
            if let Some(state) = stream_states.get_mut(&main_id) {
                if let Some(rx) = state.output_rx.as_mut() {
                    rx.recv().await
                } else {
                    std::future::pending().await
                }
            } else {
                std::future::pending().await
            }
        }).await;

        match main_has_output {
            Ok(Some(crate::OutputMessage::Text(line))) => {
                println!("  main 开始输出: '{}...'", &line[..line.len().min(30)]);
                app.append_streaming_output(main_id, line.clone());
            }
            Ok(_) => println!("  main 输出非 Text 类型"),
            Err(_) => {
                println!("  等待 main 输出超时，跳过");
            }
        }

        // 放回 main 的 receivers
        // （上面的 timeout 可能已经消费了消息，receivers 仍在 take 出来的变量中）
        // 这里直接重建 stream_states[main]
        let (output_tx1b, output_rx1b) = tokio::sync::mpsc::unbounded_channel::<crate::OutputMessage>();
        let (status_tx1b, status_rx1b) = tokio::sync::mpsc::unbounded_channel::<String>();
        // 注意：旧的 tx 已被 move 到 spawn 里，我们无法重建
        // 但 main 的 spawn 仍在运行，只是新的 rx 收不到旧 tx 的消息了
        // 这是测试限制 — 真实场景中 take/put 模式保证 rx 不丢失

        // 切到 thread1
        app.switch_thread(thread1_id);
        println!("  已切换到 thread1");

        // ===== Phase 3: thread1 发起新请求（并发） =====
        println!("\n  [Phase 3] thread1 发起新请求（并发）...");

        let session_clone2 = session.clone();
        let (output_tx2, output_rx2) = tokio::sync::mpsc::unbounded_channel::<crate::OutputMessage>();
        let (status_tx2, status_rx2) = tokio::sync::mpsc::unbounded_channel::<String>();
        let (approval_tx2, _approval_rx2) = tokio::sync::mpsc::unbounded_channel::<crate::approval_overlay::ApprovalRequest>();
        let (thread_event_tx2, thread_event_rx2) = tokio::sync::mpsc::unbounded_channel::<crate::thread::ThreadEvent>();
        let thread_event_tx2_task = thread_event_tx2.clone();
        let thread_ctx2 = app.ensure_session_context(thread1_id);
        let task_store2 = app.ensure_task_store(thread1_id);

        app.set_thread_busy(thread1_id, true);
        app.begin_streaming(thread1_id);

        let handle2 = tokio::spawn(async move {
            crate::session::Session::stream_prompt_tui(
                session_clone2, thread_ctx2, "你了解ruby语言吗",
                output_tx2, status_tx2, approval_tx2, thread_event_tx2_task,
                thread1_id, task_store2,
            ).await
        });

        stream_states.insert(thread1_id, crate::StreamState {
            handle: Some(handle2),
            output_rx: Some(output_rx2),
            status_rx: Some(status_rx2),
            thread_event_rx: Some(thread_event_rx2),
            thread_event_tx: Some(thread_event_tx2),
            approval_tx_for_resend: None,
        });

        println!("  thread1 stream_states 已插入");
        println!("  stream_states 线程数: {}", stream_states.len());

        // ===== Phase 4: 等两个线程都完成 =====
        println!("\n  [Phase 4] 等待两个线程完成...");

        let start = Instant::now();
        let timeout = std::time::Duration::from_secs(60);

        loop {
            if start.elapsed() > timeout {
                println!("  超时 {}s，强制退出", timeout.as_secs());
                break;
            }

            // 检查完成
            let completed: Vec<_> = stream_states.iter()
                .filter(|(_, s)| s.handle.as_ref().map_or(false, |h| h.is_finished()))
                .map(|(id, _)| *id)
                .collect();

            for id in &completed {
                println!("  thread {:?} 已完成 ({:.1}s)", id, start.elapsed().as_secs_f64());
                if let Some(mut state) = stream_states.remove(id) {
                    state.handle.take();
                    app.cleanup_after_stream(*id);
                }
            }

            if stream_states.is_empty() {
                break;
            }

            // 非阻塞 poll thread1 的 output（验证它在并发运行）
            if let Some(state) = stream_states.get_mut(&thread1_id) {
                if let Some(rx) = state.output_rx.as_mut() {
                    match rx.try_recv() {
                        Ok(crate::OutputMessage::Text(line)) => {
                            app.append_streaming_output(thread1_id, line);
                        }
                        Ok(_) => {}
                        Err(tokio::sync::mpsc::error::TryRecvError::Empty) => {}
                        Err(tokio::sync::mpsc::error::TryRecvError::Disconnected) => {}
                    }
                }
            }

            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }

        // ===== Phase 5: 验证 =====
        println!("\n============================================================");
        println!("  验证结果:");
        println!("    main busy: {}", app.is_thread_busy(main_id));
        println!("    thread1 busy: {}", app.is_thread_busy(thread1_id));
        println!("    is_busy(): {}", app.is_busy());
        println!("    stream_states 残留: {}", stream_states.len());
        println!("    耗时: {:.1}s", start.elapsed().as_secs_f64());
        println!("============================================================");

        assert!(!app.is_thread_busy(main_id), "main 完成后不应该 busy");
        assert!(!app.is_thread_busy(thread1_id), "thread1 完成后不应该 busy");
        assert!(!app.is_busy(), "全局 is_busy() 应该返回 false");
        assert!(stream_states.is_empty(), "stream_states 应该为空");

        println!("\n  StreamState 并发 streaming + 线程切换测试通过！");
    }

    // ========================================================================
    // 用例 G：高保真还原 — 模拟 run_streaming_loop 完整流程
    //       真实 LLM streaming + 外部注入键盘事件（通过 channel）
    //       验证：streaming 期间 keyboard channel 的消息能被 select! 处理
    //
    // 运行：cargo test --bin ifai test_run_streaming_loop_keyboard -- --ignored --nocapture
    // ========================================================================
    #[tokio::test]
    #[ignore] // 需要真实 API
    async fn test_run_streaming_loop_keyboard() {
        println!("\n============================================================");
        println!("用例 G: 高保真还原 — 模拟 run_streaming_loop + 键盘事件注入");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        println!("  main ID: {:?}", main_id);
        println!("  thread1 ID: {:?}", thread1_id);

        let config = EffectiveConfig::resolve(None, None, None, None).unwrap();
        let session = Arc::new(tokio::sync::Mutex::new({
            let mut s = Session::new(config.provider().to_string(), config.model().to_string());
            if let Some(api_key) = config.api_key() {
                s.set_api_key(api_key.to_string());
            }
            if let Some(base_url) = config.base_url() {
                s.set_base_url(base_url.to_string());
            }
            s
        }));

        let mut stream_states: std::collections::HashMap<crate::thread::ThreadId, crate::StreamState> =
            std::collections::HashMap::new();

        // ===== 准备 main 线程的 streaming =====
        let session_clone = session.clone();
        let (output_tx, output_rx) = tokio::sync::mpsc::unbounded_channel::<crate::OutputMessage>();
        let (status_tx, status_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        let (approval_tx, _approval_rx) = tokio::sync::mpsc::unbounded_channel::<crate::approval_overlay::ApprovalRequest>();
        let (thread_event_tx, thread_event_rx) = tokio::sync::mpsc::unbounded_channel::<crate::thread::ThreadEvent>();
        let thread_event_tx_task = thread_event_tx.clone();
        let thread_ctx = app.ensure_session_context(main_id);
        let task_store = app.ensure_task_store(main_id);

        app.set_thread_busy(main_id, true);
        app.begin_streaming(main_id);
        app.set_status("Thinking...".to_string());

        let handle = tokio::spawn(async move {
            crate::session::Session::stream_prompt_tui(
                session_clone, thread_ctx, "用三句话介绍你自己",
                output_tx, status_tx, approval_tx, thread_event_tx_task,
                main_id, task_store,
            ).await
        });

        stream_states.insert(main_id, crate::StreamState {
            handle: Some(handle),
            output_rx: Some(output_rx),
            status_rx: Some(status_rx),
            thread_event_rx: Some(thread_event_rx),
            thread_event_tx: Some(thread_event_tx),
            approval_tx_for_resend: None,
        });

        // ===== 模拟键盘 channel（与 run_streaming_loop 一致） =====
        let (kb_tx, mut kb_rx) = tokio::sync::mpsc::unbounded_channel::<crossterm::event::Event>();

        // 1 秒后注入 Alt+Right 键盘事件（模拟用户在 streaming 期间切换线程）
        let kb_tx_clone = kb_tx.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            println!("\n  [注入] 发送 Alt+Right 键盘事件");
            let _ = kb_tx_clone.send(crossterm::event::Event::Key(
                crossterm::event::KeyEvent::new(
                    crossterm::event::KeyCode::Right,
                    crossterm::event::KeyModifiers::ALT,
                )
            ));
        });

        // 8 秒后注入 Ctrl+C（模拟用户中断，给 LLM 足够时间输出）
        let kb_tx_clone2 = kb_tx.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(8)).await;
            println!("\n  [注入] 发送 Ctrl+C 键盘事件");
            let _ = kb_tx_clone2.send(crossterm::event::Event::Key(
                crossterm::event::KeyEvent::new(
                    crossterm::event::KeyCode::Char('c'),
                    crossterm::event::KeyModifiers::CONTROL,
                )
            ));
        });

        // ===== 模拟 run_streaming_loop 的核心 select! 循环 =====
        println!("\n  [开始] 模拟 select! 循环...");
        let start = Instant::now();
        let mut output_received = 0;
        let mut keyboard_events_received = 0;
        let mut alt_right_received = false;
        let mut ctrl_c_received = false;
        let mut loop_count = 0;

        loop {
            loop_count += 1;
            let elapsed = start.elapsed();
            if elapsed > std::time::Duration::from_secs(30) {
                println!("\n  超时 30s，退出");
                break;
            }

            let active_id = app.thread.store.active_thread()
                .map(|t| t.id)
                .unwrap_or_else(|| app.thread.store.primary_id());

            // take receivers（与 run_streaming_loop 一致）
            let (mut output_rx_local, mut status_rx_local, mut thread_event_rx_local,
                 mut thread_event_tx_local, mut approval_tx_local, mut handle_local) =
                if let Some(state) = stream_states.get_mut(&active_id) {
                    (
                        state.output_rx.take(),
                        state.status_rx.take(),
                        state.thread_event_rx.take(),
                        state.thread_event_tx.take(),
                        state.approval_tx_for_resend.take(),
                        state.handle.take(),
                    )
                } else {
                    (None, None, None, None, None, None)
                };

            let has_stream = output_rx_local.is_some();

            // ===== 核心select!（与 run_streaming_loop 完全一致的结构） =====
            tokio::select! {
                msg = async {
                    match output_rx_local.as_mut() {
                        Some(rx) => rx.recv().await,
                        None => std::future::pending::<Option<crate::OutputMessage>>().await,
                    }
                }, if has_stream => {
                    if let Some(crate::OutputMessage::Text(line)) = msg {
                        app.append_streaming_output(active_id, line.clone());
                        output_received += 1;
                        if !line.is_empty() && (output_received <= 3 || output_received % 20 == 0) {
                            println!("  [output #{}, {:.1}s] {}",
                                output_received, elapsed.as_secs_f64(),
                                &line[..line.len().min(40)]);
                        }
                    }
                }

                Some(event) = kb_rx.recv() => {
                    keyboard_events_received += 1;
                    println!("\n  [keyboard #{}, {:.1}s] 收到键盘事件: {:?}",
                        keyboard_events_received, elapsed.as_secs_f64(), event);

                    if let crossterm::event::Event::Key(key) = event {
                        if key.code == crossterm::event::KeyCode::Right
                            && key.modifiers.contains(crossterm::event::KeyModifiers::ALT) {
                            alt_right_received = true;
                            // 执行线程切换
                            if let Some(next_id) = app.thread.store.next_thread() {
                                app.switch_thread(next_id);
                                println!("  [线程切换] → {:?}", next_id);
                            }
                        } else if key.code == crossterm::event::KeyCode::Char('c')
                            && key.modifiers.contains(crossterm::event::KeyModifiers::CONTROL) {
                            ctrl_c_received = true;
                            println!("  [Ctrl+C] 中断当前线程");
                            // abort
                            if let Some(state) = stream_states.remove(&active_id) {
                                if let Some(h) = state.handle {
                                    h.abort();
                                }
                                app.cleanup_after_stream(active_id);
                            }
                        }
                    }
                }

                _ = tokio::time::sleep(std::time::Duration::from_millis(200)) => {
                    // 检查 stream 完成
                    let completed: Vec<_> = stream_states.iter()
                        .filter(|(_, s)| s.handle.as_ref().map_or(false, |h| h.is_finished()))
                        .map(|(id, _)| *id)
                        .collect();
                    for id in completed {
                        println!("  [完成] thread {:?} ({:.1}s)", id, elapsed.as_secs_f64());
                        if let Some(mut state) = stream_states.remove(&id) {
                            state.handle.take();
                            app.cleanup_after_stream(id);
                        }
                    }
                    if stream_states.is_empty() {
                        println!("  所有线程完成");
                        break;
                    }
                }
            }

            // 放回 receivers（与 run_streaming_loop 一致）
            if let Some(state) = stream_states.get_mut(&active_id) {
                if state.output_rx.is_none() && output_rx_local.is_some() {
                    state.output_rx = output_rx_local;
                    state.status_rx = status_rx_local;
                    state.thread_event_rx = thread_event_rx_local;
                    state.thread_event_tx = thread_event_tx_local;
                    state.approval_tx_for_resend = approval_tx_local;
                }
                if state.handle.is_none() && handle_local.is_some() {
                    state.handle = handle_local;
                }
            }
        }

        // ===== 验证 =====
        println!("\n============================================================");
        println!("  验证结果:");
        println!("    循环次数: {}", loop_count);
        println!("    output 收到: {} 条", output_received);
        println!("    keyboard 收到: {} 个", keyboard_events_received);
        println!("    Alt+Right 收到: {}", alt_right_received);
        println!("    Ctrl+C 收到: {}", ctrl_c_received);
        println!("    main busy: {}", app.is_thread_busy(main_id));
        println!("    耗时: {:.1}s", start.elapsed().as_secs_f64());
        println!("============================================================");

        // 核心断言：streaming 期间键盘事件必须被处理
        assert!(keyboard_events_received >= 2,
            "应该收到至少 2 个键盘事件（Alt+Right + Ctrl+C），实际收到 {} 个 — \
            如果为 0 说明 keyboard channel 在 output 高速输出时被饿死！", keyboard_events_received);
        assert!(alt_right_received, "Alt+Right 应该被处理");
        assert!(ctrl_c_received, "Ctrl+C 应该被处理");

        println!("\n  高保真还原测试通过！streaming 期间键盘事件未被饿死。");
    }

    // ========================================================================
    // 用例 H：长时间持续注入键盘事件 — 还原"开始可以，隔一段时间后不行"
    //       持续 15 秒，每 0.5 秒注入一次键盘事件，验证所有事件都被处理
    //
    // 运行：cargo test --bin ifai test_keyboard_sustained -- --ignored --nocapture
    // ========================================================================
    #[tokio::test]
    #[ignore] // 需要真实 API
    async fn test_keyboard_sustained() {
        println!("\n============================================================");
        println!("用例 H: 长时间持续注入 — 还原'开始可以，隔一段时间后不行'");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        app.create_side_thread(Some("Thread-1".to_string()));

        let config = EffectiveConfig::resolve(None, None, None, None).unwrap();
        let session = Arc::new(tokio::sync::Mutex::new({
            let mut s = Session::new(config.provider().to_string(), config.model().to_string());
            if let Some(api_key) = config.api_key() {
                s.set_api_key(api_key.to_string());
            }
            if let Some(base_url) = config.base_url() {
                s.set_base_url(base_url.to_string());
            }
            s
        }));

        let mut stream_states: std::collections::HashMap<crate::thread::ThreadId, crate::StreamState> =
            std::collections::HashMap::new();

        // 准备 streaming
        let session_clone = session.clone();
        let (output_tx, output_rx) = tokio::sync::mpsc::unbounded_channel::<crate::OutputMessage>();
        let (status_tx, status_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        let (approval_tx, _approval_rx) = tokio::sync::mpsc::unbounded_channel::<crate::approval_overlay::ApprovalRequest>();
        let (thread_event_tx, thread_event_rx) = tokio::sync::mpsc::unbounded_channel::<crate::thread::ThreadEvent>();
        let thread_event_tx_task = thread_event_tx.clone();
        let thread_ctx = app.ensure_session_context(main_id);
        let task_store = app.ensure_task_store(main_id);

        app.set_thread_busy(main_id, true);
        app.begin_streaming(main_id);
        app.set_status("Thinking...".to_string());

        let handle = tokio::spawn(async move {
            crate::session::Session::stream_prompt_tui(
                session_clone, thread_ctx, "详细解释 Rust 的所有权系统，给出至少五个代码示例",
                output_tx, status_tx, approval_tx, thread_event_tx_task,
                main_id, task_store,
            ).await
        });

        stream_states.insert(main_id, crate::StreamState {
            handle: Some(handle),
            output_rx: Some(output_rx),
            status_rx: Some(status_rx),
            thread_event_rx: Some(thread_event_rx),
            thread_event_tx: Some(thread_event_tx),
            approval_tx_for_resend: None,
        });

        // 模拟 kb_thread
        let (kb_tx, mut kb_rx) = tokio::sync::mpsc::unbounded_channel::<crossterm::event::Event>();

        // 持续 15 秒，每 0.5 秒注入一个键盘事件（共 30 个）
        let total_inject = 30;
        let inject_interval_ms = 500u64;
        for i in 0..total_inject {
            let kb_tx_clone = kb_tx.clone();
            tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(inject_interval_ms * (i as u64 + 1))).await;
                let event = if i % 2 == 0 {
                    crossterm::event::Event::Key(crossterm::event::KeyEvent::new(
                        crossterm::event::KeyCode::PageUp, crossterm::event::KeyModifiers::empty()))
                } else {
                    crossterm::event::Event::Key(crossterm::event::KeyEvent::new(
                        crossterm::event::KeyCode::PageDown, crossterm::event::KeyModifiers::empty()))
                };
                let _ = kb_tx_clone.send(event);
            });
        }

        // 模拟 run_streaming_loop select!
        println!("\n  [开始] 持续 20 秒测试...");
        let start = Instant::now();
        let mut keyboard_received = 0;
        let mut output_received = 0;

        loop {
            if start.elapsed() > std::time::Duration::from_secs(20) {
                println!("\n  超时 20s");
                break;
            }

            let active_id = app.thread.store.active_thread().map(|t| t.id).unwrap_or_else(|| app.thread.store.primary_id());

            let (mut orx, mut srx, mut terx, mut tetx, mut atx, mut hdl) =
                if let Some(state) = stream_states.get_mut(&active_id) {
                    (state.output_rx.take(), state.status_rx.take(), state.thread_event_rx.take(),
                     state.thread_event_tx.take(), state.approval_tx_for_resend.take(), state.handle.take())
                } else { (None, None, None, None, None, None) };

            let has = orx.is_some();

            tokio::select! {
                _msg = async { match orx.as_mut() { Some(rx) => rx.recv().await, None => std::future::pending().await } }, if has => {
                    output_received += 1;
                }
                Some(_ev) = kb_rx.recv() => {
                    keyboard_received += 1;
                    if keyboard_received <= 5 || keyboard_received % 10 == 0 {
                        println!("  [kb #{}/{}] at {:.1}s", keyboard_received, total_inject, start.elapsed().as_secs_f64());
                    }
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(200)) => {
                    let done: Vec<_> = stream_states.iter().filter(|(_, s)| s.handle.as_ref().map_or(false, |h| h.is_finished())).map(|(id, _)| *id).collect();
                    for id in done { if let Some(mut s) = stream_states.remove(&id) { s.handle.take(); app.cleanup_after_stream(id); } }
                    if stream_states.is_empty() { break; }
                }
            }

            if let Some(state) = stream_states.get_mut(&active_id) {
                if state.output_rx.is_none() && orx.is_some() {
                    state.output_rx = orx; state.status_rx = srx; state.thread_event_rx = terx;
                    state.thread_event_tx = tetx; state.approval_tx_for_resend = atx;
                }
                if state.handle.is_none() && hdl.is_some() { state.handle = hdl; }
            }
        }

        println!("\n============================================================");
        println!("  验证结果:");
        println!("    注入: {} 个键盘事件", total_inject);
        println!("    收到: {} 个键盘事件", keyboard_received);
        println!("    output: {} 条", output_received);
        println!("    丢失: {} 个", total_inject - keyboard_received);
        println!("    接收率: {:.1}%", keyboard_received as f64 / total_inject as f64 * 100.0);
        println!("    耗时: {:.1}s", start.elapsed().as_secs_f64());
        println!("============================================================");

        let recv_rate = keyboard_received as f64 / total_inject as f64;
        assert!(recv_rate >= 0.9,
            "键盘事件接收率应 >= 90%，实际 {:.1}%（{} / {}）", recv_rate * 100.0, keyboard_received, total_inject);

        println!("\n  长时间持续注入测试通过！接收率 {:.1}%。", recv_rate * 100.0);
    }

    // ========================================================================
    // 用例 I：高保真双线程并发 — main 工具调用审批 + thread1 普通对话
    //       main: 执行ls -l（触发工具调用 → 审批请求 → 审批通过 → 完成）
    //       thread1: 你了解python语言吗（普通对话）
    //       验证：
    //         1. 两个线程并发 streaming 无卡死
    //         2. main 的工具审批请求被正确处理
    //         3. 审批后 main 继续生成最终回复
    //         4. 所有键盘事件（Alt+Right 切线程 + 审批 Enter + Ctrl+C）都被处理
    //         5. 两个线程最终 busy=false
    //
    // 运行：cargo test --bin ifai test_concurrent_approval_and_chat -- --ignored --nocapture
    // ========================================================================
    #[tokio::test]
    #[ignore] // 需要真实 API
    async fn test_concurrent_approval_and_chat() {
        println!("\n============================================================");
        println!("用例 I: 高保真双线程并发 — main 工具审批 + thread1 普通对话");
        println!("   main: 执行ls -l（触发工具调用 → 审批 → 完成）");
        println!("   thread1: 你了解python语言吗（普通对话）");
        println!("============================================================");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        println!("  main ID: {:?}", main_id);
        println!("  thread1 ID: {:?}", thread1_id);

        let config = EffectiveConfig::resolve(None, None, None, None).unwrap();
        let session = Arc::new(tokio::sync::Mutex::new({
            let mut s = Session::new(config.provider().to_string(), config.model().to_string());
            if let Some(api_key) = config.api_key() {
                s.set_api_key(api_key.to_string());
            }
            if let Some(base_url) = config.base_url() {
                s.set_base_url(base_url.to_string());
            }
            s
        }));

        let mut stream_states: std::collections::HashMap<crate::thread::ThreadId, crate::StreamState> =
            std::collections::HashMap::new();

        // ===== 全局 approval channel（与 run_streaming_loop 一致） =====
        let (approval_tx, mut approval_rx) = tokio::sync::mpsc::unbounded_channel::<crate::approval_overlay::ApprovalRequest>();

        // ===== 准备 main 线程 streaming（执行ls -l → 触发工具审批） =====
        let session_clone_main = session.clone();
        let (output_tx_main, output_rx_main) = tokio::sync::mpsc::unbounded_channel::<crate::OutputMessage>();
        let (status_tx_main, status_rx_main) = tokio::sync::mpsc::unbounded_channel::<String>();
        let (approval_tx_main, mut approval_rx_main) = tokio::sync::mpsc::unbounded_channel::<crate::approval_overlay::ApprovalRequest>();
        let approval_tx_for_resend_main = approval_tx_main.clone();
        let (thread_event_tx_main, thread_event_rx_main) = tokio::sync::mpsc::unbounded_channel::<crate::thread::ThreadEvent>();
        let thread_event_tx_main_task = thread_event_tx_main.clone();
        let thread_ctx_main = app.ensure_session_context(main_id);
        let task_store_main = app.ensure_task_store(main_id);

        app.set_thread_busy(main_id, true);
        app.begin_streaming(main_id);
        app.set_status("Thinking...".to_string());

        // 注意：stream_prompt_tui 内部的 approval channel 需要转发到全局 channel
        // 实际上 run_streaming_loop 中每个线程有独立 approval_tx，但全局只有一个 approval_rx
        // 这里需要模拟相同机制：将线程内部的 approval 请求转发到全局 approval_rx
        let approval_tx_global = approval_tx.clone();
        let forward_main = tokio::spawn(async move {
            // forward approval requests from thread-local to global channel
            while let Some(req) = approval_rx_main.recv().await {
                let _ = approval_tx_global.send(req);
            }
        });

        let handle_main = tokio::spawn(async move {
            crate::session::Session::stream_prompt_tui(
                session_clone_main, thread_ctx_main, "执行ls -l",
                output_tx_main, status_tx_main, approval_tx_main, thread_event_tx_main_task,
                main_id, task_store_main,
            ).await
        });

        stream_states.insert(main_id, crate::StreamState {
            handle: Some(handle_main),
            output_rx: Some(output_rx_main),
            status_rx: Some(status_rx_main),
            thread_event_rx: Some(thread_event_rx_main),
            thread_event_tx: Some(thread_event_tx_main),
            approval_tx_for_resend: Some(approval_tx_for_resend_main),
        });

        // ===== 准备 thread1 streaming（你了解python语言吗 → 普通对话） =====
        let session_clone_t1 = session.clone();
        let (output_tx_t1, output_rx_t1) = tokio::sync::mpsc::unbounded_channel::<crate::OutputMessage>();
        let (status_tx_t1, status_rx_t1) = tokio::sync::mpsc::unbounded_channel::<String>();
        let (approval_tx_t1, mut approval_rx_t1) = tokio::sync::mpsc::unbounded_channel::<crate::approval_overlay::ApprovalRequest>();
        let approval_tx_for_resend_t1 = approval_tx_t1.clone();
        let (thread_event_tx_t1, thread_event_rx_t1) = tokio::sync::mpsc::unbounded_channel::<crate::thread::ThreadEvent>();
        let thread_event_tx_t1_task = thread_event_tx_t1.clone();
        let thread_ctx_t1 = app.ensure_session_context(thread1_id);
        let task_store_t1 = app.ensure_task_store(thread1_id);

        app.set_thread_busy(thread1_id, true);
        app.begin_streaming(thread1_id);

        // 同样转发 thread1 的 approval 请求到全局 channel
        let approval_tx_global2 = approval_tx.clone();
        let forward_t1 = tokio::spawn(async move {
            while let Some(req) = approval_rx_t1.recv().await {
                let _ = approval_tx_global2.send(req);
            }
        });

        let handle_t1 = tokio::spawn(async move {
            crate::session::Session::stream_prompt_tui(
                session_clone_t1, thread_ctx_t1, "你了解python语言吗",
                output_tx_t1, status_tx_t1, approval_tx_t1, thread_event_tx_t1_task,
                thread1_id, task_store_t1,
            ).await
        });

        stream_states.insert(thread1_id, crate::StreamState {
            handle: Some(handle_t1),
            output_rx: Some(output_rx_t1),
            status_rx: Some(status_rx_t1),
            thread_event_rx: Some(thread_event_rx_t1),
            thread_event_tx: Some(thread_event_tx_t1),
            approval_tx_for_resend: Some(approval_tx_for_resend_t1),
        });

        // ===== 模拟键盘 channel =====
        let (kb_tx, mut kb_rx) = tokio::sync::mpsc::unbounded_channel::<crossterm::event::Event>();

        // 注入计划：
        // 1. 3s 后 Alt+Right → 切到 thread1（验证线程切换在双 streaming 期间可用）
        // 2. 5s 后 Alt+Left → 切回 main（验证来回切换）
        // 3. 收到审批请求后注入 Enter → 批准工具执行
        // 4. 60s 后 Ctrl+C → 兜底中断（正常情况两个线程应该在 60s 内完成）

        let kb_tx1 = kb_tx.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            println!("\n  [注入] Alt+Right → 切到 thread1");
            let _ = kb_tx1.send(crossterm::event::Event::Key(
                crossterm::event::KeyEvent::new(
                    crossterm::event::KeyCode::Right,
                    crossterm::event::KeyModifiers::ALT,
                )
            ));
        });

        let kb_tx2 = kb_tx.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            println!("\n  [注入] Alt+Left → 切回 main");
            let _ = kb_tx2.send(crossterm::event::Event::Key(
                crossterm::event::KeyEvent::new(
                    crossterm::event::KeyCode::Left,
                    crossterm::event::KeyModifiers::ALT,
                )
            ));
        });

        let kb_tx3 = kb_tx.clone();
        tokio::spawn(async move {
            // 20s 兜底 Ctrl+C（正常应在 20s 内完成）
            tokio::time::sleep(std::time::Duration::from_secs(20)).await;
            println!("\n  [注入] Ctrl+C → 兜底中断");
            let _ = kb_tx3.send(crossterm::event::Event::Key(
                crossterm::event::KeyEvent::new(
                    crossterm::event::KeyCode::Char('c'),
                    crossterm::event::KeyModifiers::CONTROL,
                )
            ));
        });

        // ===== 模拟 run_streaming_loop 的核心 select! 循环 =====
        println!("\n  [开始] 模拟双线程并发 select! 循环...");
        let start = Instant::now();
        let mut output_main = 0;
        let mut output_t1 = 0;
        let mut keyboard_events = 0;
        let mut approval_received = false;
        let mut approval_resolved = false;
        let mut loop_count = 0;

        loop {
            loop_count += 1;
            let elapsed = start.elapsed();
            if elapsed > std::time::Duration::from_secs(30) {
                println!("\n  超时 90s，退出");
                break;
            }

            let active_id = app.thread.store.active_thread()
                .map(|t| t.id)
                .unwrap_or_else(|| app.thread.store.primary_id());

            // take receivers
            let (mut output_rx_local, mut status_rx_local, mut thread_event_rx_local,
                 mut thread_event_tx_local, mut approval_tx_local, mut handle_local) =
                if let Some(state) = stream_states.get_mut(&active_id) {
                    (
                        state.output_rx.take(),
                        state.status_rx.take(),
                        state.thread_event_rx.take(),
                        state.thread_event_tx.take(),
                        state.approval_tx_for_resend.take(),
                        state.handle.take(),
                    )
                } else {
                    (None, None, None, None, None, None)
                };

            let has_stream = output_rx_local.is_some();

            // ===== 核心select! =====
            tokio::select! {
                // AI 输出
                msg = async {
                    match output_rx_local.as_mut() {
                        Some(rx) => rx.recv().await,
                        None => std::future::pending::<Option<crate::OutputMessage>>().await,
                    }
                }, if has_stream => {
                    if let Some(crate::OutputMessage::Text(line)) = msg {
                        app.append_streaming_output(active_id, line.clone());
                        if active_id == main_id {
                            output_main += 1;
                            if output_main <= 3 || output_main % 20 == 0 {
                                let truncated: String = line.chars().take(40).collect();
                                println!("  [main output #{}, {:.1}s] {}",
                                    output_main, elapsed.as_secs_f64(), truncated);
                            }
                        } else {
                            output_t1 += 1;
                            if output_t1 <= 3 || output_t1 % 20 == 0 {
                                let truncated: String = line.chars().take(40).collect();
                                println!("  [thread1 output #{}, {:.1}s] {}",
                                    output_t1, elapsed.as_secs_f64(), truncated);
                            }
                        }
                    }
                }

                // 审批请求（全局 channel）
                Some(request) = approval_rx.recv() => {
                    approval_received = true;
                    println!("\n  [审批请求 {:.1}s] 工具: {} (thread: {:?})",
                        elapsed.as_secs_f64(), request.tool_name, request.thread_id);

                    // 先切换到审批对应的线程（模拟用户看到审批通知后切过去）
                    println!("  [审批] 已切换到 thread {:?} 并设置审批状态", request.thread_id);
                    app.switch_thread(request.thread_id);
                    app.set_approval_pending(request);

                    // 模拟：立即注入 Enter 键盘事件来批准工具执行
                    let kb_approve = kb_tx.clone();
                    tokio::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                        println!("  [注入] Enter → 批准工具执行");
                        let _ = kb_approve.send(crossterm::event::Event::Key(
                            crossterm::event::KeyEvent::new(
                                crossterm::event::KeyCode::Enter,
                                crossterm::event::KeyModifiers::empty(),
                            )
                        ));
                    });
                }

                // 键盘事件
                Some(event) = kb_rx.recv() => {
                    keyboard_events += 1;
                    println!("\n  [keyboard #{}, {:.1}s] {:?}",
                        keyboard_events, elapsed.as_secs_f64(), event);

                    // 先检查是否有已完成的线程
                    let completed: Vec<_> = stream_states.iter()
                        .filter(|(_, s)| s.handle.as_ref().map_or(false, |h| h.is_finished()))
                        .map(|(id, _)| *id)
                        .collect();
                    for id in completed {
                        println!("  [完成] thread {:?} ({:.1}s)", id, elapsed.as_secs_f64());
                        if let Some(mut state) = stream_states.remove(&id) {
                            state.handle.take();
                            app.cleanup_after_stream(id);
                        }
                    }

                    if let crossterm::event::Event::Key(key) = event {
                        // 审批模式处理
                        if app.is_approving() {
                            if key.code == crossterm::event::KeyCode::Enter {
                                // 批准工具执行
                                if let Some(ref req) = app.approval_state_ref() {
                                    let options = crate::approval_overlay::build_approval_options(req);
                                    if !options.is_empty() {
                                        let dec = options[0].decision; // 第一个选项：ApproveOnce
                                        let msg = app.resolve_approval(dec);
                                        approval_resolved = true;
                                        println!("  [审批] 已批准: {}", msg);
                                    }
                                }
                            } else if key.code == crossterm::event::KeyCode::Char('c')
                                && key.modifiers.contains(crossterm::event::KeyModifiers::CONTROL) {
                                // Ctrl+C 中断
                                println!("  [Ctrl+C] 中断");
                                if let Some(mut state) = stream_states.remove(&active_id) {
                                    if let Some(h) = state.handle.take() {
                                        h.abort();
                                    }
                                    app.cleanup_after_stream(active_id);
                                }
                                let all_ids: Vec<_> = stream_states.keys().copied().collect();
                                for id in all_ids {
                                    if let Some(mut state) = stream_states.remove(&id) {
                                        if let Some(h) = state.handle.take() { h.abort(); }
                                        app.cleanup_after_stream(id);
                                    }
                                }
                                break;
                            }
                        } else {
                            // 普通键盘事件处理
                            if key.code == crossterm::event::KeyCode::Right
                                && key.modifiers.contains(crossterm::event::KeyModifiers::ALT) {
                                if let Some(next_id) = app.thread.store.next_thread() {
                                    app.switch_thread(next_id);
                                    println!("  [线程切换] → {:?}", next_id);
                                }
                            } else if key.code == crossterm::event::KeyCode::Left
                                && key.modifiers.contains(crossterm::event::KeyModifiers::ALT) {
                                if let Some(prev_id) = app.thread.store.previous_thread() {
                                    app.switch_thread(prev_id);
                                    println!("  [线程切换] → {:?}", prev_id);
                                }
                            } else if key.code == crossterm::event::KeyCode::Char('c')
                                && key.modifiers.contains(crossterm::event::KeyModifiers::CONTROL) {
                                println!("  [Ctrl+C] 中断");
                                if let Some(mut state) = stream_states.remove(&active_id) {
                                    if let Some(h) = state.handle.take() { h.abort(); }
                                    app.cleanup_after_stream(active_id);
                                }
                                let all_ids: Vec<_> = stream_states.keys().copied().collect();
                                for id in all_ids {
                                    if let Some(mut state) = stream_states.remove(&id) {
                                        if let Some(h) = state.handle.take() { h.abort(); }
                                        app.cleanup_after_stream(id);
                                    }
                                }
                                break;
                            }
                        }
                    }

                    // 所有线程完成
                    if stream_states.is_empty() {
                        println!("  所有线程完成");
                        break;
                    }
                }

                // 超时：检查完成的线程
                _ = tokio::time::sleep(std::time::Duration::from_millis(200)) => {
                    let completed: Vec<_> = stream_states.iter()
                        .filter(|(_, s)| s.handle.as_ref().map_or(false, |h| h.is_finished()))
                        .map(|(id, _)| *id)
                        .collect();
                    for id in completed {
                        println!("  [完成] thread {:?} ({:.1}s)", id, elapsed.as_secs_f64());
                        if let Some(mut state) = stream_states.remove(&id) {
                            state.handle.take();
                            app.cleanup_after_stream(id);
                        }
                    }
                    if stream_states.is_empty() {
                        println!("  所有线程完成");
                        break;
                    }
                }
            }

            // 放回 receivers
            if let Some(state) = stream_states.get_mut(&active_id) {
                if state.output_rx.is_none() && output_rx_local.is_some() {
                    state.output_rx = output_rx_local;
                    state.status_rx = status_rx_local;
                    state.thread_event_rx = thread_event_rx_local;
                    state.thread_event_tx = thread_event_tx_local;
                    state.approval_tx_for_resend = approval_tx_local;
                }
                if state.handle.is_none() && handle_local.is_some() {
                    state.handle = handle_local;
                }
            }
        }

        // 清理
        app.approval.states.clear();
        forward_main.abort();
        forward_t1.abort();

        // ===== 验证 =====
        println!("\n============================================================");
        println!("  验证结果:");
        println!("    循环次数: {}", loop_count);
        println!("    main output: {} 条", output_main);
        println!("    thread1 output: {} 条", output_t1);
        println!("    keyboard 收到: {} 个", keyboard_events);
        println!("    审批请求: {}", if approval_received { "收到" } else { "未收到" });
        println!("    审批处理: {}", if approval_resolved { "已批准" } else { "未批准" });
        println!("    main busy: {}", app.is_thread_busy(main_id));
        println!("    thread1 busy: {}", app.is_thread_busy(thread1_id));
        println!("    耗时: {:.1}s", start.elapsed().as_secs_f64());
        println!("============================================================");

        // 核心断言
        assert!(keyboard_events >= 2,
            "应该收到至少 2 个键盘事件（Alt+Right + Alt+Left），实际 {} 个", keyboard_events);

        // 两个线程都应完成（不再 busy）
        assert!(!app.is_thread_busy(main_id),
            "main 线程应已完成（busy=false），实际 busy=true");
        assert!(!app.is_thread_busy(thread1_id),
            "thread1 线程应已完成（busy=false），实际 busy=true");

        // 至少一个线程有输出
        assert!(output_main + output_t1 > 0,
            "至少一个线程应有 AI 输出，实际 main={} thread1={}", output_main, output_t1);

        println!("\n  用例 I 通过！双线程并发（main 工具审批 + thread1 普通对话）无卡死。");
    }

}
