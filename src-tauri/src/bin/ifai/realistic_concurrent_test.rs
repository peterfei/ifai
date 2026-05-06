//! 高保真 E2E 测试：模拟 run_streaming_loop 的关键行为
//!
//! 测试目标：
//! 1. (场景 J) 验证活跃线程 stream 完成后，键盘事件是否被 select! 饥饿
//! 2. (场景 K) 验证 streaming 循环退出后，kb_thread.join() 是否死锁
//!
//! 运行：cargo test --bin ifai realistic_concurrent_test -- --nocapture

#[cfg(test)]
mod tests {
    use crate::tui::App;
    use crate::OutputMessage;
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant};
    use tokio::sync::mpsc;

    // ====================================================================
    // 场景 J：活跃线程 channel 关闭后 select! 键盘饥饿
    // ====================================================================
    #[tokio::test]
    async fn test_active_thread_channel_close_starves_keyboard() {
        println!("\n============================================================");
        println!("场景 J: 活跃线程 channel 关闭后键盘饥饿");
        println!("============================================================\n");

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // 模拟 main 的 streaming（后台线程，channel 关闭）
        let (_main_output_tx_dropped, main_output_rx) = mpsc::unbounded_channel::<OutputMessage>();
        drop(_main_output_tx_dropped);
        let main_handle = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(3)).await;
            Ok::<String, String>("main done".to_string())
        });

        // 模拟 thread1 的 streaming（活跃线程，channel 立即关闭）
        let (_t1_output_tx, t1_output_rx) = mpsc::unbounded_channel::<OutputMessage>();
        drop(_t1_output_tx);
        let (_t1_status_tx, t1_status_rx) = mpsc::unbounded_channel::<String>();
        drop(_t1_status_tx);

        let mut stream_states: HashMap<crate::thread::ThreadId, crate::StreamState> = HashMap::new();
        stream_states.insert(main_id, crate::StreamState {
            handle: Some(main_handle),
            output_rx: Some(main_output_rx),
            status_rx: None, thread_event_rx: None, thread_event_tx: None, approval_tx_for_resend: None,
        });
        stream_states.insert(thread1_id, crate::StreamState {
            handle: None,
            output_rx: Some(t1_output_rx),
            status_rx: Some(t1_status_rx),
            thread_event_rx: None, thread_event_tx: None, approval_tx_for_resend: None,
        });

        app.switch_thread(thread1_id);
        app.set_thread_busy(thread1_id, true);

        let (kb_tx, mut kb_rx) = mpsc::unbounded_channel::<crossterm::event::Event>();
        let kb_inject = kb_tx.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            let _ = kb_inject.send(crossterm::event::Event::Key(
                crossterm::event::KeyEvent::new(
                    crossterm::event::KeyCode::Char('c'),
                    crossterm::event::KeyModifiers::CONTROL,
                )
            ));
        });

        // 模拟 run_streaming_loop 的 select! 循环
        let start = Instant::now();
        let mut loop_count = 0u64;
        let mut keyboard_received = 0u64;
        let max_loops = 1_000_000;
        let timeout = Duration::from_secs(2);

        loop {
            loop_count += 1;
            if loop_count > max_loops || start.elapsed() > timeout { break; }

            let active_id = app.thread.store.active_thread().map(|t| t.id)
                .unwrap_or_else(|| app.thread.store.primary_id());

            let (mut output_rx, mut status_rx, _, _, _, _) =
                if let Some(state) = stream_states.get_mut(&active_id) {
                    (state.output_rx.take(), state.status_rx.take(),
                     state.thread_event_rx.take(), state.thread_event_tx.take(),
                     state.approval_tx_for_resend.take(), state.handle.take())
                } else { (None, None, None, None, None, None) };

            let has_active_stream = output_rx.is_some();

            let control = tokio::select! {
                msg = async {
                    match output_rx.as_mut() {
                        Some(rx) => rx.recv().await,
                        None => std::future::pending::<Option<OutputMessage>>().await,
                    }
                }, if has_active_stream => {
                    if let Some(_) = msg {
                        crate::StreamingControl::Continue
                    } else {
                        if let Some(mut state) = stream_states.remove(&active_id) {
                            state.handle.take();
                            app.cleanup_after_stream(active_id);
                        }
                        if stream_states.is_empty() { crate::StreamingControl::StreamFinished }
                        else { crate::StreamingControl::Continue }
                    }
                }
                status = async {
                    match status_rx.as_mut() {
                        Some(rx) => rx.recv().await,
                        None => std::future::pending::<Option<String>>().await,
                    }
                }, if has_active_stream => {
                    if let Some(_) = status { crate::StreamingControl::Continue }
                    else {
                        if stream_states.contains_key(&active_id) {
                            if let Some(mut state) = stream_states.remove(&active_id) {
                                state.handle.take(); app.cleanup_after_stream(active_id);
                            }
                        }
                        if stream_states.is_empty() { crate::StreamingControl::StreamFinished }
                        else { crate::StreamingControl::Continue }
                    }
                }
                Some(event) = kb_rx.recv() => {
                    keyboard_received += 1;
                    if stream_states.is_empty() { crate::StreamingControl::StreamFinished }
                    else {
                        if let crossterm::event::Event::Key(key) = event {
                            if key.code == crossterm::event::KeyCode::Char('c')
                                && key.modifiers.contains(crossterm::event::KeyModifiers::CONTROL) {
                                crate::StreamingControl::Interrupted
                            } else { crate::StreamingControl::Continue }
                        } else { crate::StreamingControl::Continue }
                    }
                }
            };

            match control {
                crate::StreamingControl::Continue => {}
                crate::StreamingControl::StreamFinished |
                crate::StreamingControl::Interrupted |
                crate::StreamingControl::Exit => { break; }
                _ => {}
            }
        }

        println!("  循环次数: {}, 键盘收到: {}, 耗时: {:.1}ms",
            loop_count, keyboard_received, start.elapsed().as_millis());

        assert!(keyboard_received >= 1, "键盘事件应被收到");
        assert!(loop_count < 1000, "循环次数应正常（< 1000），实际 {}", loop_count);
    }

    // ====================================================================
    // 场景 K：streaming 循环退出后 kb_thread.join() 死锁
    //
    // 精确复刻 main.rs L1379-1382 的清理逻辑：
    //     drop(kb_tx);
    //     drop(kb_rx);  // 修复后添加
    //     kb_thread.join();
    //
    // BUG：如果只 drop(kb_tx) 不 drop(kb_rx)，
    // 线程内的 clone sender 仍能 send 成功（因为 kb_rx 还活着），
    // join() 永远阻塞 → 整个程序卡死 → 键盘事件全部无法使用。
    //
    // 运行：cargo test --bin ifai test_kb_thread_join_deadlock -- --nocapture
    // ====================================================================
    #[tokio::test]
    async fn test_kb_thread_join_deadlock() {
        println!("\n============================================================");
        println!("场景 K: streaming 退出后 kb_thread.join() 死锁");
        println!("============================================================\n");

        let (kb_tx, mut kb_rx) = mpsc::unbounded_channel::<String>();

        // 模拟 main.rs L1141-1162 的键盘线程
        // 线程 clone 了 kb_tx，只有 send() 失败时才退出
        let thread_alive = Arc::new(AtomicBool::new(true));
        let thread_alive_clone = thread_alive.clone();
        let kb_tx_for_thread = kb_tx.clone(); // clone 给线程（与 main.rs L1142 一致）
        let kb_thread = std::thread::spawn(move || {
            loop {
                // 模拟 crossterm::event::poll(50ms)
                std::thread::sleep(Duration::from_millis(50));
                // 尝试 send（模拟 kb_tx.send(event)）
                if kb_tx_for_thread.send("event".to_string()).is_err() {
                    break; // receiver 已关闭 → 退出（main.rs L1148-1149）
                }
            }
            thread_alive_clone.store(false, Ordering::SeqCst);
        });

        // 模拟 select! 循环消费一些事件
        tokio::time::sleep(Duration::from_millis(200)).await;

        println!("  streaming 循环退出，开始清理...");
        let cleanup_start = Instant::now();

        // === 修复后版本（与 main.rs L1380-1382 一致） ===
        drop(kb_tx);
        drop(kb_rx); // 关键：必须在 join() 之前 drop receiver
        let result = kb_thread.join();

        let elapsed = cleanup_start.elapsed();
        println!("  清理耗时: {:.1}ms", elapsed.as_millis());
        println!("  线程是否退出: {}", !thread_alive.load(Ordering::SeqCst));
        println!("  join() 结果: {:?}", result.is_ok());

        // 验证：join() 应该在合理时间内返回（< 500ms）
        assert!(elapsed < Duration::from_secs(1),
            "join() 应在 1 秒内返回，实际 {:.1}ms（可能死锁）", elapsed.as_millis());
        assert!(!thread_alive.load(Ordering::SeqCst),
            "键盘线程应已退出");
        assert!(result.is_ok(), "键盘线程应正常退出");

        println!("\n  场景 K 通过：kb_thread.join() 正常返回，无死锁。");
    }
}
