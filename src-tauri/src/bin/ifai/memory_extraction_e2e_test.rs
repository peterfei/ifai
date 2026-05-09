// 🔥 Phase 4: 真实 LLM API 记忆提取 E2E 测试
//
// 这个测试会实际调用 LLM API（从 ~/.ifai/config.toml 读取配置），验证：
// 1. 记忆提取功能正常工作
// 2. 提取的记忆正确保存到 ~/.ifai/memories.md
// 3. 多次提取能正确追加
//
// 运行方式：
//   cd src-tauri && cargo test --bin ifai memory_extraction_e2e -- --ignored --nocapture
//
// 前置条件：
//   ~/.ifai/config.toml 中已配置 provider（anthropic/openai/deepseek）和 api_key

#[cfg(test)]
mod tests {
    use crate::config::EffectiveConfig;
    use ifainew_lib::memory;
    use std::fs;
    use std::path::PathBuf;

    /// 获取测试专用的记忆文件路径（不影响用户的真实记忆文件）
    fn test_memory_dir() -> PathBuf {
        std::env::temp_dir().join(format!("ifai_memory_e2e_test_{}", std::process::id()))
    }

    /// 从 ~/.ifai/config.toml 创建真实配置（与 main.rs 启动逻辑一致）
    fn get_real_api_config() -> Option<(String, String)> {
        let config = EffectiveConfig::resolve(None, None, None, None).ok()?;

        let provider = config.provider().to_string();
        let api_key = config.api_key()?.to_string();

        println!("  📋 配置加载成功:");
        println!("     Provider: {}", provider);
        println!("     API Key: {}...{}", &api_key[..4.min(api_key.len())], &api_key[api_key.len().saturating_sub(4)..]);

        Some((provider, api_key))
    }

    /// 设置测试环境（隔离 HOME 目录）
    fn setup_test_env() -> PathBuf {
        let test_dir = test_memory_dir();
        fs::create_dir_all(&test_dir).ok();

        // 设置测试专用的 HOME
        std::env::set_var("HOME", test_dir.to_str().unwrap());

        test_dir
    }

    /// 清理测试环境
    fn cleanup_test_env(test_dir: PathBuf) {
        fs::remove_dir_all(test_dir).ok();
    }

    // ========================================================================
    // 核心测试：Anthropic 记忆提取
    // ========================================================================

    #[tokio::test]
    #[serial_test::serial]
    #[ignore] // 需要真实 API，手动运行：cargo test --bin ifai memory_extraction_e2e -- --ignored --nocapture
    async fn test_memory_extraction_anthropic() {
        println!("\n============================================================");
        println!("🔥 真实 Anthropic API 记忆提取 E2E 测试");
        println!("============================================================");

        // ==================== 步骤 1: 获取 API 配置 ====================
        println!("\n📋 步骤 1: 加载 API 配置");

        let (provider, api_key) = match get_real_api_config() {
            Some(config) => config,
            None => {
                println!("  ⚠️  跳过测试：无法加载 ~/.ifai/config.toml");
                return;
            }
        };

        if provider != "anthropic" {
            println!("  ⚠️  跳过测试：配置的 provider 是 '{}'，不是 'anthropic'", provider);
            return;
        }

        // ==================== 步骤 2: 设置测试环境 ====================
        println!("\n🔧 步骤 2: 设置测试环境");

        let original_home = std::env::var("HOME").ok();
        let test_dir = setup_test_env();
        println!("  ✓ 测试目录: {}", test_dir.display());

        // ==================== 步骤 3: 准备测试对话 ====================
        println!("\n📝 步骤 3: 准备测试对话");

        let conversation = r#"User: 我的项目使用 TypeScript 和 Rust
AI: 好的，我记住了您使用 TypeScript 和 Rust
User: 我喜欢用中文回答技术问题
AI: 明白了，我会用中文回答您
User: 我正在开发一个 AI 编辑器
AI: 了解，AI 编辑器是个很有意思的项目"#;

        println!("  对话内容:");
        for line in conversation.lines() {
            println!("    {}", line);
        }

        // ==================== 步骤 4: 调用 LLM 提取 ====================
        println!("\n🤖 步骤 4: 调用 Anthropic API 提取记忆");

        let result = memory::extract_memories_with_llm(&api_key, conversation, &provider).await;

        match &result {
            Ok(count) => {
                println!("  ✓ 提取成功，获得 {} 条记忆", count);
                assert!(*count > 0, "应该至少提取到 1 条记忆");
            }
            Err(e) => {
                println!("  ✗ 提取失败: {}", e);
                panic!("记忆提取失败: {}", e);
            }
        }

        // ==================== 步骤 5: 验证记忆文件 ====================
        println!("\n✅ 步骤 5: 验证记忆文件");

        let memory_file = test_dir.join(".ifai/memories.md");
        assert!(memory_file.exists(), "记忆文件应该存在");

        let content = fs::read_to_string(&memory_file)
            .expect("无法读取记忆文件");

        println!("  📄 记忆文件内容:");
        println!("  ─────────────────────────────────────────");
        for line in content.lines() {
            println!("  {}", line);
        }
        println!("  ─────────────────────────────────────────");

        // 验证关键内容
        assert!(content.contains("TypeScript"), "应该记住 TypeScript");
        assert!(content.contains("Rust"), "应该记住 Rust");
        assert!(content.contains("中文"), "应该记住中文偏好");
        assert!(content.contains("AI 编辑器"), "应该记住 AI 编辑器项目");

        println!("  ✓ 内容验证通过");

        // ==================== 清理 ====================
        cleanup_test_env(test_dir);
        if let Some(home) = original_home {
            std::env::set_var("HOME", home);
        }

        println!("\n============================================================");
        println!("✅ Anthropic 记忆提取 E2E 测试通过！");
        println!("============================================================");
    }

    // ========================================================================
    // 测试：OpenAI 记忆提取
    // ========================================================================

    #[tokio::test]
    #[serial_test::serial]
    #[ignore]
    async fn test_memory_extraction_openai() {
        println!("\n============================================================");
        println!("🔥 真实 OpenAI API 记忆提取 E2E 测试");
        println!("============================================================");

        let (provider, api_key) = match get_real_api_config() {
            Some(config) => config,
            None => {
                println!("  ⚠️  跳过测试：无法加载 ~/.ifai/config.toml");
                return;
            }
        };

        if provider != "openai" {
            println!("  ⚠️  跳过测试：配置的 provider 是 '{}'", provider);
            return;
        }

        let original_home = std::env::var("HOME").ok();
        let test_dir = setup_test_env();

        let conversation = r#"User: 我是一个前端开发者，使用 React 和 Next.js
AI: 好的，了解您使用 React 和 Next.js
User: 我的团队采用 Git Flow 分支策略
AI: Git Flow 是个不错的分支管理策略"#;

        println!("📝 对话内容:\n{}", conversation);

        let result = memory::extract_memories_with_llm(&api_key, conversation, &provider).await;

        match &result {
            Ok(count) => {
                println!("✓ 提取成功，获得 {} 条记忆", count);
                assert!(*count > 0);
            }
            Err(e) => {
                panic!("记忆提取失败: {}", e);
            }
        }

        let memory_file = test_dir.join(".ifai/memories.md");
        let content = fs::read_to_string(&memory_file).expect("无法读取记忆文件");

        println!("📄 记忆文件:\n{}", content);
        assert!(content.contains("React"));
        assert!(content.contains("Git Flow"));

        cleanup_test_env(test_dir);
        if let Some(home) = original_home {
            std::env::set_var("HOME", home);
        }

        println!("✅ OpenAI 记忆提取 E2E 测试通过！");
    }

    // ========================================================================
    // 测试：多次提取（追加模式）
    // ========================================================================

    #[tokio::test]
    #[serial_test::serial]
    #[ignore]
    async fn test_memory_extraction_multiple_times() {
        println!("\n============================================================");
        println!("🔥 多次记忆提取 E2E 测试（追加模式）");
        println!("============================================================");

        let (provider, api_key) = match get_real_api_config() {
            Some(config) => config,
            None => {
                println!("  ⚠️  跳过测试：无法加载 ~/.ifai/config.toml");
                return;
            }
        };

        let original_home = std::env::var("HOME").ok();
        let test_dir = setup_test_env();

        // 第一次提取
        println!("\n📝 第一次提取: Vim 编辑器偏好");
        let conversation1 = "User: 我喜欢使用 Vim 编辑器进行开发";
        let result1 = memory::extract_memories_with_llm(&api_key, conversation1, &provider).await;
        assert!(result1.is_ok(), "第一次提取应该成功");

        // 第二次提取
        println!("📝 第二次提取: macOS 操作系统");
        let conversation2 = "User: 我的开发环境是 macOS";
        let result2 = memory::extract_memories_with_llm(&api_key, conversation2, &provider).await;
        assert!(result2.is_ok(), "第二次提取应该成功");

        // 验证两次提取都保存了
        let memory_file = test_dir.join(".ifai/memories.md");
        let content = fs::read_to_string(&memory_file).expect("无法读取记忆文件");

        println!("📄 最终记忆文件:\n{}", content);

        assert!(content.contains("Vim"), "应该记住 Vim");
        assert!(content.contains("macOS"), "应该记住 macOS");

        // 验证有多个条目
        let entry_count = content.matches("- [20").count();
        assert!(entry_count >= 2, "应该至少有 2 条记忆，实际: {}", entry_count);
        println!("✓ 共有 {} 条记忆", entry_count);

        cleanup_test_env(test_dir);
        if let Some(home) = original_home {
            std::env::set_var("HOME", home);
        }

        println!("✅ 多次提取 E2E 测试通过！");
    }

    // ========================================================================
    // 测试：无记忆可提取的情况
    // ========================================================================

    #[tokio::test]
    #[serial_test::serial]
    #[ignore]
    async fn test_memory_extraction_empty_conversation() {
        println!("\n============================================================");
        println!("🔥 空对话记忆提取 E2E 测试");
        println!("============================================================");

        let (provider, api_key) = match get_real_api_config() {
            Some(config) => config,
            None => {
                println!("  ⚠️  跳过测试：无法加载 ~/.ifai/config.toml");
                return;
            }
        };

        let original_home = std::env::var("HOME").ok();
        let test_dir = setup_test_env();

        // 无实质内容的对话
        let conversation = r#"User: 你好
AI: 你好！有什么我可以帮助你的吗？
User: 再见
AI: 再见！"#;

        println!("📝 对话内容（无实质内容）:\n{}", conversation);

        let result = memory::extract_memories_with_llm(&api_key, conversation, &provider).await;

        match &result {
            Ok(count) => {
                println!("✓ 提取完成，提取到 {} 条记忆", count);
                // LLM 可能会提取到 0 条或少量记忆
                // 我们不强制要求为 0，但应该很少
            }
            Err(e) => {
                panic!("记忆提取失败: {}", e);
            }
        }

        cleanup_test_env(test_dir);
        if let Some(home) = original_home {
            std::env::set_var("HOME", home);
        }

        println!("✅ 空对话提取 E2E 测试通过！");
    }
}
