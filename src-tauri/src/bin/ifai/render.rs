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
    ("brand", 69, false, false),         // 品牌蓝  #4b89ff → #5f87ff
    ("heading", 69, true, false),        // 标题    brand + bold
    ("success", 71, false, false),       // 成功绿  #5ea16e → #5faf5f
    ("error", 167, false, false),        // 危险红  #d16969 → #d75f5f
    ("warning", 173, false, false),      // 警告橙  #c6933f → #d7875f
    ("muted", 248, false, false),        // 次要文本 #9aa6b4 → #a8a8a8
    ("dim", 8, false, false),            // 最暗文本 #748091 → #808080
    ("code", 72, false, false),          // 行内代码 蓝绿融合
    ("table_border", 236, false, false), // 表格框线 #333333 → #303030
    ("box_bg", 234, false, true),        // 代码块背景 #17191c → #1c1c1c (bg)
    ("diff_add_bg", 22, false, true),    // diff 新增行背景 #213A2B (xterm-256 index 22)
    ("diff_del_bg", 52, false, true),    // diff 删除行背景 #4A221D (xterm-256 index 52)
];

// ============================================================================
// Progress Animation (进度动画)
// ============================================================================

/// 🎬 进度动画帧 — 旋转效果
///
/// 方案 1：旋转箭头（推荐）
/// Unicode: U+27F3, U+27F2, U+22B6, U+22B7
const PROGRESS_FRAMES_SPIN: &[char] = &['⟳', '⟲', '⊶', '⊷'];

/// 🎬 进度动画帧 — 点阵效果
///
/// 方案 2：Braille 点阵（备选）
/// Unicode: U+2808, U+2802, U+2804, U+2820
const PROGRESS_FRAMES_DOT: &[char] = &['⠁', '⠂', '⠄', '⠠'];

/// 🎬 动画帧间隔（毫秒）
///
/// 每帧显示 200ms，形成 2Hz 动画（人类视觉舒适度最佳）
const ANIMATION_FRAME_INTERVAL_MS: u64 = 200;

/// 🎬 获取当前动画帧
///
/// 基于时间计算当前应显示的帧索引
pub fn current_progress_frame() -> char {
    let elapsed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let frame_index =
        (elapsed as u64 / ANIMATION_FRAME_INTERVAL_MS) as usize % PROGRESS_FRAMES_SPIN.len();

    PROGRESS_FRAMES_SPIN[frame_index]
}

// ============================================================================
// Theme System
// ============================================================================

/// 🎨 主题系统 — 所有 12 个语义颜色字段从 BRAND_PALETTE 派生
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
    pub diff_add_bg: &'static str,
    pub diff_del_bg: &'static str,
}

impl Theme {
    /// 从 BRAND_PALETTE 生成主题
    pub const fn from_palette() -> Self {
        Self {
            brand: color_256_raw(69, false),
            heading: color_256_raw(69, true),
            success: color_256_raw(71, false),
            error: color_256_raw(167, false),
            warning: color_256_raw(173, false),
            muted: color_256_raw(248, false),
            dim: color_256_raw(8, false),
            code: color_256_raw(72, false),
            table_border: color_256_raw(236, false),
            box_bg: bg_256_raw(234),
            diff_add_bg: bg_256_raw(22),
            diff_del_bg: bg_256_raw(52),
        }
    }
}

// 🎨 元编程：实现 ThemeAccessor trait
// 由 ifai-render-macro 派生宏自动生成
impl crate::pipeline::ThemeAccessor for Theme {
    fn get_color(&self, field: &str) -> &str {
        match field {
            "success" => self.success,
            "error" => self.error,
            "warning" => self.warning,
            "brand" => self.brand,
            "heading" => self.heading,
            _ => self.muted,
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
    "\x1b[38;5;0m",
    "\x1b[38;5;1m",
    "\x1b[38;5;2m",
    "\x1b[38;5;3m",
    "\x1b[38;5;4m",
    "\x1b[38;5;5m",
    "\x1b[38;5;6m",
    "\x1b[38;5;7m",
    "\x1b[38;5;8m",
    "\x1b[38;5;9m",
    "\x1b[38;5;10m",
    "\x1b[38;5;11m",
    "\x1b[38;5;12m",
    "\x1b[38;5;13m",
    "\x1b[38;5;14m",
    "\x1b[38;5;15m",
    "\x1b[38;5;16m",
    "\x1b[38;5;17m",
    "\x1b[38;5;18m",
    "\x1b[38;5;19m",
    "\x1b[38;5;20m",
    "\x1b[38;5;21m",
    "\x1b[38;5;22m",
    "\x1b[38;5;23m",
    "\x1b[38;5;24m",
    "\x1b[38;5;25m",
    "\x1b[38;5;26m",
    "\x1b[38;5;27m",
    "\x1b[38;5;28m",
    "\x1b[38;5;29m",
    "\x1b[38;5;30m",
    "\x1b[38;5;31m",
    "\x1b[38;5;32m",
    "\x1b[38;5;33m",
    "\x1b[38;5;34m",
    "\x1b[38;5;35m",
    "\x1b[38;5;36m",
    "\x1b[38;5;37m",
    "\x1b[38;5;38m",
    "\x1b[38;5;39m",
    "\x1b[38;5;40m",
    "\x1b[38;5;41m",
    "\x1b[38;5;42m",
    "\x1b[38;5;43m",
    "\x1b[38;5;44m",
    "\x1b[38;5;45m",
    "\x1b[38;5;46m",
    "\x1b[38;5;47m",
    "\x1b[38;5;48m",
    "\x1b[38;5;49m",
    "\x1b[38;5;50m",
    "\x1b[38;5;51m",
    "\x1b[38;5;52m",
    "\x1b[38;5;53m",
    "\x1b[38;5;54m",
    "\x1b[38;5;55m",
    "\x1b[38;5;56m",
    "\x1b[38;5;57m",
    "\x1b[38;5;58m",
    "\x1b[38;5;59m",
    "\x1b[38;5;60m",
    "\x1b[38;5;61m",
    "\x1b[38;5;62m",
    "\x1b[38;5;63m",
    "\x1b[38;5;64m",
    "\x1b[38;5;65m",
    "\x1b[38;5;66m",
    "\x1b[38;5;67m",
    "\x1b[38;5;68m",
    "\x1b[38;5;69m",
    "\x1b[38;5;70m",
    "\x1b[38;5;71m",
    "\x1b[38;5;72m",
    "\x1b[38;5;73m",
    "\x1b[38;5;74m",
    "\x1b[38;5;75m",
    "\x1b[38;5;76m",
    "\x1b[38;5;77m",
    "\x1b[38;5;78m",
    "\x1b[38;5;79m",
    "\x1b[38;5;80m",
    "\x1b[38;5;81m",
    "\x1b[38;5;82m",
    "\x1b[38;5;83m",
    "\x1b[38;5;84m",
    "\x1b[38;5;85m",
    "\x1b[38;5;86m",
    "\x1b[38;5;87m",
    "\x1b[38;5;88m",
    "\x1b[38;5;89m",
    "\x1b[38;5;90m",
    "\x1b[38;5;91m",
    "\x1b[38;5;92m",
    "\x1b[38;5;93m",
    "\x1b[38;5;94m",
    "\x1b[38;5;95m",
    "\x1b[38;5;96m",
    "\x1b[38;5;97m",
    "\x1b[38;5;98m",
    "\x1b[38;5;99m",
    "\x1b[38;5;100m",
    "\x1b[38;5;101m",
    "\x1b[38;5;102m",
    "\x1b[38;5;103m",
    "\x1b[38;5;104m",
    "\x1b[38;5;105m",
    "\x1b[38;5;106m",
    "\x1b[38;5;107m",
    "\x1b[38;5;108m",
    "\x1b[38;5;109m",
    "\x1b[38;5;110m",
    "\x1b[38;5;111m",
    "\x1b[38;5;112m",
    "\x1b[38;5;113m",
    "\x1b[38;5;114m",
    "\x1b[38;5;115m",
    "\x1b[38;5;116m",
    "\x1b[38;5;117m",
    "\x1b[38;5;118m",
    "\x1b[38;5;119m",
    "\x1b[38;5;120m",
    "\x1b[38;5;121m",
    "\x1b[38;5;122m",
    "\x1b[38;5;123m",
    "\x1b[38;5;124m",
    "\x1b[38;5;125m",
    "\x1b[38;5;126m",
    "\x1b[38;5;127m",
    "\x1b[38;5;128m",
    "\x1b[38;5;129m",
    "\x1b[38;5;130m",
    "\x1b[38;5;131m",
    "\x1b[38;5;132m",
    "\x1b[38;5;133m",
    "\x1b[38;5;134m",
    "\x1b[38;5;135m",
    "\x1b[38;5;136m",
    "\x1b[38;5;137m",
    "\x1b[38;5;138m",
    "\x1b[38;5;139m",
    "\x1b[38;5;140m",
    "\x1b[38;5;141m",
    "\x1b[38;5;142m",
    "\x1b[38;5;143m",
    "\x1b[38;5;144m",
    "\x1b[38;5;145m",
    "\x1b[38;5;146m",
    "\x1b[38;5;147m",
    "\x1b[38;5;148m",
    "\x1b[38;5;149m",
    "\x1b[38;5;150m",
    "\x1b[38;5;151m",
    "\x1b[38;5;152m",
    "\x1b[38;5;153m",
    "\x1b[38;5;154m",
    "\x1b[38;5;155m",
    "\x1b[38;5;156m",
    "\x1b[38;5;157m",
    "\x1b[38;5;158m",
    "\x1b[38;5;159m",
    "\x1b[38;5;160m",
    "\x1b[38;5;161m",
    "\x1b[38;5;162m",
    "\x1b[38;5;163m",
    "\x1b[38;5;164m",
    "\x1b[38;5;165m",
    "\x1b[38;5;166m",
    "\x1b[38;5;167m",
    "\x1b[38;5;168m",
    "\x1b[38;5;169m",
    "\x1b[38;5;170m",
    "\x1b[38;5;171m",
    "\x1b[38;5;172m",
    "\x1b[38;5;173m",
    "\x1b[38;5;174m",
    "\x1b[38;5;175m",
    "\x1b[38;5;176m",
    "\x1b[38;5;177m",
    "\x1b[38;5;178m",
    "\x1b[38;5;179m",
    "\x1b[38;5;180m",
    "\x1b[38;5;181m",
    "\x1b[38;5;182m",
    "\x1b[38;5;183m",
    "\x1b[38;5;184m",
    "\x1b[38;5;185m",
    "\x1b[38;5;186m",
    "\x1b[38;5;187m",
    "\x1b[38;5;188m",
    "\x1b[38;5;189m",
    "\x1b[38;5;190m",
    "\x1b[38;5;191m",
    "\x1b[38;5;192m",
    "\x1b[38;5;193m",
    "\x1b[38;5;194m",
    "\x1b[38;5;195m",
    "\x1b[38;5;196m",
    "\x1b[38;5;197m",
    "\x1b[38;5;198m",
    "\x1b[38;5;199m",
    "\x1b[38;5;200m",
    "\x1b[38;5;201m",
    "\x1b[38;5;202m",
    "\x1b[38;5;203m",
    "\x1b[38;5;204m",
    "\x1b[38;5;205m",
    "\x1b[38;5;206m",
    "\x1b[38;5;207m",
    "\x1b[38;5;208m",
    "\x1b[38;5;209m",
    "\x1b[38;5;210m",
    "\x1b[38;5;211m",
    "\x1b[38;5;212m",
    "\x1b[38;5;213m",
    "\x1b[38;5;214m",
    "\x1b[38;5;215m",
    "\x1b[38;5;216m",
    "\x1b[38;5;217m",
    "\x1b[38;5;218m",
    "\x1b[38;5;219m",
    "\x1b[38;5;220m",
    "\x1b[38;5;221m",
    "\x1b[38;5;222m",
    "\x1b[38;5;223m",
    "\x1b[38;5;224m",
    "\x1b[38;5;225m",
    "\x1b[38;5;226m",
    "\x1b[38;5;227m",
    "\x1b[38;5;228m",
    "\x1b[38;5;229m",
    "\x1b[38;5;230m",
    "\x1b[38;5;231m",
    "\x1b[38;5;232m",
    "\x1b[38;5;233m",
    "\x1b[38;5;234m",
    "\x1b[38;5;235m",
    "\x1b[38;5;236m",
    "\x1b[38;5;237m",
    "\x1b[38;5;238m",
    "\x1b[38;5;239m",
    "\x1b[38;5;240m",
    "\x1b[38;5;241m",
    "\x1b[38;5;242m",
    "\x1b[38;5;243m",
    "\x1b[38;5;244m",
    "\x1b[38;5;245m",
    "\x1b[38;5;246m",
    "\x1b[38;5;247m",
    "\x1b[38;5;248m",
    "\x1b[38;5;249m",
    "\x1b[38;5;250m",
    "\x1b[38;5;251m",
    "\x1b[38;5;252m",
    "\x1b[38;5;253m",
    "\x1b[38;5;254m",
    "\x1b[38;5;255m",
];

/// 预定义粗体 ANSI 256 颜色
const BOLD_COLORS: &[&str] = &[
    "\x1b[1;38;5;69m", // 69
    "\x1b[1;38;5;8m",  // 8
];

/// 预定义 ANSI 256 背景色
const BG_COLORS: &[&str] = &[
    "\x1b[48;5;234m", // 234
];

/// ANSI 256 前景色（const fn）
const fn color_256_raw(code: u8, bold: bool) -> &'static str {
    // 在预定义表中查找
    if bold {
        // 粗体颜色（目前只有 69 和 8）
        if code == 69 {
            BOLD_COLORS[0]
        } else if code == 8 {
            BOLD_COLORS[1]
        } else {
            ""
        } // 未定义的粗体颜色
    } else {
        // 常规颜色（u8 保证在 0-255 范围内，COLORS 有 256 个元素）
        COLORS[code as usize]
    }
}

/// ANSI 256 背景色（const fn）
const fn bg_256_raw(code: u8) -> &'static str {
    if code == 234 {
        BG_COLORS[0]
    } else {
        ""
    }
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
// Unicode Box Drawing Constants
// ============================================================================

const H: &str = "─"; // Horizontal
const V: &str = "│"; // Vertical
const TL: &str = "╭"; // Top-Left
const TR: &str = "╮"; // Top-Right
const BL: &str = "╰"; // Bottom-Left
const BR: &str = "╯"; // Bottom-Right
const LJ: &str = "├"; // Left-Join
const RJ: &str = "┤"; // Right-Join
const TJ: &str = "┴"; // Top-Join
const BJ: &str = "┬"; // Bottom-Join
const XJ: &str = "┼"; // Cross-Join

// ============================================================================
// IfAI Brand Cursor Spinner (4.0.7)
// ============================================================================

/// 🎨 IfAI Brand Cursor — `▊` 循环 "IfAI" 四个字母
///
/// **循环模式**：`▊fAI` → `I▊AI` → `If▊I` → `IfA▊`
/// - Cursor: `▊` (theme.brand 颜色)
/// - Letters: theme.muted 颜色
/// - 完成后：`✔` (success) 或 `✘` (error)
pub struct Spinner {
    cursor_pos: usize,
    label: String,
    theme: Theme,
    finished: bool,
    success: bool,
}

impl Spinner {
    /// 创建新的 Spinner
    pub fn new(label: &str) -> Self {
        Self {
            cursor_pos: 0,
            label: label.to_string(),
            theme: default_theme(),
            finished: false,
            success: false,
        }
    }

    /// Tick 一次（循环 cursor 位置）
    pub fn tick(&mut self) -> String {
        if self.finished {
            return self.render_finished();
        }

        const BRAND_NAME: &str = "IfAI";
        let before = &BRAND_NAME[..self.cursor_pos];
        let after = &BRAND_NAME[self.cursor_pos..];

        let cursor = self.theme.brand;
        let muted = self.theme.muted;
        let dim = self.theme.dim;
        let reset = RESET;

        let output = format!(
            "\r{cursor}▊{reset}{muted}{before}{after}{reset} {dim}{}{reset}   ",
            self.label
        );

        self.cursor_pos = (self.cursor_pos + 1) % BRAND_NAME.len();
        output
    }

    /// 标记完成（成功）
    pub fn finish(&mut self, success: bool) -> String {
        self.finished = true;
        self.success = success;
        self.render_finished()
    }

    /// 渲染完成状态
    fn render_finished(&self) -> String {
        let icon = if self.success { "✔" } else { "✘" };
        let color = if self.success {
            self.theme.success
        } else {
            self.theme.error
        };
        let reset = RESET;

        format!("\r{color}{icon} IfAI{reset} {}   ", self.label)
    }
}

// ============================================================================
// Tool Call Rendering (4.0.8/4.0.9)
// ============================================================================

/// 🎨 渲染 Tool Start — `╭─ Tool: <name>` + JSON args
pub fn render_tool_start(name: &str, args: &str, theme: &Theme) -> String {
    let border = theme.table_border;
    let muted = theme.muted;
    let reset = RESET;

    // 第一行：╭─ Tool: <name>
    let header = format!("{border}╭─{border} Tool: {name}{{{reset}\n");

    // 后续行：│ <indented JSON>
    let json_lines: Vec<&str> = args.lines().collect();
    let mut body = String::new();
    for line in json_lines {
        body.push_str(&format!("{border}│{reset} {line}\n"));
    }

    header + &body
}

/// 🎨 渲染 Tool Result — `╰─ ✔/✘ <preview>`
pub fn render_tool_result(name: &str, result: &str, success: bool, theme: &Theme) -> String {
    let border = theme.table_border;
    let reset = RESET;

    let icon = if success { "✔" } else { "✘" };
    let color = if success { theme.success } else { theme.error };

    // 🔥 FIX: 显示完整输出，而非截断预览
    // 对于长输出，保留换行符以保持格式
    format!("{border}╰─{reset} {color}{icon} {name}{reset}\n{result}\n")
}

// ============================================================================
// Status Bar & Config Chain (4.0.10/4.0.11)
// ============================================================================

/// 🎨 渲染 Session Status Bar
pub fn render_status_bar(
    messages: usize,
    tools: usize,
    provider: &str,
    model: &str,
    theme: &Theme,
) -> String {
    let border = theme.table_border;
    let muted = theme.muted;
    let reset = RESET;

    format!(
        "{border}┌─{border} Session Status{reset}\n\
         {border}│{reset} Messages: {messages}  {border}│{reset} Tools: {tools}  {border}│{reset} Provider: {provider} {border}│{reset}\n\
         {border}│{reset} Model: {model} {muted}(...){reset}\n\
         {border}└{border}──────────────────────────────────────────────{border}┘{reset}\n"
    )
}

/// 🎨 渲染 Config Precedence Chain (4 层)
pub fn render_config_chain(
    cli_val: Option<&str>,
    env_val: Option<&str>,
    file_val: Option<&str>,
    default_val: &str,
    theme: &Theme,
) -> String {
    let border = theme.table_border;
    let dim = theme.dim;
    let reset = RESET;

    let mut output = String::from(&format!("{border}┌─{border} Config Chain{reset}\n"));

    // CLI args (highest)
    if let Some(v) = cli_val {
        output.push_str(&format!("{border}│{reset} ► cli-arg:    {v}\n"));
    } else if env_val.is_some() || file_val.is_some() {
        output.push_str(&format!(
            "{border}│{reset} {dim}cli-arg:    (not set){reset}\n"
        ));
    }

    // Env var
    if let Some(v) = env_val {
        if cli_val.is_some() {
            output.push_str(&format!(
                "{border}│{reset} {dim}env-var:    {v} (overridden){reset}\n"
            ));
        } else {
            output.push_str(&format!("{border}│{reset} ► env-var:    {v}\n"));
        }
    } else {
        output.push_str(&format!(
            "{border}│{reset} {dim}env-var:    (not set){reset}\n"
        ));
    }

    // Config file
    if let Some(v) = file_val {
        if cli_val.is_some() || env_val.is_some() {
            output.push_str(&format!(
                "{border}│{reset} {dim}file:       {v} (overridden){reset}\n"
            ));
        } else {
            output.push_str(&format!("{border}│{reset} ► file:       {v}\n"));
        }
    } else {
        output.push_str(&format!(
            "{border}│{reset} {dim}file:       (not set){reset}\n"
        ));
    }

    // YAML defaults
    if cli_val.is_some() || env_val.is_some() || file_val.is_some() {
        output.push_str(&format!(
            "{border}│{reset} {dim}default:    {default_val} (overridden){reset}\n"
        ));
    } else {
        output.push_str(&format!("{border}│{reset} ► default:    {default_val}\n"));
    }

    output.push_str(&format!(
        "{border}└{border}──────────────────────{border}┘{reset}\n"
    ));
    output
}

// ============================================================================
// Markdown Stream State (4.0.12)
// ============================================================================

/// 🎨 Markdown 代码块流式状态
pub struct MarkdownStreamState {
    in_code_block: bool,
    buffer: String,
    lang: Option<String>,
}

impl MarkdownStreamState {
    pub fn new() -> Self {
        Self {
            in_code_block: false,
            buffer: String::new(),
            lang: None,
        }
    }

    /// 处理文本 delta，检测代码块边界
    pub fn process_delta(&mut self, delta: &str, theme: &Theme) -> String {
        let mut output = String::new();

        for line in delta.split('\n') {
            if self.in_code_block {
                if line.trim().starts_with("```") {
                    // 代码块结束
                    output.push_str(&format!("{}\n", theme.table_border));
                    output.push_str(&format!("{}│{RESET}{}\n", theme.box_bg, self.buffer.trim()));
                    output.push_str(&format!("{}\n", theme.table_border));
                    self.in_code_block = false;
                    self.buffer.clear();
                    self.lang = None;
                } else {
                    // 代码块内容
                    self.buffer.push_str(line);
                    self.buffer.push('\n');
                }
            } else if line.trim().starts_with("```") {
                // 代码块开始
                self.in_code_block = true;
                self.lang = Some(line.trim()[3..].trim().to_string());
                output.push_str(&format!("{}\n", theme.table_border));
                output.push_str(&format!(
                    "{}│{RESET}╭─ {} language code block\n",
                    theme.table_border,
                    self.lang.as_deref().unwrap_or("text")
                ));
            } else {
                // 普通文本
                output.push_str(line);
                output.push('\n');
            }
        }

        output
    }
}

impl Default for MarkdownStreamState {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Codex-Style Minimalist Banner (4.0.13)
// ============================================================================

/// 🎨 渲染启动 Banner — Codex 风格极简主义
///
/// **设计原则**：
/// - 无 ASCII art
/// - 粗体 "IfAI" + 版本号
/// - 缩进的 model/provider/directory 行
/// - "Tip:" 行
pub fn render_banner(version: &str, provider: &str, model: &str, theme: &Theme) -> String {
    let brand = theme.brand;
    let heading = theme.heading;
    let muted = theme.muted;
    let dim = theme.dim;
    let reset = RESET;

    format!(
        "{heading}{bold}IfAI {version}{reset}\n\
         {dim}Provider:{reset} {brand}{provider}{reset}  {dim}Model:{reset} {brand}{model}{reset}\n\
         {muted}Tip: Press Ctrl+D to exit{reset}\n",
        bold = BOLD
    )
}

// ============================================================================
// Table Rendering (Auto-Width)
// ============================================================================

/// 🎨 渲染 Unicode 表格（自动列宽）
pub fn render_table(headers: &[&str], rows: &[Vec<String>]) -> String {
    if rows.is_empty() {
        return String::new();
    }

    // 计算每列宽度
    let col_count = headers.len();
    let mut widths = vec![0usize; col_count];

    // Headers width
    for (i, header) in headers.iter().enumerate() {
        widths[i] = header.len().max(widths[i]);
    }

    // Rows width
    for row in rows {
        for (i, cell) in row.iter().enumerate() {
            widths[i] = cell.len().max(widths[i]);
        }
    }

    let mut output = String::new();

    // Top border
    output.push_str("┌");
    for (i, width) in widths.iter().enumerate() {
        output.push_str(&"─".repeat(*width + 2));
        if i < col_count - 1 {
            output.push_str("┬");
        }
    }
    output.push_str("┐\n");

    // Headers
    output.push_str("│");
    for (i, header) in headers.iter().enumerate() {
        output.push_str(&format!(" {:width$} │", header, width = widths[i]));
    }
    output.push('\n');

    // Separator
    output.push_str("├");
    for (i, width) in widths.iter().enumerate() {
        output.push_str(&"─".repeat(*width + 2));
        if i < col_count - 1 {
            output.push_str("┼");
        }
    }
    output.push_str("┤\n");

    // Rows
    for row in rows {
        output.push_str("│");
        for (i, cell) in row.iter().enumerate() {
            output.push_str(&format!(" {:width$} │", cell, width = widths[i]));
        }
        output.push('\n');
    }

    // Bottom border
    output.push_str("└");
    for (i, width) in widths.iter().enumerate() {
        output.push_str(&"─".repeat(*width + 2));
        if i < col_count - 1 {
            output.push_str("┴");
        }
    }
    output.push_str("┘\n");

    output
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_brand_palette_completeness() {
        // 验证 BRAND_PALETTE 包含所有必需字段
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
        // Diff 颜色（Ctrl+D 功能）
        assert!(field_names.contains(&"diff_add_bg"));
        assert!(field_names.contains(&"diff_del_bg"));

        assert_eq!(field_names.len(), 12);
    }

    #[test]
    fn test_brand_palette_color_codes() {
        // 验证 GUI CSS → xterm-256 映射
        // brand: #4b89ff → 69 (#5f87ff)
        let brand_entry = BRAND_PALETTE
            .iter()
            .find(|(name, _, _, _)| *name == "brand")
            .unwrap();
        assert_eq!(brand_entry.1, 69); // xterm-256 code
        assert!(!brand_entry.2); // not bold
        assert!(!brand_entry.3); // not background

        // success: #5ea16e → 71 (#5faf5f)
        let success_entry = BRAND_PALETTE
            .iter()
            .find(|(name, _, _, _)| *name == "success")
            .unwrap();
        assert_eq!(success_entry.1, 71);
        assert!(!success_entry.2);

        // error: #d16969 → 167 (#d75f5f)
        let error_entry = BRAND_PALETTE
            .iter()
            .find(|(name, _, _, _)| *name == "error")
            .unwrap();
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

    // ========================================================================
    // Spinner Tests (4.0.7)
    // ========================================================================

    #[test]
    fn test_spinner_new() {
        let spinner = Spinner::new("Test Task");
        assert_eq!(spinner.label, "Test Task");
        assert!(!spinner.finished);
        assert!(!spinner.success);
        assert_eq!(spinner.cursor_pos, 0);
    }

    #[test]
    fn test_spinner_tick_cycle() {
        let mut spinner = Spinner::new("Loading");

        // Tick 1: cursor_pos=0 → "▊fAI"
        let tick1 = spinner.tick();
        assert!(tick1.contains("▊"));
        assert!(tick1.contains("Loading"));

        // Tick 2: cursor_pos=1 → "I▊AI"
        let tick2 = spinner.tick();
        assert!(tick2.contains("▊"));

        // Tick 3: cursor_pos=2 → "If▊I"
        let tick3 = spinner.tick();
        assert!(tick3.contains("▊"));

        // Tick 4: cursor_pos=3 → "IfA▊"
        let tick4 = spinner.tick();
        assert!(tick4.contains("▊"));

        // Tick 5: cursor_pos=0 → 循环回 "▊fAI"
        let tick5 = spinner.tick();
        assert!(tick5.contains("▊"));
    }

    #[test]
    fn test_spinner_finish_success() {
        let mut spinner = Spinner::new("Success Task");
        spinner.finish(true);
        assert!(spinner.finished);
        assert!(spinner.success);

        let output = spinner.tick(); // 已完成时调用 tick 返回完成状态
        assert!(output.contains("✔"));
        assert!(output.contains("Success Task"));
    }

    #[test]
    fn test_spinner_finish_error() {
        let mut spinner = Spinner::new("Error Task");
        spinner.finish(false);
        assert!(spinner.finished);
        assert!(!spinner.success);

        let output = spinner.tick();
        assert!(output.contains("✘"));
        assert!(output.contains("Error Task"));
    }

    // ========================================================================
    // Tool Rendering Tests (4.0.8/4.0.9)
    // ========================================================================

    #[test]
    fn test_render_tool_start_simple() {
        let theme = default_theme();
        let output = render_tool_start("Read", r#"{"path": "test.rs"}"#, &theme);

        assert!(output.contains("Tool: Read"));
        assert!(output.contains(r#"{"path": "test.rs"}"#));
        assert!(output.contains("╭"));
    }

    #[test]
    fn test_render_tool_start_multiline() {
        let theme = default_theme();
        let args = r#"{
  "path": "test.rs",
  "offset": 10
}"#;
        let output = render_tool_start("Edit", args, &theme);

        assert!(output.contains("Tool: Edit"));
        assert!(output.contains("│"));
        assert!(output.contains(r#""path": "test.rs""#));
    }

    #[test]
    fn test_render_tool_result_success() {
        let theme = default_theme();
        let result = "File content loaded successfully";
        let output = render_tool_result("Read", result, true, &theme);

        assert!(output.contains("✔"));
        assert!(output.contains("Read"));
        assert!(output.contains("File content loaded"));
        assert!(output.contains("╰"));
    }

    #[test]
    fn test_render_tool_result_error() {
        let theme = default_theme();
        let result = "File not found";
        let output = render_tool_result("Read", result, false, &theme);

        assert!(output.contains("✘"));
        assert!(output.contains("Read"));
        assert!(output.contains("File not found"));
    }

    #[test]
    fn test_render_tool_result_full_output() {
        let theme = default_theme();
        let long_result = "This is a very long result that should be displayed in full";
        let output = render_tool_result("Test", long_result, true, &theme);

        // 应该显示完整输出
        assert!(output.contains(long_result));
        assert!(output.contains("✔"));
    }

    // ========================================================================
    // Status Bar Tests (4.0.10)
    // ========================================================================

    #[test]
    fn test_render_status_bar() {
        let theme = default_theme();
        let output = render_status_bar(5, 3, "DeepSeek", "deepseek-chat", &theme);

        assert!(output.contains("Session Status"));
        assert!(output.contains("Messages: 5"));
        assert!(output.contains("Tools: 3"));
        assert!(output.contains("Provider: DeepSeek"));
        assert!(output.contains("Model: deepseek-chat"));
        assert!(output.contains("┌"));
        assert!(output.contains("└"));
        assert!(output.contains("│"));
    }

    // ========================================================================
    // Config Chain Tests (4.0.11)
    // ========================================================================

    #[test]
    fn test_render_config_chain_cli_only() {
        let theme = default_theme();
        let output = render_config_chain(Some("gpt-4"), None, None, "deepseek-chat", &theme);

        assert!(output.contains("Config Chain"));
        assert!(output.contains("► cli-arg:    gpt-4")); // Active
        assert!(output.contains("env-var:    (not set)"));
        assert!(output.contains("file:       (not set)"));
        assert!(output.contains("default:    deepseek-chat (overridden)"));
    }

    #[test]
    fn test_render_config_chain_env_overrides_default() {
        let theme = default_theme();
        let output = render_config_chain(None, Some("gpt-4"), None, "deepseek-chat", &theme);

        assert!(output.contains("cli-arg:    (not set)"));
        assert!(output.contains("► env-var:    gpt-4")); // Active
        assert!(output.contains("file:       (not set)"));
        assert!(output.contains("default:    deepseek-chat (overridden)"));
    }

    #[test]
    fn test_render_config_chain_file_overrides_default() {
        let theme = default_theme();
        let output = render_config_chain(None, None, Some("gpt-4"), "deepseek-chat", &theme);

        assert!(output.contains("cli-arg:    (not set)"));
        assert!(output.contains("env-var:    (not set)"));
        assert!(output.contains("► file:       gpt-4")); // Active
        assert!(output.contains("default:    deepseek-chat (overridden)"));
    }

    #[test]
    fn test_render_config_chain_default_only() {
        let theme = default_theme();
        let output = render_config_chain(None, None, None, "deepseek-chat", &theme);

        // 验证结构
        assert!(output.contains("Config Chain"));
        assert!(output.contains("► default:    deepseek-chat")); // Active
                                                                 // 验证 env-var 和 file 层显示 "(not set)"
        assert!(output.contains("env-var:    (not set)"));
        assert!(output.contains("file:       (not set)"));
        // CLI arg 层不显示（因为只有 default 值时，该层被省略）
        assert!(!output.contains("cli-arg"));
    }

    #[test]
    fn test_render_config_chain_precedence_order() {
        let theme = default_theme();
        // CLI 覆盖所有
        let output = render_config_chain(
            Some("cli-model"),
            Some("env-model"),
            Some("file-model"),
            "default-model",
            &theme,
        );

        assert!(output.contains("► cli-arg:    cli-model")); // CLI 最高优先级
        assert!(output.contains("env-var:    env-model (overridden)"));
        assert!(output.contains("file:       file-model (overridden)"));
        assert!(output.contains("default:    default-model (overridden)"));
    }

    // ========================================================================
    // Markdown Stream Tests (4.0.12)
    // ========================================================================

    #[test]
    fn test_markdown_stream_new() {
        let state = MarkdownStreamState::new();
        assert!(!state.in_code_block);
        assert!(state.buffer.is_empty());
        assert!(state.lang.is_none());
    }

    #[test]
    fn test_markdown_stream_default() {
        let state = MarkdownStreamState::default();
        assert!(!state.in_code_block);
        assert!(state.buffer.is_empty());
    }

    #[test]
    fn test_markdown_detect_code_block_start() {
        let mut state = MarkdownStreamState::new();
        let theme = default_theme();

        let delta = "```rust\nfn main() {}\n";
        let output = state.process_delta(delta, &theme);

        assert!(state.in_code_block);
        assert_eq!(state.lang.as_deref(), Some("rust"));
        assert!(output.contains("rust language code block"));
    }

    #[test]
    fn test_markdown_detect_code_block_end() {
        let mut state = MarkdownStreamState::new();
        let theme = default_theme();

        // 开始代码块
        state.process_delta("```rust\n", &theme);
        assert!(state.in_code_block);

        // 添加内容
        state.process_delta("let x = 42;\n", &theme);

        // 结束代码块
        let output = state.process_delta("```\n", &theme);
        assert!(!state.in_code_block);
        assert!(state.buffer.is_empty());
        assert!(output.contains("let x = 42;")); // 内容应被输出
    }

    #[test]
    fn test_markdown_plain_text_passthrough() {
        let mut state = MarkdownStreamState::new();
        let theme = default_theme();

        let delta = "This is plain text\nNo code blocks here\n";
        let output = state.process_delta(delta, &theme);

        assert!(!state.in_code_block);
        assert!(output.contains("This is plain text"));
        assert!(output.contains("No code blocks here"));
    }

    // ========================================================================
    // Banner Tests (4.0.13)
    // ========================================================================

    #[test]
    fn test_render_banner() {
        let theme = default_theme();
        let output = render_banner("v0.5.1", "DeepSeek", "deepseek-chat", &theme);

        assert!(output.contains("IfAI v0.5.1"));
        assert!(output.contains("Provider:"));
        assert!(output.contains("DeepSeek"));
        assert!(output.contains("Model:"));
        assert!(output.contains("deepseek-chat"));
        assert!(output.contains("Tip: Press Ctrl+D to exit"));
    }

    #[test]
    fn test_render_banner_no_ascii_art() {
        let theme = default_theme();
        let output = render_banner("v0.1.0", "OpenAI", "gpt-4", &theme);

        // 不应该有 ASCII art（没有多行的图形）
        let line_count = output.lines().count();
        assert!(line_count <= 3); // 最多3行
    }

    // ========================================================================
    // Table Rendering Tests
    // ========================================================================

    #[test]
    fn test_render_table_empty() {
        let output = render_table(&["A", "B"], &[]);
        assert!(output.is_empty());
    }

    #[test]
    fn test_render_table_single_row() {
        let headers = vec!["Name", "Age"];
        let rows = vec![vec!["Alice".to_string(), "30".to_string()]];
        let output = render_table(&headers, &rows);

        assert!(output.contains("┌"));
        assert!(output.contains("┐"));
        assert!(output.contains("│"));
        assert!(output.contains("Name"));
        assert!(output.contains("Age"));
        assert!(output.contains("Alice"));
        assert!(output.contains("30"));
        assert!(output.contains("├"));
        assert!(output.contains("┤"));
        assert!(output.contains("└"));
        assert!(output.contains("┘"));
    }

    #[test]
    fn test_render_table_auto_width() {
        let headers = vec!["ID", "Description"];
        let rows = vec![
            vec!["1".to_string(), "Short".to_string()],
            vec!["2".to_string(), "A very long description".to_string()],
        ];
        let output = render_table(&headers, &rows);

        // 验证第二列自动扩展以适应长内容
        assert!(output.contains("A very long description"));
    }

    #[test]
    fn test_render_table_multiple_columns() {
        let headers = vec!["A", "B", "C"];
        let rows = vec![
            vec!["1".to_string(), "2".to_string(), "3".to_string()],
            vec!["4".to_string(), "5".to_string(), "6".to_string()],
        ];
        let output = render_table(&headers, &rows);

        assert!(output.contains("│ 1 │ 2 │ 3 │"));
        assert!(output.contains("│ 4 │ 5 │ 6 │"));
    }

    // ========================================================================
    // Unicode Box Drawing Tests
    // ========================================================================

    #[test]
    fn test_unicode_box_constants() {
        assert_eq!(H, "─");
        assert_eq!(V, "│");
        assert_eq!(TL, "╭");
        assert_eq!(TR, "╮");
        assert_eq!(BL, "╰");
        assert_eq!(BR, "╯");
        assert_eq!(LJ, "├");
        assert_eq!(RJ, "┤");
        assert_eq!(TJ, "┴");
        assert_eq!(BJ, "┬");
        assert_eq!(XJ, "┼");
    }

    // ========================================================================
    // Progress Animation Tests (进度动画测试)
    // ========================================================================

    #[test]
    fn test_progress_frames_spin_defined() {
        // 验证旋转动画帧已定义
        assert_eq!(PROGRESS_FRAMES_SPIN.len(), 4);
        assert_eq!(PROGRESS_FRAMES_SPIN[0], '⟳');
        assert_eq!(PROGRESS_FRAMES_SPIN[1], '⟲');
        assert_eq!(PROGRESS_FRAMES_SPIN[2], '⊶');
        assert_eq!(PROGRESS_FRAMES_SPIN[3], '⊷');
    }

    #[test]
    fn test_progress_frames_dot_defined() {
        // 验证点阵动画帧已定义
        assert_eq!(PROGRESS_FRAMES_DOT.len(), 4);
        assert_eq!(PROGRESS_FRAMES_DOT[0], '⠁');
        assert_eq!(PROGRESS_FRAMES_DOT[1], '⠂');
        assert_eq!(PROGRESS_FRAMES_DOT[2], '⠄');
        assert_eq!(PROGRESS_FRAMES_DOT[3], '⠠');
    }

    #[test]
    fn test_animation_frame_interval() {
        // 验证帧间隔为 200ms
        assert_eq!(ANIMATION_FRAME_INTERVAL_MS, 200);
    }

    #[test]
    fn test_current_progress_frame_returns_valid_char() {
        // 验证当前帧函数返回有效字符
        let frame = current_progress_frame();
        assert!(PROGRESS_FRAMES_SPIN.contains(&frame));
    }

    #[test]
    fn test_current_progress_frame_cycles() {
        // 验证帧循环（通过多次调用检查返回不同的帧）
        let mut frames = std::collections::HashSet::new();
        let mut seen_different = false;

        // 连续采样 20 次（跨越至少一个完整周期）
        for _ in 0..20 {
            let frame = current_progress_frame();
            frames.insert(frame);

            // 如果帧间隔够长，应该能看到不同的帧
            std::thread::sleep(std::time::Duration::from_millis(250));
        }

        // 验证至少看到了 2 个不同的帧（证明动画在工作）
        assert!(
            frames.len() >= 2,
            "Expected at least 2 different frames, got {}",
            frames.len()
        );
    }

    #[test]
    fn test_progress_frames_unicode() {
        // 验证 Unicode 字符正确
        // 旋转箭头: U+27F3, U+27F2, U+22B6, U+22B7
        assert_eq!(PROGRESS_FRAMES_SPIN[0] as u32, 0x27F3);
        assert_eq!(PROGRESS_FRAMES_SPIN[1] as u32, 0x27F2);
        assert_eq!(PROGRESS_FRAMES_SPIN[2] as u32, 0x22B6);
        assert_eq!(PROGRESS_FRAMES_SPIN[3] as u32, 0x22B7);

        // Braille 点阵: U+2801, U+2802, U+2804, U+2820
        assert_eq!(PROGRESS_FRAMES_DOT[0] as u32, 0x2801); // '⠁'
        assert_eq!(PROGRESS_FRAMES_DOT[1] as u32, 0x2802); // '⠂'
        assert_eq!(PROGRESS_FRAMES_DOT[2] as u32, 0x2804); // '⠄'
        assert_eq!(PROGRESS_FRAMES_DOT[3] as u32, 0x2820); // '⠠'
    }
}
