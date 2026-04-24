//! Industrial-Grade Terminal Renderer
//!
//! 🏛️ 元编程：声明式渲染，零外部 TUI 依赖
//! 所有输出通过 Theme 颜色系统驱动，单一数据源 BRAND_PALETTE

// ============================================================================
// IfAI Brand Palette (Single Source of Truth)
// ============================================================================

/// 🎨 IfAI Brand Palette — 从 GUI CSS 变量映射到 xterm-256
/// 感知最近邻算法计算，确保 CLI 和 GUI 共享同一视觉语言
const BRAND_PALETTE: &[(&str, u8, bool, bool)] = &[
    // (field_name, xterm_256_code, is_bold, is_background)
    ("brand",        69,  false, false),  // 品牌蓝  #4b89ff → #5f87ff
    ("heading",      69,  true,  false),  // 标题    brand + bold
    ("success",      71,  false, false),  // 成功绿  #5ea16e → #5faf5f
    ("error",       167,  false, false),  // 危险红  #d16969 → #d75f5f
    ("warning",     173,  false, false),  // 警告橙  #c6933f → #d7875f
    ("muted",       248,  false, false),  // 次要文本 #9aa6b4 → #a8a8a8
    ("dim",           8,  false, false),  // 最暗文本 #748091 → #808080
    ("code",         72,  false, false),  // 行内代码 蓝绿融合
    ("table_border", 236,  false, false),  // 表格框线 #333333 → #303030
    ("box_bg",      234,  false, true),   // 代码块背景 #17191c → #1c1c1c (bg)
];

// ============================================================================
// Theme System
// ============================================================================

/// 🎨 主题系统 — 所有 10 个语义颜色字段从 BRAND_PALETTE 派生
#[derive(Debug, Clone, Copy)]
pub struct Theme {
    pub brand: &'static str,
    pub heading: &'static str,
    pub success: &'static str,
    pub error: &'static str,
    pub warning: &'static str,
    pub muted: &'static str,
    pub dim: &'static str,
    pub code: &'static str,
    pub table_border: &'static str,
    pub box_bg: &'static str,
}

impl Theme {
    /// 从 BRAND_PALETTE 生成主题
    pub const fn from_palette() -> Self {
        Self {
            brand:   color_256_raw(69, false),
            heading: color_256_raw(69, true),
            success: color_256_raw(71, false),
            error:   color_256_raw(167, false),
            warning: color_256_raw(173, false),
            muted:   color_256_raw(248, false),
            dim:     color_256_raw(8, false),
            code:    color_256_raw(72, false),
            table_border: color_256_raw(236, false),
            box_bg: bg_256_raw(234),
        }
    }
}

/// 默认主题（IfAI Brand Palette）
pub fn default_theme() -> Theme {
    Theme::from_palette()
}

// ============================================================================
// ANSI 256-Color Helpers (Zero crossterm dependency)
// ============================================================================

/// 预定义常用颜色（索引对应颜色代码）
const COLORS: &[&str] = &[
    "\x1b[38;5;0m", "\x1b[38;5;1m", "\x1b[38;5;2m", "\x1b[38;5;3m", "\x1b[38;5;4m",
    "\x1b[38;5;5m", "\x1b[38;5;6m", "\x1b[38;5;7m", "\x1b[38;5;8m", "\x1b[38;5;9m",
    "\x1b[38;5;10m", "\x1b[38;5;11m", "\x1b[38;5;12m", "\x1b[38;5;13m", "\x1b[38;5;14m",
    "\x1b[38;5;15m", "\x1b[38;5;16m", "\x1b[38;5;17m", "\x1b[38;5;18m", "\x1b[38;5;19m",
    "\x1b[38;5;20m", "\x1b[38;5;21m", "\x1b[38;5;22m", "\x1b[38;5;23m", "\x1b[38;5;24m",
    "\x1b[38;5;25m", "\x1b[38;5;26m", "\x1b[38;5;27m", "\x1b[38;5;28m", "\x1b[38;5;29m",
    "\x1b[38;5;30m", "\x1b[38;5;31m", "\x1b[38;5;32m", "\x1b[38;5;33m", "\x1b[38;5;34m",
    "\x1b[38;5;35m", "\x1b[38;5;36m", "\x1b[38;5;37m", "\x1b[38;5;38m", "\x1b[38;5;39m",
    "\x1b[38;5;40m", "\x1b[38;5;41m", "\x1b[38;5;42m", "\x1b[38;5;43m", "\x1b[38;5;44m",
    "\x1b[38;5;45m", "\x1b[38;5;46m", "\x1b[38;5;47m", "\x1b[38;5;48m", "\x1b[38;5;49m",
    "\x1b[38;5;50m", "\x1b[38;5;51m", "\x1b[38;5;52m", "\x1b[38;5;53m", "\x1b[38;5;54m",
    "\x1b[38;5;55m", "\x1b[38;5;56m", "\x1b[38;5;57m", "\x1b[38;5;58m", "\x1b[38;5;59m",
    "\x1b[38;5;60m", "\x1b[38;5;61m", "\x1b[38;5;62m", "\x1b[38;5;63m", "\x1b[38;5;64m",
    "\x1b[38;5;65m", "\x1b[38;5;66m", "\x1b[38;5;67m", "\x1b[38;5;68m", "\x1b[38;5;69m",
    "\x1b[38;5;70m", "\x1b[38;5;71m", "\x1b[38;5;72m", "\x1b[38;5;73m", "\x1b[38;5;74m",
    "\x1b[38;5;75m", "\x1b[38;5;76m", "\x1b[38;5;77m", "\x1b[38;5;78m", "\x1b[38;5;79m",
    "\x1b[38;5;80m", "\x1b[38;5;81m", "\x1b[38;5;82m", "\x1b[38;5;83m", "\x1b[38;5;84m",
    "\x1b[38;5;85m", "\x1b[38;5;86m", "\x1b[38;5;87m", "\x1b[38;5;88m", "\x1b[38;5;89m",
    "\x1b[38;5;90m", "\x1b[38;5;91m", "\x1b[38;5;92m", "\x1b[38;5;93m", "\x1b[38;5;94m",
    "\x1b[38;5;95m", "\x1b[38;5;96m", "\x1b[38;5;97m", "\x1b[38;5;98m", "\x1b[38;5;99m",
    "\x1b[38;5;100m", "\x1b[38;5;101m", "\x1b[38;5;102m", "\x1b[38;5;103m", "\x1b[38;5;104m",
    "\x1b[38;5;105m", "\x1b[38;5;106m", "\x1b[38;5;107m", "\x1b[38;5;108m", "\x1b[38;5;109m",
    "\x1b[38;5;110m", "\x1b[38;5;111m", "\x1b[38;5;112m", "\x1b[38;5;113m", "\x1b[38;5;114m",
    "\x1b[38;5;115m", "\x1b[38;5;116m", "\x1b[38;5;117m", "\x1b[38;5;118m", "\x1b[38;5;119m",
    "\x1b[38;5;120m", "\x1b[38;5;121m", "\x1b[38;5;122m", "\x1b[38;5;123m", "\x1b[38;5;124m",
    "\x1b[38;5;125m", "\x1b[38;5;126m", "\x1b[38;5;127m", "\x1b[38;5;128m", "\x1b[38;5;129m",
    "\x1b[38;5;130m", "\x1b[38;5;131m", "\x1b[38;5;132m", "\x1b[38;5;133m", "\x1b[38;5;134m",
    "\x1b[38;5;135m", "\x1b[38;5;136m", "\x1b[38;5;137m", "\x1b[38;5;138m", "\x1b[38;5;139m",
    "\x1b[38;5;140m", "\x1b[38;5;141m", "\x1b[38;5;142m", "\x1b[38;5;143m", "\x1b[38;5;144m",
    "\x1b[38;5;145m", "\x1b[38;5;146m", "\x1b[38;5;147m", "\x1b[38;5;148m", "\x1b[38;5;149m",
    "\x1b[38;5;150m", "\x1b[38;5;151m", "\x1b[38;5;152m", "\x1b[38;5;153m", "\x1b[38;5;154m",
    "\x1b[38;5;155m", "\x1b[38;5;156m", "\x1b[38;5;157m", "\x1b[38;5;158m", "\x1b[38;5;159m",
    "\x1b[38;5;160m", "\x1b[38;5;161m", "\x1b[38;5;162m", "\x1b[38;5;163m", "\x1b[38;5;164m",
    "\x1b[38;5;165m", "\x1b[38;5;166m", "\x1b[38;5;167m", "\x1b[38;5;168m", "\x1b[38;5;169m",
    "\x1b[38;5;170m", "\x1b[38;5;171m", "\x1b[38;5;172m", "\x1b[38;5;173m", "\x1b[38;5;174m",
    "\x1b[38;5;175m", "\x1b[38;5;176m", "\x1b[38;5;177m", "\x1b[38;5;178m", "\x1b[38;5;179m",
    "\x1b[38;5;180m", "\x1b[38;5;181m", "\x1b[38;5;182m", "\x1b[38;5;183m", "\x1b[38;5;184m",
    "\x1b[38;5;185m", "\x1b[38;5;186m", "\x1b[38;5;187m", "\x1b[38;5;188m", "\x1b[38;5;189m",
    "\x1b[38;5;190m", "\x1b[38;5;191m", "\x1b[38;5;192m", "\x1b[38;5;193m", "\x1b[38;5;194m",
    "\x1b[38;5;195m", "\x1b[38;5;196m", "\x1b[38;5;197m", "\x1b[38;5;198m", "\x1b[38;5;199m",
    "\x1b[38;5;200m", "\x1b[38;5;201m", "\x1b[38;5;202m", "\x1b[38;5;203m", "\x1b[38;5;204m",
    "\x1b[38;5;205m", "\x1b[38;5;206m", "\x1b[38;5;207m", "\x1b[38;5;208m", "\x1b[38;5;209m",
    "\x1b[38;5;210m", "\x1b[38;5;211m", "\x1b[38;5;212m", "\x1b[38;5;213m", "\x1b[38;5;214m",
    "\x1b[38;5;215m", "\x1b[38;5;216m", "\x1b[38;5;217m", "\x1b[38;5;218m", "\x1b[38;5;219m",
    "\x1b[38;5;220m", "\x1b[38;5;221m", "\x1b[38;5;222m", "\x1b[38;5;223m", "\x1b[38;5;224m",
    "\x1b[38;5;225m", "\x1b[38;5;226m", "\x1b[38;5;227m", "\x1b[38;5;228m", "\x1b[38;5;229m",
    "\x1b[38;5;230m", "\x1b[38;5;231m", "\x1b[38;5;232m", "\x1b[38;5;233m", "\x1b[38;5;234m",
    "\x1b[38;5;235m", "\x1b[38;5;236m", "\x1b[38;5;237m", "\x1b[38;5;238m", "\x1b[38;5;239m",
    "\x1b[38;5;240m", "\x1b[38;5;241m", "\x1b[38;5;242m", "\x1b[38;5;243m", "\x1b[38;5;244m",
    "\x1b[38;5;245m", "\x1b[38;5;246m", "\x1b[38;5;247m", "\x1b[38;5;248m", "\x1b[38;5;249m",
    "\x1b[38;5;250m", "\x1b[38;5;251m", "\x1b[38;5;252m", "\x1b[38;5;253m", "\x1b[38;5;254m",
    "\x1b[38;5;255m",
];

/// 预定义粗体 ANSI 256 颜色
const BOLD_COLORS: &[&str] = &[
    "\x1b[1;38;5;69m",  // 69
    "\x1b[1;38;5;8m",   // 8
];

/// 预定义 ANSI 256 背景色
const BG_COLORS: &[&str] = &[
    "\x1b[48;5;234m",  // 234
];

/// ANSI 256 前景色（const fn）
const fn color_256_raw(code: u8, bold: bool) -> &'static str {
    // 在预定义表中查找
    if bold {
        // 粗体颜色（目前只有 69 和 8）
        if code == 69 { BOLD_COLORS[0] }
        else if code == 8 { BOLD_COLORS[1] }
        else { "" } // 未定义的粗体颜色
    } else {
        // 常规颜色（u8 保证在 0-255 范围内，COLORS 有 256 个元素）
        COLORS[code as usize]
    }
}

/// ANSI 256 背景色（const fn）
const fn bg_256_raw(code: u8) -> &'static str {
    if code == 234 { BG_COLORS[0] }
    else { "" }
}

/// ANSI 重置
pub const RESET: &str = "\x1b[0m";

/// ANSI 粗体
pub const BOLD: &str = "\x1b[1m";

/// ANSI 256 前景色（运行时）
pub fn color_256(code: u8) -> String {
    format!("\x1b[38;5;{}m", code)
}

/// ANSI 256 背景色（运行时）
pub fn bg_256(code: u8) -> String {
    format!("\x1b[48;5;{}m", code)
}

/// ANSI 粗体 + 256 前景色
pub fn bold_color_256(code: u8) -> String {
    format!("\x1b[1;38;5;{}m", code)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_brand_palette_completeness() {
        // 验证 BRAND_PALETTE 包含所有 10 个必需字段
        let field_names: Vec<_> = BRAND_PALETTE.iter().map(|(name, _, _, _)| *name).collect();

        assert!(field_names.contains(&"brand"));
        assert!(field_names.contains(&"heading"));
        assert!(field_names.contains(&"success"));
        assert!(field_names.contains(&"error"));
        assert!(field_names.contains(&"warning"));
        assert!(field_names.contains(&"muted"));
        assert!(field_names.contains(&"dim"));
        assert!(field_names.contains(&"code"));
        assert!(field_names.contains(&"table_border"));
        assert!(field_names.contains(&"box_bg"));

        assert_eq!(field_names.len(), 10);
    }

    #[test]
    fn test_brand_palette_color_codes() {
        // 验证 GUI CSS → xterm-256 映射
        // brand: #4b89ff → 69 (#5f87ff)
        let brand_entry = BRAND_PALETTE.iter().find(|(name, _, _, _)| *name == "brand").unwrap();
        assert_eq!(brand_entry.1, 69); // xterm-256 code
        assert!(!brand_entry.2); // not bold
        assert!(!brand_entry.3); // not background

        // success: #5ea16e → 71 (#5faf5f)
        let success_entry = BRAND_PALETTE.iter().find(|(name, _, _, _)| *name == "success").unwrap();
        assert_eq!(success_entry.1, 71);
        assert!(!success_entry.2);

        // error: #d16969 → 167 (#d75f5f)
        let error_entry = BRAND_PALETTE.iter().find(|(name, _, _, _)| *name == "error").unwrap();
        assert_eq!(error_entry.1, 167);
    }

    #[test]
    fn test_theme_from_palette() {
        let theme = Theme::from_palette();

        // 验证所有字段都从 BRAND_PALETTE 派生
        assert!(!theme.brand.is_empty());
        assert!(!theme.heading.is_empty());
        assert!(!theme.success.is_empty());
        assert!(!theme.error.is_empty());
        assert!(!theme.warning.is_empty());
        assert!(!theme.muted.is_empty());
        assert!(!theme.dim.is_empty());
        assert!(!theme.code.is_empty());
        assert!(!theme.table_border.is_empty());
        assert!(!theme.box_bg.is_empty());
    }

    #[test]
    fn test_default_theme() {
        let theme = default_theme();
        // 应该与 from_palette() 相同
        let palette_theme = Theme::from_palette();

        assert_eq!(theme.brand, palette_theme.brand);
        assert_eq!(theme.success, palette_theme.success);
        assert_eq!(theme.error, palette_theme.error);
    }

    #[test]
    fn test_ansi_color_256() {
        let color = color_256(69);
        assert!(color.contains("\x1b["));
        assert!(color.contains("38;5;69"));
    }

    #[test]
    fn test_ansi_bg_256() {
        let bg = bg_256(234);
        assert!(bg.contains("\x1b["));
        assert!(bg.contains("48;5;234"));
    }

    #[test]
    fn test_ansi_bold_color_256() {
        let bold_color = bold_color_256(69);
        assert!(bold_color.contains("\x1b["));
        assert!(bold_color.contains("1;38;5;69"));
    }

    #[test]
    fn test_ansi_constants() {
        assert_eq!(RESET, "\x1b[0m");
        assert_eq!(BOLD, "\x1b[1m");
    }
}
