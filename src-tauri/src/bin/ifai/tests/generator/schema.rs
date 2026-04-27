// generator/schema.rs
//
// YAML Schema 定义
// 定义测试套件的 YAML 结构，用于解析测试定义文件

use serde::Deserialize;
use std::collections::HashMap;

/// 测试套件
#[derive(Debug, Deserialize)]
pub struct TestSuite {
    /// 测试套件名称
    pub name: String,
    /// 测试套件描述
    #[serde(default)]
    pub description: Option<String>,
    /// 套件级别的环境设置
    #[serde(default)]
    pub setup: Option<TestSetup>,
    /// 测试用例列表
    pub tests: Vec<TestCase>,
}

/// 套件级别的环境设置
#[derive(Debug, Deserialize, Default)]
pub struct TestSetup {
    /// 环境变量
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
    /// 配置文件内容（TOML）
    #[serde(default)]
    pub config: Option<String>,
}

/// 单个测试用例
#[derive(Debug, Deserialize)]
pub struct TestCase {
    /// 测试名称
    pub name: String,
    /// 测试描述
    #[serde(default)]
    pub description: Option<String>,
    /// Given 阶段（准备）
    pub given: TestGiven,
    /// When 阶段（执行）
    pub when: TestWhen,
    /// Then 阶段（断言）
    pub then: TestThen,
}

/// Given 阶段（准备）
#[derive(Debug, Deserialize, Default)]
pub struct TestGiven {
    /// CLI 参数
    #[serde(default)]
    #[serde(deserialize_with = "deserialize_default")]
    pub args: Vec<String>,
    /// 环境变量
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
    /// 配置文件内容
    #[serde(default)]
    pub config: Option<String>,
    /// 标准输入
    #[serde(default)]
    pub input: Option<String>,
}

/// When 阶段（执行）
#[derive(Debug, Deserialize, Default)]
pub struct TestWhen {
    /// Mock 响应文件名
    #[serde(default)]
    pub mock_response: Option<String>,
    /// 是否流式响应
    #[serde(default)]
    pub mock_streaming: Option<bool>,
    /// SSE 事件列表
    #[serde(default)]
    pub events: Option<Vec<SseEvent>>,
    /// 验证请求参数
    #[serde(default)]
    pub verify_request: Option<RequestVerification>,
}

/// Then 阶段（断言）
#[derive(Debug, Deserialize, Default)]
pub struct TestThen {
    /// 断言成功退出
    #[serde(default)]
    pub assert_success: Option<bool>,
    /// 断言输出包含文本
    #[serde(default)]
    pub assert_contains: Option<String>,
    /// 断言输出匹配正则
    #[serde(default)]
    pub assert_match: Option<String>,
    /// 断言工具被调用
    #[serde(default)]
    pub assert_tool_called: Option<String>,
    /// 断言 token 数量
    #[serde(default)]
    pub assert_token_count: Option<usize>,

    // 会话压缩相关断言
    /// 断言压缩已触发
    #[serde(default)]
    pub assert_compression_triggered: Option<bool>,
    /// 断言 token 数量低于阈值
    #[serde(default)]
    pub assert_token_count_below: Option<usize>,
    /// 断言系统提示词保留
    #[serde(default)]
    pub assert_system_prompt_preserved: Option<bool>,
    /// 断言最近消息数量
    #[serde(default)]
    pub assert_recent_messages_count: Option<usize>,
}

/// SSE 事件
#[derive(Debug, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum SseEvent {
    #[serde(rename = "response.created")]
    ResponseCreated { response_id: String },

    #[serde(rename = "text.delta")]
    TextDelta { text: String },

    #[serde(rename = "tool_call")]
    ToolCall { name: String, arguments: serde_json::Value },

    #[serde(rename = "response.done")]
    ResponseDone {},

    #[serde(rename = "conversation.compression.started")]
    CompressionStarted { threshold: usize, current_tokens: usize },

    #[serde(rename = "conversation.compression.completed")]
    CompressionCompleted {
        tokens_before: usize,
        tokens_after: usize,
        #[serde(default)]
        tokens_saved: usize,
    },
}

/// 请求验证
#[derive(Debug, Deserialize)]
pub struct RequestVerification {
    /// 验证模型
    #[serde(default)]
    pub model: Option<String>,
    /// 验证 provider
    #[serde(default)]
    pub provider: Option<String>,
    /// 其他验证字段
    #[serde(flatten)]
    pub other: HashMap<String, serde_json::Value>,
}

/// 辅助函数：为 Vec<String> 提供默认值
fn deserialize_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Default + serde::Deserialize<'de>,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn test_parse_simple_test_suite() {
        let yaml = r#"
name: "简单测试"
tests:
  - name: "测试1"
    given:
      args: ["hello"]
    when:
      mock_response: "simple.json"
    then:
      assert_success: true
      assert_contains: "Hello"
"#;

        let suite: TestSuite = serde_yaml::from_str(yaml).expect("Failed to parse YAML");
        assert_eq!(suite.name, "简单测试");
        assert_eq!(suite.tests.len(), 1);
        assert_eq!(suite.tests[0].name, "测试1");
    }

    #[test]
    fn test_parse_test_with_env() {
        let yaml = r#"
name: "环境变量测试"
setup:
  env:
    API_KEY: "test-key"
tests:
  - name: "测试环境变量"
    given:
      args: ["hello"]
      env:
        CUSTOM_VAR: "value"
    when:
      mock_response: "simple.json"
    then:
      assert_success: true
"#;

        let suite: TestSuite = serde_yaml::from_str(yaml).expect("Failed to parse YAML");
        assert_eq!(suite.setup.as_ref().unwrap().env.as_ref().unwrap().get("API_KEY"), Some(&"test-key".to_string()));
        assert_eq!(suite.tests[0].given.env.as_ref().unwrap().get("CUSTOM_VAR"), Some(&"value".to_string()));
    }

    #[test]
    fn test_parse_compression_test() {
        let yaml = r#"
name: "会话压缩测试"
tests:
  - name: "压缩触发测试"
    given:
      args: ["start"]
      input: "message1\nmessage2\nmessage3"
    when:
      mock_response: "compression.json"
    then:
      assert_success: true
      assert_compression_triggered: true
      assert_token_count_below: 1000
"#;

        let suite: TestSuite = serde_yaml::from_str(yaml).expect("Failed to parse YAML");
        let test = &suite.tests[0];
        assert_eq!(test.then.assert_compression_triggered, Some(true));
        assert_eq!(test.then.assert_token_count_below, Some(1000));
    }

    #[test]
    fn test_parse_with_events() {
        let yaml = r#"
name: "流式响应测试"
tests:
  - name: "SSE 流式测试"
    given:
      args: ["hello"]
    when:
      mock_streaming: true
      events:
        - type: "response.created"
          response_id: "resp-1"
        - type: "text.delta"
          text: "Hello"
        - type: "response.done"
    then:
      assert_success: true
"#;

        let suite: TestSuite = serde_yaml::from_str(yaml).expect("Failed to parse YAML");
        let events = suite.tests[0].when.events.as_ref().unwrap();
        assert_eq!(events.len(), 3);
    }
}
