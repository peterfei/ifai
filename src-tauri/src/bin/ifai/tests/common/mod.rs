// common/mod.rs
//
// 测试公共模块
// 包含测试基础设施（TestEnv, MockServer, assertions, network）

mod test_env;
mod assertions;
mod mock_server;
mod fixtures;
mod network;

pub use test_env::{TestEnv, CliOutput};
pub use assertions::*;
pub use mock_server::MockApiServer;
pub use mock_server::{MultiTurnSseResponder, build_tool_call_sse, build_text_sse, build_multi_tool_call_sse, build_tool_call_sse_no_finish_reason};
pub use fixtures::*;
pub use network::{check_network, NetworkAvailability, skip_if_no_network, conditional_network_test};
