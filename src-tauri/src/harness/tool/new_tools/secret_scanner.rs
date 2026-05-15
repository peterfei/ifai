//! Secret Scanner 工具 — 检测代码中的敏感信息
//!
//! Phase 6B/6E: Git Commit Agent + Security Audit Agent 共用

use tool_macro::Tool;

/// Secret Scanner 工具
///
/// 扫描内容中的 API key、密码、token 等敏感信息
#[derive(Tool)]
#[tool(
    name = "secret_scanner",
    description = "扫描文本内容中的敏感信息（API key、密码、token）。传入 content 参数。",
    params(content: str)
)]
pub struct SecretScannerTool;

impl SecretScannerTool {
    pub fn execute_secret_scanner(&self, content: &str) -> Result<SecretScanOutput, SecretScanError> {
        let patterns: &[(&str, &str)] = &[
            ("OpenAI API Key", r"sk-[a-zA-Z0-9]{20,}"),
            ("AWS Access Key", r"AKIA[0-9A-Z]{16}"),
            ("AWS Secret Key", r"[A-Za-z0-9/+=]{40}"),
            ("Generic API Key", r#"(?i)(api[_-]?key|apikey)\s*[=:]\s*['"]?[a-zA-Z0-9]{20,}"#),
            ("Password", r#"(?i)(password|passwd|pwd)\s*[=:]\s*['"]?[^\s'"]{8,}"#),
            ("Private Key", r"-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----"),
            ("GitHub Token", r"gh[ps]_[a-zA-Z0-9]{36}"),
        ];

        let mut findings = Vec::new();

        for line in content.lines() {
            for (name, pattern) in patterns {
                if let Ok(re) = regex::Regex::new(pattern) {
                    if re.is_match(line) {
                        findings.push(SecretFinding {
                            kind: name.to_string(),
                            line_preview: line.chars().take(80).collect(),
                        });
                    }
                }
            }
        }

        Ok(SecretScanOutput { findings })
    }
}

#[derive(Debug, Clone)]
pub struct SecretFinding {
    pub kind: String,
    pub line_preview: String,
}

#[derive(Debug, Clone)]
pub struct SecretScanOutput {
    pub findings: Vec<SecretFinding>,
}

impl SecretScanOutput {
    pub fn to_output_string(&self) -> String {
        if self.findings.is_empty() {
            "clean — no secrets detected".to_string()
        } else {
            let mut out = format!("⚠️ Found {} potential secret(s):\n", self.findings.len());
            for f in &self.findings {
                out.push_str(&format!("  - [{}] {}\n", f.kind, f.line_preview));
            }
            out
        }
    }
}

impl std::fmt::Display for SecretScanOutput {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.to_output_string())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SecretScanError {
    #[error("Scan failed: {0}")]
    ScanFailed(String),
}
