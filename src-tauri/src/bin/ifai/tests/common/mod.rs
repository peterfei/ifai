// common/mod.rs
//
// 测试公共模块
// 包含测试基础设施（TestEnv, MockServer, assertions）

mod test_env;
mod assertions;
mod mock_server;
mod fixtures;

pub use test_env::{TestEnv, CliOutput};
pub use assertions::*;
pub use mock_server::MockApiServer;
pub use fixtures::*;
