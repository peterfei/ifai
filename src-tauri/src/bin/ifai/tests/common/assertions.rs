// common/assertions.rs
//
// 自定义断言
// 提供测试断言辅助函数

/// 断言输出包含文本
pub fn assert_contains(output: &str, text: &str) {
    assert!(
        output.contains(text),
        "Output does not contain '{}':\n{}",
        text,
        output
    );
}

/// 断言输出匹配正则
pub fn assert_regex_match<'a>(pattern: &str, text: &'a str) -> regex_lite::Captures<'a> {
    let re = regex_lite::Regex::new(pattern).expect("Invalid regex pattern");
    let captures = re.captures(text).expect("Pattern did not match");
    captures
}

/// 断言 JSON 结构相等
pub fn assert_json_eq(actual: &str, expected: &serde_json::Value) {
    let actual_json: serde_json::Value = serde_json::from_str(actual)
        .expect("Invalid JSON");
    assert_eq!(&actual_json, expected);
}

/// 网络测试跳过宏
#[macro_export]
macro_rules! skip_if_no_network {
    ($(ok)?) => {
        if std::env::var("IFAI_RUN_NETWORK_TESTS").is_err() {
            return ok;
        }
    };
}

/// 跳过宏的重新导出
pub use skip_if_no_network;
