use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, DeriveInput, Data, DataStruct, Fields};

/// 实现 SkillFormat derive 宏
pub fn impl_skill_format(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    let struct_name = &input.ident;

    // 解析结构体字段
    let fields = match &input.data {
        Data::Struct(DataStruct { fields, .. }) => match fields {
            Fields::Named(named) => &named.named,
            _ => {
                return syn::Error::new_spanned(
                    struct_name,
                    "SkillFormat 只支持命名字段的结构体"
                ).to_compile_error().into();
            }
        },
        _ => {
            return syn::Error::new_spanned(
                struct_name,
                "SkillFormat 只支持结构体"
            ).to_compile_error().into();
        }
    };

    // 解析 skill 属性
    let mut id_field = None;
    let mut name_field = None;
    let mut description_field = None;
    let mut prompt_field = None;

    for field in fields {
        let field_name = &field.ident;

        // 解析 #[skill(...)] 属性
        for attr in &field.attrs {
            if attr.path().is_ident("skill") {
                if let Ok(nested) = attr.meta.require_list() {
                    let nested_str = quote!(#nested).to_string();

                    if nested_str.contains("id") && !nested_str.contains('=') {
                        id_field = field_name.clone();
                    }
                    if nested_str.contains("name") && !nested_str.contains('=') {
                        name_field = field_name.clone();
                    }
                    if nested_str.contains("description") && !nested_str.contains('=') {
                        description_field = field_name.clone();
                    }
                    if nested_str.contains("prompt") && !nested_str.contains('=') {
                        prompt_field = field_name.clone();
                    }
                }
            }
        }
    }

    // 验证必需字段
    let id_field = match id_field {
        Some(f) => f,
        None => {
            return syn::Error::new_spanned(
                struct_name,
                "缺少必需的 #[skill(id)] 字段标记"
            ).to_compile_error().into();
        }
    };

    let name_field = match name_field {
        Some(f) => f,
        None => {
            return syn::Error::new_spanned(
                struct_name,
                "缺少必需的 #[skill(name)] 字段标记"
            ).to_compile_error().into();
        }
    };

    let prompt_field = match prompt_field {
        Some(f) => f,
        None => {
            return syn::Error::new_spanned(
                struct_name,
                "缺少必需的 #[skill(prompt)] 字段标记"
            ).to_compile_error().into();
        }
    };

    // 生成代码
    let expanded = quote! {
        // ========== JSON 支持 ==========

        impl #struct_name {
            /// 从 JSON 字符串解析
            pub fn from_json(json: &str) -> Result<Self, String> {
                serde_json::from_str(json)
                    .map_err(|e| format!("Invalid JSON: {}", e))
            }

            /// 转换为 JSON 字符串
            pub fn to_json(&self) -> String {
                serde_json::to_string_pretty(self).unwrap_or_default()
            }

            /// 从 YAML 字符串解析
            pub fn from_yaml(yaml: &str) -> Result<Self, String> {
                serde_yaml::from_str(yaml)
                    .map_err(|e| format!("Invalid YAML: {}", e))
            }

            /// 转换为 YAML 字符串
            pub fn to_yaml(&self) -> String {
                serde_yaml::to_string(self).unwrap_or_default()
            }

            /// 从 Markdown (YAML frontmatter) 解析
            pub fn from_markdown(md: &str) -> Result<Self, String> {
                // 分离 YAML frontmatter 和正文
                let parts: Vec<&str> = md.splitn(3, "---").collect();
                if parts.len() < 3 {
                    return Err("Missing YAML frontmatter delimiter".to_string());
                }

                let yaml_frontmatter = parts[1].trim();
                let content = parts.get(2).unwrap_or(&"").trim();

                // 解析 YAML frontmatter
                let mut skill: #struct_name = serde_yaml::from_str(yaml_frontmatter)
                    .map_err(|e| format!("Invalid YAML: {}", e))?;

                // 将正文内容设置到 prompt 字段
                skill.#prompt_field = content.to_string();

                Ok(skill)
            }

            /// 转换为 Markdown (YAML frontmatter)
            pub fn to_markdown(&self) -> String {
                // 克隆并清空 prompt 字段用于 YAML 序列化
                let mut yaml_skill = self.clone();
                let content = yaml_skill.#prompt_field.clone();
                yaml_skill.#prompt_field = String::new();

                let yaml_part = serde_yaml::to_string(&yaml_skill).unwrap_or_default();
                let content_part = &self.#prompt_field;

                format!("---\n{}---\n\n{}", yaml_part, content_part)
            }

            /// 自动格式检测并解析
            pub fn from_str(s: &str) -> Result<Self, String> {
                let s = s.trim();

                // 尝试 JSON
                if s.starts_with('{') {
                    return Self::from_json(s);
                }

                // 尝试 Markdown (YAML frontmatter)
                if s.starts_with("---") {
                    return Self::from_markdown(s);
                }

                // 尝试 YAML
                Self::from_yaml(s)
            }

            /// 校验技能 Schema
            pub fn validate(&self) -> Result<(), String> {
                // 检查必需字段
                if self.#id_field.is_empty() {
                    return Err("Missing required field: id".to_string());
                }
                if self.#name_field.is_empty() {
                    return Err("Missing required field: name".to_string());
                }
                if self.#prompt_field.is_empty() {
                    return Err("Missing required field: system_prompt".to_string());
                }

                // 验证 ID 格式（kebab-case）
                if !Self::is_valid_skill_id(&self.#id_field) {
                    return Err(format!(
                        "Invalid skill id '{}': must be kebab-case (lowercase letters, numbers, hyphens)",
                        self.#id_field
                    ));
                }

                Ok(())
            }

            /// 验证技能 ID 格式（kebab-case）
            pub fn is_valid_skill_id(id: &str) -> bool {
                if id.is_empty() || id.len() > 64 {
                    return false;
                }

                // 必须以字母开头
                if !id.chars().next().map(|c| c.is_ascii_lowercase()).unwrap_or(false) {
                    return false;
                }

                // 只允许小写字母、数字和连字符
                for c in id.chars() {
                    if !c.is_ascii_lowercase() && !c.is_ascii_digit() && c != '-' {
                        return false;
                    }
                }

                // 不能以连字符结尾
                if id.ends_with('-') {
                    return false;
                }

                // 不能有连续的连字符
                if id.contains("--") {
                    return false;
                }

                true
            }

            /// 验证版本号（semver）
            pub fn validate_version(version: &str) -> Result<(), String> {
                // 基本格式检查：major.minor 或 major.minor.patch
                let parts: Vec<&str> = version.split('.').collect();
                if parts.len() < 2 || parts.len() > 3 {
                    return Err(format!(
                        "Invalid version '{}': must be in format major.minor or major.minor.patch",
                        version
                    ));
                }

                // 验证主版本号（不能有前导零，除非是 0）
                let major_str = parts[0];
                if major_str.is_empty() {
                    return Err("Major version is empty".to_string());
                }
                if major_str.len() > 1 && major_str.starts_with('0') {
                    return Err(format!("Invalid major version '{}': cannot have leading zeros", major_str));
                }
                let _major: u64 = major_str.parse().map_err(|_| {
                    format!("Invalid major version '{}': must be a non-negative integer", major_str)
                })?;

                // 验证次版本号
                let minor_str = parts[1];
                if minor_str.is_empty() {
                    return Err("Minor version is empty".to_string());
                }
                if minor_str.len() > 1 && minor_str.starts_with('0') {
                    return Err(format!("Invalid minor version '{}': cannot have leading zeros", minor_str));
                }
                let _minor: u64 = minor_str.parse().map_err(|_| {
                    format!("Invalid minor version '{}': must be a non-negative integer", minor_str)
                })?;

                // 验证补丁版本号（如果存在）
                if parts.len() == 3 {
                    let patch_and_more = parts[2];
                    let patch_str = if let Some(pre_pos) = patch_and_more.find('-') {
                        &patch_and_more[..pre_pos]
                    } else if let Some(build_pos) = patch_and_more.find('+') {
                        &patch_and_more[..build_pos]
                    } else {
                        patch_and_more
                    };

                    if patch_str.is_empty() {
                        return Err("Patch version is empty".to_string());
                    }
                    if patch_str.len() > 1 && patch_str.starts_with('0') {
                        return Err(format!("Invalid patch version '{}': cannot have leading zeros", patch_str));
                    }
                    let _patch: u64 = patch_str.parse().map_err(|_| {
                        format!("Invalid patch version '{}': must be a non-negative integer", patch_str)
                    })?;
                }

                Ok(())
            }

            /// 验证预发布标识符
            fn is_valid_prerelease(s: &str) -> bool {
                if s.is_empty() {
                    return false;
                }

                for part in s.split('.') {
                    if part.is_empty() {
                        return false;
                    }

                    // 检查是否全是数字
                    if part.chars().all(|c| c.is_ascii_digit()) {
                        if part.len() > 1 && part.starts_with('0') {
                            return false; // 不能有前导零
                        }
                    } else {
                        // 必须是字母数字和连字符
                        for c in part.chars() {
                            if !c.is_ascii_alphanumeric() && c != '-' {
                                return false;
                            }
                        }
                    }
                }

                true
            }

            /// 检测依赖循环（用于技能管理器）
            pub fn detect_dependency_cycle(
                skill_id: &str,
                dependencies: &[String],
                all_skills: &std::collections::HashMap<String, Vec<String>>,
            ) -> Result<(), String> {
                let mut visited = std::collections::HashSet::new();
                let mut stack = std::collections::HashSet::new();

                if Self::has_cycle(skill_id, &mut visited, &mut stack, all_skills) {
                    return Err(format!(
                        "Dependency cycle detected involving skill '{}'",
                        skill_id
                    ));
                }

                Ok(())
            }

            /// 递归检测循环依赖
            fn has_cycle(
                skill_id: &str,
                visited: &mut std::collections::HashSet<String>,
                stack: &mut std::collections::HashSet<String>,
                all_skills: &std::collections::HashMap<String, Vec<String>>,
            ) -> bool {
                if stack.contains(skill_id) {
                    return true; // 发现循环
                }

                if visited.contains(skill_id) {
                    return false; // 已访问过，无需再次检查
                }

                visited.insert(skill_id.to_string());
                stack.insert(skill_id.to_string());

                // 检查所有依赖
                if let Some(deps) = all_skills.get(skill_id) {
                    for dep in deps {
                        if Self::has_cycle(dep, visited, stack, all_skills) {
                            return true;
                        }
                    }
                }

                stack.remove(skill_id);
                false
            }

            /// 解析兼容性表达式（例如 ">=0.4.0", "^1.0.0"）
            pub fn parse_compatibility_expr(expr: &str) -> Result<(String, String), String> {
                let expr = expr.trim();

                // 提取操作符
                let (op, version) = if expr.starts_with(">=") {
                    (">=", &expr[2..])
                } else if expr.starts_with("<=") {
                    ("<=", &expr[2..])
                } else if expr.starts_with('^') {
                    ("^", &expr[1..])
                } else if expr.starts_with('~') {
                    ("~", &expr[1..])
                } else if expr.starts_with('>') {
                    (">", &expr[1..])
                } else if expr.starts_with('<') {
                    ("<", &expr[1..])
                } else if expr.starts_with('=') {
                    ("=", &expr[1..])
                } else {
                    ("=", expr) // 默认为精确匹配
                };

                let version = version.trim();
                if version.is_empty() {
                    return Err(format!("Invalid compatibility expression '{}': missing version", expr));
                }

                // 验证版本号格式
                Self::validate_version(version)?;

                Ok((op.to_string(), version.to_string()))
            }

            /// 检查版本兼容性
            pub fn check_compatibility(
                required: &str,
                current: &str,
            ) -> Result<bool, String> {
                let (op, req_version) = Self::parse_compatibility_expr(required)?;

                // 简化版本：只支持 =、>=、<=、>、< 操作符
                // 对于 ^ 和 ~，需要更复杂的语义版本比较
                match op.as_str() {
                    "=" => Ok(current == req_version),
                    ">=" => {
                        if let (Ok(curr), Ok(req)) = (
                            semver::Version::parse(current),
                            semver::Version::parse(&req_version),
                        ) {
                            Ok(curr >= req)
                        } else {
                            Err("Version comparison failed".to_string())
                        }
                    }
                    "<=" => {
                        if let (Ok(curr), Ok(req)) = (
                            semver::Version::parse(current),
                            semver::Version::parse(&req_version),
                        ) {
                            Ok(curr <= req)
                        } else {
                            Err("Version comparison failed".to_string())
                        }
                    }
                    ">" => {
                        if let (Ok(curr), Ok(req)) = (
                            semver::Version::parse(current),
                            semver::Version::parse(&req_version),
                        ) {
                            Ok(curr > req)
                        } else {
                            Err("Version comparison failed".to_string())
                        }
                    }
                    "<" => {
                        if let (Ok(curr), Ok(req)) = (
                            semver::Version::parse(current),
                            semver::Version::parse(&req_version),
                        ) {
                            Ok(curr < req)
                        } else {
                            Err("Version comparison failed".to_string())
                        }
                    }
                    "^" => {
                        // 兼容版本：相同主版本号，次版本和补丁版本 >= 指定版本
                        if let (Ok(curr), Ok(req)) = (
                            semver::Version::parse(current),
                            semver::Version::parse(&req_version),
                        ) {
                            Ok(curr.major == req.major && curr >= req)
                        } else {
                            Err("Version comparison failed".to_string())
                        }
                    }
                    "~" => {
                        // 波浪版本：相同主.次版本号，补丁版本 >= 指定版本
                        if let (Ok(curr), Ok(req)) = (
                            semver::Version::parse(current),
                            semver::Version::parse(&req_version),
                        ) {
                            Ok(curr.major == req.major && curr.minor == req.minor && curr >= req)
                        } else {
                            Err("Version comparison failed".to_string())
                        }
                    }
                    _ => Err(format!("Unsupported operator: {}", op)),
                }
            }

            /// 从文件加载（自动检测格式）
            pub fn load_from_path(path: &std::path::Path) -> Result<Self, String> {
                let content = std::fs::read_to_string(path)
                    .map_err(|e| format!("IO error: {}", e))?;

                Self::from_str(&content)
            }

            /// 保存到文件（根据扩展名选择格式）
            pub fn save_to_path(&self, path: &std::path::Path) -> Result<(), String> {
                let content = match path.extension().and_then(|e| e.to_str()) {
                    Some("md") => self.to_markdown(),
                    Some("json") => self.to_json(),
                    Some("yaml") | Some("yml") => self.to_yaml(),
                    _ => return Err("Unsupported format".to_string()),
                };

                std::fs::write(path, content)
                    .map_err(|e| format!("IO error: {}", e))
            }

            /// 从旧 skill.json 格式迁移
            pub fn migrate_from_json_v1(json_path: &std::path::Path) -> Result<Self, String> {
                let json_content = std::fs::read_to_string(json_path)
                    .map_err(|e| format!("IO error: {}", e))?;

                // V1 格式: { "id", "name", "description", "system_prompt", ... }
                let skill: #struct_name = serde_json::from_str(&json_content)
                    .map_err(|e| format!("Parse error: {}", e))?;

                Ok(skill)
            }

            /// 导出为旧 skill.json 格式（向后兼容）
            pub fn to_json_v1(&self) -> String {
                self.to_json()
            }
        }

        // 实现 Default
        impl Default for #struct_name {
            fn default() -> Self {
                Self {
                    #id_field: String::new(),
                    #name_field: String::new(),
                    #description_field: String::new(),
                    #prompt_field: String::new(),
                    // 其他字段使用 Default
                    ..Default::default()
                }
            }
        }
    };

    TokenStream::from(expanded)
}
