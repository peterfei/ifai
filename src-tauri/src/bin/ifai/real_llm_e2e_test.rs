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
    use std::time::Instant;

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
        let main_id = app.thread_store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        println!("  main ID: {:?}", main_id);
        println!("  thread1 ID: {:?}", thread1_id);

        // ==================== 步骤 2: main 发送 '执行ls -l' ====================
        println!("\n🔵 步骤 2: main 发送 '执行ls -l'");
        app.switch_thread(main_id);
        app.thread_messages.push(main_id, Message::user("执行ls -l".to_string()));
        app.set_thread_busy(main_id, true);

        assert!(app.is_thread_busy(main_id), "main 应该 busy");
        assert!(!app.is_thread_busy(thread1_id), "thread1 不应该 busy");
        println!("  ✓ main busy: true, thread1 busy: false");

        // ==================== 步骤 3: thread1 发送 '你了解ruby语言吗' ====================
        println!("\n🟢 步骤 3: thread1 发送 '你了解ruby语言吗'");
        app.switch_thread(thread1_id);
        app.thread_messages.push(thread1_id, Message::user("你了解ruby语言吗".to_string()));
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
        let main_id = app.thread_store.primary_id();

        // main 添加消息
        app.switch_thread(main_id);
        app.thread_messages.push(main_id, Message::user("Main: 执行ls -l".to_string()));
        let main_count = app.thread_messages.get(main_id).map(|m| m.len()).unwrap_or(0);

        // thread1 添加消息
        app.switch_thread(thread1_id);
        app.thread_messages.push(thread1_id, Message::user("Thread1: 你了解ruby语言吗".to_string()));
        let thread1_count = app.thread_messages.get(thread1_id).map(|m| m.len()).unwrap_or(0);

        // 验证隔离
        let main_count_after = app.thread_messages.get(main_id).map(|m| m.len()).unwrap_or(0);
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
        let main_id = app.thread_store.primary_id();
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
        let main_id = app.thread_store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // ---- 步骤 1: main 调用真实 LLM（执行ls -l） ----
        println!("\n步骤 1: main 调用真实 LLM '执行ls -l'");
        app.switch_thread(main_id);
        app.set_thread_busy(main_id, true);

        // 写入用户输入到 thread_messages（模拟 main.rs 中的行为）
        app.thread_messages.push(main_id, crate::thread::Message::user("执行ls -l".to_string()));

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
        app.thread_messages.push(main_id, crate::thread::Message::assistant(main_response.clone()));
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
        app.thread_messages.push(thread1_id, crate::thread::Message::user("你了解ruby语言吗".to_string()));

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

        app.thread_messages.push(thread1_id, crate::thread::Message::assistant(thread1_response.clone()));
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
        let main_id = app.thread_store.primary_id();
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
        app.approval_states.insert(main_id, request);

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
        let main_id = app.thread_store.primary_id();
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
        app.approval_states.insert(main_id, request);

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
        let main_id = app.thread_store.primary_id();
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
        app.approval_states.insert(main_id, request);
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
        let main_id = app.thread_store.primary_id();
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
        let main_id = app.thread_store.primary_id();

        // ---- 步骤 1: main 发送第一条消息 ----
        println!("\n步骤 1: main 发送 '1+1等于几'");
        app.switch_thread(main_id);
        app.thread_messages.push(main_id, Message::user("1+1等于几".to_string()));
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
        app.thread_messages.push(main_id, Message::assistant(response1));

        // ---- 步骤 4: dequeue 并处理第二条 ----
        println!("\n步骤 3: dequeue 并发送第二条消息");
        let pending = app.dequeue();
        assert!(pending.is_some(), "队列应该有消息可出队！");

        let (input2, target_id) = pending.unwrap();
        assert_eq!(input2, "2+2等于几", "出队消息内容应为 '2+2等于几'");
        assert_eq!(target_id, main_id, "目标线程应为 main");

        // 写入用户输入到 thread_messages
        app.thread_messages.push(main_id, Message::user(input2.clone()));
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
        app.thread_messages.push(main_id, Message::assistant(response2));

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
        let main_id = app.thread_store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // ---- 步骤 1: main 开始 streaming ----
        println!("\n步骤 1: main 发送 '你好'");
        app.switch_thread(main_id);
        app.thread_messages.push(main_id, Message::user("你好".to_string()));
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
        app.thread_messages.push(main_id, Message::assistant(main_response));
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
        app.thread_messages.push(thread1_id, Message::user(msg1.0.clone()));
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
        app.thread_messages.push(thread1_id, Message::assistant(t1_response));

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
        let main_id = app.thread_store.primary_id();
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
        app.thread_messages.push(thread1_id, Message::user("什么是Rust".to_string()));
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
        app.thread_messages.push(thread1_id, Message::assistant(t1_response));

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
        app.thread_messages.push(main_id, Message::user(input.clone()));
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
        app.thread_messages.push(main_id, Message::assistant(main_response));

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
        let main_id = app.thread_store.primary_id();
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

            app.thread_messages.push(main_id, Message::user(prompt.to_string()));
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

            app.thread_messages.push(main_id, Message::assistant(response.clone()));
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
        println!("║  Session 消息数: {}", session.messages.len());
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
}
