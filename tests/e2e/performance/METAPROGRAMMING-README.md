# 🏛️ 元编程驱动的 E2E 测试框架 v2.0

> **"代码即数据，声明式优先于命令式，代码生成代码"**
>
> 一个拒绝过程编程、崇尚元编程的世界级架构设计

---

## 🎯 核心哲学

### 拒绝的过程编程

```typescript
// ❌ 禁止：手动编写循环和硬编码逻辑
for (let i = 0; i < 10000; i++) {
  messages.push({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `消息 #${i}`,
  });
}
```

### 崇尚的元编程

```typescript
// ✅ 推荐：声明式定义
const scenario = await new ScenarioBuilder()
  .define('massive-scale')
  .withHistory(10000, 'realistic')  // 🔥 Zipf 分布
  .withStreaming('incremental', 'fast', 50)
  .assertPerformance('cache_hit_rate', { threshold: 80, operator: 'gt' })
  .materialize(page);  // 🔥 自动生成测试代码和数据
```

---

## 📐 架构层次

```
┌─────────────────────────────────────────────┐
│  第一层：本体论              │
│  - TestDimension (测试维度)                     │
│  - Domain (值域)                                │
│  - Constraint (约束)                            │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  第二层：场景元模型       │
│  - ScenarioMetamodel (场景定义)               │
│  - 代码即数据                                   │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  第三层：元对象协议 (MOP)                     │
│  - ScenarioMetaobject (元对象)                │
│  - materialize() (实例化方法)                 │
│  - 代码生成代码                                 │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  第四层：生成器工厂                            │
│  - HistoryGeneratorFactory (消息生成器)       │
│  - RealisticHistoryGenerator (高保真生成)    │
│  - 参数化生成                                   │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  第五层：流式 API                              │
│  - ScenarioBuilder (声明式构建器)             │
│  - Fluent Interface (流畅接口)                │
└─────────────────────────────────────────────┘
```

---

## 🚀 核心特性

### 1. 代码即数据

场景本身不包含执行逻辑，只是对测试空间的声明式描述：

```typescript
interface ScenarioMetamodel {
  id: string;
  name: string;
  dimensions: {
    history: HistoryDimension;
    streaming: StreamingDimension;
    content: ContentDimension;
  };
  assertions: AssertionConfig;
  options: ScenarioOptions;
}
```

### 2. 代码生成代码

`materialize()` 方法在运行时根据场景配置生成测试逻辑：

```typescript
class ScenarioMetaobject {
  async materialize(page: any): Promise<ScenarioExecutionResult> {
    // 1. 生成测试数据（通过生成器）
    const testData = await this.generateTestData();

    // 2. 生成测试逻辑（通过元对象协议）
    const testLogic = this.generateTestLogic();

    // 3. 执行测试
    const metrics = await testLogic(page, testData);

    // 4. 验证断言
    return this.verifyAssertions(metrics);
  }
}
```

### 3. DRY 极限化

通过参数化避免重复逻辑：

```typescript
// ✅ 一个场景定义，自动生成多种规模测试
const scales = [100, 1000, 5000, 10000];

for (const scale of scales) {
  await new ScenarioBuilder()
    .define(`scale-${scale}`)
    .withHistory(scale, 'realistic')
    .materialize(page);
}
```

### 4. 高保真数据生成

使用 Zipf 分布（长尾分布）模拟真实用户行为：

```typescript
class RealisticHistoryGenerator implements HistoryGenerator {
  private topics = ['性能优化', '代码重构', '架构设计', ...];
  private actions = ['如何', '怎么', '最佳实践', ...];

  generate(size: number): any[] {
    // 🔥 Zipf 分布采样（长尾分布）
    const topicIndex = this.zipfSample(this.topics.length, 0.5);
    const actionIndex = Math.floor(Math.random() * this.actions.length);

    return [{
      role: 'user',
      content: `${this.actions[actionIndex]}进行${this.topics[topicIndex]}？`,
    }];
  }
}
```

---

## 📊 测试场景类型

### 1. 真实分布场景

```typescript
.withHistory(10000, 'realistic')  // Zipf 分布
```

**特点**：
- 少数主题占据大部分对话
- 长尾分布符合真实用户行为
- 高保真还原真实场景

### 2. 聚类对话场景

```typescript
.withHistory(10000, 'conversation_clusters')  // 聚类分布
```

**特点**：
- 多个主题的连续讨论
- 模拟深度对话场景
- 上下文相关性强

### 3. HTTP Proxy 场景

```typescript
.withOptions({
  useHttpProxy: true,  // 使用真实后端 HTTP API
})
```

**特点**：
- 通过 HTTP API (3333 端口) 调用
- SSE 流式响应
- 真实 AI 调用

### 4. 真实 AI 场景

```typescript
.withOptions({
  useRealAI: true,  // 直接调用 HarnessAIService
})
```

**特点**：
- 绕过 HTTP 层
- 直接调用 AI 服务
- 性能更优

---

## 🧪 使用示例

### 基础用法

```typescript
test('10000 条消息测试', async ({ page }) => {
  const result = await new ScenarioBuilder()
    .define('massive-scale')
    .withHistory(10000, 'realistic')
    .withStreaming('incremental', 'fast', 50)
    .assertPerformance('cache_hit_rate', { threshold: 80, operator: 'gt' })
    .materialize(page);

  expect(result.success).toBe(true);
});
```

### 真实 AI 性能基准测试（场景 5）

场景 5 是真实 AI 缓存效果验证测试，使用真实 AI API 调用并收集详细的性能指标。

**环境配置**：
需要在 `.env.e2e.local` 中配置：
```bash
E2E_AI_API_KEY=your-api-key
E2E_AI_BASE_URL=https://open.bigmodel.cn/api/coding/paas/v4
E2E_AI_MODEL=glm-4.6
```

**测试代码**：
```typescript
test('🔬 [基准] 真实 AI 缓存效果验证', async ({ page }) => {
  const result = await new ScenarioBuilder()
    .define('real-ai-cache-benchmark')
    .withHistory(10000, 'realistic')
    .withStreaming('incremental', 'medium', 50)
    .assertPerformance('cache_hit_rate', { threshold: 80, operator: 'gt', unit: '%' })
    .assertPerformance('avg_render_time', { threshold: 50, operator: 'lt', unit: 'ms' })
    .withOptions({
      useRealAI: true,
      enableLogging: true,
      timeout: 30000,
    })
    .materialize(page);

  console.log('📊 缓存命中率:', result.metrics.cache_hit_rate, '%');
  console.log('⚡ 平均渲染时间:', result.metrics.avg_render_time, 'ms');
  console.log('🎯 最大渲染时间:', result.metrics.max_render_time, 'ms');

  expect(result.success).toBe(true);
});
```

**收集的性能指标**：
- `cache_hit_rate`: 缓存命中率（%），通过监控控制台日志 `[useStableMessages] ✅ 缓存命中` 和 `[useStableMessages] 🔄 重新计算` 计算
- `avg_render_time`: 平均渲染时间，所有渲染操作的耗时平均值
- `max_render_time`: 最大渲染时间，记录最慢的一次渲染操作
- `streaming_time`: 流式总时长
- `event_count`: SSE 事件数量
- `content_delta_count`: 内容增量事件数量

### 参数化测试

```typescript
test('多规模对比', async ({ page }) => {
  const scales = [100, 1000, 5000, 10000];
  const results = [];

  for (const scale of scales) {
    const result = await new ScenarioBuilder()
      .define(`scale-${scale}`)
      .withHistory(scale, 'uniform')
      .materialize(page);

    results.push({ scale, metrics: result.metrics });
  }

  // 自动生成对比报告
  console.table(results);
});
```

### HTTP Proxy 集成

```typescript
test('真实后端调用', async ({ page }) => {
  const result = await new ScenarioBuilder()
    .define('real-backend')
    .withHistory(1000, 'realistic')
    .withOptions({ useHttpProxy: true })
    .materialize(page);

  // 使用 SSE 监听收集指标
  expect(result.metrics.event_count).toBeGreaterThan(0);
});
```

---

## 📁 项目文件

| 文件 | 说明 |
|------|------|
| `tests/e2e/performance/metaprogramming-v2.ts` | 元编程框架核心实现 |
| `tests/e2e/performance/metaprogramming-e2e.spec.ts` | E2E 测试用例 |
| `src-tauri/src/http_api.rs` | HTTP API 服务器 |

---

## 🎓 元编程最佳实践

### ✅ 推荐做法

1. **声明式定义场景**
   ```typescript
   .withHistory(10000, 'realistic')
   ```

2. **使用生成器工厂**
   ```typescript
   HistoryGeneratorFactory.create('realistic')
   ```

3. **参数化配置**
   ```typescript
   const scales = [100, 1000, 10000];
   scales.forEach(scale => generate(scale));
   ```

### ❌ 避免做法

1. **硬编码循环**
   ```typescript
   // ❌ 禁止
   for (let i = 0; i < 10000; i++) { ... }
   ```

2. **手动编写测试逻辑**
   ```typescript
   // ❌ 禁止
   async function test() {
     // 手动编写每个测试步骤
   }
   ```

3. **重复代码**
   ```typescript
   // ❌ 禁止
   test('100 条', () => { ... });
   test('1000 条', () => { ... });
   test('10000 条', () => { ... });
   ```

---

## 🚦 运行测试

```bash
# 运行所有元编程测试
npm run test:e2e tests/e2e/performance/metaprogramming-e2e.spec.ts

# 运行特定测试
npm run test:e2e -g "10000 条真实分布消息"

# 运行场景 5（真实 AI 缓存验证）
# 需要先配置 .env.e2e.local 中的 E2E_AI_API_KEY
npm run test:e2e -g "真实 AI 缓存效果验证"
```

**场景 5 运行前置条件**：
1. 配置 `tests/e2e/.env.e2e.local` 文件
2. 设置有效的 `E2E_AI_API_KEY`、`E2E_AI_BASE_URL`、`E2E_AI_MODEL`
3. 确保 AI 服务可访问

---

**元编程架构师语录**：

> "当你发现自己编写第二个 for 循环时，请停下来，编写一个生成器。"
> "当你发现自己复制粘贴测试代码时，请停下来，编写一个元对象。"
> "最好的代码是那些永远不会被编写的代码——让它们自己生成自己。"

---

**版本**: v2.0
**最后更新**: 2025-01-17
**维护者**: 元编程架构师
