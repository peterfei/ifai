# 并行代码探索 Agent 改进提案

## 1. 问题分析

### 当前 `/explore` Agent 的问题

1. **串行扫描效率低**
   - 当前实现：每次 AI loop 只调用一个工具
   - 扫描大项目时需要逐个文件处理
   - 例如：扫描 100 个文件需要 100+ 次 AI 调用

2. **UI 缺乏层次感**
   - 只显示纯文本输出
   - 无法直观看到扫描进度
   - 无法区分不同类型的扫描结果

3. **缺乏智能分析**
   - 没有"扫描概览"阶段
   - 直接进入细节扫描
   - 用户不知道整体项目结构

### 参考目标：Cursor/Windsurf Agent 效果

```
🔍 Scanning project...
├── 📁 src/ (45 files) ████████████████░░░░ 80%
├── 📁 components/ (12 files) ████████████████████ 100% ✓
├── 📁 utils/ (8 files) ████████████████████ 100% ✓
├── 📁 stores/ (15 files) ██████████░░░░░░░░░░░ 50%

📊 Scan Summary:
• Total files: 127
• Key directories: 8
• Main language: TypeScript
• Framework detected: React + Tauri

🎯 Focusing on: src/components/AIChat/
```

---

## 2. 解决方案设计

### 2.1 两阶段扫描策略

**阶段 1：快速概览**
```
Input: "探索 src/components 目录"

1. glob("**/*", "src/components/") → 获取文件树
2. 分析项目结构
   - 统计文件类型分布
   - 识别主要技术栈
   - 生成结构概览
3. 返回层级报告给用户确认
```

**阶段 2：深度扫描**
```
1. 并行扫描多个文件/目录
2. 实时显示进度
3. 汇总关键发现
4. 生成结构化报告
```

### 2.2 并行工具调用架构

```rust
// 当前实现（串行）
while loop_count < MAX_LOOPS {
    ai_call() → one_tool_call()  // 每次只调用一个工具
}

// 新实现（并行）
while loop_count < MAX_LOOPS {
    ai_call() → multiple_tool_calls()  // 一次调用多个工具

    // 示例：
    parallel_calls = [
        "read: src/utils/helper.ts",
        "read: src/api/client.ts",
        "grep: 'export interface' src/**/*.ts"
    ]
}
```

### 2.3 UI 层次感设计

```typescript
interface ExplorePhase {
    phase: 'scanning' | 'analyzing' | 'complete';
    currentPath?: string;
    progress: {
        total: number;
        scanned: number;
        byDirectory: Record<string, { total: number; scanned: number }>;
    };
    findings: {
        directories: ExploreDirectory[];
        files: ExploreFile[];
        patterns: PatternMatch[];
    };
}

interface ExploreDirectory {
    path: string;
    fileCount: number;
    languages: string[];
    scanStatus: 'pending' | 'scanning' | 'completed';
    keyFiles: string[];
}

interface ExploreFile {
    path: string;
    language: string;
    size: number;
    relevanceScore: number;
    scanResult?: {
        hasImports: boolean;
        hasExports: boolean;
        dependencies: string[];
        patterns: string[];
    };
}
```

---

## 3. 技术规格

### 3.1 后端改进 (Rust)

#### 新增 Agent 工具

```rust
// 1. 并行读取工具
pub async fn agent_batch_read(
    paths: Vec<String>,
    project_root: &str
) -> Vec<(String, Result<String, Error>)>

// 2. 目录扫描工具
pub async fn agent_scan_directory(
    rel_path: &str,
    project_root: &str,
    options: ScanOptions
) -> DirectoryScanResult {
    pattern: String,        // "**/*.ts"
    max_depth: usize,       // 5
    include_hidden: bool,
    max_files: usize        // 限制单次扫描文件数
}

// 3. 项目结构分析
pub async fn agent_analyze_structure(
    project_root: &str
) -> ProjectStructure {
    total_files: usize,
    directories: Vec<DirectoryInfo>,
    languages: Vec<LanguageStats>,
    main_entrypoints: Vec<String>,
    dependencies: Vec<Dependency>
}
```

#### 增强 Agent Prompt

```markdown
# Parallel Explore Agent v2.0

## Phase 1: Quick Overview
1. Use `scan_directory` to get file tree structure
2. Analyze project structure and identify key directories
3. Report summary to user with progress visualization

## Phase 2: Deep Scan (with parallel reads)
1. Use `batch_read` to read multiple files in one call
2. Max 5-10 files per batch to avoid token limits
3. Prioritize:
   - Entry points (index, main, App)
   - Configuration files
   - Core logic files
4. Report findings in structured format

## Parallel Calling Example:
```json
[
  {"name": "batch_read", "arguments": {"paths": ["src/a.ts", "src/b.ts", "src/c.ts"]}},
  {"name": "grep", "arguments": {"pattern": "export.*interface", "path": "src/**/*.ts"}}
]
```
```

### 3.2 前端改进 (React/TypeScript)

#### 新增 ExploreProgress 组件

```typescript
// src/components/AIChat/ExploreProgress.tsx
interface ExploreProgressProps {
    agentId: string;
    phase: 'scanning' | 'analyzing' | 'complete';
    progress: ScanProgress;
    findings: ExploreFindings;
}

export const ExploreProgress: React.FC<ExploreProgressProps> = ({
    phase,
    progress,
    findings
}) => {
    return (
        <div className="explore-progress">
            {/* Phase Indicator */}
            <PhaseIndicator phase={phase} />

            {/* Overall Progress Bar */}
            <ProgressBar
                current={progress.scanned}
                total={progress.total}
            />

            {/* Directory Progress Tree */}
            <DirectoryTreeProgress
                directories={progress.byDirectory}
            />

            {/* Findings Summary */}
            <FindingsSummary findings={findings} />
        </div>
    );
};
```

#### 扩展 AgentEventPayload 类型

```typescript
// src/types/agent.ts
interface AgentEventPayload {
    type: AgentEventType;
    // ... existing fields ...

    // 新增：探索进度
    exploreProgress?: {
        phase: 'scanning' | 'analyzing';
        currentPath?: string;
        progress: {
            total: number;
            scanned: number;
            byDirectory: Record<string, {
                total: number;
                scanned: number;
                status: 'pending' | 'scanning' | 'completed';
            }>;
        };
    };

    // 新增：探索发现
    exploreFindings?: {
        summary: string;
        directories: Array<{
            path: string;
            fileCount: number;
            keyFiles: string[];
        }>;
        patterns?: Array<{
            type: 'import' | 'export' | 'class' | 'function';
            description: string;
        }>;
    };
}
```

---

## 4. 测试用例

### 4.1 单元测试

#### 后端工具测试

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_batch_read_multiple_files() {
        let paths = vec![
            "src/a.rs".to_string(),
            "src/b.rs".to_string(),
            "src/c.rs".to_string(),
        ];

        let results = agent_batch_read(paths, project_root).await;

        assert_eq!(results.len(), 3);
        assert!(results[0].1.is_ok());  // Each file should be read successfully
    }

    #[tokio::test]
    async fn test_scan_directory_with_limit() {
        let result = agent_scan_directory(
            "src",
            project_root,
            ScanOptions {
                max_files: 10,
                ..Default::default()
            }
        ).await;

        assert!(result.files.len() <= 10);
    }
}
```

#### 前端组件测试

```typescript
describe('ExploreProgress', () => {
    it('should display scanning phase', () => {
        const { getByText } = render(
            <ExploreProgress
                agentId="test-agent"
                phase="scanning"
                progress={{ total: 100, scanned: 45 }}
                findings={{ summary: "Scanning..." }}
            />
        );

        expect(getByText('Scanning...')).toBeInTheDocument();
        expect(getByText('45%')).toBeInTheDocument();
    });

    it('should show directory progress tree', () => {
        const progress = {
            total: 50,
            scanned: 20,
            byDirectory: {
                'src/components': { total: 15, scanned: 10, status: 'scanning' },
                'src/utils': { total: 8, scanned: 8, status: 'completed' }
            }
        };

        const { getByText } = render(<ExploreProgress progress={progress} />);

        expect(getByText(/src\/components.*10\/15/)).toBeInTheDocument();
    });
});
```

### 4.2 集成测试

```typescript
describe('Explore Agent Integration', () => {
    it('should complete full explore workflow', async () => {
        // 1. Trigger explore agent
        await sendMessage('/explore src/components');

        // 2. Wait for phase 1 completion
        await waitFor(() => {
            expect(screen.getByText(/Scan Summary/)).toBeInTheDocument();
        }, { timeout: 10000 });

        // 3. Check progress updates
        const progressBars = screen.getAllByRole('progressbar');
        expect(progressBars.length).toBeGreaterThan(0);

        // 4. Wait for completion
        await waitFor(() => {
            expect(screen.getByText(/Explore Complete/)).toBeInTheDocument();
        }, { timeout: 30000 });

        // 5. Verify findings
        expect(screen.getByText(/Total files:/)).toBeInTheDocument();
    });

    it('should handle errors gracefully', async () => {
        // Test with invalid path
        await sendMessage('/explore /nonexistent/path');

        await waitFor(() => {
            expect(screen.getByText(/Directory not found/)).toBeInTheDocument();
        });
    });
});
```

### 4.3 性能测试

```typescript
describe('Explore Performance', () => {
    it('should complete scan of 100 files within 30 seconds', async () => {
        const startTime = Date.now();

        await sendMessage('/explore src');

        await waitFor(() => {
            expect(screen.queryByRole('status', { name: 'complete' })).toBeInTheDocument();
        }, { timeout: 30000 });

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(30000);
    });

    it('should batch read multiple files efficiently', async () => {
        // Mock batch tool to verify parallel calls
        const batchSpy = jest.spyOn(toolRegistry, 'batch_read');

        await sendMessage('/explore src --parallel');

        await waitFor(() => {
            expect(batchSpy).toHaveBeenCalledWith(
                expect.arrayContaining(
                    expect.any(String)  // paths
                )
            );
        });

        // Verify batch size is reasonable (5-10 files)
        const callArgs = batchSpy.mock.calls[0][0];
        expect(callArgs.length).toBeGreaterThan(1);
        expect(callArgs.length).toBeLessThan(11);
    });
});
```

---

## 5. 实施计划（小步快跑）

### Iteration 1: 基础并行支持 (1-2 天)
**目标**: 让 agent 能够批量读取文件

- [ ] `agent_batch_read` 工具实现
- [ ] 更新 explore prompt 启用批量调用
- [ ] 测试：批量读取 3-5 个文件
- [ ] 验收：单次 AI 调用可读取多个文件

### Iteration 2: 目录扫描工具 (1-2 天)
**目标**: 新增高效的目录扫描工具

- [ ] `agent_scan_directory` 工具实现
- [ ] 支持文件数量限制
- [ ] 测试：扫描大型目录（100+ 文件）
- [ ] 验收：返回结构化的文件树

### Iteration 3: 进度事件系统 (1-2 天)
**目标**: 扩展 AgentEventPayload 支持进度数据

- [ ] 扩展 `AgentEventPayload` 类型
- [ ] 更新 agent_store 处理进度事件
- [ ] 测试：进度事件正确传递
- [ ] 验收：前端能接收进度数据

### Iteration 4: UI 进度组件 (2-3 天)
**目标**: 创建可视化进度组件

- [ ] `ExploreProgress` 组件
- [ ] `PhaseIndicator` 组件
- [ ] `DirectoryTreeProgress` 组件
- [ ] 测试：组件正确显示状态
- [ ] 验收：实时更新扫描进度

### Iteration 5: Agent Prompt 优化 (1 天)
**目标**: 改进 prompt 实现两阶段扫描

- [ ] 更新 explore.md prompt
- [ ] 添加概览阶段指令
- [ ] 添加并行调用示例
- [ ] 测试：AI 正确生成并行调用
- [ ] 验收：AI 能分阶段返回结果

### Iteration 6: 发现结果展示 (2-3 天)
**目标**: 结构化展示扫描结果

- [ ] `FindingsSummary` 组件
- [ ] 层级结果展示
- [ ] 可折叠目录树
- [ ] 测试：结果正确渲染
- [ ] 验收：用户可浏览探索结果

---

## 6. 成功指标

### 性能指标
| 指标 | 当前 | 目标 |
|------|------|------|
| 扫描 100 文件时间 | ~60s | <20s |
| 单次 AI 调用读取文件数 | 1 | 5-10 |
| 进度更新延迟 | N/A | <500ms |
| UI 响应性 | OK | 流畅无卡顿 |

### 功能指标
- ✅ 两阶段扫描（概览 + 深度）
- ✅ 实时进度显示
- ✅ 并行文件读取
- ✅ 结构化结果展示
- ✅ 目录层级可视化

---

## 7. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Token 限制 | 并行调用可能超出 LLM 上下文窗口 | 限制每批 5-10 个文件；分阶段返回 |
| AI 不遵循并行指令 | 仍然串行调用 | 在 prompt 中强化示例；提供 fallback |
| 进度事件频繁 | 影响性能 | 限流更新（每 500ms） |
| 大目录扫描超时 | 用户体验差 | 设置超时检测；支持部分返回 |

---

## 8. 待澄清问题

1. **并行批次大小**: 每次批量读取多少文件？（建议：5-10）
2. **超时设置**: 单次扫描超时时间？（建议：30秒）
3. **最大文件数**: 扫描文件数量上限？（建议：500）
4. **UI 位置**: 进度显示在消息流还是独立面板？

---

## 9. 参考资料

- 当前 explore agent: `.ifai/prompts/agents/explore.md`
- Agent runner: `src-tauri/src/agent_system/runner.rs`
- Agent events: `src/types/agent.ts`
- UI 参考: Cursor/Windsurf Agent Composer

---

**提案版本**: 1.0
**创建日期**: 2024-12-26
**状态**: 待审核
