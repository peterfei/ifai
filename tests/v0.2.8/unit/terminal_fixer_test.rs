#[cfg(test)]
mod tests {
    // 测试终端错误堆栈解析
    
    #[test]
    fn test_rust_error_parsing() {
        let stderr = r#"
error[E0433]: failed to resolve: use of undeclared type `User`
  --> src/main.rs:10:15
   |
10 |     let u = User::new();
   |               ^^^^ not found in this scope
        "#;
        
        let error_info = parse_terminal_error(stderr, "rust").unwrap();
        
        assert_eq!(error_info.file, "src/main.rs");
        assert_eq!(error_info.line, 10);
        assert_eq!(error_info.code, "E0433");
    }

    #[test]
    fn test_typescript_error_parsing() {
        let stderr = "src/components/App.tsx:25:10 - error TS2322: Type 'string' is not assignable to type 'number'.";
        
        let error_info = parse_terminal_error(stderr, "typescript").unwrap();
        
        assert_eq!(error_info.file, "src/components/App.tsx");
        assert_eq!(error_info.line, 25);
        assert_eq!(error_info.code, "TS2322");
    }
}
