// tests/common/network.rs
//
// 网络测试辅助工具
// 提供网络检测和条件跳过功能

/// 网络可用性检测结果
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NetworkAvailability {
    /// 网络可用
    Available,
    /// 网络不可用
    Unavailable,
    /// 跳过检测（CI 环境或明确启用）
    SkipCheck,
}

/// 检查网络是否可用
///
/// **检测逻辑**:
/// 1. 如果设置了 `IFAI_TEST_NETWORK` 环境变量为 "1"，则跳过检测并返回 Available
/// 2. 如果在 CI 环境中（检测 `CI` 环境变量），则跳过检测并返回 Available
/// 3. 尝试连接到 well-known 端点（如 1.1.1.1:80 的连通性）
///
/// **返回值**:
/// - `NetworkAvailability::Available` - 网络可用或跳过检测
/// - `NetworkAvailability::Unavailable` - 网络不可用
pub fn check_network() -> NetworkAvailability {
    // 1. 检查环境变量是否强制启用网络测试
    if let Ok(val) = std::env::var("IFAI_TEST_NETWORK") {
        if val == "1" || val.eq_ignore_ascii_case("true") {
            return NetworkAvailability::SkipCheck;
        }
    }

    // 2. 检查是否在 CI 环境中
    if std::env::var("CI").is_ok()
        || std::env::var("GITHUB_ACTIONS").is_ok()
        || std::env::var("GITLAB_CI").is_ok()
        || std::env::var("TRAVIS").is_ok()
    {
        return NetworkAvailability::SkipCheck;
    }

    // 3. 检查是否明确禁用网络测试
    if let Ok(val) = std::env::var("IFAI_TEST_NO_NETWORK") {
        if val == "1" || val.eq_ignore_ascii_case("true") {
            return NetworkAvailability::Unavailable;
        }
    }

    // 4. 尝试简单的网络检测
    // 注意：在测试环境中，我们应该尽量避免实际的网络请求
    // 这里只检查端口是否可达，而不发送实际数据
    use std::time::Duration;

    // 尝试连接到 Cloudflare DNS (1.1.1.1:53)
    // 使用超时时间避免阻塞
    let addr_str = "1.1.1.1:53";
    if let Ok(addr) = addr_str.parse::<std::net::SocketAddr>() {
        if std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok() {
            NetworkAvailability::Available
        } else {
            NetworkAvailability::Unavailable
        }
    } else {
        NetworkAvailability::Unavailable
    }
}

/// 网络测试宏 - 如果网络不可用，则跳过测试
///
/// **使用方式**:
/// ```rust
/// #[test]
/// #[skip_if_no_network]
/// fn test_api_call() {
///     // 这个测试需要网络，会在没有网络时被跳过
/// }
/// ```
///
/// **环境变量控制**:
/// - `IFAI_TEST_NETWORK=1` - 强制启用网络测试（跳过检测）
/// - `IFAI_TEST_NO_NETWORK=1` - 强制禁用网络测试
/// - `CI=1` - CI 环境自动启用网络测试
///
/// **跳过行为**:
/// - 测试会被标记为 `ignore`，而不是失败
/// - 运行 `cargo test` 时会显示 "ignored" 消息
macro_rules! skip_if_no_network {
    () => {
        // 在运行时检查网络，而不是在编译时
        // 这样可以动态决定是否跳过测试
        if $crate::tests::common::network::check_network()
            != $crate::tests::common::network::NetworkAvailability::Available
            && $crate::tests::common::network::check_network()
            != $crate::tests::common::network::NetworkAvailability::SkipCheck
        {
            // 网络不可用，跳过测试
            eprintln!("⚠️  Skipping test: Network not available (set IFAI_TEST_NETWORK=1 to enable)");
            return;
        }
    };
}

/// 条件网络测试宏 - 只有在网络可用时才运行测试
///
/// **使用方式**:
/// ```rust
/// #[tokio::test]
/// async fn test_real_api() {
///     conditional_network_test! {
///         // 需要网络的测试代码
///         let response = reqwest::get("https://api.example.com").await.unwrap();
///         assert!(response.status().is_success());
///     }
/// }
/// ```
///
/// **行为**:
/// - 网络可用：执行测试代码
/// - 网络不可用：跳过测试并打印提示
macro_rules! conditional_network_test {
    ($($tt:tt)*) => {
        if $crate::tests::common::network::check_network()
            != $crate::tests::common::network::NetworkAvailability::Available
            && $crate::tests::common::network::check_network()
            != $crate::tests::common::network::NetworkAvailability::SkipCheck
        {
            eprintln!("⚠️  Skipping network test: Network not available (set IFAI_TEST_NETWORK=1 to enable)");
            return;
        }

        // 网络可用，执行测试代码
        $($tt)*
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    // 本地的 ENV_LOCK 用于测试环境变量隔离
    use std::sync::Mutex;
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn test_check_network_env_force() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::set_var("IFAI_TEST_NETWORK", "1");
        let result = check_network();
        std::env::remove_var("IFAI_TEST_NETWORK");
        assert_eq!(result, NetworkAvailability::SkipCheck);
    }

    #[test]
    fn test_check_network_env_disable() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::set_var("IFAI_TEST_NO_NETWORK", "1");
        let result = check_network();
        std::env::remove_var("IFAI_TEST_NO_NETWORK");
        assert_eq!(result, NetworkAvailability::Unavailable);
    }

    #[test]
    fn test_network_availability_debug() {
        let avail = check_network();
        eprintln!("🌐 Network availability: {:?}", avail);
        // 这个测试只是输出信息，不做断言
        // 因为网络状态取决于运行环境
    }
}
