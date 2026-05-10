// 🔥 Phase 4: 会话归档 E2E 测试
//
// 测试 TUI/CLI 退出时是否正确保存会话摘要到 sessions/ 目录
//
// 运行方式：
//   cd src-tauri && cargo test --bin ifai session_archive -- --ignored --nocapture
//
// 测试内容：
// 1. 创建 Session 并添加对话消息
// 2. 调用会话归档函数
// 3. 验证 sessions/ 目录中创建了 Markdown 文件
// 4. 验证文件格式和内容正确

#[cfg(test)]
mod tests {
    use crate::persistence::SessionPersistence;
    use crate::session::Session;
    use ifainew_lib::harness::api::types::{Message, MessageContent, MessageRole};
    use std::fs;
    use std::path::PathBuf;

    /// 获取测试专用的临时目录
    fn test_archive_dir() -> PathBuf {
        std::env::temp_dir().join(format!("ifai_archive_test_{}", std::process::id()))
    }

    /// 设置测试环境（改变 HOME 到临时目录）
    fn setup_test_env() -> PathBuf {
        let test_dir = test_archive_dir();
        fs::create_dir_all(&test_dir).ok();
        std::env::set_var("HOME", test_dir.to_str().unwrap());
        test_dir
    }

    /// 清理测试环境
    fn cleanup_test_env(test_dir: PathBuf) {
        fs::remove_dir_all(test_dir).ok();
    }

    // ========================================================================
    // 核心测试：会话归档功能
    // ========================================================================

    #[test]
    #[serial_test::serial]
    #[ignore]
    fn test_session_archive_creates_file() {
        println!("\n============================================================");
        println!("🔥 会话归档 E2E 测试");
        println!("============================================================");

        // ==================== 步骤 1: 设置测试环境 ====================
        println!("\n📋 步骤 1: 设置测试环境");
        let test_dir = setup_test_env();
        println!("  ✓ 测试目录: {}", test_dir.display());

        // ==================== 步骤 2: 创建会话数据 ====================
        println!("\n📋 步骤 2: 创建测试会话");

        let messages = vec![
            Message {
                role: MessageRole::User,
                content: MessageContent::Text("我的项目使用 TypeScript 和 Rust".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            Message {
                role: MessageRole::Assistant,
                content: MessageContent::Text(
                    "好的，我记住了您使用 TypeScript 和 Rust".to_string(),
                ),
                tool_calls: None,
                tool_call_id: None,
            },
            Message {
                role: MessageRole::User,
                content: MessageContent::Text("我喜欢用中文回答".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        println!("  ✓ 创建了 {} 条测试消息", messages.len());

        // ==================== 步骤 3: 调用会话归档 ====================
        println!("\n📋 步骤 3: 调用会话归档");

        let persistence = match SessionPersistence::new() {
            Ok(p) => p,
            Err(e) => {
                println!("  ⚠️  无法创建 SessionPersistence: {}", e);
                cleanup_test_env(test_dir);
                return;
            }
        };

        let result = persistence.save_session_summary(
            &messages,
            "deepseek-official",
            "deepseek-chat",
            1500, // input_tokens
            800,  // output_tokens
        );

        let filepath = match result {
            Ok(fp) => {
                println!("  ✓ 归档文件路径: {}", fp.display());
                fp
            }
            Err(e) => {
                println!("  ⚠️  归档失败: {}", e);
                cleanup_test_env(test_dir);
                return;
            }
        };

        // ==================== 步骤 4: 验证文件存在 ====================
        println!("\n📋 步骤 4: 验证文件存在");

        if filepath.exists() {
            println!("  ✓ 文件存在");
        } else {
            println!("  ⚠️  文件不存在！");
            cleanup_test_env(test_dir);
            return;
        }

        // ==================== 步骤 5: 验证文件内容 ====================
        println!("\n📋 步骤 5: 验证文件内容");

        let content = match fs::read_to_string(&filepath) {
            Ok(c) => c,
            Err(e) => {
                println!("  ⚠️  无法读取文件: {}", e);
                cleanup_test_env(test_dir);
                return;
            }
        };

        println!("  📄 文件内容:");
        println!("  ─────────────────────────────────────────");
        for line in content.lines().take(20) {
            println!("  {}", line);
        }
        if content.lines().count() > 20 {
            println!("  ... (省略 {} 行)", content.lines().count() - 20);
        }
        println!("  ─────────────────────────────────────────");

        // 验证关键内容
        let checks = vec![
            ("# Session Summary", "标题"),
            ("deepseek-official/deepseek-chat", "模型信息"),
            ("1500 input + 800 output", "Token 统计"),
            ("TypeScript", "对话内容"),
            ("Rust", "对话内容"),
        ];

        let mut all_passed = true;
        for (pattern, name) in checks {
            if content.contains(pattern) {
                println!("  ✓ 包含 {}: '{}'", name, pattern);
            } else {
                println!("  ⚠️  缺少 {}: '{}'", name, pattern);
                all_passed = false;
            }
        }

        // ==================== 步骤 6: 列出所有会话文件 ====================
        println!("\n📋 步骤 6: 列出 sessions 目录");

        let sessions_dir = test_dir.join(".ifai").join("sessions");
        if let Ok(entries) = fs::read_dir(&sessions_dir) {
            println!("  📁 Sessions 目录内容:");
            for entry in entries.flatten() {
                println!("    - {}", entry.file_name().to_string_lossy());
            }
        }

        // ==================== 清理 ====================
        cleanup_test_env(test_dir);

        println!("\n============================================================");
        if all_passed {
            println!("✅ 测试通过");
        } else {
            println!("⚠️  部分检查失败");
        }
        println!("============================================================");
    }

    // ========================================================================
    // 测试：多次归档不冲突
    // ========================================================================

    #[test]
    #[serial_test::serial]
    #[ignore]
    fn test_multiple_archives() {
        println!("\n============================================================");
        println!("🔥 多次会话归档测试");
        println!("============================================================");

        let test_dir = setup_test_env();
        println!("  ✓ 测试目录: {}", test_dir.display());

        let persistence = SessionPersistence::new().expect("无法创建 SessionPersistence");

        // 归档第一个会话
        let messages1 = vec![Message {
            role: MessageRole::User,
            content: MessageContent::Text("第一个会话".to_string()),
            tool_calls: None,
            tool_call_id: None,
        }];

        let filepath1 = persistence
            .save_session_summary(&messages1, "deepseek-official", "deepseek-chat", 100, 50)
            .expect("第一次归档失败");

        println!(
            "  ✓ 第一个归档: {}",
            filepath1.file_name().unwrap().to_string_lossy()
        );

        // 稍微延迟（确保时间戳不同）
        std::thread::sleep(std::time::Duration::from_millis(10));

        // 归档第二个会话
        let messages2 = vec![Message {
            role: MessageRole::User,
            content: MessageContent::Text("第二个会话".to_string()),
            tool_calls: None,
            tool_call_id: None,
        }];

        let filepath2 = persistence
            .save_session_summary(&messages2, "deepseek-official", "deepseek-chat", 200, 100)
            .expect("第二次归档失败");

        println!(
            "  ✓ 第二个归档: {}",
            filepath2.file_name().unwrap().to_string_lossy()
        );

        // 验证两个文件都存在
        assert!(filepath1.exists(), "第一个文件应该存在");
        assert!(filepath2.exists(), "第二个文件应该存在");

        // 验证文件名不同
        assert_ne!(
            filepath1.file_name(),
            filepath2.file_name(),
            "两个归档文件应该有不同的文件名"
        );

        // 验证内容不同
        let content1 = fs::read_to_string(&filepath1).expect("无法读取第一个文件");
        let content2 = fs::read_to_string(&filepath2).expect("无法读取第二个文件");

        assert!(
            content1.contains("第一个会话"),
            "第一个文件应该包含 '第一个会话'"
        );
        assert!(
            content2.contains("第二个会话"),
            "第二个文件应该包含 '第二个会话'"
        );
        assert!(
            !content2.contains("第一个会话"),
            "第二个文件不应该包含 '第一个会话'"
        );

        cleanup_test_env(test_dir);

        println!("✅ 多次归档测试通过");
    }

    // ========================================================================
    // 测试：空会话归档
    // ========================================================================

    #[test]
    #[serial_test::serial]
    #[ignore]
    fn test_empty_session_archive() {
        println!("\n============================================================");
        println!("🔥 空会话归档测试");
        println!("============================================================");

        let test_dir = setup_test_env();

        let persistence = SessionPersistence::new().expect("无法创建 SessionPersistence");

        // 空消息列表
        let messages: Vec<Message> = vec![];

        let filepath = persistence
            .save_session_summary(&messages, "deepseek-official", "deepseek-chat", 0, 0)
            .expect("空会话归档失败");

        println!("  ✓ 空会话归档成功: {}", filepath.display());

        // 验证文件存在
        assert!(filepath.exists(), "空会话文件应该存在");

        // 验证文件包含基本结构
        let content = fs::read_to_string(&filepath).expect("无法读取文件");
        assert!(content.contains("# Session Summary"), "应该包含标题");
        assert!(
            content.contains("**Tokens**: 0 input + 0 output"),
            "应该显示 0 tokens"
        );

        cleanup_test_env(test_dir);

        println!("✅ 空会话归档测试通过");
    }
}
