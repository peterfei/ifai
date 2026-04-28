// Modified network_example tests - using Mock server for reliability
// Original source: tests/suite/network_example.yaml

use crate::tests::common::*;

#[tokio::test]
#[serial_test::serial]
async fn test_api_diao_yong() {
    // 演示如何测试需要真实网络的 API 调用
    let mut env = TestEnv::with_mock().await.unwrap();
    if let Some(mock) = env.mock_server() {
        mock.setup_streaming_response(vec!["API", " Response"]).await.unwrap();
    }
    let output = env.run_cli(&["--provider", "openai", "--model", "gpt-3.5-turbo", "hello"]).await.unwrap();
    output.assert_success();
    output.assert_contains("API");
}

