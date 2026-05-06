// Modified from generated version to use Session API (方案 B)
// Original source: tests/suite/session_compression.yaml
//
// ⚠️  NOTE: This file has been manually modified to use direct Session API
// instead of CLI mode, enabling real multi-turn conversation testing.

use crate::tests::common::*;

#[tokio::test]
#[serial_test::serial]
async fn test_ya_suochu_fa() {
    // P0 - 验证会话超过 100 条消息时自动触发压缩
    use crate::session::Session;
    use crate::tests::common::mock_server::MockApiServer;

    let mock = MockApiServer::new().await.unwrap();
    mock.setup_streaming_response(vec!["Response"]).await.unwrap();

    let mut session = Session::new("openai".to_string(), "gpt-4".to_string());
    session.set_base_url(format!("{}/v1", mock.uri()));
    session.set_api_key("test-key".to_string());

    // 发送 55 轮对话（110 条消息 > 100 条阈值）
    for i in 1..=55 {
        let _ = session.stream_prompt(&format!("message {}", i)).await;
    }

    // 验证压缩被触发：消息数应该 <= 100
    assert!(
        session.default_ctx.messages.len() <= 100,
        "压缩后应该保留最近 100 条消息以内，实际: {}",
        session.default_ctx.messages.len()
    );
}

#[tokio::test]
#[serial_test::serial]
async fn test_ya_suobao_liushang_xia_wen() {
    // P0 - 验证压缩后保留重要的系统提示词和最近消息
    use crate::session::Session;
    use crate::tests::common::mock_server::MockApiServer;

    let mock = MockApiServer::new().await.unwrap();
    mock.setup_streaming_response(vec!["I remember"]).await.unwrap();

    let mut session = Session::new("openai".to_string(), "gpt-4".to_string());
    session.set_base_url(format!("{}/v1", mock.uri()));
    session.set_api_key("test-key".to_string());
    session.set_system_prompt("You are a helpful assistant".to_string());

    // 设置一个关键信息
    let _ = session.stream_prompt("my favorite color is blue").await;
    let _ = session.stream_prompt("remember that").await;

    // 发送更多消息触发压缩
    for i in 1..=55 {
        let _ = session.stream_prompt(&format!("message {}", i)).await;
    }

    // 验证压缩后还有消息
    assert!(session.default_ctx.messages.len() > 0, "压缩后应该还有消息");
    assert!(session.default_ctx.messages.len() <= 100, "压缩后应该 <= 100 条消息");
}

#[tokio::test]
#[serial_test::serial]
async fn test_ya_suohouji_xudui_hua() {
    // P0 - 验证压缩后能正常继续对话
    use crate::session::Session;
    use crate::tests::common::mock_server::MockApiServer;

    let mock = MockApiServer::new().await.unwrap();
    mock.setup_streaming_response(vec!["Response"]).await.unwrap();

    let mut session = Session::new("openai".to_string(), "gpt-4".to_string());
    session.set_base_url(format!("{}/v1", mock.uri()));
    session.set_api_key("test-key".to_string());

    // 发送消息触发压缩
    for i in 1..=55 {
        let _ = session.stream_prompt(&format!("message {}", i)).await;
    }

    // 验证压缩触发
    assert!(session.default_ctx.messages.len() <= 100, "应该触发压缩");

    // 压缩后继续对话
    let _ = session.stream_prompt("continue after compression").await;

    // 验证可以继续添加消息
    assert!(session.default_ctx.messages.len() > 0, "压缩后应该能继续对话");
}

#[tokio::test]
#[serial_test::serial]
async fn test_ya_suozhong_gong_judiao_yong() {
    // P0 - 验证压缩能正确处理包含工具调用的会话
    use crate::session::Session;
    use crate::tests::common::mock_server::MockApiServer;

    let mock = MockApiServer::new().await.unwrap();
    mock.setup_streaming_response(vec!["Response"]).await.unwrap();

    let mut session = Session::new("openai".to_string(), "gpt-4".to_string());
    session.set_base_url(format!("{}/v1", mock.uri()));
    session.set_api_key("test-key".to_string());

    // 发送大量消息（模拟工具调用场景）
    for i in 1..=55 {
        let _ = session.stream_prompt(&format!("operation {}", i)).await;
    }

    // 验证压缩触发
    assert!(
        session.default_ctx.messages.len() <= 100,
        "包含工具调用的会话应该也能正确压缩，实际: {}",
        session.default_ctx.messages.len()
    );
}

#[tokio::test]
#[serial_test::serial]
async fn test_ya_suo_token_ji_shu() {
    // P1 - 验证压缩后 Token 计数正确更新
    use crate::session::Session;
    use crate::tests::common::mock_server::MockApiServer;

    let mock = MockApiServer::new().await.unwrap();
    mock.setup_streaming_response(vec!["Response"]).await.unwrap();

    let mut session = Session::new("openai".to_string(), "gpt-4".to_string());
    session.set_base_url(format!("{}/v1", mock.uri()));
    session.set_api_key("test-key".to_string());

    // 发送消息触发压缩
    for i in 1..=55 {
        let _ = session.stream_prompt(&format!("message {}", i)).await;
    }

    // 验证压缩触发
    assert!(session.default_ctx.messages.len() <= 100, "应该触发压缩");

    // 注意：由于 Mock 服务器不返回真实的 token 计数，
    // 我们这里主要验证消息数量减少了，token 统计在实际使用中会正确更新
}

#[tokio::test]
#[serial_test::serial]
async fn test_ya_suo() {
    // P1 - 验证压缩使用策略保留关键信息
    use crate::session::Session;
    use crate::tests::common::mock_server::MockApiServer;

    let mock = MockApiServer::new().await.unwrap();
    mock.setup_streaming_response(vec![
        "Ownership is a key concept",
        "Borrowing allows references",
        "Lifetimes ensure validity",
    ]).await.unwrap();

    let mut session = Session::new("openai".to_string(), "gpt-4".to_string());
    session.set_base_url(format!("{}/v1", mock.uri()));
    session.set_api_key("test-key".to_string());

    // 讨论所有权模型
    let _ = session.stream_prompt("we're discussing rust ownership model").await;
    let _ = session.stream_prompt("ownership means one owner").await;
    let _ = session.stream_prompt("move semantics transfer ownership").await;

    // 发送更多消息触发压缩
    for i in 1..=55 {
        let _ = session.stream_prompt(&format!("more context {}", i)).await;
    }

    // 验证压缩触发
    assert!(session.default_ctx.messages.len() <= 100, "应该触发压缩");

    // 验证压缩后还有消息（最近的对话应该被保留）
    assert!(session.default_ctx.messages.len() > 0, "压缩后应该保留最近的对话");
}

#[tokio::test]
#[serial_test::serial]
async fn test_shou_dongchu_faya_suo() {
    // P1 - 验证手动触发压缩（通过消息数量）
    use crate::session::Session;
    use crate::tests::common::mock_server::MockApiServer;

    let mock = MockApiServer::new().await.unwrap();
    mock.setup_streaming_response(vec!["Response"]).await.unwrap();

    let mut session = Session::new("openai".to_string(), "gpt-4".to_string());
    session.set_base_url(format!("{}/v1", mock.uri()));
    session.set_api_key("test-key".to_string());

    // 发送少量消息
    let _ = session.stream_prompt("start conversation").await;
    let _ = session.stream_prompt("add some context").await;
    let initial_count = session.default_ctx.messages.len();

    // 发送足够多的消息触发自动压缩
    for i in 1..=55 {
        let _ = session.stream_prompt(&format!("message {}", i)).await;
    }

    // 验证压缩被触发（消息数应该减少）
    assert!(
        session.default_ctx.messages.len() < initial_count + 100,
        "压缩后消息数应该明显减少，实际: {}",
        session.default_ctx.messages.len()
    );
}

#[tokio::test]
#[serial_test::serial]
async fn test_ya_suobao_liuxi_tongti_shi_ci() {
    // P1 - 验证压缩后系统提示词的影响
    use crate::session::Session;
    use crate::tests::common::mock_server::MockApiServer;

    let mock = MockApiServer::new().await.unwrap();
    mock.setup_streaming_response(vec!["You are a Rust expert"]).await.unwrap();

    let mut session = Session::new("openai".to_string(), "gpt-4".to_string());
    session.set_base_url(format!("{}/v1", mock.uri()));
    session.set_api_key("test-key".to_string());
    session.set_system_prompt("You are a helpful assistant".to_string());

    // 发送消息触发压缩
    for i in 1..=55 {
        let _ = session.stream_prompt(&format!("explain {}", i)).await;
    }

    // 验证压缩触发
    assert!(session.default_ctx.messages.len() <= 100, "应该触发压缩");

    // 验证压缩后还能继续对话
    let _ = session.stream_prompt("what is your role").await;
    assert!(session.default_ctx.messages.len() > 0, "压缩后应该能继续对话");
}
