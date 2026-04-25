//! TDD 测试：symbol() 方法

use ifai_render_macro::StatusRender;

/// 测试用例 1：基本的状态枚举
#[derive(StatusRender, Debug, Clone, Copy)]
pub enum TestStatus {
    #[status(symbol = "✓")]
    Success,

    #[status(symbol = "✗")]
    Failed,

    #[status(symbol = "⟳")]
    InProgress,

    #[status(symbol = "○")]
    Skipped,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_success_symbol() {
        assert_eq!(TestStatus::Success.symbol(), '✓');
    }

    #[test]
    fn test_failed_symbol() {
        assert_eq!(TestStatus::Failed.symbol(), '✗');
    }

    #[test]
    fn test_in_progress_symbol() {
        assert_eq!(TestStatus::InProgress.symbol(), '⟳');
    }

    #[test]
    fn test_skipped_symbol() {
        assert_eq!(TestStatus::Skipped.symbol(), '○');
    }

    #[test]
    fn test_default_symbol() {
        // 测试没有指定 symbol 时的默认值
        #[derive(StatusRender)]
        pub enum DefaultStatus {
            Foo,
            Bar,
        }

        assert_eq!(DefaultStatus::Foo.symbol(), '•');
        assert_eq!(DefaultStatus::Bar.symbol(), '•');
    }
}
