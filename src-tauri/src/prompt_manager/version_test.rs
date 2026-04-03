/**
 * Rust 单元测试：提示词版本管理功能
 *
 * 测试真实的后端逻辑，不依赖浏览器环境
 */

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use super::super::version::{
        PromptVersionManager, PromptVersion, VersionDiff
    };

    /// 创建临时测试目录
    fn setup_test_directory() -> PathBuf {
        let temp_dir = std::env::temp_dir().join("ifai_prompt_test");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        // 创建 .ifai/prompts 目录
        let prompts_dir = temp_dir.join(".ifai").join("prompts");
        fs::create_dir_all(&prompts_dir).unwrap();

        // 初始化 Git 仓库
        let repo = git2::Repository::init(&temp_dir).unwrap();

        // 配置 git 用户
        let config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();

        // 创建测试提示词文件
        let prompt_path = prompts_dir.join("test.md");
        fs::write(&prompt_path, "# Initial Version\n\nTest content").unwrap();

        // 添加并提交
        let mut index = repo.index().unwrap();
        index.add_path(PathBuf::from(".ifai/prompts/test.md")).unwrap();
        index.write().unwrap();

        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();

        let sig = repo.signature().unwrap();
        let oid = repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            "Initial commit",
            &tree,
            &[]
        ).unwrap();

        println!("Test repository initialized at: {:?}", temp_dir);
        println!("Initial commit: {}", oid);

        temp_dir
    }

    #[test]
    fn test_prompt_version_manager_creation() {
        let temp_dir = setup_test_directory();
        let manager = PromptVersionManager::new(temp_dir.to_string_lossy().to_string());

        // 验证管理器创建成功
        assert_eq!(manager.project_root(), temp_dir);
    }

    #[test]
    fn test_get_versions() {
        let temp_dir = setup_test_directory();
        let manager = PromptVersionManager::new(temp_dir.to_string_lossy().to_string());

        // 获取版本历史
        let result = manager.get_versions(".ifai/prompts/test.md", Some(10));

        assert!(result.is_ok(), "Failed to get versions: {:?}", result.err());

        let versions = result.unwrap();
        assert_eq!(versions.len(), 1, "Should have 1 version");

        let version = &versions[0];
        assert!(!version.version_id.is_empty());
        assert!(!version.author.is_empty());
        assert!(!version.message.is_empty());
        assert!(version.timestamp > 0);

        println!("Version: {:?}", version);
    }

    #[test]
    fn test_content_hash() {
        let content1 = "Hello World";
        let content2 = "Hello World";
        let content3 = "Different Content";

        let hash1 = super::super::version::stable_content_hash(content1);
        let hash2 = super::super::version::stable_content_hash(content2);
        let hash3 = super::super::version::stable_content_hash(content3);

        // 相同内容应该产生相同的 hash
        assert_eq!(hash1, hash2, "Same content should produce same hash");

        // 不同内容应该产生不同的 hash
        assert_ne!(hash1, hash3, "Different content should produce different hash");

        println!("Hash1: {}", hash1);
        println!("Hash2: {}", hash2);
        println!("Hash3: {}", hash3);
    }

    #[test]
    fn test_compare_versions() {
        let temp_dir = setup_test_directory();
        let manager = PromptVersionManager::new(temp_dir.to_string_lossy().to_string());

        // 创建第二个版本
        let repo = git2::Repository::open(&temp_dir).unwrap();
        let prompt_path = temp_dir.join(".ifai").join("prompts").join("test.md");

        // 修改文件内容
        fs::write(&prompt_path, "# Second Version\n\nModified content").unwrap();

        // 提交修改
        let mut index = repo.index().unwrap();
        index.add_path(PathBuf::from(".ifai/prompts/test.md")).unwrap();
        index.write().unwrap();

        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = repo.signature().unwrap();
        let _ = repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            "Second commit",
            &tree,
            &[&repo.head().unwrap().peel_to_commit().unwrap()]
        ).unwrap();

        // 获取所有版本
        let versions = manager.get_versions(".ifai/prompts/test.md", Some(10)).unwrap();
        assert_eq!(versions.len(), 2, "Should have 2 versions");

        // 比较两个版本
        let old_id = &versions[1].version_id;
        let new_id = &versions[0].version_id;

        let result = manager.compare_versions(".ifai/prompts/test.md", old_id, new_id);

        assert!(result.is_ok(), "Failed to compare versions: {:?}", result.err());

        let diff = result.unwrap();
        assert_eq!(diff.old_version.version_id, *old_id);
        assert_eq!(diff.new_version.version_id, *new_id);

        println!("Diff: {:?}", diff);
        println!("Additions: {}", diff.additions);
        println!("Deletions: {}", diff.deletions);

        // 应该有变化
        assert!(diff.additions > 0 || diff.deletions > 0, "Should have some changes");
    }

    #[test]
    fn test_rollback() {
        let temp_dir = setup_test_directory();
        let manager = PromptVersionManager::new(temp_dir.to_string_lossy().to_string());

        let repo = git2::Repository::open(&temp_dir).unwrap();
        let prompt_path = temp_dir.join(".ifai").join("prompts").join("test.md");

        // 获取初始版本
        let versions = manager.get_versions(".ifai/prompts/test.md", Some(10)).unwrap();
        let initial_version_id = &versions[0].version_id;

        // 修改文件
        fs::write(&prompt_path, "# Modified\n\nThis is modified content").unwrap();

        let modified_content = fs::read_to_string(&prompt_path).unwrap();
        assert!(modified_content.contains("modified content"));

        // 回滚到初始版本
        let result = manager.rollback(".ifai/prompts/test.md", initial_version_id);

        assert!(result.is_ok(), "Failed to rollback: {:?}", result.err());

        // 验证内容已恢复
        let rolled_back_content = fs::read_to_string(&prompt_path).unwrap();
        assert!(rolled_back_content.contains("Initial Version"));
        assert!(!rolled_back_content.contains("modified content"));

        println!("Rollback successful!");
        println!("Content after rollback: {}", rolled_back_content);
    }

    #[test]
    fn test_is_modified() {
        let temp_dir = setup_test_directory();
        let manager = PromptVersionManager::new(temp_dir.to_string_lossy().to_string());

        let prompt_path = temp_dir.join(".ifai").join("prompts").join("test.md");

        // 初始状态应该未被修改
        let result = manager.is_modified(".ifai/prompts/test.md");
        assert!(result.is_ok());
        assert!(!result.unwrap(), "Should not be modified initially");

        // 修改文件
        fs::write(&prompt_path, "# Modified\n\nContent").unwrap();

        // 现在应该被标记为已修改
        let result = manager.is_modified(".ifai/prompts/test.md");
        assert!(result.is_ok());
        assert!(result.unwrap(), "Should be modified after change");

        println!("Modification detection working correctly");
    }

    #[test]
    fn test_read_git_status() {
        let temp_dir = setup_test_directory();

        // 读取 Git 状态
        let status = super::super::version::read_git_status(&temp_dir.to_string_lossy().to_string());

        assert!(status.is_some(), "Should have git status");

        let status_str = status.unwrap();
        println!("Git status: {}", status_str);

        // 状态应该包含一些 git 信息
        assert!(!status_str.is_empty());
    }

    #[test]
    fn test_empty_repository() {
        let temp_dir = std::env::temp_dir().join("ifai_empty_test");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        // 初始化空的 Git 仓库
        git2::Repository::init(&temp_dir).unwrap();

        let manager = PromptVersionManager::new(temp_dir.to_string_lossy().to_string());

        // 尝试获取不存在的文件版本
        let result = manager.get_versions("nonexistent.md", Some(10));

        // 应该返回错误或空列表
        match result {
            Ok(versions) => {
                assert_eq!(versions.len(), 0, "Should be empty for nonexistent file");
            }
            Err(_) => {
                // Error is also acceptable
                println!("Got expected error for nonexistent file");
            }
        }
    }
}
