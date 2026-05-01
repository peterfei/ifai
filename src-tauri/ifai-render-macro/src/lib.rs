//! ifai-render-macro
//!
//! 为状态枚举自动生成渲染方法的派生宏

use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, Data, DeriveInput};

/// 为枚举自动生成渲染方法
///
/// # 使用示例
///
/// ```rust
/// use ifai_render_macro::StatusRender;
///
/// #[derive(StatusRender, Debug, Clone, Copy)]
/// pub enum MyStatus {
///     #[status(symbol = "✓", zh = "成功", en = "Success")]
///     Success,
///
///     #[status(symbol = "✗", zh = "失败", en = "Failed")]
///     Failed,
/// }
///
/// // 自动生成：
/// // impl MyStatus {
/// //     pub fn symbol(&self) -> char { ... }
/// //     pub fn label_zh(&self) -> &'static str { ... }
/// //     pub fn label_en(&self) -> &'static str { ... }
/// // }
/// ```
#[proc_macro_derive(StatusRender, attributes(status))]
pub fn derive_status_render(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    let enum_name = &input.ident;

    let variants = match &input.data {
        Data::Enum(data) => &data.variants,
        _ => panic!("StatusRender can only be derived for enums"),
    };

    // Phase 3: 生成 symbol(), label_zh(), label_en(), theme_field(), render_with_theme() 方法
    let mut symbol_arms = Vec::new();
    let mut label_zh_arms = Vec::new();
    let mut label_en_arms = Vec::new();
    let mut theme_arms = Vec::new();

    for variant in variants {
        let variant_name = &variant.ident;
        let attrs = parse_status_attrs(&variant.attrs);

        let symbol = attrs.symbol.unwrap_or('•');
        let label_zh = attrs.label_zh.unwrap_or_else(|| variant_name.to_string());
        let label_en = attrs.label_en.unwrap_or_else(|| variant_name.to_string());
        let theme_field = attrs.theme.unwrap_or_else(|| "muted".to_string());

        // Check if variant has fields (struct variant) or is unit variant
        let has_fields = variant.fields.len() > 0;

        let variant_pattern = if has_fields {
            quote! { #enum_name::#variant_name { .. } }
        } else {
            quote! { #enum_name::#variant_name }
        };

        symbol_arms.push(quote! {
            #variant_pattern => #symbol
        });

        label_zh_arms.push(quote! {
            #variant_pattern => #label_zh
        });

        label_en_arms.push(quote! {
            #variant_pattern => #label_en
        });

        theme_arms.push(quote! {
            #variant_pattern => #theme_field
        });
    }

    let expanded = quote! {
        /// Trait for accessing theme colors by field name
        pub trait ThemeAccessor {
            fn get_color(&self, field: &str) -> &str;
        }

        impl #enum_name {
            pub fn symbol(&self) -> char {
                match self {
                    #( #symbol_arms, )*
                }
            }

            pub fn label_zh(&self) -> &'static str {
                match self {
                    #( #label_zh_arms, )*
                }
            }

            pub fn label_en(&self) -> &'static str {
                match self {
                    #( #label_en_arms, )*
                }
            }

            pub fn theme_field(&self) -> &'static str {
                match self {
                    #( #theme_arms, )*
                }
            }

            pub fn render_with_theme<T>(
                &self,
                lang: &str,
                theme: &T,
                reset: &str,
            ) -> String
            where
                T: ThemeAccessor,
            {
                let symbol = self.symbol();
                let label = match lang {
                    "zh" => self.label_zh(),
                    "en" | _ => self.label_en(),
                };
                let color = theme.get_color(self.theme_field());

                format!("{}{} [{}]{}{}", color, symbol, label, reset, reset)
            }
        }
    };

    TokenStream::from(expanded)
}

/// 状态属性结构
struct StatusAttrs {
    symbol: Option<char>,
    label_zh: Option<String>,
    label_en: Option<String>,
    theme: Option<String>,
}

/// 解析 #[status(symbol = "...", zh = "...", en = "...", theme = "...")] 属性
fn parse_status_attrs(attrs: &[syn::Attribute]) -> StatusAttrs {
    let mut result = StatusAttrs {
        symbol: None,
        label_zh: None,
        label_en: None,
        theme: None,
    };

    for attr in attrs {
        if attr.path().is_ident("status") {
            let content = attr.meta.require_list().unwrap();
            let tokens = content.tokens.to_string();

            for token in tokens.split(',') {
                let token = token.trim();
                if token.starts_with("symbol =") {
                    let value = token.split('=').nth(1).unwrap().trim().trim_matches('"');
                    result.symbol = value.chars().next();
                } else if token.starts_with("zh =") {
                    let value = token.split('=').nth(1).unwrap().trim().trim_matches('"');
                    result.label_zh = Some(value.to_string());
                } else if token.starts_with("en =") {
                    let value = token.split('=').nth(1).unwrap().trim().trim_matches('"');
                    result.label_en = Some(value.to_string());
                } else if token.starts_with("theme =") {
                    let value = token.split('=').nth(1).unwrap().trim().trim_matches('"');
                    result.theme = Some(value.to_string());
                }
            }
        }
    }

    result
}
