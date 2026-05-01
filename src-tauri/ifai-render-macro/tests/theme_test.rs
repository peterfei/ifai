//! TDD 测试：theme_field() 和 render_with_theme() 方法

use ifai_render_macro::StatusRender;

/// 简单的 Theme 结构（模拟 CLI 的 Theme）
#[derive(Clone, Copy)]
pub struct MockTheme {
    pub success: &'static str,
    pub error: &'static str,
    pub warning: &'static str,
    pub brand: &'static str,
    pub muted: &'static str,
}

impl MockTheme {
    pub const fn new() -> Self {
        MockTheme {
            success: "\x1b[32m", // green
            error: "\x1b[31m",   // red
            warning: "\x1b[33m", // yellow
            brand: "\x1b[36m",   // cyan
            muted: "\x1b[90m",   // bright black
        }
    }
}

/// 实现 ThemeAccessor trait
impl ThemeAccessor for MockTheme {
    fn get_color(&self, field: &str) -> &str {
        match field {
            "success" => self.success,
            "error" => self.error,
            "warning" => self.warning,
            "brand" => self.brand,
            _ => self.muted,
        }
    }
}

pub const RESET: &str = "\x1b[0m";

/// 测试用例：带主题的状态枚举
#[derive(StatusRender, Debug, Clone, Copy)]
pub enum ThemedStatus {
    #[status(symbol = "✓", zh = "成功", en = "Success", theme = "success")]
    Success,

    #[status(symbol = "✗", zh = "失败", en = "Failed", theme = "error")]
    Failed,

    #[status(symbol = "⟳", zh = "进行中", en = "Running", theme = "brand")]
    InProgress,

    #[status(symbol = "○", zh = "跳过", en = "Skipped", theme = "muted")]
    Skipped,

    #[status(symbol = "⚠", zh = "警告", en = "Warning", theme = "warning")]
    Warning,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_theme_field() {
        assert_eq!(ThemedStatus::Success.theme_field(), "success");
        assert_eq!(ThemedStatus::Failed.theme_field(), "error");
        assert_eq!(ThemedStatus::InProgress.theme_field(), "brand");
        assert_eq!(ThemedStatus::Skipped.theme_field(), "muted");
        assert_eq!(ThemedStatus::Warning.theme_field(), "warning");
    }

    #[test]
    fn test_render_zh() {
        let theme = MockTheme::new();
        let success = ThemedStatus::Success.render_with_theme("zh", &theme, RESET);
        assert!(success.contains("✓"));
        assert!(success.contains("成功"));
        assert!(success.contains(theme.success));
        assert!(success.contains(RESET));

        let failed = ThemedStatus::Failed.render_with_theme("zh", &theme, RESET);
        assert!(failed.contains("✗"));
        assert!(failed.contains("失败"));
        assert!(failed.contains(theme.error));
    }

    #[test]
    fn test_render_en() {
        let theme = MockTheme::new();
        let running = ThemedStatus::InProgress.render_with_theme("en", &theme, RESET);
        assert!(running.contains("⟳"));
        assert!(running.contains("Running"));
        assert!(running.contains(theme.brand));

        let skipped = ThemedStatus::Skipped.render_with_theme("en", &theme, RESET);
        assert!(skipped.contains("○"));
        assert!(skipped.contains("Skipped"));
        assert!(skipped.contains(theme.muted));
    }

    #[test]
    fn test_default_theme() {
        // 测试没有指定 theme 时的默认值
        #[derive(StatusRender)]
        #[allow(dead_code)]
        pub enum DefaultThemeStatus {
            Foo,
        }

        assert_eq!(DefaultThemeStatus::Foo.theme_field(), "muted");
    }
}
