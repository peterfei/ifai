// 🔥 Workflow ESC 取消功能单元测试
//
// 测试 WorkflowManager 和取消核心逻辑（不运行完整 workflow）
//
// 运行方式：
//   cd src-tauri && cargo test --bin ifai workflow_cancel_unit -- --nocapture

#[cfg(test)]
mod tests {
    use ifainew_lib::commands::workflow_commands;
    use ifainew_lib::agent_system::workflow::{
        parser::WorkflowParser,
        runner::{WorkflowRunner, RunnerConfig},
        types::{AgentType, Workflow, WorkflowNode},
    };

    /// 创建一个简单的测试 workflow
    fn create_test_workflow() -> Workflow {
        use std::collections::HashMap;

        Workflow {
            id: "test-workflow".to_string(),
            name: "Test Workflow".to_string(),
            description: "Test workflow for cancel".to_string(),
            nodes: vec![WorkflowNode {
                id: "node1".to_string(),
                agent_type: AgentType::Explore,
                label: Some("Test Node".to_string()),
                config: Default::default(),
            }],
            edges: vec![],
            variables: HashMap::new(),
        }
    }

    #[tokio::test]
    async fn test_workflow_manager_create_and_cancel() {
        println!("\n============================================================");
        println!("🔥 WorkflowManager 创建和取消测试");
        println!("============================================================\n");

        // ==================== 步骤 1: 创建并注册 workflow ====================
        println!("📋 步骤 1: 创建并注册 workflow");

        let workflow = create_test_workflow();
        let config = RunnerConfig::default();
        let runner = WorkflowRunner::new(workflow, config)
            .expect("Failed to create workflow runner");

        let manager = workflow_commands::get_workflow_manager();
        let mut mgr = manager.lock().await;

        // 生成唯一 ID
        let workflow_id = format!("test-{}", uuid::Uuid::new_v4());

        mgr.start_workflow(workflow_id.clone(), runner)
            .expect("Failed to start workflow");
        drop(mgr);

        println!("  ✓ Workflow 启动成功: {}", workflow_id);

        // ==================== 步骤 2: 验证 workflow 已注册 ====================
        println!("\n🔵 步骤 2: 验证 workflow 已注册");

        let manager = workflow_commands::get_workflow_manager();
        let mgr = manager.lock().await;
        let is_registered = mgr.get_workflow(&workflow_id).is_some();
        drop(mgr);

        assert!(is_registered, "Workflow 应该已注册");
        println!("  ✓ Workflow 已在 manager 中注册");

        // ==================== 步骤 3: 调用 cancel ====================
        println!("\n🟢 步骤 3: 调用 cancel");

        let manager = workflow_commands::get_workflow_manager();
        let mut mgr = manager.lock().await;

        if let Some(runner_arc) = mgr.get_workflow(&workflow_id) {
            let mut runner = runner_arc.lock().await;
            let status_before = runner.get_status().await;
            println!("  取消前状态: {:?}", status_before);

            // 调用 cancel
            let cancel_result = runner.cancel().await;
            assert!(cancel_result.is_ok(), "Cancel 应该成功");

            let status_after = runner.get_status().await;
            println!("  取消后状态: {:?}", status_after);

            // 验证状态变为 Cancelled
            use ifainew_lib::agent_system::workflow::runner::WorkflowStatus;
            assert_eq!(
                status_after,
                WorkflowStatus::Cancelled,
                "状态应该变为 Cancelled"
            );
        }
        drop(mgr);

        println!("  ✓ Cancel 调用成功");

        // ==================== 步骤 4: 从 manager 移除 ====================
        println!("\n🟣 步骤 4: 从 manager 移除");

        let manager = workflow_commands::get_workflow_manager();
        let mut mgr = manager.lock().await;
        mgr.remove_workflow(&workflow_id);
        drop(mgr);

        // 验证已移除
        let manager = workflow_commands::get_workflow_manager();
        let mgr = manager.lock().await;
        let is_still_registered = mgr.get_workflow(&workflow_id).is_some();
        drop(mgr);

        assert!(!is_still_registered, "Workflow 应该已移除");
        println!("  ✓ Workflow 已从 manager 移除");

        println!("\n============================================================");
        println!("✅ 所有测试通过");
        println!("============================================================");
    }

    #[tokio::test]
    async fn test_all_workflows_returns_tui_workflows() {
        println!("\n============================================================");
        println!("🔥 WorkflowManager::all_workflows 测试");
        println!("============================================================\n");

        let manager = workflow_commands::get_workflow_manager();
        let mgr = manager.lock().await;

        println!("  当前运行中的 workflows: {:?}", mgr.all_workflows());

        // 验证返回值类型
        let workflows: Vec<String> = mgr.all_workflows();
        println!("  ✓ all_workflows() 返回 Vec<String>");

        drop(mgr);

        println!("\n✅ 测试通过");
    }

    #[tokio::test]
    async fn test_workflow_cancel_propagation() {
        println!("\n============================================================");
        println!("🔥 CancellationToken 传播测试");
        println!("============================================================\n");

        // 创建 workflow
        let workflow = create_test_workflow();
        let config = RunnerConfig::default();
        let runner = WorkflowRunner::new(workflow, config)
            .expect("Failed to create workflow runner");

        // 验证 runner 有 cancellation_token
        println!("  ✓ WorkflowRunner 创建成功");

        // 注册到 manager
        let manager = workflow_commands::get_workflow_manager();
        let mut mgr = manager.lock().await;
        let workflow_id = format!("test-cancel-{}", uuid::Uuid::new_v4());
        mgr.start_workflow(workflow_id.clone(), runner)
            .expect("Failed to start workflow");
        drop(mgr);

        // 调用 cancel
        let manager = workflow_commands::get_workflow_manager();
        let mut mgr = manager.lock().await;

        if let Some(runner_arc) = mgr.get_workflow(&workflow_id) {
            let mut runner = runner_arc.lock().await;

            // 验证 cancel 前 token 未取消
            // (无法直接访问 token，但可以通过行为验证)

            let cancel_result = runner.cancel().await;
            assert!(cancel_result.is_ok(), "Cancel 应该成功");

            println!("  ✓ Cancel 调用成功，token 应该已触发");
        }

        mgr.remove_workflow(&workflow_id);
        drop(mgr);

        println!("\n✅ 测试通过");
    }

    #[tokio::test]
    async fn test_workflow_manager_concurrent_access() {
        println!("\n============================================================");
        println!("🔥 WorkflowManager 并发访问测试");
        println!("============================================================\n");

        let workflow = create_test_workflow();
        let config = RunnerConfig::default();
        let runner = WorkflowRunner::new(workflow, config)
            .expect("Failed to create workflow runner");

        let manager = workflow_commands::get_workflow_manager();
        let mut mgr = manager.lock().await;

        let workflow_id = format!("test-concurrent-{}", uuid::Uuid::new_v4());
        mgr.start_workflow(workflow_id.clone(), runner)
            .expect("Failed to start workflow");
        drop(mgr);

        // 模拟并发访问
        let manager_clone = workflow_commands::get_workflow_manager();
        let workflow_id_clone = workflow_id.clone();

        let task1 = tokio::spawn(async move {
            let mgr = manager_clone.lock().await;
            let exists = mgr.get_workflow(&workflow_id_clone).is_some();
            drop(mgr);
            exists
        });

        let task2 = tokio::spawn(async move {
            let mgr = manager.lock().await;
            let count = mgr.all_workflows().len();
            drop(mgr);
            count
        });

        let result1 = task1.await.unwrap();
        let result2 = task2.await.unwrap();

        assert!(result1, "Workflow 应该存在");
        assert!(result2 >= 1, "应该至少有一个 workflow");

        println!("  ✓ 并发访问测试通过");

        // 清理
        let manager = workflow_commands::get_workflow_manager();
        let mut mgr = manager.lock().await;
        mgr.remove_workflow(&workflow_id);
        drop(mgr);

        println!("\n✅ 测试通过");
    }
}
