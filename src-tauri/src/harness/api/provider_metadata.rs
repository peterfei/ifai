//! 提供商元数据定义
//!
//! 🏛️ 元编程架构：代码即数据，配置驱动行为

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

/// 全局提供商注册表（单例）
static PROVIDER_REGISTRY: OnceLock<HashMap<String, ProviderSpec>> = OnceLock::new();

/// 🏛️ 元编程：初始化提供商注册表
/// 从嵌入的 YAML 文件加载所有提供商配置
fn init_provider_registry() -> &'static HashMap<String, ProviderSpec> {
    PROVIDER_REGISTRY.get_or_init(|| {
        let mut registry = HashMap::new();

        // 🔥 从嵌入的 YAML 文件加载提供商配置
        // 注意：这些文件在编译时被嵌入到二进制中
        let yaml_files = vec![
            (
                "openai-official",
                include_str!("../../../providers/registry/openai-official.yaml"),
            ),
            (
                "zhipu-official",
                include_str!("../../../providers/registry/zhipu-official.yaml"),
            ),
            (
                "deepseek-official",
                include_str!("../../../providers/registry/deepseek-official.yaml"),
            ),
            (
                "kimi-official",
                include_str!("../../../providers/registry/kimi-official.yaml"),
            ),
            (
                "gemini-official",
                include_str!("../../../providers/registry/gemini-official.yaml"),
            ),
        ];

        for (filename, yaml_content) in yaml_files {
            match serde_yaml::from_str::<ProviderSpec>(yaml_content) {
                Ok(spec) => {
                    let provider_id = spec.metadata.id.clone();
                    registry.insert(provider_id, spec);
                }
                Err(e) => {
                    eprintln!("Failed to parse {}: {}", filename, e);
                }
            }
        }

        registry
    })
}

/// 🏛️ 元编程：获取所有提供商规格
pub fn get_all_provider_specs() -> &'static HashMap<String, ProviderSpec> {
    init_provider_registry()
}

/// 🏛️ 元编程：根据 ID 获取提供商规格
pub fn get_provider_spec(id: &str) -> Option<&'static ProviderSpec> {
    get_all_provider_specs().get(id)
}

/// 🏛️ 元编程：获取所有提供商的模型信息
pub fn get_all_models_from_specs() -> Vec<crate::harness::api::types::ModelInfo> {
    get_all_provider_specs()
        .values()
        .flat_map(|spec| {
            spec.models
                .iter()
                .map(|m| crate::harness::api::types::ModelInfo {
                    id: m.id.clone(),
                    name: m.name.clone(),
                    context_tokens: m.context_tokens,
                })
        })
        .collect()
}

/// 🏛️ 元编程：根据提供商 ID 获取模型列表
/// 🔥 用途：替换各个 provider 中硬编码的 list_models() 实现
pub fn get_models_for_provider(
    provider_id: &str,
) -> Option<Vec<crate::harness::api::types::ModelInfo>> {
    get_provider_spec(provider_id).map(|spec| {
        spec.models
            .iter()
            .map(|m| crate::harness::api::types::ModelInfo {
                id: m.id.clone(),
                name: m.name.clone(),
                context_tokens: m.context_tokens,
            })
            .collect()
    })
}

/// 提供商元数据规范（核心数据结构）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderSpec {
    /// 提供商元信息
    pub metadata: ProviderMetadata,
    /// API 规范
    pub api_spec: ApiSpec,
    /// 请求格式规范
    pub request_format: RequestFormat,
    /// 响应格式规范
    pub response_format: ResponseFormat,
    /// 支持的模型列表
    pub models: Vec<ModelSpec>,
    /// 错误码映射
    #[serde(default)]
    pub error_mapping: HashMap<u16, String>,
}

/// 提供商元信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderMetadata {
    /// 提供商唯一标识
    pub id: String,
    /// 提供商显示名称
    pub name: String,
    /// 协议类型
    pub protocol: String,
    /// 🏛️ 声明式标签：用于匹配行为规则（如 needs_todowrite_guidance, needs_identity_hint）
    #[serde(default)]
    pub tags: Vec<String>,
}

/// API 规范
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiSpec {
    /// 基础 URL
    pub base_url: String,
    /// 端点路径
    pub endpoint: String,
    /// 认证方式
    pub auth: AuthSpec,
}

/// 认证规范
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AuthSpec {
    /// Bearer Token in Header
    #[serde(rename = "bearer_header")]
    BearerHeader { header_name: String, format: String },
    /// Query Parameter
    #[serde(rename = "query_param")]
    QueryParam { param_name: String },
}

/// 请求格式规范
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestFormat {
    /// 格式类型
    #[serde(rename = "type")]
    pub format_type: String,
    /// 消息包装字段
    pub messages_wrapper: String,
    /// 系统提示词处理方式
    pub system_prompt_handling: String,
    /// 工具字段名称（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools_field: Option<String>,
}

/// 响应格式规范
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseFormat {
    /// 响应类型
    #[serde(rename = "type")]
    pub response_type: String,
    /// 流解析器类型
    pub stream_parser: String,
    /// 内容提取路径
    pub content_extraction: String,
}

/// 模型规范
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelSpec {
    /// 模型 ID
    pub id: String,
    /// 模型显示名称
    pub name: String,
    /// 上下文窗口大小（tokens）
    pub context_tokens: u32,
    /// 能力列表
    #[serde(default)]
    pub capabilities: Vec<String>,
    /// 每 1K tokens 成本（可选，简单定价如 OpenAI/Kimi）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_per_1k_tokens: Option<f64>,
    /// 🔥 详细定价（可选，支持 DeepSeek/Gemini 分离定价）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_per_1k_tokens_input_cache_hit: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_per_1k_tokens_input_cache_miss: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_per_1k_tokens_output: Option<f64>,
    /// 标签
    #[serde(default)]
    pub tags: Vec<String>,
}

// ============================================================================
// 🏛️ 声明式行为规则系统：代码即数据，配置驱动行为
// ============================================================================

/// 行为规则片段 — 声明式数据结构，替代 if is_zhipu { push_str(...) } 命令式逻辑
struct PromptRule {
    /// 规则唯一标识
    id: &'static str,
    /// 匹配 provider tags（空数组 = 所有 provider 都匹配）
    tags: &'static [&'static str],
    /// 注入优先级（越大越先注入）
    priority: u8,
    /// 提示词模板，支持 {provider} 占位符
    content: &'static str,
}

/// 全局行为规则表 — 单一数据源，session.rs 和 lib.rs 共用
const BEHAVIOR_RULES: &[PromptRule] = &[
    // --- 所有 provider 都适用的通用规则 ---
    PromptRule {
        id: "tool_call_rules",
        tags: &[],
        priority: 10,
        content: "\
# Tool Call Rules (CRITICAL)\n\
1. Every tool call MUST include all required parameters in the arguments JSON\n\
2. If a tool call fails, fix the parameters or change your approach — DO NOT retry with the same or empty arguments\n\
3. After calling TodoWrite, immediately execute the first task — do NOT stop or call TodoWrite again\n\
4. NO REPETITION: If you see a tool result in conversation history, DO NOT call that tool again for the same purpose",
    },
    PromptRule {
        id: "tool_priority",
        tags: &[],
        priority: 5,
        content: "\
# IMPORTANT: WHEN TO USE TOOLS\n\
You have access to SPECIALIZED TOOLS. ALWAYS prefer them over generic bash:\n\n\
## File Operations (PREFER THESE OVER BASH)\n\
1. read_file - Read file contents (PREFER over 'cat' in bash)\n\
2. write_file - Write/create files (PREFER over 'echo' in bash)\n\
3. edit_file - Edit/replace text in files (PREFER over 'sed' in bash)\n\
4. glob_search - Find files by pattern (PREFER over 'find' in bash)\n\
5. grep_search - Search text in files (PREFER over 'grep' in bash)\n\n\
## Task Management\n\
DO NOT create a file with agent_write_file - this creates a messy text file!\n\
ALWAYS use the TodoWrite tool instead - this creates a proper interactive task panel!\n\n\
## When to use bash\n\
- Only use bash for system queries (pwd, date, uname) or complex shell scripts\n\
- For file operations, ALWAYS use the specialized tools above",
    },
    // --- 需要增强引导的 provider（通过 tags 匹配）---
    PromptRule {
        id: "identity_hint",
        tags: &["needs_identity_hint"],
        priority: 30,
        content: "\
**Your Identity:** You are IfAI, a professional AI coding assistant powered by {provider} model.\n\n\
**Your Capabilities:**\n\
- Code writing, analysis and optimization\n\
- Multi-language support (Rust, Python, JavaScript, Go, etc.)\n\
- Problem diagnosis and debugging\n\
- Architecture design and best practices\n\
- **Tool calling (file operations, task management, etc.)**",
    },
    PromptRule {
        id: "todowrite_mandatory",
        tags: &["needs_todowrite_guidance"],
        priority: 25,
        content: "\
# MANDATORY: Always Use TodoWrite First!\n\
For ANY task that involves multiple steps or operations, you MUST:\n\
1. First call the TodoWrite tool to create a task list\n\
2. Then execute the tasks one by one\n\
3. Continue working until ALL tasks are complete\n\
4. DO NOT STOP after creating the task list!\n\n\
Examples of tasks that require TodoWrite:\n\
- Creating a new feature (login, dashboard, etc.)\n\
- Building a complete application\n\
- Multiple file modifications\n\
- Code refactoring across multiple files\n\
- Setting up project infrastructure\n\n\
FORBIDDEN: Stopping after TodoWrite — Users want RESULTS, not just task lists!",
    },
    PromptRule {
        id: "todowrite_continuation",
        tags: &["needs_todowrite_guidance"],
        priority: 20,
        content: "\
# CRITICAL WORKFLOW - After TodoWrite\n\
1. DO NOT STOP! Do NOT send finish_reason: stop!\n\
2. Continue immediately: \"Now let me start with the first task: [name]\"\n\
3. Execute the task (call write_file, read_file, etc.)\n\
4. Continue with remaining tasks one by one\n\
5. Keep working until ALL tasks are complete!\n\n\
FORBIDDEN: Stopping after tool calls!\n\
REQUIRED: Always continue with more content after tools!\n\
Remember: Users want you to DO the work, not just plan it!",
    },
    // --- 所有 provider 的通用 continuation 规则（较弱版本）---
    PromptRule {
        id: "continuation_basic",
        tags: &[],
        priority: 8,
        content: "\
# CRITICAL: Always Continue After Tools\n\
FORBIDDEN: Stopping after tool calls!\n\
REQUIRED: Always continue with more content after tools!\n\
After calling TodoWrite, immediately execute the first task — do NOT stop!",
    },
];

/// 🏛️ 声明式：根据 provider spec 的 tags 构建行为提示词
/// 替代 session.rs / lib.rs 中的 `if is_zhipu { push_str(...) }` 命令式逻辑
///
/// # 参数
/// - `provider_id`: provider 标识（如 "zhipu-official"），用于 {provider} 占位符
/// - `provider_name`: provider 显示名称（如 "Zhipu AI (智谱)"）
/// - `provider_tags`: provider metadata.tags（声明式标签匹配）
/// - `root`: 工作目录（{root} 占位符）
///
/// # 用法
/// ```rust
/// // session.rs / lib.rs 中替代 if is_zhipu { ... } 逻辑
/// let prompt = provider_metadata::build_behavior_prompt(
///     &spec.metadata.id, &spec.metadata.name, &spec.metadata.tags, &root
/// );
/// ```
pub fn build_behavior_prompt(
    provider_id: &str,
    provider_name: &str,
    provider_tags: &[String],
    root: &str,
) -> String {
    // 按优先级降序排列匹配的规则
    let mut matched: Vec<&PromptRule> = BEHAVIOR_RULES
        .iter()
        .filter(|r| {
            r.tags.is_empty()
                || r.tags
                    .iter()
                    .any(|tag| provider_tags.iter().any(|pt| pt == tag))
        })
        .collect();
    matched.sort_by_key(|r| std::cmp::Reverse(r.priority));

    let mut sections = Vec::with_capacity(matched.len() + 1);

    // 第一段：工作目录声明
    sections.push(format!(
        "# Current Working Directory\n\
         **Current Project Directory:** `{}`\n\
         **Important:** All file operations are relative to this directory.",
        root
    ));

    // 声明式规则注入
    for rule in matched {
        let content = rule
            .content
            .replace("{provider}", provider_name)
            .replace("{provider_id}", provider_id);
        sections.push(content);
    }

    sections.join("\n\n")
}

#[cfg(test)]
mod tests_behavior_prompt {
    use super::*;

    #[test]
    fn test_behavior_prompt_all_providers_get_basic_rules() {
        // 无 tags 的 provider 应该获得通用规则（tool_call_rules + tool_priority + continuation_basic）
        let prompt = build_behavior_prompt("openai-official", "OpenAI", &[], "/tmp/test");
        assert!(prompt.contains("Tool Call Rules (CRITICAL)"));
        assert!(prompt.contains("WHEN TO USE TOOLS"));
        assert!(prompt.contains("Always Continue After Tools"));
        assert!(prompt.contains("/tmp/test"));
        // 不应包含 tag 专属规则
        assert!(!prompt.contains("MANDATORY: Always Use TodoWrite First"));
        assert!(!prompt.contains("Your Identity:"));
    }

    #[test]
    fn test_behavior_prompt_zhipu_gets_enhanced_rules() {
        // zhipu tags → needs_todowrite_guidance + needs_identity_hint
        let tags = vec![
            "needs_todowrite_guidance".to_string(),
            "needs_identity_hint".to_string(),
        ];
        let prompt = build_behavior_prompt("zhipu-official", "Zhipu AI (智谱)", &tags, "/tmp/test");
        // 增强规则
        assert!(prompt.contains("MANDATORY: Always Use TodoWrite First"));
        assert!(prompt.contains("CRITICAL WORKFLOW - After TodoWrite"));
        assert!(prompt.contains("powered by Zhipu AI (智谱) model"));
        // 通用规则也在
        assert!(prompt.contains("Tool Call Rules (CRITICAL)"));
        assert!(prompt.contains("WHEN TO USE TOOLS"));
    }

    #[test]
    fn test_behavior_prompt_deepseek_gets_todowrite_but_no_identity() {
        let tags = vec!["needs_todowrite_guidance".to_string()];
        let prompt = build_behavior_prompt("deepseek-official", "DeepSeek", &tags, "/tmp/test");
        assert!(prompt.contains("MANDATORY: Always Use TodoWrite First"));
        assert!(!prompt.contains("Your Identity:"));
    }

    #[test]
    fn test_behavior_prompt_priority_ordering() {
        let tags = vec!["needs_identity_hint".to_string()];
        let prompt = build_behavior_prompt("test", "TestProvider", &tags, "/tmp/test");
        // identity_hint priority=30 应在 tool_call_rules priority=10 之前
        let identity_pos = prompt.find("Your Identity:").unwrap();
        let tool_rules_pos = prompt.find("Tool Call Rules (CRITICAL)").unwrap();
        assert!(
            identity_pos < tool_rules_pos,
            "identity_hint should appear before tool_call_rules"
        );
    }

    #[test]
    fn test_behavior_prompt_provider_placeholder() {
        let tags = vec!["needs_identity_hint".to_string()];
        let prompt = build_behavior_prompt("kimi-official", "Kimi (Moonshot AI)", &tags, "/root");
        assert!(prompt.contains("powered by Kimi (Moonshot AI) model"));
        assert!(prompt.contains("/root"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_openai_spec() {
        let yaml = r#"
metadata:
  id: openai-official
  name: OpenAI
  protocol: openai

api_spec:
  base_url: https://api.openai.com/v1
  endpoint: /chat/completions
  auth:
    type: bearer_header
    header_name: Authorization
    format: "Bearer {key}"

request_format:
  type: openai_standard
  messages_wrapper: messages
  system_prompt_handling: separate_message
  tools_field: tools

response_format:
  type: sse
  stream_parser: openai_sse
  content_extraction: delta.content

models:
  - id: gpt-4o
    name: GPT-4o
    context_tokens: 128000
    capabilities: [vision, tools, streaming]
    cost_per_1k_tokens: 0.005

error_mapping:
  401: authentication_error
  429: rate_limit_error
"#;

        let spec: ProviderSpec = serde_yaml::from_str(yaml).expect("Failed to parse YAML");

        assert_eq!(spec.metadata.id, "openai-official");
        assert_eq!(spec.metadata.name, "OpenAI");
        assert_eq!(spec.metadata.protocol, "openai");

        // 验证 API 规范
        assert_eq!(spec.api_spec.base_url, "https://api.openai.com/v1");
        assert_eq!(spec.api_spec.endpoint, "/chat/completions");

        // 验证认证方式
        match &spec.api_spec.auth {
            AuthSpec::BearerHeader {
                header_name,
                format,
            } => {
                assert_eq!(header_name, "Authorization");
                assert_eq!(format, "Bearer {key}");
            }
            _ => panic!("Expected BearerHeader auth"),
        }

        // 验证请求格式
        assert_eq!(spec.request_format.format_type, "openai_standard");
        assert_eq!(spec.request_format.messages_wrapper, "messages");
        assert_eq!(spec.request_format.tools_field, Some("tools".to_string()));

        // 验证模型
        assert_eq!(spec.models.len(), 1);
        assert_eq!(spec.models[0].id, "gpt-4o");
        assert_eq!(spec.models[0].context_tokens, 128000);
        assert_eq!(
            spec.models[0].capabilities,
            vec!["vision", "tools", "streaming"]
        );
        assert_eq!(spec.models[0].cost_per_1k_tokens, Some(0.005));

        // 验证错误映射
        assert_eq!(
            spec.error_mapping.get(&401),
            Some(&"authentication_error".to_string())
        );
        assert_eq!(
            spec.error_mapping.get(&429),
            Some(&"rate_limit_error".to_string())
        );
    }

    #[test]
    fn test_deserialize_zhipu_spec() {
        let yaml = r#"
metadata:
  id: zhipu-official
  name: Zhipu AI (智谱)
  protocol: openai

api_spec:
  base_url: https://open.bigmodel.cn/api/paas/v4
  endpoint: /chat/completions
  auth:
    type: bearer_header
    header_name: Authorization
    format: "Bearer {key}"

request_format:
  type: openai_standard
  messages_wrapper: messages
  system_prompt_handling: separate_message
  tools_field: tools

response_format:
  type: sse
  stream_parser: openai_sse
  content_extraction: delta.content

models:
  - id: glm-5.1
    name: GLM-5.1
    context_tokens: 128000
    capabilities: [tools, streaming, vision]
    cost_per_1k_tokens: 0.012
    tags: [latest, premium]
  - id: glm-4.7
    name: GLM-4.7
    context_tokens: 128000
    capabilities: [tools, streaming]
    cost_per_1k_tokens: 0.005

error_mapping:
  401: authentication_error
  402: quota_exceeded
  429: rate_limit_error
"#;

        let spec: ProviderSpec = serde_yaml::from_str(yaml).expect("Failed to parse YAML");

        assert_eq!(spec.metadata.id, "zhipu-official");
        assert_eq!(spec.metadata.protocol, "openai");

        // 验证 GLM-5.1 模型
        let glm51 = spec
            .models
            .iter()
            .find(|m| m.id == "glm-5.1")
            .expect("GLM-5.1 not found");
        assert_eq!(glm51.name, "GLM-5.1");
        assert_eq!(glm51.tags, vec!["latest", "premium"]);
        assert!(glm51.capabilities.contains(&"vision".to_string()));

        // 验证错误映射包含 402
        assert_eq!(
            spec.error_mapping.get(&402),
            Some(&"quota_exceeded".to_string())
        );
    }

    #[test]
    fn test_deserialize_kimi_spec() {
        let yaml = r#"
metadata:
  id: kimi-official
  name: Kimi (Moonshot AI)
  protocol: openai

api_spec:
  base_url: https://api.moonshot.cn/v1
  endpoint: /chat/completions
  auth:
    type: bearer_header
    header_name: Authorization
    format: "Bearer {key}"

request_format:
  type: openai_standard
  messages_wrapper: messages
  system_prompt_handling: separate_message
  tools_field: tools

response_format:
  type: sse
  stream_parser: openai_sse
  content_extraction: delta.content

models:
  - id: moonshot-v1-k2.6
    name: Moonshot V1 K2.6
    context_tokens: 128000
    capabilities: [tools, streaming, vision]
    cost_per_1k_tokens: 0.012
    tags: [latest, premium]
  - id: moonshot-v1-128k
    name: Moonshot V1 128K
    context_tokens: 128000
    capabilities: [tools, streaming]
    cost_per_1k_tokens: 0.012
  - id: moonshot-v1-32k
    name: Moonshot V1 32K
    context_tokens: 32000
    capabilities: [tools, streaming]
    cost_per_1k_tokens: 0.008
  - id: moonshot-v1-8k
    name: Moonshot V1 8K
    context_tokens: 8000
    capabilities: [tools, streaming]
    cost_per_1k_tokens: 0.003
"#;

        let spec: ProviderSpec = serde_yaml::from_str(yaml).expect("Failed to parse YAML");

        assert_eq!(spec.metadata.id, "kimi-official");
        assert_eq!(spec.models.len(), 4);

        // 验证 K2.6 模型
        let k26 = spec
            .models
            .iter()
            .find(|m| m.id == "moonshot-v1-k2.6")
            .expect("K2.6 not found");
        assert_eq!(k26.tags, vec!["latest", "premium"]);

        // 验证不同上下文长度
        assert_eq!(spec.models[0].context_tokens, 128000); // K2.6
        assert_eq!(spec.models[1].context_tokens, 128000); // 128K
        assert_eq!(spec.models[2].context_tokens, 32000); // 32K
        assert_eq!(spec.models[3].context_tokens, 8000); // 8K
    }

    #[test]
    fn test_deserialize_gemini_spec() {
        let yaml = r#"
metadata:
  id: gemini-official
  name: Google Gemini
  protocol: gemini

api_spec:
  base_url: https://generativelanguage.googleapis.com/v1beta
  endpoint: /models/{model}:streamGenerateContent
  auth:
    type: query_param
    param_name: key

request_format:
  type: gemini_custom
  messages_wrapper: contents
  system_prompt_handling: prefix_in_user
  system_prompt_prefix: "System: "

response_format:
  type: sse
  stream_parser: gemini_sse
  content_extraction: parts.0.text

models:
  - id: gemini-2.0-flash-exp
    name: Gemini 2.0 Flash Experimental
    context_tokens: 1000000
    capabilities: [streaming]
    cost_per_1k_tokens: 0
    tags: [free, experimental]
"#;

        let spec: ProviderSpec = serde_yaml::from_str(yaml).expect("Failed to parse YAML");

        assert_eq!(spec.metadata.protocol, "gemini");

        // 验证 Gemini 使用 query param 认证
        match &spec.api_spec.auth {
            AuthSpec::QueryParam { param_name } => {
                assert_eq!(param_name, "key");
            }
            _ => panic!("Expected QueryParam auth"),
        }

        // 验证 Gemini 不同的请求格式
        assert_eq!(spec.request_format.format_type, "gemini_custom");
        assert_eq!(spec.request_format.messages_wrapper, "contents");
        assert_eq!(spec.request_format.system_prompt_handling, "prefix_in_user");

        // 验证免费标签
        assert_eq!(spec.models[0].tags, vec!["free", "experimental"]);
    }

    #[test]
    fn test_load_provider_from_file() {
        // 🏛️ 元编程：从文件加载提供商配置
        // 这个测试验证从 YAML 文件加载的功能

        // 注意：这个测试使用内联 YAML，实际使用时会从文件读取
        let yaml_content = r#"
metadata:
  id: test-provider
  name: Test Provider
  protocol: openai

api_spec:
  base_url: https://api.test.com/v1
  endpoint: /chat/completions
  auth:
    type: bearer_header
    header_name: Authorization
    format: "Bearer {key}"

request_format:
  type: openai_standard
  messages_wrapper: messages
  system_prompt_handling: separate_message

response_format:
  type: sse
  stream_parser: openai_sse
  content_extraction: delta.content

models:
  - id: test-model
    name: Test Model
    context_tokens: 128000
    capabilities: [streaming]
"#;

        let spec: ProviderSpec =
            serde_yaml::from_str(yaml_content).expect("Failed to parse provider spec from YAML");

        assert_eq!(spec.metadata.id, "test-provider");
        assert_eq!(spec.models.len(), 1);
        assert_eq!(spec.models[0].id, "test-model");
    }

    #[test]
    fn test_provider_spec_to_internal_types() {
        // 🏛️ 元编程：验证 ProviderSpec 可以转换为内部类型

        let yaml = r#"
metadata:
  id: openai-test
  name: OpenAI Test
  protocol: openai

api_spec:
  base_url: https://api.openai.com/v1
  endpoint: /chat/completions
  auth:
    type: bearer_header
    header_name: Authorization
    format: "Bearer {key}"

request_format:
  type: openai_standard
  messages_wrapper: messages
  system_prompt_handling: separate_message

response_format:
  type: sse
  stream_parser: openai_sse
  content_extraction: delta.content

models:
  - id: gpt-4o
    name: GPT-4o
    context_tokens: 128000
    capabilities: [vision, tools, streaming]
"#;

        let spec: ProviderSpec = serde_yaml::from_str(yaml).unwrap();

        // 验证可以提取 ModelInfo
        let model_info: crate::harness::api::types::ModelInfo =
            crate::harness::api::types::ModelInfo {
                id: spec.models[0].id.clone(),
                name: spec.models[0].name.clone(),
                context_tokens: spec.models[0].context_tokens,
            };

        assert_eq!(model_info.id, "gpt-4o");
        assert_eq!(model_info.name, "GPT-4o");
        assert_eq!(model_info.context_tokens, 128000);
    }

    #[test]
    fn test_provider_registry() {
        // 🏛️ 元编程：测试提供商注册表
        // 验证可以注册多个提供商并获取所有模型

        use std::collections::HashMap;

        let mut registry = HashMap::new();

        // 注册 OpenAI
        let openai_yaml = r#"
metadata:
  id: openai-official
  name: OpenAI
  protocol: openai

api_spec:
  base_url: https://api.openai.com/v1
  endpoint: /chat/completions
  auth:
    type: bearer_header
    header_name: Authorization
    format: "Bearer {key}"

request_format:
  type: openai_standard
  messages_wrapper: messages
  system_prompt_handling: separate_message

response_format:
  type: sse
  stream_parser: openai_sse
  content_extraction: delta.content

models:
  - id: gpt-4o
    name: GPT-4o
    context_tokens: 128000
  - id: gpt-4o-mini
    name: GPT-4o Mini
    context_tokens: 128000
"#;

        let openai_spec: ProviderSpec = serde_yaml::from_str(openai_yaml).unwrap();
        registry.insert(openai_spec.metadata.id.clone(), openai_spec);

        // 注册 Zhipu
        let zhipu_yaml = r#"
metadata:
  id: zhipu-official
  name: Zhipu AI
  protocol: openai

api_spec:
  base_url: https://open.bigmodel.cn/api/paas/v4
  endpoint: /chat/completions
  auth:
    type: bearer_header
    header_name: Authorization
    format: "Bearer {key}"

request_format:
  type: openai_standard
  messages_wrapper: messages
  system_prompt_handling: separate_message

response_format:
  type: sse
  stream_parser: openai_sse
  content_extraction: delta.content

models:
  - id: glm-5.1
    name: GLM-5.1
    context_tokens: 128000
"#;

        let zhipu_spec: ProviderSpec = serde_yaml::from_str(zhipu_yaml).unwrap();
        registry.insert(zhipu_spec.metadata.id.clone(), zhipu_spec);

        // 验证注册表
        assert_eq!(registry.len(), 2);
        assert!(registry.contains_key("openai-official"));
        assert!(registry.contains_key("zhipu-official"));

        // 验证可以获取所有模型
        let all_models: Vec<_> = registry
            .values()
            .flat_map(|spec| {
                spec.models
                    .iter()
                    .map(|m| crate::harness::api::types::ModelInfo {
                        id: m.id.clone(),
                        name: m.name.clone(),
                        context_tokens: m.context_tokens,
                    })
            })
            .collect();

        assert_eq!(all_models.len(), 3); // 2 from OpenAI + 1 from Zhipu

        // 不依赖顺序，验证模型存在
        let model_ids: Vec<_> = all_models.iter().map(|m| &m.id).collect();
        assert!(model_ids.contains(&&"gpt-4o".to_string()));
        assert!(model_ids.contains(&&"gpt-4o-mini".to_string()));
        assert!(model_ids.contains(&&"glm-5.1".to_string()));
    }

    #[test]
    fn test_get_all_provider_specs() {
        // 🏛️ 元编程：测试从嵌入的 YAML 文件加载提供商

        let specs = get_all_provider_specs();

        // 验证加载了所有 5 个提供商
        assert_eq!(specs.len(), 5);
        assert!(specs.contains_key("openai-official"));
        assert!(specs.contains_key("zhipu-official"));
        assert!(specs.contains_key("deepseek-official"));
        assert!(specs.contains_key("kimi-official"));
        assert!(specs.contains_key("gemini-official"));

        // 验证 OpenAI 模型（现在有 15 个模型，包括 GPT-5 系列）
        let openai = specs.get("openai-official").unwrap();
        assert_eq!(openai.models.len(), 15);
        assert!(openai.models.iter().any(|m| m.id == "gpt-4o"));
        assert!(openai.models.iter().any(|m| m.id == "gpt-5"));

        // 验证 Zhipu GLM-5.1
        let zhipu = specs.get("zhipu-official").unwrap();
        assert!(zhipu.models.iter().any(|m| m.id == "glm-5.1"));
        assert!(zhipu
            .models
            .iter()
            .any(|m| m.tags.contains(&"latest".to_string())));

        // 验证 DeepSeek（注意：现在只有 deepseek-chat，不再有 deepseek-vl）
        let deepseek = specs.get("deepseek-official").unwrap();
        assert!(deepseek.models.iter().any(|m| m.id == "deepseek-chat"));
        assert!(deepseek
            .models
            .iter()
            .any(|m| m.tags.contains(&"latest".to_string())));

        // 验证 Kimi K2.6（注意：模型 ID 从 moonshot-v1-k2.6 改为 kimi-k2.6）
        let kimi = specs.get("kimi-official").unwrap();
        assert!(kimi.models.iter().any(|m| m.id == "kimi-k2.6"));

        // 验证 Gemini
        let gemini = specs.get("gemini-official").unwrap();
        assert!(gemini.models.iter().any(|m| m.id == "gemini-2.0-flash-exp"));
        assert_eq!(
            gemini.api_spec.base_url,
            "https://generativelanguage.googleapis.com/v1beta"
        );
    }

    #[test]
    fn test_get_all_models_from_specs() {
        // 🏛️ 元编程：测试获取所有模型

        let all_models = get_all_models_from_specs();

        // 应该包含所有提供商的模型
        // OpenAI: 15, Zhipu: 6, DeepSeek: 1, Kimi: 15, Gemini: 3 = 40+ total
        assert!(all_models.len() >= 30); // 至少有一些模型

        // 验证关键模型存在
        let model_ids: Vec<_> = all_models.iter().map(|m| &m.id).collect();
        assert!(model_ids.contains(&&"gpt-4o".to_string()));
        assert!(model_ids.contains(&&"glm-5.1".to_string()));
        assert!(model_ids.contains(&&"deepseek-chat".to_string())); // 更新：deepseek-vl → deepseek-chat
        assert!(model_ids.contains(&&"kimi-k2.6".to_string())); // 更新：moonshot-v1-k2.6 → kimi-k2.6
        assert!(model_ids.contains(&&"gemini-2.0-flash-exp".to_string()));
    }

    #[test]
    fn test_get_provider_spec_by_id() {
        // 🏛️ 元编程：测试根据 ID 获取提供商

        let openai = get_provider_spec("openai-official");
        assert!(openai.is_some());
        assert_eq!(openai.unwrap().metadata.name, "OpenAI");

        let zhipu = get_provider_spec("zhipu-official");
        assert!(zhipu.is_some());
        assert_eq!(zhipu.unwrap().metadata.name, "Zhipu AI (智谱)");

        let deepseek = get_provider_spec("deepseek-official");
        assert!(deepseek.is_some());
        assert_eq!(deepseek.unwrap().metadata.name, "DeepSeek");

        let nonexistent = get_provider_spec("nonexistent-provider");
        assert!(nonexistent.is_none());
    }

    #[test]
    fn test_get_models_for_provider() {
        // 🏛️ 元编程：测试根据提供商 ID 获取模型列表

        // 测试 OpenAI
        let openai_models = get_models_for_provider("openai-official");
        assert!(openai_models.is_some());
        let models = openai_models.unwrap();
        assert!(models.len() > 0);
        let model_ids: Vec<_> = models.iter().map(|m| &m.id).collect();
        assert!(model_ids.contains(&&"gpt-4o".to_string()));

        // 测试 DeepSeek（注意：现在只有 deepseek-chat，不再有 deepseek-vl）
        let deepseek_models = get_models_for_provider("deepseek-official");
        assert!(deepseek_models.is_some());
        let models = deepseek_models.unwrap();
        assert!(models.len() > 0);
        let model_ids: Vec<_> = models.iter().map(|m| &m.id).collect();
        assert!(model_ids.contains(&&"deepseek-chat".to_string()));

        // 测试不存在的提供商
        let nonexistent = get_models_for_provider("nonexistent-provider");
        assert!(nonexistent.is_none());
    }
}
