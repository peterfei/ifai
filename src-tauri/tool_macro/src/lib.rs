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
    let (tool_name, tool_description) = parse_tool_attr(&input.attrs);

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
    };

    TokenStream::from(expanded)
}

/// 解析 #[tool(name = "...", description = "...")] 属性
fn parse_tool_attr(attrs: &[Attribute]) -> (String, String) {
    let mut tool_name = String::new();
    let mut tool_description = String::new();

    for attr in attrs {
        if attr.path().is_ident("tool") {
            // 尝试将整个属性解析为 ToolAttr 结构
            if let Ok(parsed) = attr.parse_args::<ToolAttrArgs>() {
                tool_name = parsed.name;
                tool_description = parsed.description;
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

    (tool_name, tool_description)
}

/// 自定义属性解析器
struct ToolAttrArgs {
    name: String,
    description: String,
}

impl syn::parse::Parse for ToolAttrArgs {
    fn parse(input: syn::parse::ParseStream) -> syn::Result<Self> {
        use syn::{LitStr, Token};

        let mut name = String::new();
        let mut description = String::new();

        // 解析 name = "xxx", description = "xxx"
        while !input.is_empty() {
            // 读取标识符
            let key: syn::Ident = input.parse()?;
            let key_str = key.to_string();

            // 读取 =
            input.parse::<Token![=]>()?;

            // 读取字符串值
            let value: LitStr = input.parse()?;

            match key_str.as_str() {
                "name" => name = value.value(),
                "description" => description = value.value(),
                _ => {}
            }

            // 如果有逗号，跳过
            if input.peek(Token![,]) {
                input.parse::<Token![,]>()?;
            }
        }

        Ok(ToolAttrArgs { name, description })
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
