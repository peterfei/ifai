# AI 模型集成 - 规范增量

## ADDED Requirements

### Requirement: 本地 LLM 模型加载
系统 SHALL 支持加载和管理本地 LLM 模型（GGUF 格式），并提供模型生命周期管理能力。

#### Scenario: 成功加载 Qwen2.5-Coder 模型
- **GIVEN** 用户已下载 Qwen2.5-Coder-0.5B-Q4_K_M.gguf 模型文件到 `.ifai/models/llm/` 目录
- **WHEN** 应用启动或用户主动触发"加载本地模型"
- **THEN** 系统应在 5 秒内成功加载模型到内存
- **AND** 显示模型状态为"已加载"和内存占用信息（~700MB）
- **AND** 发送模型就绪事件到前端

#### Scenario: 模型文件不存在时的回退
- **GIVEN** 本地模型文件不存在
- **WHEN** 系统尝试加载本地模型
- **THEN** 系统应显示友好提示"本地模型未下载，请前往设置页面下载"
- **AND** 自动回退到云端 API 模式
- **AND** 不阻塞用户使用 AI 功能

#### Scenario: 低内存设备自动跳过加载
- **GIVEN** 系统可用内存 < 2GB
- **WHEN** 应用尝试自动加载本地模型
- **THEN** 系统应跳过加载并记录日志
- **AND** 显示提示"内存不足，已切换到云端模式"
- **AND** 提供"手动加载"选项供高级用户覆盖

### Requirement: 本地 LLM 推理
系统 SHALL 支持使用本地 LLM 进行代码生成、补全和解释任务，并提供流式响应。

#### Scenario: 代码补全请求（本地推理）
- **GIVEN** 本地模型已加载
- **AND** 用户在编辑器中触发代码补全（上下文 < 2048 tokens）
- **WHEN** 系统接收到补全请求
- **THEN** 系统应使用本地模型推理
- **AND** 首 token 延迟 < 1 秒
- **AND** 推理速度 >= 10 tokens/s（CPU）或 >= 30 tokens/s（GPU）
- **AND** 以流式方式返回生成的代码

#### Scenario: 长上下文任务自动路由到云端
- **GIVEN** 本地模型已加载
- **AND** 用户提交上下文长度 > 6144 tokens 的任务
- **WHEN** 系统判断任务类型
- **THEN** 系统应自动路由到云端 API
- **AND** 显示提示"超长上下文，使用云端模型处理"
- **AND** 保持流式响应体验一致性

#### Scenario: 推理失败时的错误处理
- **GIVEN** 本地模型推理过程中发生错误（OOM、崩溃等）
- **WHEN** 错误被捕获
- **THEN** 系统应记录详细错误日志
- **AND** 显示用户友好的错误提示
- **AND** 自动卸载模型释放内存
- **AND** 提供"重试"和"切换到云端"选项

### Requirement: 硬件加速支持
系统 SHALL 检测并使用平台原生硬件加速（Metal/CUDA/Vulkan）以优化推理性能。

#### Scenario: macOS 自动启用 Metal 加速
- **GIVEN** 应用运行在 macOS（M1/M2/M3 或 Intel with Metal 2+）
- **WHEN** 加载本地模型
- **THEN** 系统应自动检测并启用 Metal 加速
- **AND** 在日志中记录"Metal acceleration enabled"
- **AND** 推理速度相比 CPU 提升 2-4 倍

#### Scenario: NVIDIA GPU 自动启用 CUDA
- **GIVEN** 应用运行在 Windows/Linux 且检测到 NVIDIA GPU
- **WHEN** 加载本地模型
- **THEN** 系统应尝试启用 CUDA 加速
- **AND** 如果 CUDA 可用，记录"CUDA acceleration enabled"
- **AND** 如果 CUDA 不可用，回退到 CPU 并记录警告

#### Scenario: 无 GPU 环境使用 CPU 推理
- **GIVEN** 系统无可用的 GPU 加速
- **WHEN** 加载本地模型
- **THEN** 系统应使用 CPU 推理
- **AND** 记录"Using CPU inference with AVX2 optimization"
- **AND** 显示性能提示"推荐使用 GPU 以获得更快速度"

### Requirement: 模型下载和缓存管理
系统 SHALL 提供模型下载、验证和缓存清理功能。

#### Scenario: 用户下载 LLM 模型
- **GIVEN** 用户在设置页面选择"下载 Qwen2.5-Coder-0.5B 模型"
- **WHEN** 点击"下载"按钮
- **THEN** 系统应显示下载进度条（百分比和速度）
- **AND** 支持断点续传（下载中断后可继续）
- **AND** 下载完成后自动进行 SHA256 校验
- **AND** 校验成功后保存到 `.ifai/models/llm/` 目录
- **AND** 发送通知"模型下载完成，现在可以使用本地 AI 功能"

#### Scenario: 下载失败时的重试机制
- **GIVEN** 模型下载过程中网络中断
- **WHEN** 下载失败
- **THEN** 系统应保留已下载的部分文件
- **AND** 显示错误提示"下载失败，点击重试"
- **AND** 重试时从断点继续下载
- **AND** 最多自动重试 3 次

#### Scenario: 删除本地模型释放空间
- **GIVEN** 用户在设置页面选择已下载的模型
- **WHEN** 点击"删除"按钮并确认
- **THEN** 系统应先卸载模型（如果已加载）
- **AND** 删除模型文件
- **AND** 更新磁盘空间显示
- **AND** 显示通知"模型已删除，释放 ~300MB 空间"

### Requirement: 混合推理路由
系统 SHALL 根据任务类型、上下文长度和用户偏好智能选择本地或云端推理。

#### Scenario: 简单代码补全使用本地模型
- **GIVEN** 本地模型已加载
- **AND** 用户偏好设置为"自动"
- **WHEN** 用户请求代码补全（上下文 < 2048 tokens）
- **THEN** 系统应自动选择本地模型
- **AND** 在 UI 中显示 🏠 本地模型标识
- **AND** 推理完成后记录性能指标

#### Scenario: 复杂架构设计使用云端 API
- **GIVEN** 本地模型已加载
- **AND** 用户偏好设置为"自动"
- **WHEN** 用户请求"设计微服务架构"（复杂任务）
- **THEN** 系统应自动选择云端 API
- **AND** 在 UI 中显示 ☁️ 云端模型标识
- **AND** 显示选择原因"复杂任务，使用云端模型以获得更好质量"

#### Scenario: 用户手动覆盖路由决策
- **GIVEN** 系统自动选择了本地模型
- **WHEN** 用户点击"切换到云端模型"
- **THEN** 系统应中断当前推理（如果正在进行）
- **AND** 使用云端 API 重新执行任务
- **AND** 记录用户覆盖决策供未来优化

## ADDED Requirements

### Requirement: 模型性能监控
系统 SHALL 提供实时的模型性能监控和资源使用统计。

#### Scenario: 实时显示推理性能指标
- **GIVEN** 本地模型正在执行推理
- **WHEN** 用户打开性能监控面板
- **THEN** 系统应实时显示：
  - 推理速度（tokens/s）
  - CPU/GPU 使用率
  - 内存占用（模型 + 运行时）
  - 推理延迟（P50/P95/P99）
- **AND** 每秒更新一次数据

#### Scenario: 性能警告和优化建议
- **GIVEN** 本地推理速度持续 < 5 tokens/s
- **WHEN** 系统检测到性能不佳
- **THEN** 系统应显示警告"推理速度较慢"
- **AND** 提供优化建议（如"启用 GPU 加速"或"切换到云端模式"）
- **AND** 提供一键操作按钮

## MODIFIED Requirements

无（此为新增功能，无需修改现有需求）

## REMOVED Requirements

无（保留现有云端 API 功能）
