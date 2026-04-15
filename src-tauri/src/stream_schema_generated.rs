// stream_schema_generated.rs — 由 codegen-stream-schema.ts 从 stream-schema.yaml 自动生成
// ⚠️ 此文件自动生成，请勿手动编辑。修改 schema/stream-schema.yaml 后重新运行 codegen。

// ═══════════════════════════════════════════════════════════
// Stream Phase State Machine
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StreamPhase {
    Streaming,
    AwaitingApproval,
    Continuing,
    Finished,
}

impl StreamPhase {
    /// 是否处于加载状态（由 streamPhases[].loading 自动生成）
    pub fn is_loading(&self) -> bool {
        matches!(self, Self::Streaming | Self::AwaitingApproval | Self::Continuing)
    }

    /// 获取当前 phase 允许的转换目标
    pub fn allowed_transitions(&self) -> Vec<StreamPhase> {
        match self {
        StreamPhase::Streaming => vec![StreamPhase::AwaitingApproval, StreamPhase::Finished],
        StreamPhase::AwaitingApproval => vec![StreamPhase::Continuing, StreamPhase::Finished, StreamPhase::Finished],
        StreamPhase::Continuing => vec![StreamPhase::AwaitingApproval, StreamPhase::Finished],
        StreamPhase::Finished => vec![],
        }
    }
}

// ═══════════════════════════════════════════════════════════
// Permission Mode（Ord 枚举，由 permissionModes[].ordinal 自动生成）
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum PermissionMode {
    ReadOnly,
    WorkspaceWrite,
    DangerFullAccess,
    Prompt,
    Allow,
}

impl PermissionMode {
    /// 是否自动批准（由 permissionModes[].autoApprove 自动生成）
    pub fn auto_approve(&self) -> bool {
        matches!(self, Self::ReadOnly | Self::Allow)
    }
}

// ═══════════════════════════════════════════════════════════
// Tool Permission Lookup（由 toolPermissions 自动生成）
// ═══════════════════════════════════════════════════════════

/// 查询工具所需权限（单一真相源，替代 is_safe_tool()）
pub fn required_permission_for(tool_name: &str) -> PermissionMode {
    let normalized = tool_name.replace("agent_", "");
    match normalized.as_str() {
        "read_file"
            | "read_file_range"
            | "list_dir"
            | "list_directory"
            | "scan_project"
            | "scan_directory"
            | "get_file_tree"
            | "get_file_symbols"
            | "list_functions"
            | "probe_symbols"
            | "search"
            | "grep_search"
            | "glob_search"
            | "search_file_content"
            | "TodoWrite"
            | "todowrite"
            | "init_rag_index"
            => PermissionMode::ReadOnly,
        "write_file"
            | "create_file"
            | "replace_text"
            | "edit_file"
            => PermissionMode::WorkspaceWrite,
        "delete_file"
            | "rename_file"
            | "move_file"
            | "bash"
            | "execute_command"
            | "PowerShell"
            => PermissionMode::DangerFullAccess,
        _ => PermissionMode::DangerFullAccess, // 未知工具默认最高权限
    }
}

/// 判断是否需要审批：active_mode < required_mode
pub fn requires_approval(active_mode: PermissionMode, tool_name: &str) -> bool {
    let required = required_permission_for(tool_name);
    active_mode < required
}

// ═══════════════════════════════════════════════════════════
// Backend Event Emit Timing（由 backendEvents[].emitTiming 自动生成）
// ═══════════════════════════════════════════════════════════

/// 仅在最终轮次转发的事件类型
pub fn is_final_round_only_event(event_type: &str) -> bool {
    matches!(event_type, "finish")
}

// ═══════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permission_ord_ordering() {
        assert!(PermissionMode::ReadOnly < PermissionMode::WorkspaceWrite);
        assert!(PermissionMode::WorkspaceWrite < PermissionMode::DangerFullAccess);
        assert!(PermissionMode::DangerFullAccess < PermissionMode::Prompt);
        assert!(PermissionMode::Prompt < PermissionMode::Allow);
    }

    #[test]
    fn test_permission_auto_approve() {
        assert!(PermissionMode::ReadOnly.auto_approve());
        assert!(!PermissionMode::WorkspaceWrite.auto_approve());
        assert!(!PermissionMode::DangerFullAccess.auto_approve());
        assert!(PermissionMode::Allow.auto_approve());
    }

    #[test]
    fn test_requires_approval_logic() {
        // WorkspaceWrite >= ReadOnly → no approval
        assert!(!requires_approval(PermissionMode::WorkspaceWrite, "read_file"));
        // WorkspaceWrite < DangerFullAccess → needs approval
        assert!(requires_approval(PermissionMode::WorkspaceWrite, "bash"));
        // Allow >= anything → no approval
        assert!(!requires_approval(PermissionMode::Allow, "bash"));
    }

    #[test]
    fn test_required_permission_for_unknown() {
        assert_eq!(required_permission_for("nonexistent_tool"), PermissionMode::DangerFullAccess);
    }

    #[test]
    fn test_agent_prefix_normalization() {
        assert_eq!(required_permission_for("agent_write_file"), required_permission_for("write_file"));
        assert_eq!(required_permission_for("agent_bash"), required_permission_for("bash"));
        assert_eq!(required_permission_for("agent_read_file"), required_permission_for("read_file"));
    }

    #[test]
    fn test_stream_phase_is_loading() {
        assert!(StreamPhase::Streaming.is_loading());
        assert!(StreamPhase::AwaitingApproval.is_loading());
        assert!(StreamPhase::Continuing.is_loading());
        assert!(!StreamPhase::Finished.is_loading());
    }

    #[test]
    fn test_phase_transitions_validity() {
        // STREAMING can go to AWAITING_APPROVAL or FINISHED
        let from_streaming = StreamPhase::Streaming.allowed_transitions();
        assert!(from_streaming.contains(&StreamPhase::AwaitingApproval));
        assert!(from_streaming.contains(&StreamPhase::Finished));
        assert!(!from_streaming.contains(&StreamPhase::Streaming));

        // FINISHED has no transitions
        assert!(StreamPhase::Finished.allowed_transitions().is_empty());
    }

    #[test]
    fn test_final_round_only_events() {
        assert!(is_final_round_only_event("finish"));
        assert!(!is_final_round_only_event("stream_phase"));
        assert!(!is_final_round_only_event("tool_approval_required"));
    }

    #[test]
    fn test_required_permission_for_all_tools() {
        // ReadOnly tools
        assert_eq!(required_permission_for("read_file"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("read_file_range"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("list_dir"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("scan_project"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("todowrite"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("TodoWrite"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("search"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("grep_search"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("glob_search"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("get_file_tree"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("get_file_symbols"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("list_functions"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("probe_symbols"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("scan_directory"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("search_file_content"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("list_directory"), PermissionMode::ReadOnly);
        assert_eq!(required_permission_for("init_rag_index"), PermissionMode::ReadOnly);
        // WorkspaceWrite tools
        assert_eq!(required_permission_for("write_file"), PermissionMode::WorkspaceWrite);
        assert_eq!(required_permission_for("create_file"), PermissionMode::WorkspaceWrite);
        assert_eq!(required_permission_for("edit_file"), PermissionMode::WorkspaceWrite);
        assert_eq!(required_permission_for("replace_text"), PermissionMode::WorkspaceWrite);
        // DangerFullAccess tools
        assert_eq!(required_permission_for("delete_file"), PermissionMode::DangerFullAccess);
        assert_eq!(required_permission_for("rename_file"), PermissionMode::DangerFullAccess);
        assert_eq!(required_permission_for("move_file"), PermissionMode::DangerFullAccess);
        assert_eq!(required_permission_for("bash"), PermissionMode::DangerFullAccess);
        assert_eq!(required_permission_for("execute_command"), PermissionMode::DangerFullAccess);
        assert_eq!(required_permission_for("PowerShell"), PermissionMode::DangerFullAccess);
    }

    #[test]
    fn test_required_permission_for_unknown_extended() {
        assert_eq!(required_permission_for("nonexistent_tool"), PermissionMode::DangerFullAccess);
        assert_eq!(required_permission_for(""), PermissionMode::DangerFullAccess);
        assert_eq!(required_permission_for("totally_fake_tool"), PermissionMode::DangerFullAccess);
    }

    #[test]
    fn test_auto_approve_via_ord_comparison() {
        // Ord order: ReadOnly(0) < WorkspaceWrite(1) < DangerFullAccess(2) < Prompt(3) < Allow(4)
        // WorkspaceWrite >= ReadOnly -> auto-approve (WorkspaceWrite >= required ReadOnly)
        assert!(PermissionMode::WorkspaceWrite >= PermissionMode::ReadOnly);
        // WorkspaceWrite < DangerFullAccess -> should NOT auto-approve
        assert!(PermissionMode::WorkspaceWrite < PermissionMode::DangerFullAccess);
        // Allow >= DangerFullAccess -> auto-approve
        assert!(PermissionMode::Allow >= PermissionMode::DangerFullAccess);
        // Prompt > DangerFullAccess (Prompt ordinal is 3, DangerFullAccess is 2)
        assert!(PermissionMode::Prompt > PermissionMode::DangerFullAccess);
        // ReadOnly < WorkspaceWrite -> needs approval for write tools
        assert!(PermissionMode::ReadOnly < PermissionMode::WorkspaceWrite);
        // DangerFullAccess < Prompt < Allow
        assert!(PermissionMode::DangerFullAccess < PermissionMode::Prompt);
        assert!(PermissionMode::Prompt < PermissionMode::Allow);
    }

    #[test]
    fn test_requires_approval_comprehensive() {
        // Ord order: ReadOnly(0) < WorkspaceWrite(1) < DangerFullAccess(2) < Prompt(3) < Allow(4)
        // requires_approval uses: active_mode < required_mode

        // ReadOnly mode(0): needs approval for everything except ReadOnly(0) tools
        assert!(!requires_approval(PermissionMode::ReadOnly, "read_file"));       // 0 < 0 = false
        assert!(requires_approval(PermissionMode::ReadOnly, "write_file"));       // 0 < 1 = true
        assert!(requires_approval(PermissionMode::ReadOnly, "bash"));             // 0 < 2 = true

        // WorkspaceWrite mode(1): auto-approves ReadOnly(0) and WorkspaceWrite(1), not DangerFullAccess(2)
        assert!(!requires_approval(PermissionMode::WorkspaceWrite, "read_file")); // 1 < 0 = false
        assert!(!requires_approval(PermissionMode::WorkspaceWrite, "edit_file")); // 1 < 1 = false
        assert!(requires_approval(PermissionMode::WorkspaceWrite, "delete_file"));// 1 < 2 = true
        assert!(requires_approval(PermissionMode::WorkspaceWrite, "bash"));       // 1 < 2 = true

        // Allow mode(4): auto-approves everything
        assert!(!requires_approval(PermissionMode::Allow, "read_file"));         // 4 < 0 = false
        assert!(!requires_approval(PermissionMode::Allow, "write_file"));        // 4 < 1 = false
        assert!(!requires_approval(PermissionMode::Allow, "bash"));              // 4 < 2 = false
        assert!(!requires_approval(PermissionMode::Allow, "nonexistent_tool"));  // 4 < 2 = false

        // DangerFullAccess mode(2): auto-approves ReadOnly(0), WorkspaceWrite(1), and DangerFullAccess(2)
        assert!(!requires_approval(PermissionMode::DangerFullAccess, "read_file")); // 2 < 0 = false
        assert!(!requires_approval(PermissionMode::DangerFullAccess, "write_file"));// 2 < 1 = false
        assert!(!requires_approval(PermissionMode::DangerFullAccess, "bash"));      // 2 < 2 = false

        // Prompt mode(3): auto-approves ReadOnly(0), WorkspaceWrite(1), DangerFullAccess(2), not Prompt/Allow
        assert!(!requires_approval(PermissionMode::Prompt, "read_file"));  // 3 < 0 = false
        assert!(!requires_approval(PermissionMode::Prompt, "bash"));       // 3 < 2 = false
    }
}
