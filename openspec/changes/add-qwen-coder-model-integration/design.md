# 技术设计：Qwen2.5-Coder 本地模型集成

## Context（背景）

### 当前状态
- **AI 功能**：完全依赖外部 API（OpenAI、Claude、智谱 AI）
- **Embedding**：使用 fastembed + all-MiniLM-L6-v2（通用语义模型，87MB）
- **架构**：Tauri 2.0 + React 19，Rust 后端处理 AI 调用
- **性能**：应用体积 ~50MB，运行时内存 ~80MB

### 技术约束
- **平台兼容性**：Windows 10+, macOS 11+, Linux (Debian/Ubuntu/Fedora)
- **Bundle 大小**：希望保持 <500MB（含模型）
- **内存占用**：目标运行时 <1GB（含模型加载）
- **启动性能**：冷启动 <3s（不含首次模型加载）

### 利益相关者
- **用户**：需要离线 AI 功能、隐私保护、零成本使用
- **开发团队**：需要保持代码质量、性能、可维护性
- **企业客户**：需要代码不出本地、合规性保障

## Goals / Non-Goals（目标与非目标）

### Goals（目标）
1. ✅ 集成轻量级本地 LLM（Qwen2.5-Coder-0.5B-Q4）支持离线代码生成
2. ✅ 升级到代码专用 Embedding 模型，提升 RAG 检索精度
3. ✅ 实现混合推理架构（本地 + 云端智能路由）
4. ✅ 保持安装包体积在合理范围（<500MB）
5. ✅ 确保推理性能满足实时交互需求（<1s 首 token）
6. ✅ 支持跨平台硬件加速（Metal/CUDA/Vulkan）

### Non-Goals（非目标）
1. ❌ 支持超大模型（>3B 参数），优先轻量高效
2. ❌ 实现模型微调功能（v1.0 不涉及，未来可考虑）
3. ❌ 支持多模态模型（仅限文本代码任务）
4. ❌ 构建模型训练和评估系统（使用预训练模型）
5. ❌ 完全移除云端 API 支持（保留混合模式）

## Decisions（技术决策）

### Decision 1: 推理引擎选型 - llama.cpp vs candle vs ONNX Runtime

**选择：llama.cpp（Rust 绑定：llama-cpp-rs）**

**原因**：
- ✅ 成熟稳定：llama.cpp 是业界标准，社区活跃，bug 修复快
- ✅ 性能优异：C++ 实现，高度优化，支持多种量化格式（Q4_0, Q5_K_M, Q8_0）
- ✅ 硬件加速：原生支持 Metal（macOS）、CUDA（NVIDIA）、Vulkan（跨平台）
- ✅ Rust 绑定成熟：llama-cpp-rs 提供安全的 Rust FFI 绑定
- ✅ 模型兼容性：支持 GGUF 格式，Qwen2.5-Coder 官方提供 GGUF 版本

**备选方案及原因**：
- **candle (Hugging Face)**：
  - ❌ 纯 Rust 实现，但性能略逊于 llama.cpp
  - ❌ 模型格式支持较少，需要转换
  - ✅ 完全 Rust 生态，无 C++ 依赖
  - 结论：性能优先，选择 llama.cpp

- **ONNX Runtime**：
  - ❌ 主要针对 ONNX 模型，需要转换 Qwen2.5-Coder
  - ❌ 推理性能不如 llama.cpp
  - ✅ 跨平台兼容性好
  - 结论：对于 LLM 推理，llama.cpp 更优

### Decision 2: Embedding 模型选型 - CodeBERT vs Qwen2-Embedder vs 保持 all-MiniLM

**选择：Qwen2-Embedder（ONNX 量化版）**

**原因**：
- ✅ 与 LLM 同源：Qwen 系列模型，语义空间对齐更好
- ✅ 代码优化：专门针对代码语义训练
- ✅ 体积适中：ONNX INT8 量化后 ~120MB
- ✅ 性能优异：代码检索 NDCG@10 提升 ~20%（相比 all-MiniLM）
- ✅ 官方支持：阿里云团队维护，文档完善

**备选方案及原因**：
- **CodeBERT (Microsoft)**：
  - ✅ 专门针对代码设计
  - ❌ 体积较大（~140MB）
  - ❌ 与 Qwen LLM 语义空间可能不对齐
  - 结论：Qwen2-Embedder 更契合整体架构

- **保持 all-MiniLM-L6-v2**：
  - ✅ 已集成，无需额外工作
  - ❌ 通用模型，代码场景表现一般
  - ❌ 无法与 Qwen LLM 协同优化
  - 结论：值得升级以提升 RAG 质量

### Decision 3: 模型量化策略 - Q4_0 vs Q5_K_M vs Q8_0

**选择：Q4_K_M（4-bit 分组量化，混合精度）**

**原因**：
- ✅ 体积最优：~300MB（相比原始 FP16 的 1GB）
- ✅ 性能均衡：推理速度快，内存占用低
- ✅ 质量可接受：代码生成质量损失 <5%（相比 FP16）
- ✅ 硬件适配：4-bit 在 CPU 和 GPU 上都高效

**性能对比表**：
| 量化格式 | 体积 | 内存占用 | 推理速度 | 质量损失 |
|---------|------|---------|---------|---------|
| FP16 (原始) | ~1GB | ~2GB | 基准 | 0% |
| Q8_0 | ~550MB | ~1.2GB | 1.2x | <1% |
| Q5_K_M | ~400MB | ~900MB | 1.5x | <3% |
| **Q4_K_M** | **~300MB** | **~700MB** | **1.8x** | **<5%** |
| Q4_0 | ~280MB | ~650MB | 2.0x | ~8% |

**权衡说明**：
- Q4_K_M 在质量和性能间达到最佳平衡
- 对于 0.5B 小模型，4-bit 量化几乎无感知质量损失
- 内存占用符合目标（<1GB 运行时）

### Decision 4: 混合推理路由策略 - 规则引擎 vs ML 分类器 vs 用户手动

**选择：规则引擎 + 用户覆盖**

**原因**：
- ✅ 简单可控：基于任务类型和上下文长度的确定性规则
- ✅ 透明可解释：用户清楚知道为什么选择本地/云端
- ✅ 无额外开销：无需 ML 模型推理
- ✅ 灵活调整：用户可手动覆盖自动决策

**路由规则**：
```rust
// 伪代码示例
fn route_inference(task: TaskType, context_length: usize) -> InferenceBackend {
    match task {
        TaskType::CodeCompletion if context_length < 2048 => Local,
        TaskType::SimpleRefactor if context_length < 4096 => Local,
        TaskType::UnitTestGeneration if context_length < 3072 => Local,
        TaskType::ArchitectureDesign => Cloud,
        TaskType::DeepRefactor => Cloud,
        _ if context_length > 6144 => Cloud, // 超长上下文
        _ => UserPreference, // 回退到用户设置
    }
}
```

**备选方案及原因**：
- **ML 分类器**：
  - ❌ 增加复杂度，需要训练数据
  - ❌ 不透明，用户难以理解决策
  - ✅ 可能更精准
  - 结论：当前阶段规则引擎足够

### Decision 5: 模型打包策略 - 内嵌 vs 首次下载 vs 混合

**选择：混合策略（Embedding 内嵌 + LLM 首次下载）**

**原因**：
- ✅ 安装包体积控制：仅内嵌小模型（Embedding ~120MB）
- ✅ 用户选择：用户可选择是否下载 LLM（~300MB）
- ✅ 快速启动：Embedding 模型立即可用（RAG 功能）
- ✅ 灵活性：用户可根据网络和硬件条件决定

**实施方案**：
1. **轻量版安装包**（~200MB）：
   - 内嵌 Embedding 模型
   - 支持 RAG 代码检索
   - 首次启动提示下载 LLM

2. **完整版安装包**（~500MB）：
   - 内嵌 Embedding + LLM
   - 开箱即用的完全离线体验

**备选方案及原因**：
- **全部内嵌**：
  - ❌ 安装包过大（~500MB），下载体验差
  - ✅ 开箱即用
  - 结论：提供完整版作为选项

- **全部首次下载**：
  - ❌ 首次使用体验差
  - ❌ Embedding 模型也需下载，RAG 无法立即使用
  - 结论：Embedding 必须内嵌

### Decision 6: 平台硬件加速方案

**选择：平台原生加速 + CPU 回退**

**macOS**：
- ✅ 优先使用 Metal（Apple Silicon / Intel 集成显卡）
- ✅ M 系列芯片：Metal Performance Shaders 加速
- ✅ Intel Mac：Metal 2+

**Windows**：
- ✅ 优先使用 CUDA（NVIDIA GPU）
- ⚠️ AMD GPU：Vulkan 加速（实验性）
- ✅ 无独显：CPU + AVX2 指令集

**Linux**：
- ✅ NVIDIA：CUDA
- ✅ AMD：ROCm / Vulkan
- ✅ Intel：oneAPI / Vulkan
- ✅ 无 GPU：CPU + AVX2/NEON

**回退策略**：
```rust
// 硬件检测优先级
let backend = detect_best_backend(&[
    Backend::Metal,   // macOS M1/M2/M3
    Backend::CUDA,    // NVIDIA GPU
    Backend::Vulkan,  // 通用 GPU
    Backend::CPU,     // 最终回退
]);
```

## Architecture（架构设计）

### 系统层次架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  AIChat UI   │  │ Model Config │  │ Performance UI  │   │
│  │ (本地/云端)   │  │    Panel     │  │   (FPS/内存)     │   │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕ Tauri Commands / Events
┌─────────────────────────────────────────────────────────────┐
│                 Backend (Rust/Tauri)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          Inference Router (混合推理路由)              │   │
│  │  ┌────────────────┐        ┌─────────────────────┐  │   │
│  │  │  Rule Engine   │───────▶│  User Preference    │  │   │
│  │  │ (任务类型分析)  │        │  (手动覆盖)          │  │   │
│  │  └────────────────┘        └─────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│           ↙                              ↘                  │
│  ┌─────────────────┐            ┌──────────────────────┐   │
│  │  Local LLM      │            │   Cloud API Client   │   │
│  │  Inference      │            │  (OpenAI/Claude/智谱)│   │
│  │ ┌─────────────┐ │            └──────────────────────┘   │
│  │ │llama.cpp    │ │                                        │
│  │ │ Bridge      │ │            ┌──────────────────────┐   │
│  │ └─────────────┘ │            │  RAG Embedding       │   │
│  │ ┌─────────────┐ │            │  (Qwen2-Embedder)    │   │
│  │ │Model Loader │ │            │ ┌──────────────────┐ │   │
│  │ │ (缓存管理)   │ │            │ │  fastembed /     │ │   │
│  │ └─────────────┘ │            │ │  Custom ONNX     │ │   │
│  └─────────────────┘            │ └──────────────────┘ │   │
│                                 └──────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          Model Manager (模型管理)                     │   │
│  │  - 模型下载和缓存                                      │   │
│  │  - 版本管理和更新                                      │   │
│  │  - 性能监控和优化                                      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│              ifainew-core (Private Package)                 │
│  - AI 模型接口抽象                                           │
│  - 混合推理协调                                              │
│  - RAG 上下文构建                                            │
└─────────────────────────────────────────────────────────────┘
```

### 数据流设计

#### 1. 本地 LLM 推理流程
```
User Input (前端)
    ↓
Tauri Command: local_inference({ prompt, options })
    ↓
Inference Router: 判断任务类型
    ↓
[本地路径]
    ↓
Model Loader: 检查模型是否已加载
    ↓
llama.cpp Bridge: 调用推理引擎
    ↓
Streaming Response: 逐 token 返回
    ↓
Tauri Event: emit('ai-response-chunk', token)
    ↓
Frontend: 实时渲染
```

#### 2. RAG Embedding 检索流程
```
@codebase 查询 (前端)
    ↓
Tauri Command: build_context({ query, project_root })
    ↓
Document Chunking: 分块代码文件
    ↓
Qwen2-Embedder: 生成 query embedding
    ↓
Vector Search: cosine similarity 检索
    ↓
Context Building: 构建相关代码上下文
    ↓
返回 top-K 代码片段
```

#### 3. 混合推理决策流程
```
Task Request
    ↓
Extract Task Metadata:
  - task_type: CodeCompletion | Refactor | ...
  - context_length: token count
  - user_preference: Local | Cloud | Auto
    ↓
Rule Engine 评估:
  ┌─────────────────────────────────────┐
  │ IF user_preference != Auto:          │
  │   RETURN user_preference             │
  │ ELSE IF task_type == CodeCompletion  │
  │      AND context_length < 2048:      │
  │   RETURN Local                       │
  │ ELSE IF context_length > 6144:       │
  │   RETURN Cloud                       │
  │ ELSE:                                │
  │   RETURN Local (default)             │
  └─────────────────────────────────────┘
    ↓
Execute Inference (Local or Cloud)
```

### 模块接口设计

#### Rust 模块接口

```rust
// local_llm/mod.rs
pub struct LocalLLM {
    model: Option<LlamaModel>,
    config: ModelConfig,
    backend: Backend,
}

impl LocalLLM {
    pub async fn load_model(path: &Path) -> Result<Self>;
    pub async fn inference(&self, prompt: &str, options: InferenceOptions)
        -> Result<Stream<String>>;
    pub async fn unload_model(&mut self) -> Result<()>;
    pub fn get_status(&self) -> ModelStatus;
}

// model_manager/mod.rs
pub struct ModelManager {
    cache_dir: PathBuf,
    models: HashMap<String, ModelMetadata>,
}

impl ModelManager {
    pub async fn download_model(
        &self,
        model_id: &str,
        progress_callback: impl Fn(f64)
    ) -> Result<PathBuf>;

    pub async fn verify_model(&self, path: &Path) -> Result<bool>;
    pub fn list_available_models(&self) -> Vec<ModelMetadata>;
    pub async fn delete_model(&self, model_id: &str) -> Result<()>;
}

// inference_router/mod.rs
pub struct InferenceRouter {
    local_llm: Arc<Mutex<LocalLLM>>,
    cloud_client: Arc<CloudAPIClient>,
    rules: RouteRules,
}

impl InferenceRouter {
    pub fn route(
        &self,
        task: TaskMetadata,
        user_pref: UserPreference
    ) -> InferenceBackend;

    pub async fn execute(
        &self,
        request: InferenceRequest
    ) -> Result<Stream<String>>;
}
```

#### Tauri 命令接口

```rust
#[tauri::command]
async fn load_local_model(
    app: AppHandle,
    model_path: String,
) -> Result<ModelStatus, String>;

#[tauri::command]
async fn local_inference(
    app: AppHandle,
    state: State<'_, LocalLLMState>,
    prompt: String,
    options: InferenceOptions,
    event_id: String,
) -> Result<(), String>;

#[tauri::command]
async fn download_model(
    app: AppHandle,
    model_id: String,
    event_id: String, // 用于进度回调
) -> Result<String, String>; // 返回模型路径

#[tauri::command]
fn get_model_status(
    state: State<'_, LocalLLMState>,
) -> Result<ModelStatus, String>;

#[tauri::command]
async fn switch_inference_backend(
    app: AppHandle,
    backend: InferenceBackend, // Local | Cloud | Auto
) -> Result<(), String>;
```

## Risks / Trade-offs（风险与权衡）

### Risk 1: 模型质量 vs 体积权衡

**风险**：0.5B 小模型在复杂代码任务上质量可能不足

**影响**：
- 中等：简单任务（补全、格式化）表现良好
- 较高：复杂任务（架构设计、深度重构）质量下降

**缓解措施**：
1. ✅ 混合推理架构：复杂任务自动路由到云端 API
2. ✅ 用户教育：明确本地模型适用场景
3. ✅ 质量监控：收集用户反馈，持续优化路由规则
4. ⚠️ 未来考虑：支持可选的更大模型（1.5B/3B）

### Risk 2: 跨平台性能差异

**风险**：不同平台/硬件推理性能差异大

**影响**：
- 高端硬件（M2 Max、RTX 4090）：30-50 tokens/s
- 中端硬件（M1、GTX 1660）：15-25 tokens/s
- 低端硬件（Intel i5、无独显）：5-10 tokens/s

**缓解措施**：
1. ✅ 硬件检测：启动时自动检测性能，推荐配置
2. ✅ 性能模式：低配设备默认使用云端 API
3. ✅ 用户控制：提供手动覆盖选项
4. ✅ 性能提示：实时显示推理速度，帮助用户决策

### Risk 3: 模型下载和更新

**风险**：大文件下载可能失败或中断

**影响**：
- 网络较差用户无法获取 LLM
- 更新模型时可能下载失败

**缓解措施**：
1. ✅ 断点续传：支持下载中断后继续
2. ✅ 镜像源：提供多个下载源（GitHub、HuggingFace、国内镜像）
3. ✅ 完整性校验：SHA256 验证避免损坏文件
4. ✅ 轻量版：Embedding 模型内嵌，核心功能（RAG）不受影响

### Risk 4: 内存占用

**风险**：模型加载后内存占用较高（~700MB）

**影响**：
- 低配设备（<8GB RAM）可能卡顿
- 多标签页打开时内存压力大

**缓解措施**：
1. ✅ 懒加载：首次推理时才加载模型
2. ✅ 自动卸载：空闲 10 分钟后自动卸载
3. ✅ 内存监控：实时检测可用内存，动态调整
4. ✅ 用户控制：提供"保持加载"选项（高配设备）

## Migration Plan（迁移计划）

### Phase 1: 基础设施（Week 1-2）
1. 集成 llama-cpp-rs 依赖
2. 实现 Model Manager 和 Model Loader
3. 搭建 Tauri 命令接口
4. 配置跨平台编译和打包

### Phase 2: LLM 推理引擎（Week 2-3）
1. 实现 LocalLLM 核心推理逻辑
2. 接入流式响应和事件发送
3. 硬件加速配置（Metal/CUDA/Vulkan）
4. 性能测试和优化

### Phase 3: Embedding 升级（Week 3-4）
1. 集成 Qwen2-Embedder ONNX 模型
2. 替换 fastembed 或扩展支持
3. RAG 检索质量验证
4. 性能基准测试

### Phase 4: 混合推理路由（Week 4-5）
1. 实现 Inference Router
2. 定义路由规则
3. 用户偏好设置
4. 路由决策日志和分析

### Phase 5: UI 集成（Week 5-6）
1. 模型管理界面
2. 性能监控面板
3. 对话 UI 适配（本地/云端标识）
4. 用户设置页面

### Phase 6: 测试和优化（Week 6-8）
1. 单元测试和集成测试
2. 跨平台测试
3. 性能优化和内存调优
4. 用户 Beta 测试

### 回滚方案
- 保留云端 API 作为回退
- 可通过配置禁用本地模型
- 发布独立"云端版"（无本地模型）

## Open Questions（待解决问题）

### Question 1: Embedding 模型选型最终确认
- 需要实际测试 Qwen2-Embedder vs CodeBERT 在代码检索上的表现
- 收集用户对检索质量的反馈

### Question 2: 模型下载源和 CDN
- 确定主要下载源（GitHub Releases vs HuggingFace vs 自建 CDN）
- 国内用户访问速度优化方案

### Question 3: 多语言支持优先级
- 本地模型主要支持哪些编程语言？
- 是否需要针对特定语言优化提示词？

### Question 4: 企业版特性
- 是否需要企业版支持自定义模型？
- 私有化部署时的模型管理方案？

---

**审批流程**：
1. 技术负责人审查架构设计
2. 前端/后端团队评审接口设计
3. 产品经理确认功能优先级
4. 预研验证关键技术点
