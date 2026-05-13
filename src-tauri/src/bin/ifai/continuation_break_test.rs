//! 🔥 续接循环 Break 条件单元测试
//!
//! 复现 bug 场景：DeepSeek 返回 `finish_reason=tool_calls` 但所有工具调用参数为 `{}`
//! 导致 `collected_tool_calls` 为空，但循环不 break，陷入死循环
//!
//! ## 场景说明
//!
//! **Bug 复现路径**：
//! 1. DeepSeek API 返回 `finish_reason=tool_calls` + N 个 tool_calls
//! 2. 所有 tool_calls 的 arguments 都是 `{}`
//! 3. `filter_empty_tool_calls!` 宏在 DeepSeek provider 中过滤掉所有空参数
//! 4. `collected_tool_calls` 为空（没有 ToolDone 事件被触发）
//! 5. `execute_tools_tui` 返回空的 `tool_results`
//! 6. 但 `should_stop_tui` 只检查 `finish_reason != "stop"`，不检查 `collected_tool_calls.is_empty()`
//! 7. 循环继续，AI 每轮看到相同上下文，继续返回空参数工具调用 → 死循环
//!
//! **日志证据**：
//! ```
//! [DeepSeek] finish_reason=tool_calls, tool_calls=4, text_len=0
//! [TUI-ROUND-4] 消息变化: 11 → 11 (Δ=0), tool_results=0, has_text=false, has_tools=false
//! [TUI-ROUND-5] 消息变化: 11 → 11 (Δ=0), tool_results=0, has_text=false, has_tools=false
//! ...
//! [TUI-STAGNATION] Token: 13700 → 13717 (delta=17, 阈值=200)  // 停滞检测触发
//! ```

#[cfg(test)]
mod tests {
    /// 📊 续接循环 Break 决策
    ///
    /// 模拟 `session.rs` 中的 `should_stop_tui` 逻辑
    fn should_stop(
        finish_reason: &Option<String>,
        collected_tool_calls_count: usize,
    ) -> bool {
        match finish_reason {
            Some(reason) => reason == "stop",
            None => collected_tool_calls_count == 0,
        }
    }

    /// 📊 修复后的 Break 决策（Bug 修复版本）
    ///
    /// 新增：finish_reason=tool_calls 但 collected_tool_calls 为空时也应该 stop
    fn should_stop_fixed(
        finish_reason: &Option<String>,
        collected_tool_calls_count: usize,
    ) -> bool {
        match finish_reason {
            Some(reason) if reason == "stop" => true,
            Some(reason) if reason == "tool_calls" => {
                // 🔥 FIX: 如果返回 tool_calls 但实际收集到 0 个工具调用，说明都被过滤了
                // 此时应该 break，避免死循环
                collected_tool_calls_count == 0
            }
            Some(_) => false, // 其他 finish_reason（如 "length", "content_filter"）不 break
            None => collected_tool_calls_count == 0, // fallback: 未知 provider
        }
    }

    // ========================================================================
    // 正常场景
    // ========================================================================

    #[test]
    fn test_normal_stop() {
        // 场景：AI 正常结束对话
        let finish_reason = Some("stop".to_string());
        let collected_count = 0;

        assert!(
            should_stop(&finish_reason, collected_count),
            "finish_reason=stop 应该停止循环"
        );
    }

    #[test]
    fn test_normal_tool_calls() {
        // 场景：AI 返回工具调用，且成功收集到
        let finish_reason = Some("tool_calls".to_string());
        let collected_count = 3;

        assert!(
            !should_stop(&finish_reason, collected_count),
            "finish_reason=tool_calls 且有工具调用时，应该继续循环"
        );
    }

    #[test]
    fn test_fallback_no_tools() {
        // 场景：未知 provider（finish_reason=None），没有工具调用
        let finish_reason = None;
        let collected_count = 0;

        assert!(
            should_stop(&finish_reason, collected_count),
            "finish_reason=None 且无工具调用时，应该停止循环"
        );
    }

    #[test]
    fn test_fallback_with_tools() {
        // 场景：未知 provider（finish_reason=None），但有工具调用
        let finish_reason = None;
        let collected_count = 2;

        assert!(
            !should_stop(&finish_reason, collected_count),
            "finish_reason=None 但有工具调用时，应该继续循环"
        );
    }

    // ========================================================================
    // Bug 场景（空参数工具调用）
    // ========================================================================

    #[test]
    fn test_bug_empty_tool_calls_original_logic() {
        // 🐛 Bug 场景：finish_reason=tool_calls 但 collected_tool_calls=0
        //
        // 这是实际发生的 bug：
        // - DeepSeek 返回 finish_reason=tool_calls + 4 个工具调用
        // - 但所有 arguments 都是 {}，被 filter_empty_tool_calls! 过滤
        // - collected_tool_calls 为空
        // - 原始逻辑：!should_stop=true，继续循环 → 死循环！
        let finish_reason = Some("tool_calls".to_string());
        let collected_count = 0;

        // 🔴 原始逻辑的错误行为
        assert!(
            !should_stop(&finish_reason, collected_count),
            "原始 bug: finish_reason=tool_calls 即使 collected=0 也不 stop，导致死循环"
        );
    }

    #[test]
    fn test_bug_empty_tool_calls_fixed_logic() {
        // ✅ 修复后的逻辑
        let finish_reason = Some("tool_calls".to_string());
        let collected_count = 0;

        assert!(
            should_stop_fixed(&finish_reason, collected_count),
            "修复后: finish_reason=tool_calls 且 collected=0 时应该 stop"
        );
    }

    // ========================================================================
    // 边界场景
    // ========================================================================

    #[test]
    fn test_other_finish_reasons() {
        // 其他 finish_reason（如 length, content_filter）不应该停止
        for reason in &["length", "content_filter", "model_timeout"] {
            let finish_reason = Some(reason.to_string());
            let collected_count = 0;

            // 原始逻辑
            assert!(
                !should_stop(&finish_reason, collected_count),
                "finish_reason={} 不应该停止循环",
                reason
            );

            // 修复后逻辑也应该一致
            assert!(
                !should_stop_fixed(&finish_reason, collected_count),
                "finish_reason={} 不应该停止循环（修复后）",
                reason
            );
        }
    }

    #[test]
    fn test_partial_tool_collection() {
        // 场景：API 返回 4 个工具调用，但只有 2 个有有效参数
        // （部分被 filter_empty_tool_calls! 过滤）
        let finish_reason = Some("tool_calls".to_string());
        let collected_count = 2;

        assert!(
            !should_stop(&finish_reason, collected_count),
            "部分工具调用被过滤时，应该继续循环（还有 2 个有效调用）"
        );

        assert!(
            !should_stop_fixed(&finish_reason, collected_count),
            "部分工具调用被过滤时，应该继续循环（修复后）"
        );
    }

    // ========================================================================
    // 集成测试：完整场景模拟
    // ========================================================================

    #[test]
    fn test_scenario_deepseek_empty_args_loop() {
        // 🔥 完整复现 DeepSeek 空参数死循环场景

        let mut round = 0;
        let mut stop_detected = false;
        let max_rounds = 10;

        // 模拟续接循环
        while round < max_rounds {
            round += 1;

            // Round 1-3: 正常工具调用
            if round <= 3 {
                let finish_reason = Some("tool_calls".to_string());
                let collected_count = 3;

                if should_stop_fixed(&finish_reason, collected_count) {
                    stop_detected = true;
                    break;
                }
            }
            // Round 4-10: DeepSeek 返回空参数工具调用
            else {
                let finish_reason = Some("tool_calls".to_string());
                let collected_count = 0; // 全部被 filter_empty_tool_calls! 过滤

                if should_stop_fixed(&finish_reason, collected_count) {
                    stop_detected = true;
                    break;
                }
            }
        }

        assert!(
            stop_detected && round == 4,
            "修复后：应该在 round 4 检测到空工具调用并停止，实际 round={}, stop_detected={}",
            round, stop_detected
        );
    }
}
