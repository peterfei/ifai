# 元编程 Token 系统设计文档

## 核心哲学

**复用 GUI 端元数据，零重复定义**

```
┌─────────────────────────────────────────────────────────┐
│  GUI 端已有元数据（复用）                                │
│  ├─ providers/registry/*.yaml      → ProviderSpec       │
│  │   ├─ openai-official.yaml       → cost_per_1k_tokens │
│  │   ├─ deepseek-official.yaml     → 详细定价           │
│  │   └─ ... (5 个 provider)                             │
│  └─ src/harness/api/provider_metadata.rs                │
│      ├─ ModelSpec                → 扩展定价字段         │
│      └─ get_provider_spec(id)     → 复用查询 API        │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│  CLI 端扩展（零重复）                                    │
│  ├─ 扩展 ModelSpec.pricing         → 支持 cache 定价    │
│  ├─ token/usage.rs                 → TokenMetrics       │
│  └─ token/compact.rs               → CompactionEngine   │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│  运行时 API                                             │
│  ├─ pricing_for_model(model)     → 从 metadata 读取     │
│  ├─ calculate_cost(tokens, model) → 使用定价数据        │
│  └─ TokenMetrics                 → 自动生成方法         │
└─────────────────────────────────────────────────────────┘
```

## 1. 扩展 ModelSpec 以支持详细定价

### 1.1 当前 `ModelSpec` 结构（GUI 端）

```rust
pub struct ModelSpec {
    pub id: String,
    pub name: String,
    pub context_tokens: u32,
    pub capabilities: Vec<String>,
    pub cost_per_1k_tokens: Option<f64>,  // ⚠️ 简单定价（OpenAI 格式）
    pub tags: Vec<String>,
}
```

### 1.2 扩展为支持详细定价

```rust
/// 🔥 元编程：扩展 ModelSpec 以支持所有定价格式
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelSpec {
    pub id: String,
    pub name: String,
    pub context_tokens: u32,
    pub capabilities: Vec<String>,

    /// 🔥 兼容简单定价（OpenAI 格式）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_per_1k_tokens: Option<f64>,

    /// 🔥 详细定价（DeepSeek/Gemini 格式）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pricing: Option<ModelPricing>,

    pub tags: Vec<String>,
}

/// 🔥 详细定价结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricing {
    /// 输入定价（每 1K tokens）
    pub input: f64,
    /// 输出定价（每 1K tokens）
    pub output: f64,
    /// 缓存命中定价（可选，支持 prompt caching）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_hit: Option<f64>,
    /// 缓存未命中定价（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_miss: Option<f64>,
}

impl ModelSpec {
    /// 🔥 元方法：统一获取输入定价
    pub fn input_cost_per_1k(&self) -> Option<f64> {
        if let Some(pricing) = &self.pricing {
            Some(pricing.input)
        } else {
            self.cost_per_1k_tokens
        }
    }

    /// 🔥 元方法：统一获取输出定价
    pub fn output_cost_per_1k(&self) -> Option<f64> {
        self.pricing.as_ref().map(|p| p.output)
    }

    /// 🔥 元方法：计算成本（USD）
    pub fn calculate_cost(&self, input_tokens: u32, output_tokens: u32) -> Option<f64> {
        let input_cost = (input_tokens as f64 / 1000.0) * self.input_cost_per_1k()?;
        let output_cost = (output_tokens as f64 / 1000.0) * self.output_cost_per_1k()?;
        Some(input_cost + output_cost)
    }
}
```

### 1.3 YAML 兼容性

**OpenAI 格式**（继续工作）：
```yaml
- id: gpt-4o
  cost_per_1k_tokens: 0.005  # 简单定价
```

**DeepSeek 格式**（扩展支持）：
```yaml
- id: deepseek-chat
  pricing:
    input: 0.28    # cache_miss 价格
    output: 0.42
    cache_hit: 0.028
```

## 2. CLI 端复用 GUI 元数据

### 2.1 从 `provider_metadata` 读取定价

```rust
// token/usage.rs
use crate::harness::api::provider_metadata::{get_provider_spec, ProviderSpec};

pub fn pricing_for_model(model_id: &str) -> Option<ModelPricing> {
    // 🔥 元编程：遍历所有 provider 查找模型
    for (_provider_id, spec) in get_all_provider_specs() {
        if let Some(model_spec) = spec.models.iter().find(|m| m.id == model_id) {
            return model_spec.to_pricing();
        }
    }
    None
}

impl ModelSpec {
    fn to_pricing(&self) -> Option<ModelPricing> {
        Some(ModelPricing {
            input: self.input_cost_per_1k()?,
            output: self.output_cost_per_1k()?,
            cache_hit: self.pricing.as_ref()?.cache_hit,
            cache_miss: None,  // 与 input 合并
        })
    }
}
```

### 2.2 使用示例

```rust
// session.rs
use crate::token::usage::pricing_for_model;

fn record_usage(&mut self, input: u32, output: u32) {
    if let Some(cost) = pricing_for_model(&self.model)
        .and_then(|p| p.calculate_cost(input, output))
    {
        self.total_cost += cost;
        println!("Session cost: ${:.4}", self.total_cost);
    }
}
```

## 3. Token 追踪器（保持原设计）

### 3.1 声明式规格定义

```rust
#[derive(MetricSpec)]
pub struct TokenMetrics {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_hit_tokens: u32,
    pub cache_miss_tokens: u32,
}

// 自动生成方法...
```

## 4. 会话压缩引擎（保持原设计）

### 4.1 YAML 配置

```yaml
# models/compaction_rules.yaml（新增）
compaction_rules:
  - priority: 100
    trigger_condition:
      min_messages: 10
      max_tokens: 100000
    preserve_config:
      recent_messages: 10
```

## 5. 数据流

```
用户输入 "Write a file"
    ↓
Session.stream_prompt()
    ↓
API 调用 → 获得 token 使用量
    ↓
session.record_usage(input, output)
    ↓
pricing_for_model("deepseek-chat") → 从 GUI metadata 读取
    ↓
calculate_cost(input, output) → $0.00XX
    ↓
显示: "Token usage: 1500 input / 500 output (Total: 2000)"
       "Cost: $0.00XX"
```

## 关键改进

1. ✅ **复用 GUI 元数据** - 零重复定义定价
2. ✅ **扩展 ModelSpec** - 支持简单和详细定价格式
3. ✅ **统一 API** - `pricing_for_model()` 从 metadata 读取
4. ✅ **向后兼容** - 简单定价继续工作
5. ✅ **类型安全** - Rust 编译时检查

## 总结

**元编程的核心**：**复用而非重写**

```
GUI: providers/registry/*.yaml + provider_metadata.rs
  ↓ 扩展
ModelSpec.pricing (新增 cache_hit/cache_miss)
  ↓ 复用
CLI: pricing_for_model() → 读取 GUI metadata
  ↓ 生成
TokenMetrics → 自动生成方法
```

单一真实来源：`providers/registry/*.yaml`

## 1. 模型定价元数据

### 1.1 YAML 配置（`models/token_pricing.yaml`）

```yaml
model_pricing:
  - model_family: "claude"
    models: ["claude-3-5-sonnet", "claude-3-opus"]
    max_tokens: 200000
    pricing:
      input_per_million: 3.0
      output_per_million: 15.0
      cache_write_per_million: 3.75
      cache_read_per_million: 0.30
    aliases: ["anthropic", "claude-3"]
```

### 1.2 编译时代码生成（`build.rs`）

```rust
fn main() {
    // 读取 YAML
    let pricing_yaml = std::fs::read_to_string("models/token_pricing.yaml")
        .expect("Failed to read token_pricing.yaml");

    // 解析为结构体
    let config: TokenPricingConfig = serde_yaml::from_str(&pricing_yaml)
        .expect("Failed to parse token_pricing.yaml");

    // 生成 Rust 代码
    let rust_code = generate_pricing_module(&config);

    // 写入 src/bin/cli/token_pricing.rs
    std::fs::write("src/bin/cli/token_pricing.rs", rust_code)
        .expect("Failed to write token_pricing.rs");
}
```

**生成的代码**（`token_pricing.rs`）：
```rust
// 🔥 自动生成 - 请勿手动编辑

#[derive(Debug, Clone)]
pub struct ModelPricing {
    pub max_tokens: usize,
    pub input_cost_per_million: f64,
    pub output_cost_per_million: f64,
    pub cache_write_cost_per_million: Option<f64>,
    pub cache_read_cost_per_million: Option<f64>,
}

static MODEL_PRICING_TABLE: &[(&str, ModelPricing)] = &[
    ("claude-3-5-sonnet-20241022", ModelPricing { ... }),
    ("claude-3-opus-20240229", ModelPricing { ... }),
    // ... 所有模型
];

pub fn pricing_for_model(model: &str) -> Option<ModelPricing> {
    MODEL_PRICING_TABLE
        .iter()
        .find(|(name, _)| name.contains(model) || model.contains(name))
        .map(|(_, pricing)| pricing.clone())
}
```

### 1.3 使用示例

```rust
// 在 session.rs 中
use crate::token_pricing::pricing_for_model;

fn calculate_cost(&self, input_tokens: u32, output_tokens: u32) -> Option<f64> {
    let pricing = pricing_for_model(&self.model)?;
    let input_cost = (input_tokens as f64 / 1_000_000.0) * pricing.input_cost_per_million;
    let output_cost = (output_tokens as f64 / 1_000_000.0) * pricing.output_cost_per_million;
    Some(input_cost + output_cost)
}
```

## 2. Token 追踪器

### 2.1 声明式规格定义（`token/usage.rs`）

```rust
/// 🔥 元编程：使用宏自动生成方法
#[derive(MetricSpec)]
pub struct TokenMetrics {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_write_tokens: u32,
    pub cache_read_tokens: u32,
}

// 🔥 宏自动生成以下方法：
impl TokenMetrics {
    pub fn total_tokens(&self) -> u32 {
        self.input_tokens + self.output_tokens + self.cache_read_tokens
    }

    pub fn estimate_cost_usd(&self, model: &str) -> Option<f64> {
        let pricing = pricing_for_model(model)?;
        let input = (self.input_tokens as f64 / 1_000_000.0) * pricing.input_cost_per_million;
        let output = (self.output_tokens as f64 / 1_000_000.0) * pricing.output_cost_per_million;
        Some(input + output)
    }

    pub fn summary_lines(&self) -> Vec<String> {
        vec![
            format!("Input tokens     {}", self.input_tokens),
            format!("Output tokens    {}", self.output_tokens),
            format!("Cache write      {}", self.cache_write_tokens),
            format!("Cache read       {}", self.cache_read_tokens),
            format!("Total tokens     {}", self.total_tokens()),
        ]
    }
}
```

### 2.2 会话集成

```rust
pub struct Session {
    // ... 现有字段

    // 🔥 元编程：累积 token 统计
    cumulative_metrics: TokenMetrics,
    turn_count: u32,
}

impl Session {
    pub fn record_turn(&mut self, input: u32, output: u32) {
        self.cumulative_metrics.input_tokens += input;
        self.cumulative_metrics.output_tokens += output;
        self.turn_count += 1;
    }

    pub fn total_cost(&self) -> Option<f64> {
        self.cumulative_metrics.estimate_cost_usd(&self.model)
    }
}
```

## 3. 会话压缩引擎

### 3.1 YAML 配置（`models/compaction_rules.yaml`）

```yaml
compaction_rules:
  - priority: 100
    name: "default-compaction"
    trigger_condition:
      min_messages: 10
      max_tokens: 100000
    preserve_config:
      recent_messages: 10
      system_prompt: true
      tool_pairs: true
```

### 3.2 运行时引擎（`token/compact.rs`）

```rust
pub struct CompactionEngine {
    rules: Vec<CompactionRule>,
}

impl CompactionEngine {
    pub fn from_yaml(path: &Path) -> Result<Self> {
        let yaml = fs::read_to_string(path)?;
        let config: CompactionConfig = serde_yaml::from_str(&yaml)?;
        Ok(Self {
            rules: config.compaction_rules,
        })
    }

    pub fn should_compact(&self, session: &Session) -> bool {
        self.rules.iter().any(|rule| {
            session.messages.len() >= rule.trigger_condition.min_messages
                && estimate_tokens(&session.messages) >= rule.trigger_condition.max_tokens
        })
    }

    pub fn compact(&self, session: &Session) -> Result<CompactionResult> {
        // 🔥 配置驱动的压缩算法
        let rule = self.find_matching_rule(session)?;

        // 1. 保留消息（按配置）
        let preserved = rule.preserve_config.select_messages(session);

        // 2. 生成摘要（使用配置的模板）
        let summary = self.summarize(&rule.summary_config, session)?;

        // 3. 构建新会话
        let compacted = Session {
            messages: vec![original_system_prompt, summary_message]
                .into_iter()
                .chain(preserved)
                .collect(),
        };

        Ok(CompactionResult {
            compacted_session: compacted,
            removed_message_count: session.messages.len() - preserved.len(),
            summary,
        })
    }
}
```

## 4. REPL 集成

### 4.1 实时显示

```rust
// 在 stream_prompt 后
println!(
    "\nToken usage: {} input / {} output (Total: {})",
    turn_metrics.input_tokens,
    turn_metrics.output_tokens,
    turn_metrics.total_tokens()
);

// 显示累计成本
if let Some(cost) = session.total_cost() {
    println!("Cumulative cost: ${:.4}", cost);
}
```

### 4.2 `/cost` 命令

```rust
pub fn show_cost(session: &Session) -> String {
    let metrics = &session.cumulative_metrics;
    let model = &session.model;

    let mut lines = vec!["Cost".to_string()];

    for line in metrics.summary_lines() {
        lines.push(format!("  {}", line));
    }

    if let Some(cost) = metrics.estimate_cost_usd(model) {
        lines.push(format!("  Est. cost       ${:.4}", cost));
    }

    lines.push(format!("  Turns           {}", session.turn_count));

    lines.join("\n")
}
```

### 4.3 `/compact` 命令

```rust
pub fn compact_session(session: &Session) -> Result<String> {
    let engine = CompactionEngine::from_yaml("models/compaction_rules.yaml")?;

    if !engine.should_compact(session) {
        return Ok("Compaction skipped: session is below the compaction threshold.".to_string());
    }

    let result = engine.compact(session)?;

    Ok(format!(
        "Compacted {} messages into a resumable system summary.",
        result.removed_message_count
    ))
}
```

## 5. 测试策略

### 5.1 单元测试

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pricing_lookup() {
        let pricing = pricing_for_model("claude-3-5-sonnet").unwrap();
        assert_eq!(pricing.max_tokens, 200000);
        assert_eq!(pricing.input_cost_per_million, 3.0);
    }

    #[test]
    fn test_cost_calculation() {
        let metrics = TokenMetrics {
            input_tokens: 1000,
            output_tokens: 500,
            cache_write_tokens: 0,
            cache_read_tokens: 0,
        };

        let cost = metrics.estimate_cost_usd("claude-3-5-sonnet").unwrap();
        assert!((cost - 0.0105).abs() < 0.0001);  // ~1.05¢
    }

    #[test]
    fn test_compaction_trigger() {
        let engine = CompactionEngine::from_yaml("models/compaction_rules.yaml").unwrap();
        let session = create_test_session(15, 120_000);  // 超过阈值
        assert!(engine.should_compact(&session));
    }
}
```

### 5.2 集成测试

```rust
#[test]
fn test_token_tracking_across_turns() {
    let mut session = Session::new("claude-3-5-sonnet".to_string());

    // 模拟 3 轮对话
    session.record_turn(1000, 500);
    session.record_turn(1500, 800);
    session.record_turn(2000, 1200);

    assert_eq!(session.cumulative_metrics.input_tokens, 4500);
    assert_eq!(session.cumulative_metrics.output_tokens, 2500);
    assert_eq!(session.turn_count, 3);

    let cost = session.total_cost().unwrap();
    assert!((cost - 0.0675).abs() < 0.001);  // ~6.75¢
}
```

## 6. 性能优化

### 6.1 Token 估算缓存

```rust
pub struct TokenEstimator {
    cache: HashMap<String, usize>,
}

impl TokenEstimator {
    pub fn estimate(&mut self, text: &str) -> usize {
        // 使用 LRU 缓存避免重复计算
        if let Some(&cached) = self.cache.get(text) {
            return cached;
        }

        let estimated = text.len() / 4;  // 简化估算
        self.cache.insert(text.to_string(), estimated);
        estimated
    }
}
```

### 6.2 延迟摘要生成

```rust
impl Session {
    pub fn check_and_compact(&mut self, engine: &CompactionEngine) -> bool {
        if engine.should_compact(self) {
            // 后台异步生成摘要
            tokio::spawn(async move {
                engine.compact(self).await
            });
            true
        } else {
            false
        }
    }
}
```

## 7. 错误处理

```rust
pub enum TokenError {
    ModelPricingNotFound(String),
    InvalidConfiguration(String),
    CompactionFailed(String),
}

impl std::fmt::Display for TokenError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            Self::ModelPricingNotFound(model) => write!(f, "Pricing not found for model: {}", model),
            Self::InvalidConfiguration(msg) => write!(f, "Invalid configuration: {}", msg),
            Self::CompactionFailed(msg) => write!(f, "Compaction failed: {}", msg),
        }
    }
}
```

## 总结

**元编程 Token 系统的核心优势**：

1. **零硬编码** - 所有定价、规则从 YAML 驱动
2. **编译时优化** - build.rs 生成高效查找表
3. **声明式规格** - TokenMetrics 自动生成方法
4. **配置驱动** - 压缩引擎从 YAML 规则生成
5. **类型安全** - Rust 类型系统保证正确性
6. **易于扩展** - 新增模型只需修改 YAML

这就是"代码即数据"的极致体现。
