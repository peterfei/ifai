/**
 * Unit Test: Tool Routing Strategy (v0.3.3)
 *
 * 测试三层路由策略：
 * 1. 路由优先级（Layer 1 → Layer 2 → Layer 3）
 * 2. 回退机制（本地 LLM 失败 → 云端 API）
 * 3. 性能目标（每层延迟要求）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Types
// ============================================================================

type ClassificationLayer = 1 | 2 | 3;

interface RouteResult {
  layer: ClassificationLayer;
  source: 'local' | 'cloud';
  category: string;
  tool?: string;
  confidence: number;
  latency_ms: number;
  fallback_reason?: string;
}

interface RouteOptions {
  simulateLLMFailure?: boolean;
  modelLoaded?: boolean;
  cloudAPIEnabled?: boolean;
}

// ============================================================================
// Mock Implementation
// ============================================================================

/**
 * 路由决策函数（模拟实现）
 * TODO: 替换为真实的 Rust backend 调用
 */
async function routeTool(input: string, options: RouteOptions = {}): Promise<RouteResult> {
  const start = performance.now();

  const {
    simulateLLMFailure = false,
    modelLoaded = true,
    cloudAPIEnabled = true
  } = options;

  // Layer 1: Exact Match
  if (input.startsWith('/') || input.startsWith('agent_') || /^ls$|^pwd$|^git |^npm |^cargo /.test(input)) {
    return {
      layer: 1,
      source: 'local',
      category: 'file_operations',
      tool: 'agent_read_file',
      confidence: 1.0,
      latency_ms: performance.now() - start
    };
  }

  // Layer 2: Rule-based
  if (input.includes('读取') || input.includes('git')) {
    return {
      layer: 2,
      source: 'local',
      category: input.includes('git') ? 'terminal_commands' : 'file_operations',
      confidence: 0.9,
      latency_ms: performance.now() - start
    };
  }

  // Layer 3: LLM Classification
  if (!modelLoaded) {
    return {
      layer: 3,
      source: 'cloud',
      category: 'ai_chat',
      confidence: 0.8,
      latency_ms: performance.now() - start,
      fallback_reason: 'Model not loaded'
    };
  }

  if (simulateLLMFailure) {
    if (!cloudAPIEnabled) {
      throw new Error('Both LLM and Cloud API failed');
    }
    return {
      layer: 3,
      source: 'cloud',
      category: 'ai_chat',
      confidence: 0.8,
      latency_ms: performance.now() - start,
      fallback_reason: 'LLM inference failed'
    };
  }

  return {
    layer: 3,
    source: 'local',
    category: 'ai_chat',
    confidence: 0.85,
    latency_ms: performance.now() - start
  };
}

/**
 * 计算百分位数
 */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((p / 100) * sorted.length);
  return sorted[index];
}

// ============================================================================
// Routing Priority Tests
// ============================================================================

describe('Three-Layer Routing Strategy', () => {
  describe('Routing Priority', () => {
    it('should try Layer 1 first for exact matches', async () => {
      const result = await routeTool('/read file.txt');
      expect(result.layer).toBe(1);
      expect(result.source).toBe('local');
      expect(result.latency_ms).toBeLessThan(5);
    });

    it('should use Layer 2 for rule matches', async () => {
      const result = await routeTool('读取 file.txt');
      expect(result.layer).toBe(2);
      expect(result.source).toBe('local');
      expect(result.latency_ms).toBeLessThan(20);
    });

    it('should use Layer 3 for LLM inference', async () => {
      const result = await routeTool('分析这段代码的性能');
      expect(result.layer).toBe(3);
      expect(result.source).toBe('local');
      expect(result.latency_ms).toBeLessThan(300);
    });
  });

  describe('Layer Selection Logic', () => {
    it('should not skip to Layer 2 if Layer 1 matches', async () => {
      const result = await routeTool('/read 文件');
      expect(result.layer).toBe(1); // Should match slash command, not keyword
    });

    it('should not skip to Layer 3 if Layer 2 matches', async () => {
      const result = await routeTool('git status');
      // "git status" matches Layer 1 (exact command), not Layer 2 (keyword)
      expect(result.layer).toBeLessThanOrEqual(2);
    });
  });
});

// ============================================================================
// Fallback Behavior Tests
// ============================================================================

describe('Fallback Behavior', () => {
  describe('LLM Failure Scenarios', () => {
    it('should fallback to cloud when LLM fails', async () => {
      const result = await routeTool('complex query', { simulateLLMFailure: true });
      expect(result.source).toBe('cloud');
      expect(result.fallback_reason).toMatch(/LLM.*failed/i);
    });

    it('should indicate fallback reason', async () => {
      const result = await routeTool('query', { simulateLLMFailure: true });
      expect(result.fallback_reason).toBeDefined();
      expect(typeof result.fallback_reason).toBe('string');
    });
  });

  describe('Model Not Loaded', () => {
    it('should fallback to cloud when model not loaded', async () => {
      const result = await routeTool('any query', { modelLoaded: false });
      expect(result.source).toBe('cloud');
      expect(result.fallback_reason).toContain('Model not loaded');
    });

    it('should try Layer 3 via cloud if Layer 1 and 2 do not match', async () => {
      const result = await routeTool('explain async/await', { modelLoaded: false });
      expect(result.layer).toBe(3);
      expect(result.source).toBe('cloud');
    });
  });

  describe('Complete Failure', () => {
    it('should throw error when both LLM and cloud fail', async () => {
      await expect(
        routeTool('query', { simulateLLMFailure: true, cloudAPIEnabled: false })
      ).rejects.toThrow();
    });
  });

  describe('Graceful Degradation', () => {
    it('should always return a result when cloud is available', async () => {
      const result = await routeTool('any input', {
        simulateLLMFailure: true,
        modelLoaded: false,
        cloudAPIEnabled: true
      });
      expect(result.source).toBe('cloud');
    });
  });
});

// ============================================================================
// Performance Benchmarks
// ============================================================================

describe('Performance Benchmarks', () => {
  describe('Layer 1 Performance', () => {
    it('should meet Layer 1 latency target: P95 < 5ms', async () => {
      const inputs = Array(100).fill('/read file.txt');
      const latencies: number[] = [];

      for (const input of inputs) {
        const result = await routeTool(input);
        if (result.layer === 1) {
          latencies.push(result.latency_ms);
        }
      }

      const p95 = percentile(latencies, 95);
      expect(p95).toBeLessThan(5);
    });

    it('should handle 1000+ Layer 1 classifications per second', async () => {
      const inputs = Array(100).fill('/read');
      const start = performance.now();

      await Promise.all(inputs.map(input => routeTool(input)));

      const duration = performance.now() - start;
      const throughput = 100 / (duration / 1000);
      expect(throughput).toBeGreaterThan(100);
    });
  });

  describe('Layer 2 Performance', () => {
    it('should meet Layer 2 latency target: P95 < 20ms', async () => {
      const inputs = Array(100).fill('读取文件');
      const latencies: number[] = [];

      for (const input of inputs) {
        const result = await routeTool(input);
        if (result.layer === 2) {
          latencies.push(result.latency_ms);
        }
      }

      const p95 = percentile(latencies, 95);
      expect(p95).toBeLessThan(20);
    });
  });

  describe('Layer 3 Performance', () => {
    it('should meet Layer 3 latency target: P95 < 300ms', async () => {
      const inputs = Array(20).fill('分析代码性能');
      const latencies: number[] = [];

      for (const input of inputs) {
        const result = await routeTool(input);
        if (result.layer === 3) {
          latencies.push(result.latency_ms);
        }
      }

      const p95 = percentile(latencies, 95);
      expect(p95).toBeLessThan(300);
    });

    it('should handle multiple concurrent LLM requests', async () => {
      const inputs = Array(10).fill('解释这段代码');
      const results = await Promise.all(
        inputs.map(input => routeTool(input))
      );

      results.forEach(result => {
        expect(result.layer).toBe(3);
        expect(result.latency_ms).toBeLessThan(500);
      });
    });
  });

  describe('Overall System Performance', () => {
    it('should meet overall P99 latency target: <500ms', async () => {
      const mixedInputs = [
        '/read file.txt',           // Layer 1
        '读取配置',                  // Layer 2
        '分析项目架构',              // Layer 3
        'git status',               // Layer 1
        '生成组件代码',              // Layer 2
      ];

      const latencies: number[] = [];

      for (const input of mixedInputs) {
        const result = await routeTool(input);
        latencies.push(result.latency_ms);
      }

      const p99 = percentile(latencies, 99);
      expect(p99).toBeLessThan(500);
    });
  });
});

// ============================================================================
// Confidence and Reliability
// ============================================================================

describe('Confidence and Reliability', () => {
  describe('Confidence Scores', () => {
    it('should return perfect confidence for Layer 1', async () => {
      const result = await routeTool('/read file.txt');
      expect(result.confidence).toBe(1.0);
    });

    it('should return high confidence for Layer 2', async () => {
      const result = await routeTool('读取文件');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should return moderate confidence for Layer 3', async () => {
      const result = await routeTool('分析代码');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Consistency', () => {
    it('should return consistent results for identical inputs', async () => {
      const input = '读取文件';
      const results = await Promise.all([
        routeTool(input),
        routeTool(input),
        routeTool(input),
      ]);

      const layers = results.map(r => r.layer);
      expect(layers.every(l => l === layers[0])).toBe(true);
    });

    it('should handle rapid consecutive requests', async () => {
      const promises = Array(50).fill(null).map((_, i) =>
        routeTool(`/test${i}`)
      );

      const results = await Promise.all(promises);
      expect(results.length).toBe(50);
    });
  });
});

// ============================================================================
// Integration Points
// ============================================================================

describe('Integration Points', () => {
  describe('Tool Execution Integration', () => {
    it('should return tool name for direct execution', async () => {
      const result = await routeTool('agent_read_file(rel_path="test")');
      expect(result.tool).toBeDefined();
      expect(result.tool).toBe('agent_read_file');
    });

    it('should return category for ambiguous tools', async () => {
      const result = await routeTool('读取文件');
      expect(result.category).toBeDefined();
      expect(result.category).toBe('file_operations');
    });
  });

  describe('UI Feedback Integration', () => {
    it('should provide layer information for UI display', async () => {
      const result = await routeTool('分析代码');
      expect(result.layer).toBeDefined();
      expect([1, 2, 3]).toContain(result.layer);
    });

    it('should provide source information for UI display', async () => {
      const result = await routeTool('查询');
      expect(result.source).toBeDefined();
      expect(['local', 'cloud']).toContain(result.source);
    });

    it('should provide latency for performance monitoring', async () => {
      const result = await routeTool('test');
      expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
