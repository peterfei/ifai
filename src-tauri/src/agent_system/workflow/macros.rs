//! 编译期事件派发宏
//!
//! `define_progress_emitter!` — 生成编译期 match 分支，
//! 零运行时 HashMap 开销，新增事件类型只需在宏调用中追加一行。

/// define_progress_emitter! — 编译期生成事件派发 match
///
/// 用法:
/// ```ignore
/// define_progress_emitter!(event, emit_fn, {
///     Thinking   => ("thinking", "thinking"),
///     ToolCall   => ("tool_call", "tool_call"),
/// });
/// ```
///
/// 其中 emit_fn 是接受 (channel: &str, key: &str) 的闭包或函数。
#[macro_export]
macro_rules! define_progress_emitter {
    // 基础形式：event 表达式 + emit 回调 + 映射规则表
    ($event:expr, $emit:expr, { $( $event_type:pat => ($channel:expr, $key:expr) ),+ $(,)? }) => {{
        #[allow(unused)]
        let mut emitted = false;
        match &$event {
            $(
                $event_type => {
                    emitted = true;
                    $emit($channel, $key);
                }
            )+
            _ => {}
        }
        emitted
    }};
}

// ============================================================
// 单元测试
// ============================================================

#[cfg(test)]
mod tests {
    // --- 宏匹配时调用 emit ---
    #[test]
    fn test_macro_emits_for_matched_type() {
        #[derive(Debug, PartialEq)]
        enum MockEvent {
            Start,
            Progress(u8),
            Done,
        }

        use std::sync::atomic::{AtomicBool, Ordering};
        let called = AtomicBool::new(false);

        let _result = define_progress_emitter!(MockEvent::Progress(50), |_ch: &str, _k: &str| {
            called.store(true, Ordering::SeqCst);
        }, {
            MockEvent::Start    => ("start", "start"),
            MockEvent::Progress(_) => ("progress", "progress"),
            MockEvent::Done     => ("done", "done"),
        });

        assert!(called.load(Ordering::SeqCst), "Progress 应触发 emit");
    }

    // --- 宏对未匹配类型不调用 emit ---
    #[test]
    fn test_macro_does_not_emit_for_unmatched_type() {
        #[derive(Debug, PartialEq)]
        enum MockEvent {
            Start,
            Progress(u8),
            Done,
        }

        use std::sync::atomic::{AtomicBool, Ordering};
        let called = AtomicBool::new(false);

        let _result = define_progress_emitter!(MockEvent::Progress(100), |_ch: &str, _k: &str| {
            called.store(true, Ordering::SeqCst);
        }, {
            MockEvent::Start => ("start", "start"),
            MockEvent::Done  => ("done", "done"),
        });

        assert!(!called.load(Ordering::SeqCst), "Progress 不匹配，不应触发 emit");
    }

    // --- 宏能处理通配符模式 ---
    #[test]
    fn test_macro_with_catch_all_pattern() {
        #[derive(Debug, PartialEq)]
        enum MockEvent {
            A,
            B,
        }

        use std::sync::atomic::{AtomicBool, Ordering};
        let called = AtomicBool::new(false);

        let _result = define_progress_emitter!(MockEvent::B, |_ch: &str, _k: &str| {
            called.store(true, Ordering::SeqCst);
        }, {
            MockEvent::A => ("a", "a"),
            _           => ("other", "other"),
        });

        assert!(called.load(Ordering::SeqCst), "B 应匹配通配符并触发 emit");
    }

    // --- 宏能传递正确的 channel/key ---
    #[test]
    fn test_macro_passes_correct_channel_and_key() {
        #[derive(Debug, PartialEq)]
        enum MockEvent {
            A,
        }

        use std::sync::Mutex;
        let captured = Mutex::new((String::new(), String::new()));

        let _result = define_progress_emitter!(MockEvent::A, |ch: &str, key: &str| {
            *captured.lock().unwrap() = (ch.to_string(), key.to_string());
        }, {
            MockEvent::A => ("my_channel", "my_key"),
        });

        let (ch, key) = captured.lock().unwrap().clone();
        assert_eq!(ch, "my_channel", "channel 应正确传递");
        assert_eq!(key, "my_key", "key 应正确传递");
    }
}
