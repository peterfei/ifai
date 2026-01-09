# Bug 分析: "执行vite" 成功但服务器未启动

## 问题描述

用户输入："执行vite"
- AI 建议执行 `npm run dev` 命令
- 用户批准执行
- LLM 反馈：`{"exit_code":0,"stdout":"\n> demo3@1.0.0 dev\n> vite\n\n✅ Server started successfully","stderr":"","success":true,"elapsed_ms":864}`
- 但实际上服务器没有启动

## 问题确认

**是的，这个问题很可能是 LLM 在错误的目录下执行了命令。**

## 根本原因分析

### 1. bash 命令的工作目录问题

从代码分析：
- `execute_bash_command_streaming` 接受 `working_dir` 参数
- 如果指定了 `working_dir`，命令会在该目录下执行
- **但是 LLM 可能没有指定正确的工作目录，或者指定了错误的目录**

### 2. 可能的场景

#### 场景 A: LLM 没有指定 working_dir
```typescript
// LLM 生成的工具调用
{
  "tool": "bash",
  "args": {
    "command": "npm run dev"
    // ❌ 没有 cwd 或 working_dir
  }
}
```

结果：
- 命令在**当前工作目录**下执行
- 如果当前目录不是项目根目录，就会启动错误的项目

#### 场景 B: LLM 指定了错误的 working_dir
```typescript
// LLM 生成的工具调用
{
  "tool": "bash",
  "args": {
    "command": "npm run dev",
    "cwd": "/Users/mac/project/aieditor"  // ❌ 错误：这是编辑器源代码目录
  }
}
```

结果：
- 命令在 ifainew 源代码目录下执行
- 启动了 ifainew 的 dev 服务器，而不是用户项目的服务器

#### 场景 C: LLM 混淆了不同项目
```
用户当前工作目录：/Users/mac/mock-project
LLM 可能认为应该执行：/Users/mac/other-project
```

### 3. 启动成功标志检测误判

从 `bash_streaming.rs` 代码：
```rust
const SUCCESS_PATTERNS: &[&str] = &[
    "Local:",      // ❌ 这可能匹配任何 vite 服务器
    "ready in",
    "VITE",
    // ...
];
```

问题：
- 系统检测到 "Local:" 就认为启动成功
- 但可能启动的是**其他项目**的服务器（如 ifainew 编辑器自己的 dev 服务器）
- 没有验证启动的服务器是否是用户期望的项目

## 修复方案

### 修复 1: 自动使用项目根目录作为 working_dir

**核心思路**：bash 命令执行时，如果没有指定 `working_dir` 或指定的目录不是项目根目录，自动使用项目根目录。

#### 修改位置: `src/stores/useChatStore.ts`

```typescript
// 在 patchedApproveToolCall 中，处理 bash 工具
const bashTools = ['bash', 'execute_bash_command', 'bash_execute_streaming'];
if (bashTools.includes(toolName)) {
    // 获取项目根目录
    const rootPath = useFileStore.getState().rootPath;

    if (!rootPath) {
        throw new Error("No project root opened");
    }

    // 🔥 修复：确保工作目录是项目根目录
    let finalArgs = { ...args };
    const providedCwd = args.cwd || args.working_dir;

    // 如果 LLM 没有指定目录，或指定了错误的目录
    if (!providedCwd || (providedCwd && !providedCwd.startsWith(rootPath))) {
        console.log(`[useChatStore] Auto-setting working_dir to project root: ${rootPath}`);
        console.log(`[useChatStore] Original cwd/working_dir:`, providedCwd);

        // 覆盖 working_dir 为项目根目录
        finalArgs = {
            ...args,
            working_dir: rootPath,
            cwd: rootPath  // 兼容不同命名
        };
    }

    // 使用修改后的 args 调用命令
    // ...
}
```

### 修复 2: 增强启动成功标志验证

**核心思路**：在检测到启动成功标志后，验证启动的服务器是否在项目根目录下运行。

#### 修改位置: `src-tauri/src/commands/bash_streaming.rs`

```rust
fn detect_startup_success(stdout_lines: &[String], stderr_lines: &[String], working_dir: &Option<String>) -> bool {
    // 先检测启动成功标志
    let has_success_pattern = /* 现有逻辑 */;

    if !has_success_pattern {
        return false;
    }

    // 🔥 新增：验证启动的服务器是否在项目目录下
    if let Some(dir) = working_dir {
        // 检查输出中是否包含项目相关信息
        let output = stdout_lines.join(" ");

        // 如果输出包含 package.json 的项目名称
        // 可以进一步验证启动的是正确的项目
        if let Ok(project_name) = get_project_name_from_package_json(dir) {
            if output.contains(&project_name) {
                println!("[Bash Streaming] ✅ Verified: started project '{}'", project_name);
                return true;
            }
        }

        // 如果无法验证，输出警告但仍返回 true
        println!("[Bash Streaming] ⚠️ Warning: Could not verify if started server belongs to project");
        println!("[Bash Streaming] Working directory: {}", dir);
    }

    true
}
```

### 修复 3: 添加端口验证（可选增强）

**核心思路**：检测到启动成功后，验证端口是否真正可访问。

#### 修改位置: `src-tauri/src/commands/bash_streaming.rs`

```rust
async fn verify_server_running(port: u16) -> bool {
    // 尝试连接到端口
    match TcpListener::bind(format!("127.0.0.1:{}", port)).await {
        Ok(_) => false,  // 端口未被占用，服务器未运行
        Err(_) => true,   // 端口被占用，服务器可能在运行
    }
}

// 在 detect_startup_success 后调用
if detected_startup {
    // 验证常用端口是否真正在监听
    let ports_to_check = [1420, 3000, 5173, 8080];
    for port in ports_to_check {
        if verify_server_running(port).await {
            println!("[Bash Streaming] ✅ Verified server running on port {}", port);
            return true;
        }
    }

    println!("[Bash Streaming] ⚠️ Warning: No server detected on common ports");
    return false;
}
```

## 建议的测试场景

### E2E 测试用例

1. **场景 1: LLM 未指定 cwd**
   - 输入："执行vite"
   - 预期：自动在项目根目录下执行
   - 验证：服务器正确启动

2. **场景 2: LLM 指定了错误的 cwd**
   - LLM 生成：`{command: "npm run dev", cwd: "/path/to/wrong/dir"}`
   - 预期：自动修正为项目根目录
   - 验证：服务器正确启动

3. **场景 3: 验证输出中的项目名称**
   - 在项目根目录有 `package.json`，name 为 "demo3"
   - 输出中应该包含 "demo3"
   - 验证：确认启动的是正确的项目

## 总结

**问题确认**：是的，这个问题是由于 LLM 在错误的目录下执行命令导致的。

**修复优先级**：
1. **P0（必须）**: 修复 1 - 自动使用项目根目录作为 working_dir
2. **P1（重要）**: 修复 2 - 增强启动成功标志验证
3. **P2（可选）**: 修复 3 - 添加端口验证

**风险**：
- 如果用户确实需要在其他目录执行命令，修复 1 可能会限制这个功能
- 建议：添加明确的参数让用户可以覆盖默认行为
