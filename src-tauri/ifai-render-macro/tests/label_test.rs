//! TDD 测试：label_zh() 和 label_en() 方法

use ifai_render_macro::StatusRender;

/// 测试用例：带中英文标签的状态枚举
#[derive(StatusRender, Debug, Clone, Copy)]
pub enum LabeledStatus {
    #[status(symbol = "✓", zh = "成功", en = "Success")]
    Success,

    #[status(symbol = "✗", zh = "失败", en = "Failed")]
    Failed,

    #[status(symbol = "⟳", zh = "进行中", en = "Running")]
    InProgress,

    #[status(symbol = "○", zh = "跳过", en = "Skipped")]
    Skipped,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_label_zh() {
        assert_eq!(LabeledStatus::Success.label_zh(), "成功");
        assert_eq!(LabeledStatus::Failed.label_zh(), "失败");
        assert_eq!(LabeledStatus::InProgress.label_zh(), "进行中");
        assert_eq!(LabeledStatus::Skipped.label_zh(), "跳过");
    }

    #[test]
    fn test_label_en() {
        assert_eq!(LabeledStatus::Success.label_en(), "Success");
        assert_eq!(LabeledStatus::Failed.label_en(), "Failed");
        assert_eq!(LabeledStatus::InProgress.label_en(), "Running");
        assert_eq!(LabeledStatus::Skipped.label_en(), "Skipped");
    }

    #[test]
    fn test_default_labels() {
        // 测试没有指定 zh/en 时的默认值（应该使用 variant 名）
        #[derive(StatusRender)]
        #[allow(dead_code)]
        pub enum DefaultLabeledStatus {
            Foo,
            Bar,
        }

        assert_eq!(DefaultLabeledStatus::Foo.label_zh(), "Foo");
        assert_eq!(DefaultLabeledStatus::Foo.label_en(), "Foo");
    }
}
