//! 代码生成器 - 从元数据生成提供商客户端代码
//!
//! 🏛️ 元编程架构核心：配置即代码
//!
//! ## 设计理念
//!
//! 传统方式需要为每个提供商手动编写数百行代码。通过元编程，
//! 我们只需要在 YAML 中定义配置，宏就能自动生成所有代码。
//!
//! ## 对比
//!
//! ### 传统方式（手动实现）
//! ```rust,ignore
//! // ❌ 每个提供商 500+ 行重复代码
//! pub struct ZhipuClient { ... }
//! impl ZhipuClient {
//!   fn build_url(&self) -> String { ... }
//!   fn build_headers(&self) -> Vec<Header> { ... }
//!   fn transform_request(&self) -> Value { ... }
//!   fn parse_response(&self) -> StreamEvent { ... }
//! }
//! ```
//!
//! ### 元编程方式（代码生成）
//! ```rust,ignore
//! // ✅ 只需 1 行！
//! generate_provider_client!(zhipi-official, ZhipuOfficialClient, OpenAIFormatAdapter);
//! ```
//!
//! ## 工作流程
//!
//! ```text
//! ┌──────────────┐
//! │ YAML 配置文件 │
//! │ zhipu.yaml   │
//! └──────┬───────┘
//!        │
//!        ▼
//! ┌──────────────┐
//! │ ProviderSpec │ (serde_yaml 解析)
//! └──────┬───────┘
//!        │
//!        ▼
//! ┌──────────────┐
//! │  宏展开生成   │
//! │   客户端代码  │
//! └──────────────┘
//! ```

use crate::harness::api::format_adapter::{
    FormatAdapter, GeminiFormatAdapter, OpenAIFormatAdapter,
};

/// 🏛️ 元编程宏：生成提供商客户端结构体
///
/// ## 语法
///
/// ```rust,ignore
/// generate_provider_client!(
///     "provider-id",           // YAML 文件名（不含扩展名）
///     ClientStructName,       // 生成的结构体名称
///     AdapterType             // 使用的适配器类型
/// );
/// ```
///
/// ## 使用示例
///
/// ```rust,ignore
/// // OpenAI 兼容的提供商（Zhipu、Kimi 等）
/// generate_provider_client!("zhipu-official", ZhipuOfficialClient, OpenAIFormatAdapter);
/// generate_provider_client!("kimi-official", KimiOfficialClient, OpenAIFormatAdapter);
///
/// // Gemini 特殊格式
/// generate_provider_client!("gemini-official", GeminiOfficialClient, GeminiFormatAdapter);
/// ```
///
/// ## 生成的代码
///
/// 宏会展开为：
/// 1. 客户端结构体（例如 `ZhipuOfficialClient`）
/// 2. `new()` 构造函数 - 从 YAML 加载配置
/// 3. 便捷方法 - URL 构建、请求头、请求转换、SSE 解析
/// 4. `Default` trait 实现
///
/// ## 实现细节
///
/// 宏在编译时展开，从嵌入的 YAML 文件读取配置：
/// - 使用 `include_str!` 在编译时嵌入 YAML
/// - 使用 `serde_yaml` 在运行时解析
/// - 根据 `protocol` 字段选择适配器类型
#[macro_export]
macro_rules! generate_provider_client {
    (
        $provider_id:expr,
        $client_name:ident,
        $adapter:ident
    ) => {
        /// 🏛️ 自动生成的客户端
        ///
        /// 此代码由 `generate_provider_client!` 宏从元数据生成。
        /// 请勿手动编辑 - 修改 YAML 配置文件重新生成。
        #[derive(Debug, Clone)]
        pub struct $client_name {
            adapter: $crate::harness::api::format_adapter::$adapter,
        }

        impl $client_name {
            /// 创建新的客户端实例
            ///
            /// 从嵌入的 YAML 文件加载提供商配置。
            pub fn new() -> Self {
                // 🔥 在编译时嵌入 YAML，运行时解析
                let yaml = include_str!(concat!(
                    "../../../providers/registry/",
                    $provider_id,
                    ".yaml"
                ));

                let spec = $crate::harness::api::code_gen::parse_spec_from_yaml(yaml)
                    .expect(&format!("Failed to parse provider spec: {}", $provider_id));

                let adapter = $crate::harness::api::format_adapter::$adapter::new(spec);

                Self { adapter }
            }

            /// 获取提供商规格
            pub fn spec(&self) -> &$crate::harness::api::provider_metadata::ProviderSpec {
                use $crate::harness::api::format_adapter::FormatAdapter;
                self.adapter.spec()
            }

            /// 构建请求 URL
            pub fn build_url(&self, model_id: &str, api_key: &str) -> String {
                use $crate::harness::api::format_adapter::FormatAdapter;
                self.adapter.build_url(model_id, api_key)
            }

            /// 构建请求头
            pub fn build_headers(&self, api_key: &str) -> Vec<(String, String)> {
                use $crate::harness::api::format_adapter::FormatAdapter;
                self.adapter.build_headers(api_key)
            }

            /// 转换请求体
            pub fn transform_request_body(
                &self,
                request: &$crate::harness::api::types::StreamRequest,
            ) -> Result<::serde_json::Value, String> {
                use $crate::harness::api::format_adapter::FormatAdapter;
                self.adapter.transform_request_body(request)
            }

            /// 解析 SSE 事件
            pub fn parse_sse_event(
                &self,
                event_data: &str,
            ) -> Result<Option<$crate::harness::api::types::StreamEvent>, String> {
                use $crate::harness::api::format_adapter::FormatAdapter;
                self.adapter.parse_sse_event(event_data)
            }
        }

        impl ::std::default::Default for $client_name {
            fn default() -> Self {
                Self::new()
            }
        }

        // 🏛️ 实现 From<ProviderSpec> 以便在 MetadataDrivenClient 中使用
        impl From<$crate::harness::api::provider_metadata::ProviderSpec> for $client_name {
            fn from(spec: $crate::harness::api::provider_metadata::ProviderSpec) -> Self {
                let adapter = $crate::harness::api::format_adapter::$adapter::new(spec);
                Self { adapter }
            }
        }

        // 🏛️ 实现 FormatAdapter trait，将所有方法委托给内部适配器
        impl $crate::harness::api::format_adapter::FormatAdapter for $client_name {
            fn spec(&self) -> &$crate::harness::api::provider_metadata::ProviderSpec {
                use $crate::harness::api::format_adapter::FormatAdapter;
                self.adapter.spec()
            }

            fn build_url(&self, model_id: &str, api_key: &str) -> String {
                use $crate::harness::api::format_adapter::FormatAdapter;
                self.adapter.build_url(model_id, api_key)
            }

            fn build_headers(&self, api_key: &str) -> Vec<(String, String)> {
                use $crate::harness::api::format_adapter::FormatAdapter;
                self.adapter.build_headers(api_key)
            }

            fn transform_request_body(
                &self,
                request: &$crate::harness::api::types::StreamRequest,
            ) -> Result<::serde_json::Value, String> {
                use $crate::harness::api::format_adapter::FormatAdapter;
                self.adapter.transform_request_body(request)
            }

            fn parse_sse_event(
                &self,
                event_data: &str,
            ) -> Result<Option<$crate::harness::api::types::StreamEvent>, String> {
                use $crate::harness::api::format_adapter::FormatAdapter;
                self.adapter.parse_sse_event(event_data)
            }

            fn map_error(&self, status_code: u16) -> String {
                use $crate::harness::api::format_adapter::FormatAdapter;
                self.adapter.map_error(status_code)
            }
        }
    };
}

// ============================================================================
// 辅助函数：从 YAML 字符串解析 ProviderSpec
// ============================================================================

/// 🔧 从 YAML 字符串解析 ProviderSpec 的辅助函数
pub fn parse_spec_from_yaml(
    yaml: &str,
) -> Result<crate::harness::api::provider_metadata::ProviderSpec, serde_yaml::Error> {
    serde_yaml::from_str(yaml)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::api::provider_metadata::ProviderSpec;

    #[test]
    fn test_provider_spec_from_yaml_openai() {
        let yaml = include_str!("../../../providers/registry/openai-official.yaml");
        let spec = parse_spec_from_yaml(yaml);

        assert!(spec.is_ok());
        let spec = spec.unwrap();

        assert_eq!(spec.metadata.id, "openai-official");
        assert_eq!(spec.metadata.protocol, "openai");
        assert!(!spec.models.is_empty());
    }

    #[test]
    fn test_provider_spec_from_yaml_zhipu() {
        let yaml = include_str!("../../../providers/registry/zhipu-official.yaml");
        let spec = parse_spec_from_yaml(yaml);

        assert!(spec.is_ok());
        let spec = spec.unwrap();

        assert_eq!(spec.metadata.id, "zhipu-official");
        assert_eq!(spec.metadata.protocol, "openai");

        // 验证 GLM-5.1 模型存在
        let glm_51 = spec.models.iter().find(|m| m.id == "glm-5.1");
        assert!(glm_51.is_some());
        assert_eq!(glm_51.unwrap().name, "GLM-5.1");
    }

    #[test]
    fn test_provider_spec_from_yaml_kimi() {
        let yaml = include_str!("../../../providers/registry/kimi-official.yaml");
        let spec = parse_spec_from_yaml(yaml);

        assert!(spec.is_ok());
        let spec = spec.unwrap();

        assert_eq!(spec.metadata.id, "kimi-official");
        assert_eq!(spec.metadata.protocol, "openai");

        // 验证 K2.6 模型存在（注意：模型 ID 从 moonshot-v1-k2.6 改为 kimi-k2.6）
        let k2_6 = spec.models.iter().find(|m| m.id == "kimi-k2.6");
        assert!(k2_6.is_some());
        assert_eq!(k2_6.unwrap().name, "Kimi K2.6");
    }

    #[test]
    fn test_provider_spec_from_yaml_gemini() {
        let yaml = include_str!("../../../providers/registry/gemini-official.yaml");
        let spec = parse_spec_from_yaml(yaml);

        assert!(spec.is_ok());
        let spec = spec.unwrap();

        assert_eq!(spec.metadata.id, "gemini-official");
        assert_eq!(spec.metadata.protocol, "gemini");
        assert!(!spec.models.is_empty());
    }
}
