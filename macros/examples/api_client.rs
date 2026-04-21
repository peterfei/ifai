//! API 客户端宏使用示例
//!
//! 这个示例演示了如何使用 api_client! 宏
//! 自动生成类型安全的 API 客户端

fn main() {
    println!("🎯 API 客户端宏使用示例\n");
    println!("========================================\n");

    println!("✅ 宏自动生成的内容：\n");

    println!("1. SkillRegistryClient 结构体");
    println!("   - 基于 reqwest::Client 的 HTTP 客户端");
    println!("   - 支持可选的 API 密钥认证");
    println!("   - 自动管理 base_url");
    println!();

    println!("2. 自动生成的 API 方法：\n");

    println!("   a) list_skills()");
    println!("      描述: 获取技能列表");
    println!("      方法: GET /skills");
    println!("      返回: Result<Vec<Skill>, SkillError>");
    println!();

    println!("   b) get_skill(skill_id: String)");
    println!("      描述: 获取技能详情");
    println!("      方法: GET /skills/{{skill_id}}");
    println!("      返回: Result<Skill, SkillError>");
    println!();

    println!("   c) install_skill()");
    println!("      描述: 安装技能");
    println!("      方法: POST /skills/{{skill_id}}/install");
    println!("      参数:");
    println!("        - skill_id: String");
    println!("        - version: Option<String>");
    println!("        - source: String");
    println!("      返回: Result<InstalledSkill, SkillError>");
    println!("      认证: 需要 (auth = true)");
    println!();

    println!("   d) uninstall_skill(skill_id: String)");
    println!("      描述: 卸载技能");
    println!("      方法: POST /skills/{{skill_id}}/uninstall");
    println!("      返回: Result<Skill, SkillError>");
    println!("      认证: 需要 (auth = true)");
    println!();

    println!("   e) search_skills()");
    println!("      描述: 搜索技能");
    println!("      方法: GET /skills/search");
    println!("      参数:");
    println!("        - query: String");
    println!("        - limit: Option<usize>");
    println!("      返回: Result<Vec<Skill>, SkillError>");
    println!();

    println!("3. SkillError 错误类型：");
    println!("   - RequestError: 请求失败");
    println!("   - ParseError: 解析失败");
    println!("   - ApiError: API 错误（包含状态码）");
    println!("   - AuthError: 认证失败");
    println!("   - NetworkError: 网络错误");
    println!();

    println!("========================================");
    println!("💡 Phase 4 新增功能:");
    println!("   1. ✓ 类型安全的 API 客户端生成");
    println!("   2. ✓ 自动错误处理");
    println!("   3. ✓ 支持认证（API 密钥）");
    println!("   4. ✓ 路径参数替换");
    println!("   5. ✓ 可选参数支持");
    println!("========================================\n");

    println!("📝 使用示例:");
    println!();
    println!("   // 创建客户端");
    println!("   let client = SkillRegistryClient::new();");
    println!("   // 或使用 API 密钥");
    println!("   let client = SkillRegistryClient::with_api_key(\"your-key\".to_string());");
    println!();
    println!("   // 调用 API");
    println!("   match client.list_skills().await {{");
    println!("       Ok(skills) => println!(\"技能: {{:?}}\", skills),");
    println!("       Err(e) => eprintln!(\"错误: {{}}\", e),");
    println!("   }}");
    println!();

    println!("🔗 与 ifainew-core 集成:");
    println!();
    println!("   生成的客户端可以直接调用 ifainew-core 中的业务逻辑:");
    println!("   - Skill 类型在 ifainew-core 中定义");
    println!("   - 实际的 API 端点由 ifainew-core 提供");
    println!("   - 宏生成的是类型安全的客户端包装");
    println!();

    println!("🚀 未来计划:");
    println!("   - OpenAPI 规范解析");
    println!("   - 从 Swagger/OpenAPI 文件生成客户端");
    println!("   - 重试逻辑生成");
    println!("   - 进度回调支持");
    println!("   - Mock 服务器生成");
    println!("   - WebSocket 支持生成");
    println!();

    println!("🎉 示例执行完成!");
    println!();
    println!("💡 提示: 运行 cargo expand 查看生成的完整代码");
}
