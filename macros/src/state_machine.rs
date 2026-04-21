use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, DeriveInput, Data, DataEnum, Ident, Meta, Fields};
use std::collections::HashMap;

/// 实现 StateMachine derive 宏
pub fn impl_state_machine(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    let enum_name = &input.ident;

    // 解析枚举
    let variants = match &input.data {
        Data::Enum(DataEnum { variants, .. }) => variants,
        _ => {
            return syn::Error::new_spanned(
                enum_name,
                "StateMachine 只支持枚举"
            ).to_compile_error().into();
        }
    };

    // 解析状态机配置
    let mut initial_state = None;
    let mut state_definitions = Vec::new();

    // 从 #[state_machine] 属性获取初始状态
    for attr in &input.attrs {
        if attr.path().is_ident("state_machine") {
            // 使用 syn 解析 Meta
            match &attr.meta {
                Meta::List(list) => {
                    // 解析列表中的内容: #[state_machine(initial = "NotInstalled")]
                    let tokens = list.tokens.clone();
                    let token_str = tokens.to_string();

                    // 手动解析 key = "value" 格式
                    for part in token_str.split(',') {
                        let part = part.trim();
                        if part.contains("initial") {
                            if let Some(eq_idx) = part.find('=') {
                                let value_part = &part[eq_idx + 1..].trim();
                                // 去除引号
                                if value_part.starts_with('"') && value_part.ends_with('"') {
                                    let value = &value_part[1..value_part.len() - 1];
                                    initial_state = Some(Ident::new(value, enum_name.span()));
                                }
                            }
                        }
                    }
                }
                Meta::Path(_) => {
                    // 不支持的无参数格式
                }
                Meta::NameValue(nv) => {
                    // 尝试解析 NameValue 格式
                    if nv.path.is_ident("initial") {
                        if let syn::Expr::Lit(syn::ExprLit {
                            lit: syn::Lit::Str(lit_str),
                            ..
                        }) = &nv.value {
                            initial_state = Some(Ident::new(&lit_str.value(), enum_name.span()));
                        }
                    }
                }
            }
        }
    }

    let initial_state = match initial_state {
        Some(s) => s,
        None => {
            return syn::Error::new_spanned(
                enum_name,
                "缺少 #[state_machine(initial = \"...\")] 属性"
            ).to_compile_error().into();
        }
    };

    // 解析每个状态的定义
    for variant in variants {
        let variant_name = &variant.ident;
        let mut transitions = Vec::new();
        let has_data = matches!(&variant.fields, Fields::Unnamed(_) | Fields::Named(_));

        // 解析 #[state(...)] 属性
        for attr in &variant.attrs {
            if attr.path().is_ident("state") {
                if let Meta::List(list) = &attr.meta {
                    let tokens = list.tokens.clone().to_string();

                    // 解析 transitions = [...] 格式
                    if let Some(trans_start) = tokens.find("transitions") {
                        let after_trans = &tokens[trans_start..];
                        if let Some(eq_idx) = after_trans.find('=') {
                            let after_eq = &after_trans[eq_idx + 1..];

                            // 查找数组内容 [...]
                            if let Some(array_start) = after_eq.find('[') {
                                let after_array = &after_eq[array_start + 1..];
                                if let Some(array_end) = after_array.find(']') {
                                    let array_content = &after_array[..array_end];

                                    // 分割数组元素
                                    for item in array_content.split(',') {
                                        let item = item.trim().trim_matches('"');
                                        if !item.is_empty() {
                                            // 清理可能的额外字符
                                            let cleaned = item.chars()
                                                .filter(|c| c.is_alphanumeric() || *c == '_')
                                                .collect::<String>();
                                            if !cleaned.is_empty() {
                                                transitions.push(Ident::new(&cleaned, variant_name.span()));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        state_definitions.push((variant_name.clone(), transitions, has_data));
    }

    // 构建状态转换映射（用于验证）
    let mut transition_map: HashMap<String, Vec<String>> = HashMap::new();
    for (variant_name, transitions, _) in &state_definitions {
        let state_name = variant_name.to_string();
        let allowed_transitions: Vec<String> = transitions.iter().map(|t| t.to_string()).collect();
        transition_map.insert(state_name, allowed_transitions);
    }

    // 为每个状态生成方法
    let mut state_queries = Vec::new();
    let mut variant_names = Vec::new();
    let mut can_transition_checks = Vec::new();
    let mut validate_transition_checks = Vec::new();
    let mut allowed_transitions_list = Vec::new();

    for (variant_name, transitions, _has_data) in &state_definitions {
        variant_names.push(variant_name.clone());

        // 生成状态查询方法
        let is_method = Ident::new(
            &format!("is_{}", to_snake_case(&variant_name.to_string())),
            variant_name.span()
        );

        state_queries.push(quote! {
            pub fn #is_method(&self) -> bool {
                matches!(self, #enum_name::#variant_name { .. })
            }
        });

        // 生成 can_transition_to 检查的分支（为每个转换生成一个）
        for target_state in transitions {
            let check = quote! {
                (#enum_name::#variant_name { .. }, #enum_name::#target_state { .. }) => true,
            };
            can_transition_checks.push(check);
        }

        // 生成 validate_transition 检查的分支
        let allowed_matches: Vec<proc_macro2::TokenStream> = transitions.iter()
            .map(|t| quote! { #enum_name::#t { .. } })
            .collect();

        let validate_branch = quote! {
            #enum_name::#variant_name { .. } => {
                if matches!(target, #(#allowed_matches)|*) {
                    Ok(())
                } else {
                    Err(format!(
                        "Cannot transition from '{}' to '{}'",
                        self.state_name(),
                        target.state_name()
                    ))
                }
            }
        };
        validate_transition_checks.push(validate_branch);

        // 生成允许的转换列表
        let transition_strs: Vec<String> = transitions.iter()
            .map(|t| t.to_string())
            .collect();

        allowed_transitions_list.push(quote! {
            #enum_name::#variant_name { .. } => &[#(#transition_strs),*],
        });
    }

    // 生成实现的代码
    let expanded = quote! {
        impl #enum_name {
            // 状态查询方法
            #(#state_queries)*

            /// 创建初始状态
            pub fn initial() -> Self {
                #enum_name::#initial_state
            }

            /// 获取当前状态名称
            pub fn state_name(&self) -> &str {
                match self {
                    #(Self::#variant_names { .. } => stringify!(#variant_names),)*
                }
            }

            /// 检查是否可以转换到目标状态
            pub fn can_transition_to(&self, target: &Self) -> bool {
                match (self, target) {
                    #(#can_transition_checks)*
                    _ => false,
                }
            }

            /// 验证转换是否有效
            pub fn validate_transition(&self, target: &Self) -> Result<(), String> {
                match self {
                    #(#validate_transition_checks)*
                }
            }

            /// 获取允许的转换列表
            pub fn allowed_transitions(&self) -> &[&'static str] {
                match self {
                    #(#allowed_transitions_list)*
                }
            }
        }

        impl Default for #enum_name {
            fn default() -> Self {
                Self::initial()
            }
        }
    };

    TokenStream::from(expanded)
}

/// 转换为 snake_case
fn to_snake_case(s: &str) -> String {
    let mut result = String::new();
    for (i, c) in s.chars().enumerate() {
        if c.is_uppercase() {
            if i != 0 {
                result.push('_');
            }
            result.extend(c.to_lowercase());
        } else {
            result.push(c);
        }
    }
    result
}
