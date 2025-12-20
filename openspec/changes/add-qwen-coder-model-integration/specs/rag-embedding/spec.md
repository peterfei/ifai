# RAG Embedding - 规范增量

## MODIFIED Requirements

### Requirement: 代码语义 Embedding 生成
系统 SHALL 使用代码专用 Embedding 模型（Qwen2-Embedder）生成代码片段的向量表示，以提升代码语义检索精度。

**修改内容**：从通用模型（all-MiniLM-L6-v2）升级到代码专用模型（Qwen2-Embedder ONNX）

#### Scenario: 代码文件 Embedding 生成
- **GIVEN** 用户打开代码库项目
- **AND** RAG 索引系统启动
- **WHEN** 系统扫描到 TypeScript/Rust/Python 等代码文件
- **THEN** 系统应使用 Qwen2-Embedder 模型生成 embedding
- **AND** embedding 维度为 768（与 Qwen2.5-Coder 语义空间对齐）
- **AND** 每个文档块的 embedding 生成时间 < 50ms
- **AND** 批量处理时支持批大小 32，总吞吐 > 100 文档/秒

#### Scenario: 代码查询 Embedding 生成
- **GIVEN** 用户在对话中使用 `@codebase` 查询
- **WHEN** 系统接收到查询文本（如 "@codebase 如何实现用户认证"）
- **THEN** 系统应使用相同的 Qwen2-Embedder 模型生成查询 embedding
- **AND** embedding 生成时间 < 100ms
- **AND** 使用与代码文档相同的语义空间

#### Scenario: 代码相似度检索精度提升
- **GIVEN** 索引已使用 Qwen2-Embedder 模型构建
- **WHEN** 用户查询"JWT token 生成逻辑"
- **THEN** 系统应返回相关的代码片段
- **AND** 检索精度（NDCG@10）相比 all-MiniLM-L6-v2 提升 >= 15%
- **AND** top-5 结果中至少有 4 个是相关代码

### Requirement: Embedding 模型优化和量化
系统 SHALL 使用 ONNX INT8 量化优化 Embedding 模型以减小体积和内存占用。

**修改内容**：新增量化要求和性能目标

#### Scenario: 量化模型体积优化
- **GIVEN** Qwen2-Embedder 原始模型（FP32）体积 ~200MB
- **WHEN** 使用 ONNX INT8 量化
- **THEN** 量化后模型体积应 <= 120MB
- **AND** 质量损失（余弦相似度差异）< 1%
- **AND** 打包到应用中不显著增加安装包大小

#### Scenario: 量化模型推理性能
- **GIVEN** 使用 ONNX Runtime 加载量化模型
- **WHEN** 执行 embedding 推理
- **THEN** 单文档推理时间相比 FP32 减少 >= 30%
- **AND** 内存占用减少 >= 40%
- **AND** 检索精度损失 < 2%

#### Scenario: 跨平台 ONNX Runtime 加速
- **GIVEN** 应用运行在支持硬件加速的平台
- **WHEN** 加载 Embedding 模型
- **THEN** 系统应自动检测并使用以下加速：
  - macOS: CoreML（Apple Silicon）或 CPU（Intel）
  - Windows: DirectML（GPU）或 CPU
  - Linux: CUDA（NVIDIA）或 CPU
- **AND** 记录加速方式到日志

## ADDED Requirements

### Requirement: 代码专用 Embedding 模型集成
系统 SHALL 支持集成和切换多种代码专用 Embedding 模型。

#### Scenario: Qwen2-Embedder 模型初始化
- **GIVEN** 应用首次启动
- **WHEN** RAG 系统初始化
- **THEN** 系统应加载内嵌的 Qwen2-Embedder ONNX 模型
- **AND** 模型加载时间 < 2 秒
- **AND** 内存占用增加 ~200MB（模型权重 + 运行时）
- **AND** 发送模型就绪事件

#### Scenario: Embedding 模型切换（未来扩展）
- **GIVEN** 用户在设置页面选择不同的 Embedding 模型
- **WHEN** 点击"应用"
- **THEN** 系统应卸载当前模型
- **AND** 加载新模型
- **AND** 显示提示"需要重新索引代码库以使用新模型"
- **AND** 提供"立即重新索引"选项

### Requirement: 代码块智能分割优化
系统 SHALL 使用代码感知的分割策略优化文档分块，以提升检索质量。

#### Scenario: 函数级别代码分割
- **GIVEN** 扫描到 TypeScript/JavaScript 代码文件
- **WHEN** 系统进行文档分割
- **THEN** 系统应优先在函数/类边界分割
- **AND** 单个代码块大小在 256-1024 tokens 之间
- **AND** 保留上下文（函数签名 + 前 2 行注释）
- **AND** 避免在代码块中间截断

#### Scenario: Markdown 文档分割
- **GIVEN** 扫描到 README.md 或文档文件
- **WHEN** 系统进行文档分割
- **THEN** 系统应在标题（## 或 ###）边界分割
- **AND** 保留标题层级上下文
- **AND** 单个块大小在 512-2048 tokens 之间

#### Scenario: 代码注释与代码分离
- **GIVEN** 代码文件包含大量注释和文档字符串
- **WHEN** 系统进行 embedding 生成
- **THEN** 系统应为代码和注释生成独立的 embedding
- **AND** 注释 embedding 用于自然语言查询匹配
- **AND** 代码 embedding 用于代码相似度匹配

### Requirement: Embedding 缓存和增量索引
系统 SHALL 实现 Embedding 缓存机制以避免重复计算，并支持增量索引更新。

#### Scenario: Embedding 结果缓存
- **GIVEN** 代码文件已生成 embedding
- **AND** 文件内容未发生变化
- **WHEN** 系统重新扫描项目
- **THEN** 系统应从缓存中读取 embedding
- **AND** 跳过重复计算
- **AND** 缓存命中率 > 90%（稳定项目）

#### Scenario: 文件修改触发增量更新
- **GIVEN** 用户修改了代码文件
- **WHEN** 文件保存后触发索引更新
- **THEN** 系统应仅重新计算修改文件的 embedding
- **AND** 更新向量索引中的对应条目
- **AND** 增量更新时间 < 500ms（单文件）

#### Scenario: 缓存失效和清理
- **GIVEN** 代码文件被删除
- **WHEN** 系统扫描到文件缺失
- **THEN** 系统应从缓存中删除对应 embedding
- **AND** 从向量索引中移除条目
- **AND** 定期清理孤立缓存（每周）

## ADDED Requirements

### Requirement: 代码语义检索质量指标
系统 SHALL 提供代码检索质量的可观测性指标。

#### Scenario: 检索质量评估
- **GIVEN** 用户执行 `@codebase` 查询
- **WHEN** 系统返回 top-K 结果
- **THEN** 系统应记录以下指标：
  - 查询响应时间（< 150ms）
  - 返回结果数量（K = 5-10）
  - 结果相似度分数（cosine similarity）
  - 缓存命中情况
- **AND** 提供调试模式显示详细检索过程

#### Scenario: 低质量结果警告
- **GIVEN** 检索结果的最高相似度分数 < 0.5
- **WHEN** 系统返回结果给用户
- **THEN** 系统应显示警告"未找到高度相关的代码，结果可能不准确"
- **AND** 提供优化建议（如"重新索引"或"调整查询关键词"）

## REMOVED Requirements

无（保留现有 RAG 架构，仅升级模型）
