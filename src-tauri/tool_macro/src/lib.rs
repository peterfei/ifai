use proc_macro::TokenStream;
use quote::{quote, ToTokens};
use syn::{parse_macro_input, DeriveInput, Attribute, Data, Fields, Field, Type};

/// #[derive(Tool)] 宏的实现
///
/// 功能演进：
/// ✅ v0.1.0: 解析 #[tool(name, description)] 属性
/// ✅ v0.1.1: 支持带字段的结构体 + 生成构造器
/// 🔄 v0.2.0: 生成 ToolExecutor trait 实现（规划中）
/// 🔄 v0.3.0: 生成 ToolSpec 和 OpenAI schema（规划中）
/// 🔄 v0.4.0: 自动 inventory 注册（规划中）
#[proc_macro_derive(Tool, attributes(tool))]
pub fn derive_tool(input: TokenStream) -> TokenStream {
    // 解析输入结构体
    let input = parse_macro_input!(input as DeriveInput);
    let name = &input.ident;

    // 解析 #[tool(...)] 属性
    let (tool_name, tool_description, params) = parse_tool_attr(&input.attrs);

    // 解析结构体字段
    let fields = parse_struct_fields(&input.data);

    // 生成构造器参数
    let constructor_params: Vec<_> = fields.iter()
        .filter(|f| f.kind == FieldKind::Config || f.kind == FieldKind::State)
        .map(|f| {
            let field_name = &f.name;
            let field_type = &f.ty;
            quote! { #field_name: #field_type }
        })
        .collect();

    // 生成构造器初始化
    let constructor_inits: Vec<_> = fields.iter()
        .filter(|f| f.kind == FieldKind::Config || f.kind == FieldKind::State)
        .map(|f| {
            let field_name = &f.name;
            quote! { #field_name }
        })
        .collect();

    // 生成参数解析代码
    let param_names: Vec<&str> = params.iter().map(|p| p.name.as_str()).collect();
    let param_idents: Vec<proc_macro2::Ident> = params.iter()
        .map(|p| proc_macro2::Ident::new(&p.name, proc_macro2::Span::call_site()))
        .collect();

    let param_parsing: Vec<proc_macro2::TokenStream> = params.iter().map(|p| {
        let param_name = &p.name;
        let param_ident = proc_macro2::Ident::new(param_name, proc_macro2::Span::call_site());

        let parse_expr = match p.ty {
            ParamType::String => quote! {
                let #param_ident = args.get(#param_name)
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| ToolError::InvalidInput(format!("Missing '{}' parameter", #param_name)))?;
            },
            ParamType::Integer => quote! {
                let #param_ident = args.get(#param_name)
                    .and_then(|v| v.as_u64())
                    .ok_or_else(|| ToolError::InvalidInput(format!("Missing or invalid '{}' parameter", #param_name)))?;
            },
            ParamType::Float => quote! {
                let #param_ident = args.get(#param_name)
                    .and_then(|v| v.as_f64())
                    .ok_or_else(|| ToolError::InvalidInput(format!("Missing or invalid '{}' parameter", #param_name)))?;
            },
            ParamType::Boolean => quote! {
                let #param_ident = args.get(#param_name)
                    .and_then(|v| v.as_bool())
                    .ok_or_else(|| ToolError::InvalidInput(format!("Missing or invalid '{}' parameter", #param_name)))?;
            },
        };
        parse_expr
    }).collect();

    // 生成参数的 JSON schema
    let param_schemas: Vec<proc_macro2::TokenStream> = params.iter().map(|p| {
        let param_name = &p.name;
        let json_type = match p.ty {
            ParamType::String => "string",
            ParamType::Integer => "integer",
            ParamType::Float => "number",
            ParamType::Boolean => "boolean",
        };

        quote! {
            #param_name: {
                "type": #json_type,
                "description": #param_name
            }
        }
    }).collect();

    // 生成 execute_method 的参数
    let execute_params: Vec<proc_macro2::TokenStream> = params.iter().map(|p| {
        let param_ident = proc_macro2::Ident::new(&p.name, proc_macro2::Span::call_site());
        match p.ty {
            ParamType::String => quote! { &#param_ident },
            ParamType::Integer | ParamType::Float | ParamType::Boolean => quote! { #param_ident },
        }
    }).collect();

    // 生成 ToolLike 实现（始终生成，空参数工具也支持）
    let execute_method_name = proc_macro2::Ident::new(
        &format!("execute_{}", tool_name.replace("-", "_")),
        proc_macro2::Span::call_site()
    );

    // required 列表：有参数时生成，无参数时空数组
    let required_array = if params.is_empty() {
        quote! {}
    } else {
        quote! { "required": [#(#param_names),*] }
    };

    let tool_like_impl = quote! {
        // 生成 ToolLike trait 实现
        impl crate::harness::tool::new_tools::adapter::ToolLike for #name {
            fn schema(&self) -> serde_json::Value {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": #tool_name,
                        "description": #tool_description,
                        "parameters": {
                            "type": "object",
                            "properties": {
                                #(#param_schemas),*
                            },
                            #required_array
                        }
                    }
                })
            }

            fn execute_tool(&self, args: &serde_json::Value) -> Result<String, crate::harness::tool::ToolError> {
                use serde_json::Value;
                use crate::harness::tool::ToolError;

                // 解析参数
                #(#param_parsing)*

                // 调用 execute 方法
                let result = self.#execute_method_name(#(#execute_params),*)
                    .map_err(|e| ToolError::Execution(e.to_string()))?;

                // 尝试调用 to_output_string()，如果失败就使用 to_string()
                use std::string::ToString;
                Ok(result.to_output_string())
            }
        }
    };

    // 生成代码
    let expanded = quote! {
        impl #name {
            // 生成的常量
            pub const TOOL_NAME: &'static str = #tool_name;
            pub const TOOL_DESCRIPTION: &'static str = #tool_description;

            // 获取工具名称
            pub fn get_name() -> &'static str {
                Self::TOOL_NAME
            }

            // 获取工具描述
            pub fn get_description() -> &'static str {
                Self::TOOL_DESCRIPTION
            }

            // 生成的构造器
            pub fn new(#(#constructor_params),*) -> Self {
                Self {
                    #(#constructor_inits),*
                }
            }
        }

        #tool_like_impl
    };

    TokenStream::from(expanded)
}

/// 解析 #[tool(name = "...", description = "...", params(...))] 属性
fn parse_tool_attr(attrs: &[Attribute]) -> (String, String, Vec<ToolParam>) {
    let mut tool_name = String::new();
    let mut tool_description = String::new();
    let mut params = Vec::new();

    for attr in attrs {
        if attr.path().is_ident("tool") {
            // 尝试将整个属性解析为 ToolAttr 结构
            if let Ok(parsed) = attr.parse_args::<ToolAttrArgs>() {
                tool_name = parsed.name;
                tool_description = parsed.description;
                params = parsed.params;
                break;
            }
        }
    }

    // 如果没有找到属性，使用默认值
    if tool_name.is_empty() {
        tool_name = "unnamed_tool".to_string();
    }
    if tool_description.is_empty() {
        tool_description = "A tool".to_string();
    }

    (tool_name, tool_description, params)
}

/// 自定义属性解析器
struct ToolAttrArgs {
    name: String,
    description: String,
    params: Vec<ToolParam>,
}

/// 工具参数定义
struct ToolParam {
    name: String,
    ty: ParamType,
}

/// 参数类型
#[derive(Debug, Clone, PartialEq)]
enum ParamType {
    String,
    Integer,
    Float,
    Boolean,
}

impl syn::parse::Parse for ToolAttrArgs {
    fn parse(input: syn::parse::ParseStream) -> syn::Result<Self> {
        use syn::{LitStr, Token, parenthesized};
        use proc_macro2::Ident;

        let mut name = String::new();
        let mut description = String::new();
        let mut params = Vec::new();

        // 解析 name = "xxx", description = "xxx", params(...)
        while !input.is_empty() {
            // 读取标识符
            let key: Ident = input.parse()?;
            let key_str = key.to_string();

            match key_str.as_str() {
                "name" | "description" => {
                    // 读取 =
                    input.parse::<Token![=]>()?;

                    // 读取字符串值
                    let value: LitStr = input.parse()?;

                    if key_str == "name" {
                        name = value.value();
                    } else {
                        description = value.value();
                    }

                    // 如果有逗号，跳过
                    if input.peek(Token![,]) {
                        input.parse::<Token![,]>()?;
                    }
                }
                "params" => {
                    // 解析 params(...) 列表
                    let params_content;
                    parenthesized!(params_content in input);

                    // 解析参数列表: param_name: type, param_name2: type2
                    while !params_content.is_empty() {
                        // 参数名
                        let param_name: Ident = params_content.parse()?;
                        let param_name_str = param_name.to_string();

                        // 冒号
                        params_content.parse::<Token![:]>()?;

                        // 类型
                        let type_ident: Ident = params_content.parse()?;
                        let param_type = match type_ident.to_string().as_str() {
                            "str" | "string" | "String" => ParamType::String,
                            "int" | "integer" | "u64" | "i64" | "u32" | "i32" | "usize" | "isize" => ParamType::Integer,
                            "float" | "f64" | "f32" => ParamType::Float,
                            "bool" | "boolean" => ParamType::Boolean,
                            _ => ParamType::String, // 默认为字符串
                        };

                        params.push(ToolParam {
                            name: param_name_str,
                            ty: param_type,
                        });

                        // 如果有逗号，跳过
                        if params_content.peek(Token![,]) {
                            params_content.parse::<Token![,]>()?;
                        }
                    }

                    // 如果有逗号，跳过
                    if input.peek(Token![,]) {
                        input.parse::<Token![,]>()?;
                    }
                }
                _ => {
                    // 未知键，跳过值
                    input.parse::<Token![=]>()?;
                    input.parse::<syn::Expr>()?;
                    if input.peek(Token![,]) {
                        input.parse::<Token![,]>()?;
                    }
                }
            }
        }

        Ok(ToolAttrArgs { name, description, params })
    }
}

/// 字段类型
#[derive(Debug, PartialEq, Eq)]
enum FieldKind {
    Config,   // #[tool(config)]
    State,    // #[tool(state)]
    Cache,    // #[tool(cache)]
    Normal,   // 普通字段（无标注）
}

/// 解析后的字段信息
struct ParsedField {
    name: proc_macro2::Ident,
    ty: Type,
    kind: FieldKind,
}

/// 解析结构体字段
fn parse_struct_fields(data: &Data) -> Vec<ParsedField> {
    let mut fields = Vec::new();

    if let Data::Struct(data_struct) = data {
        if let Fields::Named(named_fields) = &data_struct.fields {
            for field in named_fields.named.iter() {
                let field_name = field.ident.clone().unwrap();
                let field_ty = field.ty.clone();

                // 解析字段属性
                let kind = parse_field_attr(&field.attrs);

                fields.push(ParsedField {
                    name: field_name,
                    ty: field_ty,
                    kind,
                });
            }
        }
    }

    fields
}

/// 解析字段属性（#[tool(config)], #[tool(state)], etc.）
fn parse_field_attr(attrs: &[Attribute]) -> FieldKind {
    for attr in attrs {
        if attr.path().is_ident("tool") {
            // 尝试解析为简单的标识符（如 #[tool(config)]）
            if let Ok(ident) = attr.parse_args::<syn::Ident>() {
                match ident.to_string().as_str() {
                    "config" => return FieldKind::Config,
                    "state" => return FieldKind::State,
                    "cache" => return FieldKind::Cache,
                    _ => {}
                }
            }
        }
    }
    FieldKind::Normal
}
