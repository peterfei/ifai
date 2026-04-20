/**
 * 🏛️ 元编程驱动的技能激活 E2E 测试
 *
 * 核心哲学：
 * - 代码即数据：场景通过数据结构定义
 * - 声明式设计：描述"测试什么"，而非"如何测试"
 * - 代码生成代码：框架自动生成测试逻辑
 * - 红绿重构：先写失败测试，再实现功能
 *
 * @version 2.0
 * @reference commit a7c1f66
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

// ============================================================================
// 第一层：本体论 - 测试空间维度定义
// ============================================================================

/**
 * 技能操作维度
 */
export type SkillOperationType =
  | 'activate'       // 激活技能
  | 'deactivate'     // 停用技能
  | 'toggle'         // 切换状态
  | 'batch'          // 批量操作
  | 'concurrent';    // 并发操作

/**
 * 技能状态维度
 */
export type SkillState =
  | 'inactive'       // 未激活
  | 'active'         // 已激活
  | 'error';         // 错误状态

/**
 * 性能维度
 */
export interface PerformanceDimension {
  /** 响应时间阈值（毫秒） */
  responseTime: number;
  /** 吞吐量（操作/秒） */
  throughput?: number;
  /** 内存使用（MB） */
  memory?: number;
}

// ============================================================================
// 第二层：场景元模型
// ============================================================================

/**
 * 技能激活场景元模型
 */
export interface SkillActivationMetamodel {
  /** 场景标识 */
  id: string;
  /** 场景名称 */
  name: string;
  /** 场景描述 */
  description?: string;

  /** 维度配置 */
  dimensions: {
    /** 操作维度 */
    operation: {
      type: SkillOperationType;
      count?: number;  // 批量操作时的数量
    };
    /** 技能维度 */
    skills: {
      count: number;          // 技能数量
      ids: string[];          // 技能ID列表
      categories: string[];   // 技能分类
    };
    /** 状态维度 */
    state: {
      initial: SkillState;
      expected: SkillState;
    };
    /** 性能维度 */
    performance?: PerformanceDimension;
  };

  /** 断言配置 */
  assertions: {
    /** 状态断言 */
    state: StateAssertion[];
    /** 性能断言 */
    performance?: PerformanceAssertion[];
    /** 行为断言 */
    behavior?: BehaviorAssertion[];
  };

  /** 执行选项 */
  options?: {
    /** 是否使用真实后端 */
    useRealBackend?: boolean;
    /** 超时时间 */
    timeout?: number;
    /** 是否启用日志 */
    enableLogging?: boolean;
  };
}

/**
 * 状态断言
 */
export interface StateAssertion {
  /** 属性路径 */
  property: 'isActive' | 'activeCount' | 'hasError';
  /** 期望值 */
  expected: any;
  /** 操作符 */
  operator?: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte';
}

/**
 * 性能断言
 */
export interface PerformanceAssertion {
  /** 指标名称 */
  metric: 'responseTime' | 'throughput' | 'memory';
  /** 阈值 */
  threshold: number;
  /** 操作符 */
  operator: 'lt' | 'gt' | 'lte' | 'gte';
  /** 单位 */
  unit?: string;
}

/**
 * 行为断言
 */
export interface BehaviorAssertion {
  /** 行为描述 */
  behavior: string;
  /** 验证函数 */
  validator: (result: any) => boolean;
}

/**
 * 场景执行结果
 */
export interface SkillScenarioResult {
  /** 是否成功 */
  success: boolean;
  /** 执行指标 */
  metrics: {
    /** 响应时间（毫秒） */
    responseTime: number;
    /** 操作数量 */
    operationCount: number;
    /** 成功数量 */
    successCount: number;
    /** 失败数量 */
    failureCount: number;
  };
  /** 状态验证结果 */
  stateValidation: {
    /** 是否符合预期 */
    passed: boolean;
    /** 实际状态 */
    actual: any;
    /** 期望状态 */
    expected: any;
  };
  /** 失败的断言 */
  failures: Array<{
    assertion: string;
    expected: any;
    actual: any;
  }>;
  /** 测试数据 */
  testData?: any;
}

// ============================================================================
// 第三层：场景构建器
// ============================================================================

/**
 * 技能激活场景构建器
 *
 * 提供流畅API用于声明式定义测试场景
 */
export class SkillScenarioBuilder {
  private metamodel: Partial<SkillActivationMetamodel> = {
    dimensions: {
      operation: { type: 'activate' },
      skills: { count: 1, ids: [], categories: [] },
      state: { initial: 'inactive', expected: 'active' },
    },
    assertions: {
      state: [],
    },
  };

  /**
   * 定义场景
   */
  define(id: string): this {
    this.metamodel.id = id;
    this.metamodel.name = id;
    return this;
  }

  /**
   * 配置操作维度
   */
  withOperation(type: SkillOperationType, count?: number): this {
    this.metamodel.dimensions!.operation = { type, count };
    return this;
  }

  /**
   * 配置技能维度
   */
  withSkills(count: number, ids?: string[], categories?: string[]): this {
    this.metamodel.dimensions!.skills = {
      count,
      ids: ids || [],
      categories: categories || [],
    };
    return this;
  }

  /**
   * 配置初始状态
   */
  withInitialState(state: SkillState): this {
    this.metamodel.dimensions!.state!.initial = state;
    return this;
  }

  /**
   * 配置期望状态
   */
  withExpectedState(state: SkillState): this {
    this.metamodel.dimensions!.state!.expected = state;
    return this;
  }

  /**
   * 添加状态断言
   */
  assertState(property: StateAssertion['property'], expected: any, operator?: StateAssertion['operator']): this {
    this.metamodel.assertions!.state.push({ property, expected, operator });
    return this;
  }

  /**
   * 添加性能断言
   */
  assertPerformance(metric: PerformanceAssertion['metric'], threshold: number, operator: PerformanceAssertion['operator'], unit?: string): this {
    if (!this.metamodel.assertions!.performance) {
      this.metamodel.assertions!.performance = [];
    }
    this.metamodel.assertions!.performance.push({ metric, threshold, operator, unit });
    return this;
  }

  /**
   * 配置选项
   */
  withOptions(options: {
    useRealBackend?: boolean;
    timeout?: number;
    enableLogging?: boolean;
  }): this {
    this.metamodel.options = { ...this.metamodel.options, ...options };
    return this;
  }

  /**
   * 🔥 核心：实例化场景（代码生成代码）
   */
  async materialize(page: any): Promise<SkillScenarioResult> {
    console.log(`\n🏛️ [元编程] 实例化场景: ${this.metamodel.name}`);
    console.log(`   操作: ${this.metamodel.dimensions!.operation.type}`);
    console.log(`   技能数: ${this.metamodel.dimensions!.skills.count}`);

    // 🔥 关键修复：设置 rootPath
    await page.evaluate(() => {
      const fileStore = (window as any).__fileStore;
      if (fileStore) {
        fileStore.getState().setRootPath('/test-project');
        console.log('[元编程] 设置 rootPath: /test-project');
      }
    });

    const startTime = Date.now();

    // 1. 生成测试数据
    const testData = this.generateTestData();

    // 2. 执行测试逻辑
    const executionResult = await this.executeTestLogic(page, testData);

    // 3. 验证断言
    const failures = this.verifyAssertions(executionResult);

    const endTime = Date.now();

    return {
      success: failures.length === 0,
      metrics: {
        responseTime: endTime - startTime,
        operationCount: executionResult.operationCount,
        successCount: executionResult.successCount,
        failureCount: executionResult.failureCount,
      },
      stateValidation: executionResult.stateValidation,
      failures,
      testData,
    };
  }

  /**
   * 生成测试数据
   */
  private generateTestData(): any {
    const { skills } = this.metamodel.dimensions!;
    const skillIds: string[] = [];

    // 根据配置生成技能ID
    if (skills.ids && skills.ids.length > 0) {
      skillIds.push(...skills.ids);
    } else {
      // 自动生成技能ID
      for (let i = 0; i < skills.count; i++) {
        skillIds.push(`test-skill-${i + 1}`);
      }
    }

    return {
      skillIds,
      count: skillIds.length,
    };
  }

  /**
   * 执行测试逻辑（生成的代码）
   */
  private async executeTestLogic(page: any, testData: any): Promise<any> {
    const { operation, state } = this.metamodel.dimensions!;
    const operationType = operation.type;

    // 设置测试技能
    await page.evaluate((ids: string[]) => {
      if (!(window as any).__E2E_MOCK_FILE_SYSTEM__) {
        (window as any).__E2E_MOCK_FILE_SYSTEM__ = new Map();
      }
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;

      ids.forEach((id, index) => {
        mockFS.set(`/test-project/.ifai/skills/${id}/skill.md`,
          `---\nname: Test Skill ${index + 1}\nid: ${id}\n---\nTest skill description`);
      });
    }, testData.skillIds);

    // 等待技能注册
    await page.waitForTimeout(500);

    // 🔥 关键：设置初始状态
    if (state.initial === 'active') {
      await page.evaluate(async (ids: string[]) => {
        const skillStore = (window as any).__skillStore;
        for (const id of ids) {
          await skillStore.getState().activateSkill(id);
        }
      }, testData.skillIds);
      await page.waitForTimeout(200);
    }

    // 执行操作
    let operationCount = 0;
    let successCount = 0;
    let failureCount = 0;
    let actualState: any = {};

    switch (operationType) {
      case 'activate': {
        const result = await page.evaluate(async (skillId: string) => {
          const skillStore = (window as any).__skillStore;
          if (!skillStore) {
            return { success: false, error: 'skillStore not available' };
          }

          try {
            const start = Date.now();
            await skillStore.getState().activateSkill(skillId);
            const duration = Date.now() - start;

            const state = skillStore.getState();
            return {
              success: true,
              isActive: state.activeSkillIds.includes(skillId),
              activeCount: state.activeSkillIds.length,
              duration,
            };
          } catch (error) {
            return {
              success: false,
              error: (error as Error).message,
            };
          }
        }, testData.skillIds[0]);

        operationCount = 1;
        successCount = result.success ? 1 : 0;
        failureCount = result.success ? 0 : 1;
        actualState = result;
        break;
      }

      case 'deactivate': {
        // 先激活技能
        await page.evaluate(async (skillId: string) => {
          const skillStore = (window as any).__skillStore;
          await skillStore.getState().activateSkill(skillId);
        }, testData.skillIds[0]);

        await page.waitForTimeout(100);

        // 再停用
        const result = await page.evaluate(async (skillId: string) => {
          const skillStore = (window as any).__skillStore;
          if (!skillStore) {
            return { success: false, error: 'skillStore not available' };
          }

          try {
            await skillStore.getState().deactivateSkill(skillId);
            const state = skillStore.getState();
            return {
              success: true,
              isActive: state.activeSkillIds.includes(skillId),  // 🔥 修复：返回 isActive 而不是 isInactive
              isInactive: !state.activeSkillIds.includes(skillId),
              activeCount: state.activeSkillIds.length,
            };
          } catch (error) {
            return {
              success: false,
              error: (error as Error).message,
            };
          }
        }, testData.skillIds[0]);

        operationCount = 1;
        successCount = result.success ? 1 : 0;
        failureCount = result.success ? 0 : 1;
        actualState = result;
        break;
      }

      case 'toggle': {
        const result = await page.evaluate(async (skillId: string) => {
          const skillStore = (window as any).__skillStore;
          if (!skillStore) {
            return { success: false, error: 'skillStore not available' };
          }

          try {
            await skillStore.getState().toggleActive(skillId);
            const state = skillStore.getState();
            return {
              success: true,
              isActive: state.activeSkillIds.includes(skillId),
              activeCount: state.activeSkillIds.length,
            };
          } catch (error) {
            return {
              success: false,
              error: (error as Error).message,
            };
          }
        }, testData.skillIds[0]);

        operationCount = 1;
        successCount = result.success ? 1 : 0;
        failureCount = result.success ? 0 : 1;
        actualState = result;
        break;
      }

      case 'batch': {
        const count = operation.count || testData.skillIds.length;
        const result = await page.evaluate(async (ids: string[]) => {
          const skillStore = (window as any).__skillStore;
          if (!skillStore) {
            return { success: false, error: 'skillStore not available' };
          }

          try {
            const startTime = Date.now();

            // 批量激活
            for (const id of ids) {
              await skillStore.getState().activateSkill(id);
            }

            const duration = Date.now() - startTime;
            const state = skillStore.getState();

            return {
              success: true,
              activeCount: state.activeSkillIds.length,
              duration,
              avgTime: duration / ids.length,
            };
          } catch (error) {
            return {
              success: false,
              error: (error as Error).message,
            };
          }
        }, testData.skillIds.slice(0, count));

        operationCount = count;
        successCount = result.success ? count : 0;
        failureCount = result.success ? 0 : count;
        actualState = result;
        break;
      }

      case 'concurrent': {
        const result = await page.evaluate(async (ids: string[]) => {
          const skillStore = (window as any).__skillStore;
          if (!skillStore) {
            return { success: false, error: 'skillStore not available' };
          }

          try {
            const startTime = Date.now();

            // 并发激活
            const promises = ids.map(id => skillStore.getState().activateSkill(id));
            await Promise.all(promises);

            const duration = Date.now() - startTime;
            const state = skillStore.getState();

            return {
              success: true,
              activeCount: state.activeSkillIds.length,
              duration,
            };
          } catch (error) {
            return {
              success: false,
              error: (error as Error).message,
            };
          }
        }, testData.skillIds);

        operationCount = testData.skillIds.length;
        successCount = result.success ? testData.skillIds.length : 0;
        failureCount = result.success ? 0 : testData.skillIds.length;
        actualState = result;
        break;
      }
    }

    return {
      operationCount,
      successCount,
      failureCount,
      stateValidation: {
        passed: actualState.success || false,
        actual: actualState,
        expected: state.expected,
      },
    };
  }

  /**
   * 验证断言
   */
  private verifyAssertions(executionResult: any): Array<{
    assertion: string;
    expected: any;
    actual: any;
  }> {
    const failures: Array<{ assertion: string; expected: any; actual: any }> = [];
    const { assertions } = this.metamodel;
    const { stateValidation } = executionResult;

    // 验证状态断言
    for (const assertion of assertions.state) {
      let actual: any;
      let passed = false;

      switch (assertion.property) {
        case 'isActive':
          actual = stateValidation.actual.isActive;
          passed = assertion.operator ? this.compare(actual, assertion.expected, assertion.operator) : actual === assertion.expected;
          break;
        case 'activeCount':
          actual = stateValidation.actual.activeCount;
          passed = assertion.operator ? this.compare(actual, assertion.expected, assertion.operator) : actual === assertion.expected;
          break;
        case 'hasError':
          actual = !!stateValidation.actual.error;
          passed = assertion.operator ? this.compare(actual, assertion.expected, assertion.operator) : actual === assertion.expected;
          break;
      }

      if (!passed) {
        failures.push({
          assertion: `state.${assertion.property}`,
          expected: assertion.expected,
          actual,
        });
      }
    }

    // 验证性能断言
    if (assertions.performance) {
      for (const assertion of assertions.performance) {
        let actual: any;

        switch (assertion.metric) {
          case 'responseTime':
            actual = executionResult.stateValidation.actual.duration || 0;
            break;
          case 'throughput':
            actual = executionResult.operationCount / (executionResult.stateValidation.actual.duration || 1) * 1000;
            break;
        }

        const passed = this.compare(actual, assertion.threshold, assertion.operator);
        if (!passed) {
          failures.push({
            assertion: `performance.${assertion.metric}`,
            expected: `${assertion.operator} ${assertion.threshold}${assertion.unit || ''}`,
            actual: `${actual}${assertion.unit || ''}`,
          });
        }
      }
    }

    return failures;
  }

  /**
   * 比较值
   */
  private compare(actual: any, expected: any, operator: string): boolean {
    switch (operator) {
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
      case 'gt':
        return actual > expected;
      case 'lt':
        return actual < expected;
      case 'gte':
        return actual >= expected;
      case 'lte':
        return actual <= expected;
      default:
        return actual === expected;
    }
  }
}

// ============================================================================
// 第四层：测试场景定义（代码即数据）
// ============================================================================

test.describe('🏛️ 元编程：技能激活场景自动化生成与验证', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });

    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[元编程]') || text.includes('[Skill]')) {
        console.log(`[Browser] ${text}`);
      }
    });

    // 导航到主页
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 🔥 关键：每个测试前清空激活状态，避免测试间状态污染
    await page.evaluate(() => {
      const skillStore = (window as any).__skillStore;
      if (skillStore && skillStore.getState) {
        const state = skillStore.getState();
        // 清空所有激活的技能
        state.activeSkillIds.forEach((id: string) => {
          skillStore.getState().deactivateSkill(id);
        });
      }
    });

    await page.waitForTimeout(500);
  });

  /**
   * 🟢 场景 1：单个技能激活（红：先写失败的断言）
   *
   * 测试目标：
   * - 验证激活功能的基本正确性
   * - 验证状态更新
   * - 验证性能要求
   */
  test('🟢 [红绿重构] 场景 1：激活单个技能', async ({ page }) => {
    // ✅ 声明式定义场景
    const result = await new SkillScenarioBuilder()
      .define('activate-single-skill')
      .withOperation('activate')
      .withSkills(1, ['test-skill-1'])
      .withInitialState('inactive')
      .withExpectedState('active')
      .assertState('isActive', true)  // 🔴 失败断言：驱动实现
      .assertState('activeCount', 1)
      .assertPerformance('responseTime', 500, 'lt', 'ms')
      .withOptions({ enableLogging: true })
      .materialize(page);

    // 📊 自动生成的测试报告
    printScenarioReport('激活单个技能', result);

    // ✅ 最终断言
    expect(result.success, '所有断言应该通过').toBe(true);
  });

  /**
   * 🟢 场景 2：单个技能停用
   */
  test('🟢 [红绿重构] 场景 2：停用单个技能', async ({ page }) => {
    const result = await new SkillScenarioBuilder()
      .define('deactivate-single-skill')
      .withOperation('deactivate')
      .withSkills(1, ['test-skill-2'])
      .withInitialState('active')
      .withExpectedState('inactive')
      .assertState('isActive', false, 'eq')  // 停用后不应激活
      .assertState('activeCount', 0)
      .assertPerformance('responseTime', 500, 'lt', 'ms')
      .withOptions({ enableLogging: true })
      .materialize(page);

    printScenarioReport('停用单个技能', result);

    expect(result.success).toBe(true);
  });

  /**
   * 🟢 场景 3：Toggle 切换（未激活 → 激活）
   */
  test('🟢 [红绿重构] 场景 3：Toggle 切换到激活', async ({ page }) => {
    const result = await new SkillScenarioBuilder()
      .define('toggle-to-active')
      .withOperation('toggle')
      .withSkills(1, ['test-skill-3'])
      .withInitialState('inactive')
      .withExpectedState('active')
      .assertState('isActive', true)
      .assertPerformance('responseTime', 500, 'lt', 'ms')
      .withOptions({ enableLogging: true })
      .materialize(page);

    printScenarioReport('Toggle 切换到激活', result);

    expect(result.success).toBe(true);
  });

  /**
   * 🟢 场景 4：Toggle 切换（激活 → 停用）
   */
  test('🟢 [红绿重构] 场景 4：Toggle 切换到停用', async ({ page }) => {
    const result = await new SkillScenarioBuilder()
      .define('toggle-to-inactive')
      .withOperation('toggle')
      .withSkills(1, ['test-skill-4'])
      .withInitialState('active')
      .withExpectedState('inactive')
      .assertState('isActive', false)
      .assertPerformance('responseTime', 500, 'lt', 'ms')
      .withOptions({ enableLogging: true })
      .materialize(page);

    printScenarioReport('Toggle 切换到停用', result);

    expect(result.success).toBe(true);
  });

  /**
   * 🟢 场景 5：批量激活（10 个技能）
   */
  test('🟢 [红绿重构] 场景 5：批量激活 10 个技能', async ({ page }) => {
    const result = await new SkillScenarioBuilder()
      .define('batch-activate-10')
      .withOperation('batch', 10)
      .withSkills(10)  // 自动生成 10 个技能
      .withInitialState('inactive')
      .withExpectedState('active')
      .assertState('activeCount', 10, 'eq')
      .assertPerformance('responseTime', 2000, 'lt', 'ms')
      .withOptions({ enableLogging: true })
      .materialize(page);

    printScenarioReport('批量激活 10 个技能', result);

    expect(result.success).toBe(true);
  });

  /**
   * 🟢 场景 6：并发激活（5 个技能）
   */
  test('🟢 [红绿重构] 场景 6：并发激活 5 个技能', async ({ page }) => {
    const result = await new SkillScenarioBuilder()
      .define('concurrent-activate-5')
      .withOperation('concurrent')
      .withSkills(5)
      .withInitialState('inactive')
      .withExpectedState('active')
      .assertState('activeCount', 5, 'eq')
      .assertPerformance('responseTime', 1000, 'lt', 'ms')
      .withOptions({ enableLogging: true })
      .materialize(page);

    printScenarioReport('并发激活 5 个技能', result);

    expect(result.success).toBe(true);
  });

  /**
   * 🟢 场景 7：幂等性验证（重复激活）
   */
  test('🟢 [红绿重构] 场景 7：幂等性 - 重复激活同一技能', async ({ page }) => {
    // 先激活一次
    await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      if (!mockFS) (window as any).__E2E_MOCK_FILE_SYSTEM__ = new Map();
      (window as any).__E2E_MOCK_FILE_SYSTEM__.set('/test-project/.ifai/skills/idem-test/skill.md',
        '---\nname: Idem Test\nid: idem-test\n---\nTest');

      const skillStore = (window as any).__skillStore;
      await skillStore.getState().activateSkill('idem-test');
    });

    await page.waitForTimeout(100);

    // 再次激活，验证不会重复添加
    const result = await new SkillScenarioBuilder()
      .define('idempotent-activate')
      .withOperation('activate')
      .withSkills(1, ['idem-test'])
      .withInitialState('active')
      .withExpectedState('active')
      .assertState('activeCount', 1, 'eq')  // 应该仍然只有 1 个
      .withOptions({ enableLogging: true })
      .materialize(page);

    printScenarioReport('幂等性验证', result);

    expect(result.success).toBe(true);
  });

  /**
   * 🟢 场景 8：性能基准测试
   */
  test('🟢 [红绿重构] 场景 8：性能基准测试', async ({ page }) => {
    const iterations = 10;
    const results: SkillScenarioResult[] = [];

    console.log(`\n🏃 性能测试: ${iterations} 次迭代`);

    for (let i = 0; i < iterations; i++) {
      const result = await new SkillScenarioBuilder()
        .define(`perf-iteration-${i}`)
        .withOperation('activate')
        .withSkills(1, [`perf-skill-${i}`])
        .assertPerformance('responseTime', 200, 'lt', 'ms')
        .withOptions({ enableLogging: false })
        .materialize(page);

      results.push(result);

      // 清理
      await page.evaluate(async (skillId: string) => {
        const skillStore = (window as any).__skillStore;
        await skillStore.getState().deactivateSkill(skillId);
      }, `perf-skill-${i}`);
    }

    // 计算统计数据
    const times = results.map(r => r.metrics.responseTime);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    const min = Math.min(...times);

    console.log(`\n📊 性能统计:`);
    console.log(`   平均: ${avg.toFixed(2)}ms`);
    console.log(`   最大: ${max}ms`);
    console.log(`   最小: ${min}ms`);
    console.log(`   吞吐量: ${(1000 / avg).toFixed(2)} 操作/秒`);

    // 断言：平均响应时间应小于 600ms
    expect(avg).toBeLessThan(600);
  });
});

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 打印场景执行报告
 */
function printScenarioReport(scenarioName: string, result: SkillScenarioResult): void {
  console.log('\n' + '='.repeat(70));
  console.log(`📊 场景执行报告：${scenarioName}`);
  console.log('='.repeat(70));
  console.log(`✅ 成功: ${result.success}`);
  console.log(`⏱️  响应时间: ${result.metrics.responseTime}ms`);
  console.log(`🔢 操作数: ${result.metrics.operationCount}`);
  console.log(`✓ 成功数: ${result.metrics.successCount}`);
  console.log(`✗ 失败数: ${result.metrics.failureCount}`);

  if (result.stateValidation) {
    console.log(`\n📋 状态验证:`);
    console.log(`   通过: ${result.stateValidation.passed}`);
    if (result.stateValidation.actual) {
      console.log(`   实际: ${JSON.stringify(result.stateValidation.actual, null, 2)}`);
    }
    console.log(`   期望: ${result.stateValidation.expected}`);
  }

  if (result.failures.length > 0) {
    console.log('\n❌ 失败的断言:');
    result.failures.forEach((f, index) => {
      console.log(`   ${index + 1}. ${f.assertion}`);
      console.log(`      期望: ${JSON.stringify(f.expected)}`);
      console.log(`      实际: ${JSON.stringify(f.actual)}`);
    });
  }

  console.log('='.repeat(70) + '\n');
}
