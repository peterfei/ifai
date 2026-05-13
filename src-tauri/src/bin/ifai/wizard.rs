//! 首次运行设置向导
//!
//! 声明式架构：WizardStep 枚举 + WizardAction + SetupWizard 状态机
//! 3 个步骤：SelectProvider → ConfigureModel → SetPreferences → Completed

use crossterm::event::KeyCode;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};

#[cfg(test)]
use regex; // 只在测试时需要

// ═══════════════════════════════════════════════════════════
// WizardAction — 供 tui.rs 事件循环使用的命令
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WizardAction {
    /// 进入下一步
    Advance,
    /// 返回上一步
    Back,
    /// 完成设置（保存配置 + 创建 .onboarding 标记）
    Complete,
    /// 跳过整个向导
    Skip,
    /// 关闭已完成提示
    Dismiss,
    /// 无操作
    None,
}

// ═══════════════════════════════════════════════════════════
// WizardStep — 步骤状态机枚举
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WizardStep {
    SelectProvider {
        cursor: usize,
    },
    ConfigureModel {
        cursor: usize,
    },
    EnterApiKey {
        input_buffer: String,
        cursor_col: usize,
    },
    SetPreferences {
        cursor: usize,
        temperature_idx: usize,   // 0..=20 (0.0..2.0 step 0.1)
        max_tokens_idx: usize,    // 0..=32 (512..=16834 step 512)
        language_idx: usize,      // 0=跟随系统, 1=中文, 2=English
    },
    Completed,
}

impl WizardStep {
    pub fn name(&self) -> &'static str {
        match self {
            WizardStep::SelectProvider { .. } => "SelectProvider",
            WizardStep::ConfigureModel { .. } => "ConfigureModel",
            WizardStep::EnterApiKey { .. } => "EnterApiKey",
            WizardStep::SetPreferences { .. } => "SetPreferences",
            WizardStep::Completed => "Completed",
        }
    }
}

// ═══════════════════════════════════════════════════════════
// ProviderInfo — 服务商数据
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone)]
pub struct ProviderInfo {
    /// 配置文件中使用的 provider ID（如 "openai", "zhipu"）
    pub id: &'static str,
    /// 显示名称（如 "OpenAI", "智谱 AI"）
    pub name: &'static str,
    pub description: &'static str,
}

const PROVIDERS: &[ProviderInfo] = &[
    ProviderInfo {
        id: "openai",
        name: "OpenAI",
        description: "GPT-4, GPT-3.5",
    },
    ProviderInfo {
        id: "anthropic",
        name: "Anthropic",
        description: "Claude 3, Claude 3.5",
    },
    ProviderInfo {
        id: "zhipu",
        name: "智谱 AI",
        description: "GLM-4, GLM-4V",
    },
    ProviderInfo {
        id: "deepseek",
        name: "DeepSeek",
        description: "DeepSeek-V2, V3",
    },
    ProviderInfo {
        id: "gemini",
        name: "Gemini",
        description: "Gemini Pro, 1.5",
    },
    ProviderInfo {
        id: "local",
        name: "Local Model",
        description: "Ollama/LM Studio",
    },
];

/// 根据服务商获取可用的模型列表（使用 provider ID）
fn models_for(provider: &str) -> &[&'static str] {
    match provider {
        "openai" => &["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
        "anthropic" => &["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
        "zhipu" => &["glm-4", "glm-4v", "glm-4-plus"],
        "deepseek" => &["deepseek-chat", "deepseek-coder"],
        "gemini" => &["gemini-pro", "gemini-1.5-pro", "gemini-1.5-flash"],
        "local" => &["local-model"],
        _ => &["unknown"],
    }
}

/// 根据 provider ID 获取显示名称
fn provider_display_name(id: &str) -> &'static str {
    PROVIDERS.iter()
        .find(|p| p.id == id)
        .map(|p| p.name)
        .unwrap_or("Unknown")
}

// ═══════════════════════════════════════════════════════════
// SetupWizard — 设置向导状态机
// ═══════════════════════════════════════════════════════════

pub struct SetupWizard {
    /// 当前步骤
    step: WizardStep,
    /// 已选择的服务商
    pub selected_provider: Option<String>,
    /// 已选择的模型
    pub selected_model: Option<String>,
    /// API Key
    pub api_key: String,
    /// 温度值
    pub temperature: f64,
    /// 最大 Token
    pub max_tokens: u32,
    /// 语言索引
    pub language_idx: usize,
}

impl SetupWizard {
    pub fn new() -> Self {
        Self {
            step: WizardStep::SelectProvider { cursor: 0 },
            selected_provider: None,
            selected_model: None,
            api_key: String::new(),
            temperature: 0.7,
            max_tokens: 4096,
            language_idx: 0,
        }
    }

    /// 当前步骤名称
    pub fn current_step_name(&self) -> &'static str {
        self.step.name()
    }

    /// 当前步骤引用
    pub fn current_step(&self) -> &WizardStep {
        &self.step
    }

    /// 是否已完成
    pub fn is_completed(&self) -> bool {
        matches!(self.step, WizardStep::Completed)
    }

    /// 保存配置到 ~/.ifai/config.toml
    pub fn save_config(&self) -> Result<(), String> {
        use std::fs;

        let config_path = dirs::home_dir()
            .map(|home| home.join(".ifai").join("config.toml"))
            .ok_or("无法获取主目录")?;

        // 如果配置文件不存在，先创建基础模板
        if !config_path.exists() {
            let template = r#"# IfAI CLI Configuration

[default]
provider = "openai"
model = "gpt-4o"

[providers.openai]
# api_key = "sk-..."  # 在此设置 API Key
"#;
            fs::write(&config_path, template)
                .map_err(|e| format!("Failed to create config.toml: {}", e))?;
        }

        // 读取现有配置
        let mut content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config.toml: {}", e))?;

        // 更新 provider 和 model
        if let Some(ref provider) = self.selected_provider {
            let provider_line = format!("provider = \"{}\"", provider);
            if content.contains("provider = ") {
                content = regex::Regex::new(r#"provider\s*=\s*"[^"]*""#)
                    .map_err(|e| format!("Regex error: {}", e))?
                    .replace(&content, &provider_line)
                    .into_owned();
            } else if content.contains("[default]") {
                content = content.replace(
                    "[default]",
                    &format!("[default]\n{}", provider_line)
                );
            }
        }

        if let Some(ref model) = self.selected_model {
            let model_line = format!("model = \"{}\"", model);
            if content.contains("model = ") {
                content = regex::Regex::new(r#"model\s*=\s*"[^"]*""#)
                    .map_err(|e| format!("Regex error: {}", e))?
                    .replace(&content, &model_line)
                    .into_owned();
            } else if content.contains("[default]") {
                content = content.replace(
                    "[default]",
                    &format!("[default]\n{}", model_line)
                );
            }
        }

        // 更新 api_key（如果用户输入了）
        if !self.api_key.is_empty() {
            let provider_id = self.selected_provider.as_deref().unwrap_or("openai");
            let providers_section = format!("[providers.{}]", provider_id);

            if content.contains(&providers_section) {
                // 如果 providers.xxx 段存在，更新 api_key
                if content.contains(&format!("{} api_key", providers_section)) {
                    let new_api_key = format!("api_key = \"{}\"", self.api_key);
                    content = regex::Regex::new(r#"\[providers\.[^\]]+\]\s*api_key\s*=\s*"[^"]*""#)
                        .map_err(|e| format!("Regex error: {}", e))?
                        .replace(&content, &format!("{}\n    {}", &providers_section, new_api_key))
                        .into_owned();
                } else {
                    // 追加 api_key 到 providers.xxx 段
                    content = content.replace(
                        &providers_section,
                        &format!("{}\n    api_key = \"{}\"", providers_section, self.api_key)
                    );
                }
            } else {
                // 追加 providers.xxx 段
                content = format!(r#"
{}
[providers.{}]
    api_key = "{}"
"#, content, provider_id, self.api_key);
            }
        }

        // 写回文件
        fs::write(&config_path, content)
            .map_err(|e| format!("Failed to write config.toml: {}", e))?;

        Ok(())
    }

    /// 处理键盘事件
    pub fn handle_key(&mut self, key: KeyCode) -> WizardAction {
        match &mut self.step {
            WizardStep::SelectProvider { cursor } => match key {
                KeyCode::Up => {
                    *cursor = cursor.saturating_sub(1);
                    WizardAction::None
                }
                KeyCode::Down => {
                    let max = PROVIDERS.len().saturating_sub(1);
                    *cursor = max.min(*cursor + 1);
                    WizardAction::None
                }
                KeyCode::Enter => {
                    self.selected_provider = Some(PROVIDERS[*cursor].id.to_string());
                    self.step = WizardStep::ConfigureModel { cursor: 0 };
                    WizardAction::Advance
                }
                KeyCode::Esc => WizardAction::Skip,
                _ => WizardAction::None,
            },
            WizardStep::ConfigureModel { cursor } => match key {
                KeyCode::Up => {
                    *cursor = cursor.saturating_sub(1);
                    WizardAction::None
                }
                KeyCode::Down => {
                    let provider = self.selected_provider.as_deref().unwrap_or("");
                    let models = models_for(provider);
                    let max = models.len().saturating_sub(1);
                    *cursor = max.min(*cursor + 1);
                    WizardAction::None
                }
                KeyCode::Enter => {
                    let provider = self.selected_provider.as_deref().unwrap_or("");
                    let models = models_for(provider);
                    self.selected_model = Some(models[*cursor].to_string());
                    self.step = WizardStep::EnterApiKey {
                        input_buffer: String::new(),
                        cursor_col: 0,
                    };
                    WizardAction::Advance
                }
                KeyCode::Tab => {
                    // Tab 切换焦点（当前简化为 Enter 行为）
                    WizardAction::None
                }
                KeyCode::Esc => {
                    self.step = WizardStep::SelectProvider { cursor: 0 };
                    WizardAction::Back
                }
                _ => WizardAction::None,
            },
            WizardStep::EnterApiKey {
                input_buffer,
                cursor_col,
            } => match key {
                KeyCode::Char(c) => {
                    // 只允许 ASCII 字符（英文、数字、符号），过滤中文
                    if c.is_ascii() {
                        input_buffer.push(c);
                        *cursor_col = input_buffer.len();
                    }
                    WizardAction::None
                }
                KeyCode::Backspace => {
                    // 删除字符（安全处理多字节 UTF-8 字符）
                    if !input_buffer.is_empty() {
                        let last_char = input_buffer.chars().rev().next();
                        if let Some(ch) = last_char {
                            let char_len = ch.len_utf8();
                            let new_len = input_buffer.len().saturating_sub(char_len);
                            input_buffer.truncate(new_len);
                            *cursor_col = new_len;
                        }
                    }
                    WizardAction::None
                }
                KeyCode::Enter => {
                    // 确认 API Key（可以为空，用户稍后配置）
                    self.api_key = input_buffer.clone();
                    self.step = WizardStep::SetPreferences {
                        cursor: 0,
                        temperature_idx: 7, // 0.7
                        max_tokens_idx: 7,  // 4096
                        language_idx: 0,
                    };
                    WizardAction::Advance
                }
                KeyCode::Esc => {
                    // 返回到 ConfigureModel
                    let provider = self.selected_provider.as_deref().unwrap_or("");
                    let models = models_for(provider);
                    let model_idx = models.iter().position(|m| {
                        self.selected_model.as_deref() == Some(*m)
                    }).unwrap_or(0);
                    self.step = WizardStep::ConfigureModel { cursor: model_idx };
                    WizardAction::Back
                }
                _ => WizardAction::None,
            },
            WizardStep::SetPreferences {
                cursor,
                temperature_idx,
                max_tokens_idx,
                language_idx,
            } => match key {
                KeyCode::Up => {
                    *cursor = cursor.saturating_sub(1);
                    WizardAction::None
                }
                KeyCode::Down => {
                    *cursor = (2).min(*cursor + 1);
                    WizardAction::None
                }
                KeyCode::Left => {
                    match *cursor {
                        0 => *temperature_idx = temperature_idx.saturating_sub(1),
                        1 => *max_tokens_idx = max_tokens_idx.saturating_sub(1),
                        2 => *language_idx = language_idx.saturating_sub(1),
                        _ => {}
                    }
                    WizardAction::None
                }
                KeyCode::Right => {
                    match *cursor {
                        0 => *temperature_idx = (20).min(*temperature_idx + 1),
                        1 => *max_tokens_idx = (32).min(*max_tokens_idx + 1),
                        2 => *language_idx = (2).min(*language_idx + 1),
                        _ => {}
                    }
                    WizardAction::None
                }
                KeyCode::Enter => {
                    // 保存偏好值
                    self.temperature = *temperature_idx as f64 * 0.1;
                    self.max_tokens = 512 + *max_tokens_idx as u32 * 512;
                    self.language_idx = *language_idx;
                    self.step = WizardStep::Completed;
                    WizardAction::Complete
                }
                KeyCode::Esc => {
                    self.step = WizardStep::EnterApiKey {
                        input_buffer: self.api_key.clone(),
                        cursor_col: self.api_key.len(),
                    };
                    WizardAction::Back
                }
                _ => WizardAction::None,
            },
            WizardStep::Completed => match key {
                KeyCode::Enter => WizardAction::Dismiss,
                _ => WizardAction::None,
            },
        }
    }

    /// 渲染当前步骤
    pub fn render(&self) -> Vec<Line<'static>> {
        let title = "首次设置向导";
        match &self.step {
            WizardStep::SelectProvider { cursor } => {
                let mut lines = Vec::new();
                lines.push(Line::from(""));
                lines.push(centered_line(format!("  {}  ", title), Some(Color::Cyan), true));
                lines.push(centered_line("── 步骤 1/3: 选择 AI 服务 ──", Some(Color::DarkGray), false));
                lines.push(Line::from(""));
                lines.push(centered_line("请选择您的 AI 服务提供商：", Some(Color::White), false));
                lines.push(Line::from(""));

                for (i, provider) in PROVIDERS.iter().enumerate() {
                    let selected = i == *cursor;
                    let prefix = if selected { " › " } else { "   " };
                    let name_style = if selected {
                        Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)
                    } else {
                        Style::default().fg(Color::White)
                    };
                    let desc_color = if selected { Color::DarkGray } else { Color::Gray };
                    let text = format!(
                        "{:<20} {}",
                        format!("{}{}", prefix, provider.name),
                        provider.description
                    );
                    let spans = vec![
                        Span::styled(text.clone(), name_style),
                        Span::styled("", Style::default().fg(desc_color)),
                    ];
                    // Split into name and description parts
                    let line_text = format!(
                        "{:<20} {}",
                        format!("{}{}", prefix, provider.name),
                        provider.description
                    );
                    lines.push(centered_line(line_text, if selected { Some(Color::Cyan) } else { Some(Color::White) }, selected));
                }

                lines.push(Line::from(""));
                lines.push(centered_line("↑↓ 切换  Enter 确认  Esc 跳过", Some(Color::DarkGray), false));
                lines
            }
            WizardStep::ConfigureModel { cursor } => {
                let provider_id = self.selected_provider.as_deref().unwrap_or("?");
                let provider_name = provider_display_name(provider_id);
                let models = models_for(provider_id);
                let mut lines = Vec::new();
                lines.push(Line::from(""));
                lines.push(centered_line(format!("  {}  ", title), Some(Color::Cyan), true));
                lines.push(centered_line("── 步骤 2/3: 配置模型 ──", Some(Color::DarkGray), false));
                lines.push(Line::from(""));
                lines.push(centered_line(format!("服务商: {}", provider_name), Some(Color::Yellow), false));
                lines.push(centered_line("选择模型：", Some(Color::White), false));
                lines.push(Line::from(""));

                for (i, model) in models.iter().enumerate() {
                    let selected = i == *cursor;
                    let prefix = if selected { " › " } else { "   " };
                    let style = if selected {
                        Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)
                    } else {
                        Style::default().fg(Color::White)
                    };
                    lines.push(centered_line(
                        format!("{}{}", prefix, model),
                        if selected { Some(Color::Cyan) } else { Some(Color::White) },
                        selected,
                    ));
                }

                lines.push(Line::from(""));
                lines.push(centered_line("↑↓ 切换  Enter 确认  Esc 返回", Some(Color::DarkGray), false));
                lines
            }
            WizardStep::EnterApiKey { input_buffer, .. } => {
                let provider_name = self.selected_provider.as_deref().unwrap_or("?");
                let model_name = self.selected_model.as_deref().unwrap_or("?");
                let mut lines = Vec::new();
                lines.push(Line::from(""));
                lines.push(centered_line(format!("  {}  ", title), Some(Color::Cyan), true));
                lines.push(centered_line("── 步骤 3/4: 输入 API Key ──", Some(Color::DarkGray), false));
                lines.push(Line::from(""));
                lines.push(centered_line(format!("服务商: {} | 模型: {}", provider_name, model_name), Some(Color::Yellow), false));
                lines.push(Line::from(""));
                lines.push(centered_line("请输入 API Key（可选，直接 Enter 跳过）:", Some(Color::White), false));
                lines.push(Line::from(""));
                // 输入框带白色下划线（固定 50 字符宽）
                let display_text = format!("{:50}", input_buffer);
                let input_style = Style::default()
                    .fg(Color::White)
                    .add_modifier(Modifier::UNDERLINED);
                let input_line = Line::from(vec![
                    Span::raw("  "),
                    Span::styled(display_text, input_style),
                ]);
                lines.push(input_line);
                lines.push(Line::from(""));
                lines.push(centered_line("输入字符  Backspace 删除  Enter 确认  Esc 返回", Some(Color::DarkGray), false));
                lines
            }
            WizardStep::SetPreferences {
                cursor,
                temperature_idx,
                max_tokens_idx,
                language_idx,
            } => {
                let temp_value = *temperature_idx as f64 * 0.1;
                let tokens_value = 512 + *max_tokens_idx as u32 * 512;
                let lang_options = ["跟随系统", "中文", "English"];
                let lang_value = lang_options[(*language_idx).min(2)];

                let mut lines = Vec::new();
                lines.push(Line::from(""));
                lines.push(centered_line(format!("  {}  ", title), Some(Color::Cyan), true));
                lines.push(centered_line("── 步骤 4/4: 偏好设置 ──", Some(Color::DarkGray), false));
                lines.push(Line::from(""));

                // 温度滑块
                let temp_indicator = if *cursor == 0 { " ◀ " } else { "   " };
                lines.push(centered_line(
                    format!("温度 (Temperature):"),
                    Some(if *cursor == 0 { Color::Cyan } else { Color::White }),
                    *cursor == 0,
                ));
                lines.push(centered_line(
                    format!("{}  {:.1}  ▶ 精确↔创造性", temp_indicator, temp_value),
                    Some(Color::DarkGray),
                    false,
                ));
                lines.push(Line::from(""));

                // 最大 Token 滑块
                let tokens_indicator = if *cursor == 1 { " ◀ " } else { "   " };
                lines.push(centered_line(
                    format!("最大 Token 数:"),
                    Some(if *cursor == 1 { Color::Cyan } else { Color::White }),
                    *cursor == 1,
                ));
                lines.push(centered_line(
                    format!("{}  {}  ▶  ←少  多→", tokens_indicator, tokens_value),
                    Some(Color::DarkGray),
                    false,
                ));
                lines.push(Line::from(""));

                // 语言选择
                let lang_indicator = if *cursor == 2 { " ◀ " } else { "   " };
                lines.push(centered_line(
                    format!("显示语言:"),
                    Some(if *cursor == 2 { Color::Cyan } else { Color::White }),
                    *cursor == 2,
                ));
                lines.push(centered_line(
                    format!("{}  {}  ▶", lang_indicator, lang_value),
                    Some(Color::DarkGray),
                    false,
                ));
                lines.push(Line::from(""));

                lines.push(centered_line("←→ 调值  Enter 完成  Esc 返回", Some(Color::DarkGray), false));
                lines
            }
            WizardStep::Completed => {
                vec![
                    Line::from(""),
                    centered_line("", None, false),
                    centered_line("  ✅ 设置完成！  ".to_string(), Some(Color::Green), true),
                    Line::from(""),
                    centered_line("已保存配置到 ~/.ifai/config.toml".to_string(), Some(Color::DarkGray), false),
                    centered_line("已部署内置 prompt 文件".to_string(), Some(Color::DarkGray), false),
                    centered_line("已部署内置 skill".to_string(), Some(Color::DarkGray), false),
                    Line::from(""),
                    centered_line("现在开始使用 IfAI！".to_string(), Some(Color::Cyan), true),
                    Line::from(""),
                    centered_line("按 Enter 继续...".to_string(), Some(Color::DarkGray), false),
                    Line::from(""),
                ]
            }
        }
    }
}

impl Default for SetupWizard {
    fn default() -> Self {
        Self::new()
    }
}

// ═══════════════════════════════════════════════════════════
// 渲染辅助函数
// ═══════════════════════════════════════════════════════════

fn centered_line(text: impl Into<String>, color: Option<Color>, bold: bool) -> Line<'static> {
    let mut style = Style::default();
    if let Some(c) = color {
        style = style.fg(c);
    }
    if bold {
        style = style.add_modifier(Modifier::BOLD);
    }
    Line::from(Span::styled(text.into(), style))
}

// ═══════════════════════════════════════════════════════════
// 测试
// ═══════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wizard_initial_state() {
        let wiz = SetupWizard::new();
        assert_eq!(wiz.current_step_name(), "SelectProvider");
        assert!(!wiz.is_completed());
    }

    #[test]
    fn test_wizard_navigation_down() {
        let mut wiz = SetupWizard::new();
        let action = wiz.handle_key(KeyCode::Down);
        assert_eq!(action, WizardAction::None);
        // cursor should be 1 now
        if let WizardStep::SelectProvider { cursor } = wiz.step {
            assert_eq!(cursor, 1, "按下 Down 后 cursor 应为 1");
        } else {
            panic!("应在 SelectProvider 步骤");
        }
    }

    #[test]
    fn test_wizard_select_provider_advances() {
        let mut wiz = SetupWizard::new();
        let action = wiz.handle_key(KeyCode::Enter);
        assert_eq!(action, WizardAction::Advance);
        assert_eq!(wiz.current_step_name(), "ConfigureModel");
        assert_eq!(
            wiz.selected_provider.as_deref(),
            Some("openai"),
            "应默认选择第一个服务商"
        );
    }

    #[test]
    fn test_wizard_skip_on_esc() {
        let mut wiz = SetupWizard::new();
        let action = wiz.handle_key(KeyCode::Esc);
        assert_eq!(action, WizardAction::Skip);
    }

    #[test]
    fn test_wizard_back_from_configure_model() {
        let mut wiz = SetupWizard::new();
        wiz.handle_key(KeyCode::Enter); // Advance to ConfigureModel
        let action = wiz.handle_key(KeyCode::Esc);
        assert_eq!(action, WizardAction::Back);
        assert_eq!(wiz.current_step_name(), "SelectProvider");
    }

    #[test]
    fn test_wizard_complete_flow() {
        let mut wiz = SetupWizard::new();
        // Step 1: Select provider
        wiz.handle_key(KeyCode::Enter);
        assert_eq!(wiz.current_step_name(), "ConfigureModel");

        // Step 2: Select model
        wiz.handle_key(KeyCode::Enter);
        assert_eq!(wiz.current_step_name(), "EnterApiKey");

        // Step 3: Enter API Key (跳过)
        wiz.handle_key(KeyCode::Enter);
        assert_eq!(wiz.current_step_name(), "SetPreferences");

        // Step 4: Confirm preferences
        let action = wiz.handle_key(KeyCode::Enter);
        assert_eq!(action, WizardAction::Complete);
        assert_eq!(wiz.current_step_name(), "Completed");
        assert!(wiz.is_completed());
    }

    #[test]
    fn test_wizard_dismiss_completed() {
        let mut wiz = SetupWizard::new();
        // 快速通关
        wiz.handle_key(KeyCode::Enter); // SelectProvider
        wiz.handle_key(KeyCode::Enter); // ConfigureModel
        wiz.handle_key(KeyCode::Enter); // EnterApiKey (跳过)
        wiz.handle_key(KeyCode::Enter); // SetPreferences
        assert!(wiz.is_completed());

        let action = wiz.handle_key(KeyCode::Enter);
        assert_eq!(action, WizardAction::Dismiss);
    }

    #[test]
    fn test_wizard_selected_provider_and_model() {
        let mut wiz = SetupWizard::new();
        wiz.handle_key(KeyCode::Enter); // Select OpenAI
        assert_eq!(wiz.selected_provider.as_deref(), Some("openai"));

        wiz.handle_key(KeyCode::Enter); // Select gpt-4o
        assert_eq!(wiz.selected_model.as_deref(), Some("gpt-4o"));
    }

    #[test]
    fn test_wizard_provider_list_bounds() {
        let mut wiz = SetupWizard::new();
        // 向下翻到底
        for _ in 0..10 {
            wiz.handle_key(KeyCode::Down);
        }
        if let WizardStep::SelectProvider { cursor } = wiz.step {
            assert_eq!(cursor, PROVIDERS.len() - 1, "不应超出列表范围");
        }

        // 向上翻到顶
        for _ in 0..10 {
            wiz.handle_key(KeyCode::Up);
        }
        if let WizardStep::SelectProvider { cursor } = wiz.step {
            assert_eq!(cursor, 0, "不应小于 0");
        }
    }

    #[test]
    fn test_wizard_render_returns_lines() {
        let wiz = SetupWizard::new();
        let lines = wiz.render();
        assert!(!lines.is_empty(), "渲染结果不应为空");
        // 应该包含标题
        let combined: String = lines.iter().map(|l| l.to_string()).collect();
        assert!(combined.contains("首次设置向导"), "应包含向导标题");
        assert!(combined.contains("步骤 1/3"), "应包含步骤信息");
    }

    #[test]
    fn test_wizard_render_configure_model() {
        let mut wiz = SetupWizard::new();
        wiz.handle_key(KeyCode::Enter); // Advance
        let lines = wiz.render();
        let combined: String = lines.iter().map(|l| l.to_string()).collect();
        assert!(combined.contains("步骤 2/3"), "应包含步骤 2 信息");
        assert!(combined.contains("OpenAI"), "应包含服务商名");
    }

    #[test]
    fn test_wizard_render_completed() {
        let mut wiz = SetupWizard::new();
        wiz.handle_key(KeyCode::Enter); // SelectProvider
        wiz.handle_key(KeyCode::Enter); // ConfigureModel
        wiz.handle_key(KeyCode::Enter); // EnterApiKey (跳过)
        wiz.handle_key(KeyCode::Enter); // SetPreferences
        let lines = wiz.render();
        let combined: String = lines.iter().map(|l| l.to_string()).collect();
        assert!(combined.contains("设置完成"), "应包含完成信息");
    }

    #[test]
    fn test_wizard_preferences_slider_bounds() {
        let mut wiz = SetupWizard::new();
        wiz.handle_key(KeyCode::Enter); // SelectProvider
        wiz.handle_key(KeyCode::Enter); // ConfigureModel
        wiz.handle_key(KeyCode::Enter); // EnterApiKey (跳过)

        // Should be at SetPreferences
        assert_eq!(wiz.current_step_name(), "SetPreferences");

        // Test temperature slider bounds
        if let WizardStep::SetPreferences { temperature_idx, .. } = wiz.step {
            assert_eq!(temperature_idx, 7, "初始温度 index 应为 7 (= 0.7)");
        }

        // Move right too many times
        for _ in 0..30 {
            wiz.handle_key(KeyCode::Right);
        }
        if let WizardStep::SetPreferences { temperature_idx, .. } = wiz.step {
            assert_eq!(temperature_idx, 20, "温度 index 不应超过 20");
        }

        // Move left too many times
        for _ in 0..30 {
            wiz.handle_key(KeyCode::Left);
        }
        if let WizardStep::SetPreferences { temperature_idx, .. } = wiz.step {
            assert_eq!(temperature_idx, 0, "温度 index 不应小于 0");
        }
    }

    #[test]
    fn test_wizard_preferences_saves_values() {
        let mut wiz = SetupWizard::new();
        wiz.handle_key(KeyCode::Enter); // SelectProvider
        wiz.handle_key(KeyCode::Enter); // ConfigureModel
        wiz.handle_key(KeyCode::Enter); // EnterApiKey (跳过)

        // 调整温度到 1.0 (index 10)
        for _ in 0..3 {
            wiz.handle_key(KeyCode::Down); // move cursor to max_tokens
        }
        for _ in 0..3 {
            wiz.handle_key(KeyCode::Up); // move cursor back to temperature
        }
        for _ in 0..3 {
            wiz.handle_key(KeyCode::Right); // increase temperature
        }
        // Move to max_tokens, increase, move to language
        wiz.handle_key(KeyCode::Down);
        for _ in 0..3 {
            wiz.handle_key(KeyCode::Right);
        }
        wiz.handle_key(KeyCode::Down);
        wiz.handle_key(KeyCode::Right); // language to 中文

        wiz.handle_key(KeyCode::Enter); // Complete

        assert_eq!(wiz.temperature, 1.0, "温度应为 1.0");
        assert_eq!(wiz.max_tokens, 5632, "max_tokens 应为 5632"); // 7 + 3 = 10 → 512+10*512=5632
        assert_eq!(wiz.language_idx, 1, "语言应为中文");
    }

    #[test]
    fn test_api_key_filters_chinese() {
        let mut wiz = SetupWizard::new();
        wiz.handle_key(KeyCode::Enter); // SelectProvider
        wiz.handle_key(KeyCode::Enter); // ConfigureModel

        // 输入中文字符（应被过滤）
        wiz.handle_key(KeyCode::Char('你'));
        wiz.handle_key(KeyCode::Char('好'));

        // 输入英文（应被接受）
        wiz.handle_key(KeyCode::Char('s'));
        wiz.handle_key(KeyCode::Char('k'));
        wiz.handle_key(KeyCode::Char('-'));
        wiz.handle_key(KeyCode::Char('1'));

        // 按 Backspace 删除
        wiz.handle_key(KeyCode::Backspace);

        if let WizardStep::EnterApiKey { input_buffer, .. } = &wiz.step {
            assert_eq!(input_buffer, "sk-", "中文字符应被过滤，英文应保留");
        }
    }

    #[test]
    fn test_models_for_known_providers() {
        let models = models_for("openai");
        assert!(models.contains(&"gpt-4o"));

        let models = models_for("Unknown");
        assert_eq!(models, &["unknown"]);
    }
}
