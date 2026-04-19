use proc_macro::TokenStream;
use quote::quote;
use proc_macro2::{Ident, Span};

/// API 端点定义
#[allow(dead_code)]
struct ApiEndpoint {
    name: Ident,
    method: Ident,
    path: String,
    description: String,
    params: Vec<(Ident, String)>,
    return_type: String,
    #[allow(dead_code)]
    requires_auth: bool,
}

/// 实现 api_client! 宏
///
/// 从声明式配置生成类型安全的 API 客户端
///
/// # 语法
///
/// ```ignore
/// api_client! {
///     name = "SkillRegistryClient";
///     base_url = "https://api.ifai.com";
///     error_type = "SkillError";
///
///     endpoints: {
///         ListSkills {
///             method = GET;
///             path = "/skills";
///             description = "获取技能列表";
///             returns = Vec<Skill>;
///         },
///
///         InstallSkill {
///             method = POST;
///             path = "/skills/{skill_id}/install";
///             description = "安装技能";
///             params = { skill_id: String, version: Option<String> };
///             returns = InstalledSkill;
///             auth = true;
///         },
///     }
/// }
/// ```
pub fn impl_api_client(_input: TokenStream) -> TokenStream {
    // 简化版：生成示例 API 客户端
    // 实际实现需要完整的解析器

    let client_name = Ident::new("SkillRegistryClient", Span::call_site());
    let error_type = Ident::new("SkillError", Span::call_site());
    let base_url = "https://api.ifai.com/v1";

    // 定义 API 端点
    let endpoints = vec![
        ApiEndpoint {
            name: Ident::new("list_skills", Span::call_site()),
            method: Ident::new("get", Span::call_site()),
            path: "/skills".to_string(),
            description: "获取技能列表".to_string(),
            params: vec![],
            return_type: "Vec<Skill>".to_string(),
            requires_auth: false,
        },
        ApiEndpoint {
            name: Ident::new("get_skill", Span::call_site()),
            method: Ident::new("get", Span::call_site()),
            path: "/skills/{skill_id}".to_string(),
            description: "获取技能详情".to_string(),
            params: vec![
                (Ident::new("skill_id", Span::call_site()), "String".to_string()),
            ],
            return_type: "Skill".to_string(),
            requires_auth: false,
        },
        ApiEndpoint {
            name: Ident::new("install_skill", Span::call_site()),
            method: Ident::new("post", Span::call_site()),
            path: "/skills/{skill_id}/install".to_string(),
            description: "安装技能".to_string(),
            params: vec![
                (Ident::new("skill_id", Span::call_site()), "String".to_string()),
                (Ident::new("version", Span::call_site()), "Option<String>".to_string()),
                (Ident::new("source", Span::call_site()), "String".to_string()),
            ],
            return_type: "InstalledSkill".to_string(),
            requires_auth: true,
        },
        ApiEndpoint {
            name: Ident::new("uninstall_skill", Span::call_site()),
            method: Ident::new("post", Span::call_site()),
            path: "/skills/{skill_id}/uninstall".to_string(),
            description: "卸载技能".to_string(),
            params: vec![
                (Ident::new("skill_id", Span::call_site()), "String".to_string()),
            ],
            return_type: "Skill".to_string(),
            requires_auth: true,
        },
        ApiEndpoint {
            name: Ident::new("search_skills", Span::call_site()),
            method: Ident::new("get", Span::call_site()),
            path: "/skills/search".to_string(),
            description: "搜索技能".to_string(),
            params: vec![
                (Ident::new("query", Span::call_site()), "String".to_string()),
                (Ident::new("limit", Span::call_site()), "Option<usize>".to_string()),
            ],
            return_type: "Vec<Skill>".to_string(),
            requires_auth: false,
        },
    ];

    // 为每个端点生成方法
    let mut client_methods = Vec::new();
    let mut endpoint_names = Vec::new();

    for endpoint in &endpoints {
        let method_name = &endpoint.name;
        let http_method = &endpoint.method;
        let _description = &endpoint.description;
        let return_type: proc_macro2::TokenStream = endpoint.return_type.parse().unwrap();

        // 构建参数列表
        let mut params = Vec::new();
        let mut param_names = Vec::new();
        let mut path_build = endpoint.path.clone();

        for (param_name, param_type) in &endpoint.params {
            params.push(quote! {
                #param_name: #param_type
            });
            param_names.push(param_name.clone());

            // 替换路径中的参数占位符
            path_build = path_build.replace(&format!("{{{}}}", param_name), "");
        }

        // 生成 HTTP 方法调用
        let http_call = match http_method.to_string().as_str() {
            "get" => quote! { self.client.get(&url) },
            "post" => quote! { self.client.post(&url) },
            "put" => quote! { self.client.put(&url) },
            "delete" => quote! { self.client.delete(&url) },
            _ => quote! { compile_error!("Unsupported HTTP method") },
        };

        // 生成方法
        let client_method = quote! {
            /// 自动生成的 API 方法
            pub async fn #method_name(
                &self,
                #(#params),*
            ) -> Result<#return_type, #error_type> {
                let url = self.build_url(&#path_build);

                // 构建请求
                let mut request = #http_call;

                // 设置查询参数
                #(
                    if #param_names.contains(&stringify!(#param_names)) {
                        // 添加到查询字符串
                    }
                )*

                // 发送请求
                let response = request
                    .send()
                    .await
                    .map_err(|e| #error_type::RequestError(e.to_string()))?;

                // 处理响应
                if response.status().is_success() {
                    response
                        .json::<#return_type>()
                        .await
                        .map_err(|e| #error_type::ParseError(e.to_string()))
                } else {
                    Err(#error_type::ApiError(response.status().as_u16()))
                }
            }
        };

        client_methods.push(client_method);
        endpoint_names.push(method_name.clone());
    }

    // 生成客户端结构
    let expanded = quote! {
        use reqwest::Client;

        /// 自动生成的 API 客户端
        ///
        /// 此代码由 api_client! 宏生成
        #[derive(Clone)]
        pub struct #client_name {
            client: Client,
            base_url: String,
            api_key: Option<String>,
        }

        impl #client_name {
            /// 创建新的 API 客户端实例
            pub fn new() -> Self {
                Self {
                    client: Client::new(),
                    base_url: #base_url.to_string(),
                    api_key: None,
                }
            }

            /// 创建带 API 密钥的客户端
            pub fn with_api_key(api_key: String) -> Self {
                Self {
                    client: Client::new(),
                    base_url: #base_url.to_string(),
                    api_key: Some(api_key),
                }
            }

            /// 构建完整的 URL
            fn build_url(&self, path: &str) -> String {
                format!("{}{}", self.base_url, path)
            }

            /// 设置 API 密钥
            pub fn set_api_key(&mut self, api_key: String) {
                self.api_key = Some(api_key);
            }

            // 自动生成的 API 方法
            #(#client_methods)*
        }

        impl Default for #client_name {
            fn default() -> Self {
                Self::new()
            }
        }

        // 错误类型定义
        #[derive(Debug, thiserror::Error)]
        pub enum #error_type {
            #[error("请求失败: {0}")]
            RequestError(String),

            #[error("解析失败: {0}")]
            ParseError(String),

            #[error("API 错误: {0}")]
            ApiError(u16),

            #[error("认证失败")]
            AuthError,

            #[error("网络错误")]
            NetworkError,
        }
    };

    TokenStream::from(expanded)
}
