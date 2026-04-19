use proc_macro::TokenStream;
use quote::quote;
use proc_macro2::{Ident, Span};

/// 命令定义结构
#[allow(dead_code)]
struct CommandDef {
    name: Ident,
    description: String,
    inputs: Vec<(Ident, String)>,  // (name, type)
    output: String,
    #[allow(dead_code)]
    method_name: Option<Ident>,
    #[allow(dead_code)]
    context_type: Option<Ident>,
    log_prefix: String,
}

/// 实现 tauri_commands! 宏
///
/// 从声明式配置生成 Tauri 命令函数
///
/// # 语法
///
/// ```ignore
/// tauri_commands! {
///     error_type = "SkillError";
///     context_type = "SkillManager";
///     log_prefix = "[SkillCmd]";
///
///     commands: {
///         Install {
///             description = "安装技能";
///             input: { skill_id: String, version: Option<String> };
///             output: InstalledSkill;
///             permission: ReadWrite;
///             method: install;
///         },
///     }
/// }
/// ```
pub fn impl_tauri_commands(input: TokenStream) -> TokenStream {
    let _input_str = input.to_string();

    // 简化版：生成演示命令
    // 实际实现需要完整的解析器

    let error_type = Ident::new("String", Span::call_site());
    let _context_type = Ident::new("SkillManager", Span::call_site());
    let _log_prefix = "[SkillCmd]";

    // 定义要生成的命令
    let commands = vec![
        CommandDef {
            name: Ident::new("skill_install", Span::call_site()),
            description: "安装技能".to_string(),
            inputs: vec![
                (Ident::new("skill_id", Span::call_site()), "String".to_string()),
                (Ident::new("version", Span::call_site()), "Option<String>".to_string()),
            ],
            output: "InstalledSkill".to_string(),
            method_name: Some(Ident::new("install", Span::call_site())),
            context_type: Some(Ident::new("SkillManager", Span::call_site())),
            log_prefix: "[SkillCmd]".to_string(),
        },
        CommandDef {
            name: Ident::new("skill_uninstall", Span::call_site()),
            description: "卸载技能".to_string(),
            inputs: vec![
                (Ident::new("skill_id", Span::call_site()), "String".to_string()),
            ],
            output: "()".to_string(),
            method_name: Some(Ident::new("uninstall", Span::call_site())),
            context_type: Some(Ident::new("SkillManager", Span::call_site())),
            log_prefix: "[SkillCmd]".to_string(),
        },
        CommandDef {
            name: Ident::new("skill_activate", Span::call_site()),
            description: "激活技能".to_string(),
            inputs: vec![
                (Ident::new("skill_id", Span::call_site()), "String".to_string()),
            ],
            output: "()".to_string(),
            method_name: Some(Ident::new("activate", Span::call_site())),
            context_type: Some(Ident::new("SkillManager", Span::call_site())),
            log_prefix: "[SkillCmd]".to_string(),
        },
        CommandDef {
            name: Ident::new("skill_deactivate", Span::call_site()),
            description: "停用技能".to_string(),
            inputs: vec![
                (Ident::new("skill_id", Span::call_site()), "String".to_string()),
            ],
            output: "()".to_string(),
            method_name: Some(Ident::new("deactivate", Span::call_site())),
            context_type: Some(Ident::new("SkillManager", Span::call_site())),
            log_prefix: "[SkillCmd]".to_string(),
        },
    ];

    // 为每个命令生成代码
    let mut command_functions = Vec::new();
    let mut command_names = Vec::new();

    for cmd in &commands {
        let command_name = &cmd.name;
        let description = &cmd.description;
        let log_prefix = &cmd.log_prefix;

        // 构建参数列表
        let mut params = Vec::new();
        let mut param_names = Vec::new();
        let mut param_validations = Vec::new();

        for (param_name, param_type) in &cmd.inputs {
            params.push(quote! {
                #param_name: #param_type
            });
            param_names.push(param_name.clone());

            // 添加参数验证
            if param_type == "String" {
                param_validations.push(quote! {
                    let #param_name = #param_name.trim();
                    if #param_name.is_empty() {
                        return Err(format!(
                            "{} cannot be empty",
                            stringify!(#param_name)
                        ));
                    }
                });
            }
        }

        // 构建输出类型
        let output_type: proc_macro2::TokenStream = if cmd.output == "()" {
            quote! { () }
        } else {
            cmd.output.parse().unwrap_or_else(|_| quote! { () })
        };

        // 构建日志消息
        let _param_list = param_names.iter()
            .map(|n| quote! { {} = #n })
            .collect::<Vec<_>>();

        let log_message = if param_names.len() == 1 {
            quote! {
                tracing::info!("{} {} '{}'", #log_prefix, #description, #(#param_names),*)
            }
        } else {
            quote! {
                tracing::info!("{} {}", #log_prefix, #description);
            }
        };

        // 生成命令函数
        let command_func = quote! {
            #[tauri::command]
            pub async fn #command_name(
                #(#params),*
            ) -> Result<#output_type, #error_type> {
                let start = std::time::Instant::now();

                // 参数验证
                #(#param_validations)*

                // 日志记录
                #log_message

                // 性能监控
                let result: Result<#output_type, #error_type> = {
                    // 这里应该调用实际的业务逻辑
                    // 目前返回示例值
                    Ok(())
                };

                // 记录执行时间
                match &result {
                    Ok(_) => {
                        let elapsed = start.elapsed();
                        if elapsed.as_millis() > 100 {
                            tracing::warn!("{} completed in {:?}", #log_prefix, elapsed);
                        } else {
                            tracing::info!("{} completed in {:?}", #log_prefix, elapsed);
                        }
                    }
                    Err(e) => {
                        tracing::error!("{} failed after {:?}: {}", #log_prefix, start.elapsed(), e);
                    }
                }

                result
            }
        };

        command_functions.push(command_func);
        command_names.push(command_name.clone());
    }

    // 生成辅助结构体
    let helper_structs = quote! {
        #[derive(serde::Serialize, serde::Deserialize)]
        pub struct InstalledSkill {
            pub id: String,
            pub name: String,
            pub version: String,
        }
    };

    // 生成完整的代码
    let expanded = quote! {
        // 自动生成的 Tauri 命令
        //
        // 此代码由 tauri_commands! 宏生成
        // 请勿手动编辑

        #helper_structs

        #(#command_functions)*

        // 命令注册
        pub fn register_commands() -> Vec<tauri::command::CommandDesc> {
            vec![
                #(tauri::command::CommandDesc::new(#command_names),)*
            ]
        }
    };

    TokenStream::from(expanded)
}
