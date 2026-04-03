// 调试测试 - 检查 get_versions 的问题
#[cfg(test)]
mod debug_tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn debug_get_versions() {
        let temp_dir = setup_test_directory();
        let manager = PromptVersionManager::new(temp_dir.to_string_lossy().to_string()).unwrap();

        // 检查文件路径
        let prompt_path_str = ".ifai/prompts/test.md";
        let prompt_full_path = manager.get_prompt_path(prompt_path_str);

        println!("=== Debug get_versions ===");
        println!("temp_dir: {:?}", temp_dir);
        println!("prompt_path_str: {}", prompt_path_str);
        println!("prompt_full_path: {:?}", prompt_full_path);
        println!("File exists: {}", prompt_full_path.exists());

        // 如果文件不存在，列出目录内容
        if !prompt_full_path.exists() {
            println!("File does not exist! Listing directory contents:");
            let prompts_dir = temp_dir.join(".ifai").join("prompts");
            if let Ok(entries) = fs::read_dir(&prompts_dir) {
                for entry in entries {
                    if let Ok(entry) = entry {
                        println!("  - {:?}", entry.path());
                    }
                }
            }
        }

        // 尝试获取版本
        let result = manager.get_versions(prompt_path_str, Some(10));
        println!("get_versions result: {:?}", result);

        // 检查 Git 仓库
        let repo = git2::Repository::open(&temp_dir);
        println!("Git repo: {:?}", repo);

        if let Ok(repo) = repo {
            // 检查是否有提交
            let head = repo.head();
            println!("HEAD: {:?}", head);

            if let Ok(head) = head {
                let commit = head.peel_to_commit();
                println!("HEAD commit: {:?}", commit);

                if let Ok(commit) = commit {
                    println!("Commit ID: {}", commit.id());
                    println!("Commit message: {:?}", commit.message());

                    // 列出树中的文件
                    let tree = commit.tree();
                    println!("Tree: {:?}", tree);

                    if let Ok(tree) = tree {
                        println!("Walking tree:");
                        tree.walk(git2::TreeWalkMode::PreOrder, |root, entry| {
                            println!("  - {} / {} ({:?})", root, entry.name().unwrap_or("?"), entry.kind());
                            git2::TreeWalkResult::Ok
                        }).ok();
                    }
                }
            }
        }
    }
}
