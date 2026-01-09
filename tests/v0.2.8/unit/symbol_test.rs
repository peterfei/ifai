#[cfg(test)]
mod tests {
    // 模拟 RagService 接口行为的 TDD 测试
    
    #[tokio::test]
    async fn test_symbol_extraction_commercial() {
        // 在实际开发中，这里会通过 AppState 访问真正的引擎
        let content = "struct User { id: u64, name: String }";
        let symbols = crate::symbol_engine::extract_symbols_from_source(content, "rust"); 
        
        assert!(symbols.iter().any(|s| s.name == "User" && s.kind == "struct_item"));
    }

    #[tokio::test]
    async fn test_symbol_extraction_community() {
        #[cfg(not(feature = "commercial"))]
        {
            // 场景：在社区版下，符号提取应优雅降级或返回空
            let content = "struct User { id: u64 }";
            let symbols = extract_symbols(content, "rust");
            
            assert!(symbols.is_empty(), "社区版不应支持符号解析");
        }
    }

    #[tokio::test]
    async fn test_atomic_write_rollback_on_failure() {
        #[cfg(feature = "commercial")]
        {
            // 场景：原子写入 2 个文件，第 2 个因权限失败
            let ops = vec![
                WriteOp { path: "file1.txt", content: "hello" },
                WriteOp { path: "/root/protected.txt", content: "fail" }
            ];
            
            let result = atomic_execute(ops).await;
            
            assert!(result.is_err());
            assert!(!std::path::Path::new("file1.txt").exists(), "发生错误时，第一个文件必须被回滚（删除）");
        }
    }
}
