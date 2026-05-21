//! 空间隐喻分类定义
//!
//! 使用元编程生成 Wing、Hall 和 MemoryPath，支持 4 层空间隐喻。

/// 宏定义：声明式 Wing（项目/用户维度）
/// 格式：{WingType}/{name}，如 "project/ifai" 或 "user/alice"
macro_rules! declare_wings {
    (
        $(
            $name:ident : $prefix:expr ;
        )*
    ) => {
        #[derive(Debug, Clone, PartialEq, Eq, Hash)]
        pub enum Wing {
            $($name),*
        }

        impl Wing {
            pub fn prefix(&self) -> &'static str {
                match self {
                    $(Self::$name => $prefix),*
                }
            }

            pub fn all() -> &'static [Wing] {
                &[$(Wing::$name),*]
            }
        }

        impl std::fmt::Display for Wing {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                match self {
                    $(Self::$name => write!(f, "{}", $prefix)),*
                }
            }
        }

        impl std::str::FromStr for Wing {
            type Err = String;

            fn from_str(s: &str) -> Result<Self, Self::Err> {
                match s {
                    $($prefix => Ok(Wing::$name),)*
                    _ => Err(format!("Invalid Wing: {}", s)),
                }
            }
        }
    };
}

/// 声明式定义 Wing（扩展只需在此添加）
declare_wings! {
    Project : "project";  // 项目维度
    User : "user";        // 用户维度
}

/// 宏定义：声明式 Hall（4 个主分类）
macro_rules! declare_halls {
    (
        $(
            $name:ident : $display:expr ;
        )*
    ) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
        pub enum MemoryHall {
            $($name),*
        }

        impl MemoryHall {
            pub fn display_name(&self) -> &'static str {
                match self {
                    $(Self::$name => $display),*
                }
            }

            pub fn all() -> &'static [MemoryHall] {
                &[$(MemoryHall::$name),*]
            }
        }

        impl std::fmt::Display for MemoryHall {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, "{}", self.display_name())
            }
        }

        impl std::str::FromStr for MemoryHall {
            type Err = String;

            fn from_str(s: &str) -> Result<Self, Self::Err> {
                match s {
                    $($display => Ok(MemoryHall::$name),)*
                    $(stringify!($name) => Ok(MemoryHall::$name),)*
                    _ => Err(format!("Invalid Hall: {}", s)),
                }
            }
        }
    };
}

/// 声明式定义 Hall（扩展只需在此添加）
declare_halls! {
    Preferences : "Preferences";
    ProjectKnowledge : "Project Knowledge";
    Decisions : "Decisions";
    WorkflowPatterns : "Workflow Patterns";
}

/// 空间路径：Wing/Hall/Room 或 Hall/Room
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct MemoryPath {
    pub wing: Option<Wing>, // 可选：project/ifai, user/alice
    pub hall: MemoryHall,   // 必须：Preferences, ProjectKnowledge, etc.
    pub room: String,       // 必须：programming-languages, frontend-stack, etc.
}

impl std::str::FromStr for MemoryPath {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let parts: Vec<&str> = s.split('/').collect();

        match parts.len() {
            2 => {
                // Hall/Room（省略 Wing）
                let hall = parts[0]
                    .parse::<MemoryHall>()
                    .map_err(|_| format!("Invalid Hall: {}", parts[0]))?;
                let room = parts[1].to_string();
                Ok(MemoryPath {
                    wing: None,
                    hall,
                    room,
                })
            }
            3 => {
                // Wing/Hall/Room（完整 3 层）
                let wing = Some(
                    parts[0]
                        .parse::<Wing>()
                        .map_err(|_| format!("Invalid Wing: {}", parts[0]))?,
                );
                let hall = parts[1]
                    .parse::<MemoryHall>()
                    .map_err(|_| format!("Invalid Hall: {}", parts[1]))?;
                let room = parts[2].to_string();
                Ok(MemoryPath { wing, hall, room })
            }
            _ => Err(format!(
                "Invalid path format: {}, expected 'Hall/Room' or 'Wing/Hall/Room'",
                s
            )),
        }
    }
}

impl MemoryPath {
    /// 生成 Markdown section 标题（支持 2-3 层缩进）
    pub fn section_title(&self) -> String {
        match &self.wing {
            None => {
                // 2 层：## Hall\n### Room
                format!("## {}\n### {}", self.hall, self.room)
            }
            Some(wing) => {
                // 3 层：## Wing (使用枚举名称的大写形式)\n### Hall\n#### Room
                let wing_name = match wing {
                    Wing::Project => "Project",
                    Wing::User => "User",
                };
                format!("## {}\n### {}\n#### {}", wing_name, self.hall, self.room)
            }
        }
    }

    /// 显示路径（Wing/Hall/Room 或 Hall/Room）
    pub fn display(&self) -> String {
        match &self.wing {
            None => format!("{}/{}", self.hall, self.room),
            Some(wing) => format!("{}/{}/{}", wing, self.hall, self.room),
        }
    }
}

/// 生成 path_schema（用于工具 Schema 定义）
pub fn path_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "string",
        "description": "Memory path in spatial metaphor format",
        "examples": [
            "Preferences/programming-languages",
            "Project Knowledge/frontend-stack",
            "project/Preferences/programming-languages",
            "user/Project Knowledge/database-config"
        ]
    })
}

// ============ 单元测试 ============

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wing_from_str_valid() {
        assert_eq!("project".parse::<Wing>(), Ok(Wing::Project));
        assert_eq!("user".parse::<Wing>(), Ok(Wing::User));
    }

    #[test]
    fn test_wing_from_str_invalid() {
        assert!("invalid".parse::<Wing>().is_err());
    }

    #[test]
    fn test_wing_display() {
        assert_eq!(Wing::Project.to_string(), "project");
        assert_eq!(Wing::User.to_string(), "user");
    }

    #[test]
    fn test_wing_prefix() {
        assert_eq!(Wing::Project.prefix(), "project");
        assert_eq!(Wing::User.prefix(), "user");
    }

    #[test]
    fn test_wing_all() {
        let wings = Wing::all();
        assert_eq!(wings.len(), 2);
        assert!(wings.contains(&Wing::Project));
        assert!(wings.contains(&Wing::User));
    }

    #[test]
    fn test_hall_from_str_valid() {
        assert_eq!(
            "Preferences".parse::<MemoryHall>(),
            Ok(MemoryHall::Preferences)
        );
        assert_eq!(
            "Project Knowledge".parse::<MemoryHall>(),
            Ok(MemoryHall::ProjectKnowledge)
        );
        assert_eq!("Decisions".parse::<MemoryHall>(), Ok(MemoryHall::Decisions));
        assert_eq!(
            "Workflow Patterns".parse::<MemoryHall>(),
            Ok(MemoryHall::WorkflowPatterns)
        );
    }

    #[test]
    fn test_hall_from_str_invalid() {
        assert!("InvalidHall".parse::<MemoryHall>().is_err());
    }

    // ── PascalCase 别名容错（AI 模型可能传 "ProjectKnowledge" 而非 "Project Knowledge"）──

    #[test]
    fn test_hall_pascal_case_alias_project_knowledge() {
        assert_eq!(
            "ProjectKnowledge".parse::<MemoryHall>(),
            Ok(MemoryHall::ProjectKnowledge)
        );
    }

    #[test]
    fn test_hall_pascal_case_alias_workflow_patterns() {
        assert_eq!(
            "WorkflowPatterns".parse::<MemoryHall>(),
            Ok(MemoryHall::WorkflowPatterns)
        );
    }

    #[test]
    fn test_hall_pascal_case_path_resolution() {
        // 完整路径测试：PascalCase Hall + Room
        let path = "ProjectKnowledge/frontend-stack".parse::<MemoryPath>();
        assert!(path.is_ok(), "PascalCase Hall should resolve: {:?}", path);
        let p = path.unwrap();
        assert_eq!(p.hall, MemoryHall::ProjectKnowledge);
        assert_eq!(p.room, "frontend-stack");
    }

    #[test]
    fn test_hall_unknown_still_rejected() {
        assert!("UnknownHall".parse::<MemoryHall>().is_err());
    }

    #[test]
    fn test_hall_display_name() {
        assert_eq!(MemoryHall::Preferences.display_name(), "Preferences");
        assert_eq!(
            MemoryHall::ProjectKnowledge.display_name(),
            "Project Knowledge"
        );
        assert_eq!(MemoryHall::Decisions.display_name(), "Decisions");
        assert_eq!(
            MemoryHall::WorkflowPatterns.display_name(),
            "Workflow Patterns"
        );
    }

    #[test]
    fn test_hall_all() {
        let halls = MemoryHall::all();
        assert_eq!(halls.len(), 4);
        assert!(halls.contains(&MemoryHall::Preferences));
        assert!(halls.contains(&MemoryHall::ProjectKnowledge));
        assert!(halls.contains(&MemoryHall::Decisions));
        assert!(halls.contains(&MemoryHall::WorkflowPatterns));
    }

    #[test]
    fn test_hall_all_unique() {
        let halls = MemoryHall::all();
        let unique_halls: std::collections::HashSet<_> = halls.iter().collect();
        assert_eq!(halls.len(), unique_halls.len());
    }

    #[test]
    fn test_memory_path_parse_2_layer() {
        let path = "Preferences/programming-languages"
            .parse::<MemoryPath>()
            .unwrap();
        assert_eq!(path.wing, None);
        assert_eq!(path.hall, MemoryHall::Preferences);
        assert_eq!(path.room, "programming-languages");
    }

    #[test]
    fn test_memory_path_parse_3_layer() {
        let path = "project/Preferences/programming-languages"
            .parse::<MemoryPath>()
            .unwrap();
        assert_eq!(path.wing, Some(Wing::Project));
        assert_eq!(path.hall, MemoryHall::Preferences);
        assert_eq!(path.room, "programming-languages");
    }

    #[test]
    fn test_memory_path_parse_invalid_hall() {
        let result = "InvalidHall/room".parse::<MemoryPath>();
        assert!(result.is_err());
    }

    #[test]
    fn test_memory_path_parse_invalid_wing() {
        let result = "invalid/wing/Preferences/room".parse::<MemoryPath>();
        assert!(result.is_err());
    }

    #[test]
    fn test_memory_path_parse_invalid_format() {
        let result = "only-one-part".parse::<MemoryPath>();
        assert!(result.is_err());

        let result = "four/parts/here/extra".parse::<MemoryPath>();
        assert!(result.is_err());
    }

    #[test]
    fn test_memory_path_section_title_2_layer() {
        let path = MemoryPath {
            wing: None,
            hall: MemoryHall::Preferences,
            room: "programming-languages".to_string(),
        };
        assert_eq!(
            path.section_title(),
            "## Preferences\n### programming-languages"
        );
    }

    #[test]
    fn test_memory_path_section_title_4_layer() {
        let path = MemoryPath {
            wing: Some(Wing::Project),
            hall: MemoryHall::Preferences,
            room: "programming-languages".to_string(),
        };
        assert_eq!(
            path.section_title(),
            "## Project\n### Preferences\n#### programming-languages"
        );
    }

    #[test]
    fn test_memory_path_display_2_layer() {
        let path = MemoryPath {
            wing: None,
            hall: MemoryHall::Preferences,
            room: "programming-languages".to_string(),
        };
        assert_eq!(path.display(), "Preferences/programming-languages");
    }

    #[test]
    fn test_memory_path_display_3_layer() {
        let path = MemoryPath {
            wing: Some(Wing::Project),
            hall: MemoryHall::Preferences,
            room: "programming-languages".to_string(),
        };
        assert_eq!(path.display(), "project/Preferences/programming-languages");
    }

    #[test]
    fn test_path_schema() {
        let schema = path_schema();
        assert_eq!(schema["type"], "string");
        assert!(schema["description"].is_string());

        let examples = schema["examples"].as_array().unwrap();
        assert_eq!(examples.len(), 4);
        assert!(examples.contains(&serde_json::json!("Preferences/programming-languages")));
        assert!(examples.contains(&serde_json::json!(
            "project/Preferences/programming-languages"
        )));
    }

    #[test]
    fn test_backward_compatibility_2_layer_paths() {
        // 验证 2 层路径仍能正常解析（向后兼容）
        let paths = vec![
            "Preferences/programming-languages",
            "Project Knowledge/frontend-stack",
            "Decisions/database-choice",
            "Workflow Patterns/code-review",
        ];

        for path_str in paths {
            let path = path_str.parse::<MemoryPath>();
            assert!(path.is_ok(), "Failed to parse: {}", path_str);
            let path = path.unwrap();
            assert_eq!(path.wing, None, "Path should have no wing: {}", path_str);
            assert!(
                !path.room.is_empty(),
                "Room should not be empty: {}",
                path_str
            );
        }
    }

    #[test]
    fn test_user_wing_paths() {
        // 验证 User Wing 路径
        let path = "user/Preferences/communication-style"
            .parse::<MemoryPath>()
            .unwrap();
        assert_eq!(path.wing, Some(Wing::User));
        assert_eq!(path.hall, MemoryHall::Preferences);
        assert_eq!(path.room, "communication-style");
        assert_eq!(path.display(), "user/Preferences/communication-style");
    }
}
