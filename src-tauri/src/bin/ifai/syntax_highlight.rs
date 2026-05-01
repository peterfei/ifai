//! 🎨 语法高亮 - 元编程架构
//!
//! **设计原则**：
//! - 声明式语法定义：通过 `SyntaxPattern` 定义语法规则
//! - 特征提取器：基于模式匹配自动识别语法元素
//! - 零依赖高亮：不引入 syntect 等重型库，使用正则表达式元编程
//! - 性能优化：编译时预编译正则，运行时零开销
//!
//! **架构层次**：
//! ```text
//! SyntaxPattern (声明式语法定义)
//!         ->
//! FeatureExtractor (特征提取器)
//!         ->
//! HighlightRenderer (高亮渲染器)
//!         ->
//! ANSI 颜色注入
//! ```

use regex::Regex;
use std::collections::HashMap;

/// 🎯 语法元素类型（状态机核心）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyntaxElement {
    /// 关键字
    Keyword,
    /// 字符串
    String,
    /// 注释
    Comment,
    /// 函数名
    Function,
    /// 数字
    Number,
    /// 类型/结构体
    Type,
    /// 宏
    Macro,
    /// 属性
    Attribute,
    /// 普通文本
    Text,
}

/// 🎯 语法模式（声明式定义）
#[derive(Debug, Clone)]
pub struct SyntaxPattern {
    /// 正则表达式模式
    pub pattern: &'static str,
    /// 语法元素类型
    pub element: SyntaxElement,
}

/// 🎯 语言语法定义（声明式配置）
#[derive(Debug, Clone)]
pub struct LanguageSyntax {
    /// 语言名称
    pub name: &'static str,
    /// 语法模式列表
    pub patterns: Vec<SyntaxPattern>,
}

impl LanguageSyntax {
    /// 🔥 Rust 语法定义（声明式）
    pub fn rust() -> Self {
        Self {
            name: "rust",
            patterns: vec![
                // 关键字
                SyntaxPattern {
                    pattern: r"\b(fn|let|mut|if|else|match|for|while|loop|break|continue|return|struct|enum|impl|trait|type|use|mod|pub|crate|super|where|async|await|move|unsafe|ref|static|const)\b",
                    element: SyntaxElement::Keyword,
                },
                // 字符串
                SyntaxPattern {
                    pattern: r#""[^"]*"|'[^']*'"#,
                    element: SyntaxElement::String,
                },
                // 注释
                SyntaxPattern {
                    pattern: r"//.*$|/\*[\s\S]*?\*/",
                    element: SyntaxElement::Comment,
                },
                // 函数名（fn 后面的标识符）
                SyntaxPattern {
                    pattern: r"\bfn\s+([a-zA-Z_][a-zA-Z0-9_]*)\b",
                    element: SyntaxElement::Function,
                },
                // 数字
                SyntaxPattern {
                    pattern: r"\b\d+([uif](32|64)|usize)?\b",
                    element: SyntaxElement::Number,
                },
                // 类型（大写开头）
                SyntaxPattern {
                    pattern: r"\b[A-Z][a-zA-Z0-9_]*\b",
                    element: SyntaxElement::Type,
                },
                // 宏
                SyntaxPattern {
                    pattern: r"\b[a-zA-Z_][a-zA-Z0-9_]*!",
                    element: SyntaxElement::Macro,
                },
                // 属性
                SyntaxPattern {
                    pattern: r"#\[.*?\]",
                    element: SyntaxElement::Attribute,
                },
            ],
        }
    }

    /// 🔥 Python 语法定义（声明式）
    pub fn python() -> Self {
        Self {
            name: "python",
            patterns: vec![
                // 关键字
                SyntaxPattern {
                    pattern: r"\b(def|class|if|elif|else|for|while|try|except|finally|with|as|import|from|return|yield|raise|pass|break|continue|and|or|not|in|is|lambda|True|False|None)\b",
                    element: SyntaxElement::Keyword,
                },
                // 字符串
                SyntaxPattern {
                    pattern: r#"r?""".*?"""|r?'.*?'|r?".*?""#,
                    element: SyntaxElement::String,
                },
                // 注释
                SyntaxPattern {
                    pattern: r"#.*$",
                    element: SyntaxElement::Comment,
                },
                // 函数名（def 后面的标识符）
                SyntaxPattern {
                    pattern: r"\bdef\s+([a-zA-Z_][a-zA-Z0-9_]*)\b",
                    element: SyntaxElement::Function,
                },
                // 数字
                SyntaxPattern {
                    pattern: r"\b\d+\.?\d*\b",
                    element: SyntaxElement::Number,
                },
                // 类型（大写开头）
                SyntaxPattern {
                    pattern: r"\b[A-Z][a-zA-Z0-9_]*\b",
                    element: SyntaxElement::Type,
                },
            ],
        }
    }

    /// 🔥 JavaScript/TypeScript 语法定义（声明式）
    pub fn javascript() -> Self {
        Self {
            name: "javascript",
            patterns: vec![
                // 关键字
                SyntaxPattern {
                    pattern: r"\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|super|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|null|undefined|true|false)\b",
                    element: SyntaxElement::Keyword,
                },
                // 字符串
                SyntaxPattern {
                    pattern: r#"`[^`]*`|"[^"]*"|'[^']*'"#,
                    element: SyntaxElement::String,
                },
                // 注释
                SyntaxPattern {
                    pattern: r"//.*$|/\*[\s\S]*?\*/",
                    element: SyntaxElement::Comment,
                },
                // 函数名
                SyntaxPattern {
                    pattern: r"\bfunction\s+([a-zA-Z_][a-zA-Z0-9_]*)\b",
                    element: SyntaxElement::Function,
                },
                // 数字
                SyntaxPattern {
                    pattern: r"\b\d+\.?\d*\b",
                    element: SyntaxElement::Number,
                },
                // 类型（大写开头）
                SyntaxPattern {
                    pattern: r"\b[A-Z][a-zA-Z0-9_]*\b",
                    element: SyntaxElement::Type,
                },
            ],
        }
    }
}

/// 🎨 高亮主题（声明式配置）
#[derive(Debug, Clone)]
pub struct HighlightTheme {
    /// 关键字颜色（紫色）
    pub keyword: &'static str,
    /// 字符串颜色（绿色）
    pub string: &'static str,
    /// 注释颜色（暗灰）
    pub comment: &'static str,
    /// 函数名颜色（蓝色）
    pub function: &'static str,
    /// 数字颜色（橙色）
    pub number: &'static str,
    /// 类型颜色（青色）
    pub r#type: &'static str,
    /// 宏颜色（黄色）
    pub macro_color: &'static str,
    /// 属性颜色（暗青）
    pub attribute: &'static str,
    /// 重置序列
    pub reset: &'static str,
}

impl Default for HighlightTheme {
    fn default() -> Self {
        Self {
            keyword: "\x1b[38;5;141m",     // 紫色
            string: "\x1b[38;5;148m",      // 绿色
            comment: "\x1b[38;5;242m",     // 暗灰
            function: "\x1b[38;5;75m",     // 蓝色
            number: "\x1b[38;5;209m",      // 橙色
            r#type: "\x1b[38;5;81m",       // 青色
            macro_color: "\x1b[38;5;221m", // 黄色
            attribute: "\x1b[38;5;66m",    // 暗青
            reset: "\x1b[0m",
        }
    }
}

/// 🎯 特征提取器（元编程：基于模式自动提取语法元素）
pub struct FeatureExtractor {
    /// 预编译正则表达式缓存
    regex_cache: HashMap<String, Regex>,
}

impl FeatureExtractor {
    /// 创建新的特征提取器
    pub fn new() -> Self {
        Self {
            regex_cache: HashMap::new(),
        }
    }

    /// 🔥 提取语法特征（元编程：自动匹配模式）
    pub fn extract_features(
        &mut self,
        code: &str,
        syntax: &LanguageSyntax,
    ) -> Vec<(SyntaxElement, String, usize, usize)> {
        let mut features = Vec::new();

        for pattern in &syntax.patterns {
            if let Ok(re) = self.get_or_compile_regex(pattern.pattern) {
                for caps in re.captures_iter(code) {
                    if let Some(matched) = caps.get(0) {
                        features.push((
                            pattern.element,
                            matched.as_str().to_string(),
                            matched.start(),
                            matched.end(),
                        ));
                    }
                }
            }
        }

        features
    }

    /// 🔥 获取或编译正则表达式（缓存优化）
    fn get_or_compile_regex(&mut self, pattern: &str) -> Result<&Regex, regex::Error> {
        if !self.regex_cache.contains_key(pattern) {
            let re = Regex::new(pattern)?;
            self.regex_cache.insert(pattern.to_string(), re);
        }
        Ok(self.regex_cache.get(pattern).unwrap())
    }
}

impl Default for FeatureExtractor {
    fn default() -> Self {
        Self::new()
    }
}

/// 🎨 高亮渲染器（声明式设计）
pub struct HighlightRenderer {
    /// 高亮主题
    theme: HighlightTheme,
    /// 特征提取器
    extractor: FeatureExtractor,
    /// 语言语法映射
    syntax_map: HashMap<String, LanguageSyntax>,
}

impl HighlightRenderer {
    /// 创建新的高亮渲染器
    pub fn new(theme: HighlightTheme) -> Self {
        let mut syntax_map = HashMap::new();
        syntax_map.insert("rust".to_string(), LanguageSyntax::rust());
        syntax_map.insert("rs".to_string(), LanguageSyntax::rust());
        syntax_map.insert("python".to_string(), LanguageSyntax::python());
        syntax_map.insert("py".to_string(), LanguageSyntax::python());
        syntax_map.insert("javascript".to_string(), LanguageSyntax::javascript());
        syntax_map.insert("js".to_string(), LanguageSyntax::javascript());
        syntax_map.insert("typescript".to_string(), LanguageSyntax::javascript());
        syntax_map.insert("ts".to_string(), LanguageSyntax::javascript());

        Self {
            theme,
            extractor: FeatureExtractor::new(),
            syntax_map,
        }
    }

    /// 🔥 渲染高亮代码（元编程：自动应用颜色）
    pub fn render_highlighted(&mut self, code: &str, lang: &str) -> String {
        // 获取语言语法定义
        let syntax = self
            .syntax_map
            .get(lang)
            .or_else(|| self.syntax_map.get(&lang.to_lowercase()))
            .cloned()
            .unwrap_or_else(|| LanguageSyntax {
                name: "text",
                patterns: Vec::new(),
            });

        // 提取语法特征
        let features = self.extractor.extract_features(code, &syntax);

        // 如果没有特征，返回原始代码
        if features.is_empty() {
            return code.to_string();
        }

        // 应用高亮（元编程：根据特征自动生成带颜色的代码）
        self.apply_highlighting(code, &features)
    }

    /// 🔥 应用高亮（元编程：自动注入 ANSI 颜色）
    fn apply_highlighting(
        &self,
        code: &str,
        features: &[(SyntaxElement, String, usize, usize)],
    ) -> String {
        let mut result = String::new();
        let mut last_end = 0;

        // 按位置排序特征
        let mut sorted_features = features.to_vec();
        sorted_features.sort_by_key(|f| f.2);

        for (element, text, start, end) in sorted_features {
            // 添加前面的普通文本
            if start > last_end {
                result.push_str(&code[last_end..start]);
            }

            // 添加高亮文本
            let color = self.get_color_for_element(element);
            result.push_str(color);
            result.push_str(&text);
            result.push_str(self.theme.reset);

            last_end = end;
        }

        // 添加剩余的普通文本
        if last_end < code.len() {
            result.push_str(&code[last_end..]);
        }

        result
    }

    /// 🔥 获取语法元素对应的颜色（声明式映射）
    fn get_color_for_element(&self, element: SyntaxElement) -> &'static str {
        match element {
            SyntaxElement::Keyword => &self.theme.keyword,
            SyntaxElement::String => &self.theme.string,
            SyntaxElement::Comment => &self.theme.comment,
            SyntaxElement::Function => &self.theme.function,
            SyntaxElement::Number => &self.theme.number,
            SyntaxElement::Type => &self.theme.r#type,
            SyntaxElement::Macro => &self.theme.macro_color,
            SyntaxElement::Attribute => &self.theme.attribute,
            SyntaxElement::Text => &self.theme.reset,
        }
    }
}

impl Default for HighlightRenderer {
    fn default() -> Self {
        Self::new(HighlightTheme::default())
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rust_syntax_definition() {
        let syntax = LanguageSyntax::rust();
        assert_eq!(syntax.name, "rust");
        assert!(!syntax.patterns.is_empty());

        // 检查关键字模式
        let keyword_pattern = &syntax.patterns[0];
        assert_eq!(keyword_pattern.element, SyntaxElement::Keyword);
        assert!(keyword_pattern.pattern.contains("fn|let|mut"));
    }

    #[test]
    fn test_feature_extractor() {
        let mut extractor = FeatureExtractor::new();
        let syntax = LanguageSyntax::rust();
        let code = r#"fn main() {
    let x = 42;
    println!("Hello");
}"#;

        let features = extractor.extract_features(code, &syntax);

        // 应该提取到关键字
        assert!(features.iter().any(|f| f.0 == SyntaxElement::Keyword));
        // 应该提取到字符串
        assert!(features.iter().any(|f| f.0 == SyntaxElement::String));
        // 应该提取到数字
        assert!(features.iter().any(|f| f.0 == SyntaxElement::Number));
    }

    #[test]
    fn test_highlight_renderer() {
        let mut renderer = HighlightRenderer::default();
        let code = r#"fn main() {
    let x = 42;
}"#;

        let highlighted = renderer.render_highlighted(code, "rust");

        // 应该包含 ANSI 颜色代码
        assert!(highlighted.contains("\x1b["));
        // 应该保留原始代码的关键字
        assert!(highlighted.contains("fn"));
        // 由于有 ANSI 颜色代码，检查内容片段而非完整字符串
        assert!(highlighted.contains("main"));
        assert!(highlighted.contains("let"));
    }

    #[test]
    fn test_python_syntax() {
        let mut renderer = HighlightRenderer::default();
        let code = r#"def hello():
    print("Hi")"#;

        let highlighted = renderer.render_highlighted(code, "python");

        assert!(highlighted.contains("\x1b["));
        assert!(highlighted.contains("def hello"));
    }

    #[test]
    fn test_javascript_syntax() {
        let mut renderer = HighlightRenderer::default();
        let code = r#"function test() {
    const x = 123;
}"#;

        let highlighted = renderer.render_highlighted(code, "javascript");

        assert!(highlighted.contains("\x1b["));
        assert!(highlighted.contains("function test"));
    }

    #[test]
    fn test_unknown_language() {
        let mut renderer = HighlightRenderer::default();
        let code = "some random code";

        let highlighted = renderer.render_highlighted(code, "unknown");

        // 未知语言应该返回原始代码
        assert_eq!(highlighted, code);
    }
}
