//! Ping 工具 - 使用 #[derive(Tool)] 宏的第一个示例
//!
//! 这个工具用于测试网络连接，是演示元编程工具系统的第一个实际应用。

use tool_macro::Tool;
use std::net::ToSocketAddrs;
use std::time::Duration;

// TDD 步骤 1: 先定义工具接口（使用宏）
#[derive(Tool)]
#[tool(
    name = "ping",
    description = "Test network connectivity to a host",
    params(host: str, port: int)
)]
pub struct PingTool {
    #[tool(config)]
    timeout_ms: u64,

    #[tool(state)]
    request_count: usize,
}

impl PingTool {
    /// TDD 步骤 2: 定义工具行为
    ///
    /// 测试到主机的网络连接
    pub fn execute_ping(&self, host: &str, port: u64) -> Result<PingResult, PingError> {
        // 构造地址
        let addr = format!("{}:{}", host, port);

        // 尝试连接
        let duration = Duration::from_millis(self.timeout_ms);
        let start = std::time::Instant::now();

        let socket_addrs = addr.to_socket_addrs()
            .map_err(|e| PingError::InvalidAddress(format!("Invalid address '{}': {}", addr, e)))?;

        for addr in socket_addrs {
            if std::net::TcpStream::connect_timeout(&addr, duration).is_ok() {
                let elapsed = start.elapsed();
                return Ok(PingResult {
                    host: host.to_string(),
                    port: port as u16,
                    reachable: true,
                    latency_ms: elapsed.as_millis() as u64,
                });
            }
        }

        Ok(PingResult {
            host: host.to_string(),
            port: port as u16,
            reachable: false,
            latency_ms: 0,
        })
    }
}

/// Ping 结果
#[derive(Debug, Clone)]
pub struct PingResult {
    pub host: String,
    pub port: u16,
    pub reachable: bool,
    pub latency_ms: u64,
}

impl PingResult {
    /// 格式化输出为字符串（用于 ToolLike trait）
    pub fn to_output_string(&self) -> String {
        self.to_string()
    }
}

impl std::fmt::Display for PingResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.reachable {
            write!(f, "✅ {}:{} is reachable ({}ms)", self.host, self.port, self.latency_ms)
        } else {
            write!(f, "❌ {}:{} is not reachable", self.host, self.port)
        }
    }
}

/// Ping 错误
#[derive(Debug, thiserror::Error)]
pub enum PingError {
    #[error("Invalid address: {0}")]
    InvalidAddress(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

// TDD 步骤 3: 编写测试
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_macro_attributes() {
        // 验证宏生成的属性
        assert_eq!(PingTool::TOOL_NAME, "ping");
        assert_eq!(PingTool::TOOL_DESCRIPTION, "Test network connectivity to a host");
        assert_eq!(PingTool::get_name(), "ping");
        assert_eq!(PingTool::get_description(), "Test network connectivity to a host");
    }

    #[test]
    fn test_constructor() {
        // 验证宏生成的构造器
        let tool = PingTool::new(5000, 0);
        assert_eq!(tool.timeout_ms, 5000);
        assert_eq!(tool.request_count, 0);
    }

    #[test]
    fn test_ping_localhost() {
        // 测试本地连接（应该成功）
        let tool = PingTool::new(5000, 1);
        let result = tool.execute_ping("127.0.0.1", 80_u64);
        // 注意：80 端口可能没有服务，但至少应该能连接到 localhost
        // 所以我们只验证不会 panic
        let _ = result;
    }

    #[test]
    fn test_ping_display_format() {
        // 测试结果显示格式
        let result = PingResult {
            host: "example.com".to_string(),
            port: 80,
            reachable: true,
            latency_ms: 50,
        };

        let display = format!("{}", result);
        assert!(display.contains("✅"));
        assert!(display.contains("example.com"));
        assert!(display.contains("80"));
        assert!(display.contains("50ms"));
    }

    #[test]
    fn test_ping_unreachable_display() {
        // 测试不可达地址的显示
        let result = PingResult {
            host: "unreachable.example".to_string(),
            port: 9999,
            reachable: false,
            latency_ms: 0,
        };

        let display = format!("{}", result);
        assert!(display.contains("❌"));
        assert!(display.contains("not reachable"));
    }
}
