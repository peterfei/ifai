//! 真实流式输出场景 E2E 测试
//!
//! 测试真实的 LLM 流式输出场景
//! 包括 append_streaming_output 的行为

#[cfg(test)]
mod tests {
    use crate::tui::App;

    #[test]
    fn test_append_streaming_output_no_direct_render() {
        // 测试：append_streaming_output 不应该直接渲染到 content_lines

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // 在主线程
        app.switch_thread(primary_id);

        // 模拟流式输出
        app.append_streaming_output(primary_id, "Rust is".to_string());

        // 快照：append_streaming_output 不应该直接推送到 content_lines
        insta::assert_snapshot!(format!(
            "After append_streaming_output:\ncontent_lines.len(): {}\nstreaming_buffer: {:?}",
            app.content_lines.len(),
            app.get_streaming_buffer()
        ), @r###"
        After append_streaming_output:
        content_lines.len(): 0
        streaming_buffer: Some("Rust is")
        "###);

        // ✅ 修复后：content_lines 为空，内容只在 buffer 中
        // 渲染由 ThreadEvent 处理逻辑负责
    }

    #[test]
    fn test_real_streaming_with_thread_switch() {
        // 测试：真实流式输出期间切换线程

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // 在主线程发送消息
        app.switch_thread(primary_id);
        let request_thread_id = primary_id;

        // 模拟流式输出第一行
        app.append_streaming_output(request_thread_id, "Rust is".to_string());

        // 通过 ThreadEvent 存储
        app.thread.messages.push(request_thread_id, crate::thread::Message::user("Rust is".to_string()));

        // 模拟用户切换到 Thread-2
        app.switch_thread(thread2_id);

        // 模拟流式输出第二行
        app.append_streaming_output(request_thread_id, " a systems".to_string());

        // 通过 ThreadEvent 存储（仍然到主线程）
        app.thread.messages.push(request_thread_id, crate::thread::Message::user(" a systems".to_string()));

        // 验证：主线程有完整的响应，Thread-2 为空
        insta::assert_snapshot!(format!(
            "Real streaming with thread switch:\nActive: {:?}\nthread_messages[Main].len(): {}\nthread_messages[Thread-2].len(): {}\ncontent_lines.len(): {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(primary_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len()),
            app.content_lines.len()
        ), @r###"
        Real streaming with thread switch:
        Active: Some("Side: Thread-2")
        thread_messages[Main].len(): 2
        thread_messages[Thread-2].len(): 0
        content_lines.len(): 0
        "###);

        // ✅ 正确：所有内容都在主线程，Thread-2 完全隔离
    }

    #[test]
    fn test_thread_event_responsible_for_rendering() {
        // 测试：ThreadEvent 负责渲染到正确的线程

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // 在主线程
        app.switch_thread(primary_id);
        let request_thread_id = primary_id;

        // 模拟流式输出
        app.append_streaming_output(request_thread_id, "Line 1".to_string());
        app.thread.messages.push(request_thread_id, crate::thread::Message::user("Line 1".to_string()));

        // 模拟 ThreadEvent 处理逻辑（main.rs:1342-1356）
        if let Some(active) = app.thread.store.active_thread() {
            if active.id == request_thread_id {
                app.push_line("Line 1".to_string());
            }
        }

        // 验证：内容显示在主线程
        insta::assert_snapshot!(format!(
            "After ThreadEvent rendering:\nActive: {:?}\ncontent_lines.len(): {}\nFirst line: {:?}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.content_lines.len(),
            app.content_lines.first().and_then(|line| line.spans.first()).map(|s| s.content.clone())
        ), @r###"
        After ThreadEvent rendering:
        Active: Some("Main")
        content_lines.len(): 1
        First line: Some("Line 1")
        "###);

        // ✅ 正确：ThreadEvent 负责渲染
    }
}
