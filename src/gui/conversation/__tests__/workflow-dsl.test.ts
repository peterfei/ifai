/**
 * WORKFLOW_DSL 单元测试
 *
 * 测试覆盖：
 * - UT-C.1.1: 类型导出完整性
 * - UT-C.1.2: Mock 审批数据结构
 * - UT-C.1.3: Mock 交互数据结构
 * - UT-C.1.4: Mock 文件变更数据结构
 * - UT-C.1.5: Mock 工具调用数据结构
 * - UT-C.1.6: Mock 错误修复数据结构
 * - UT-C.1.7: Mock Composer 数据结构
 * - UT-C.1.8: Mock 任务数据结构
 * - UT-C.1.9: getMockTaskDataList / getMockTaskDataById 工具函数
 */

import { describe, it, expect } from 'vitest';
import {
  // 类型（通过值间接验证）
  MOCK_APPROVAL_DATA,
  MOCK_APPROVAL_DATA_HIGH_RISK,
  MOCK_INTERACTION_DATA_SINGLE,
  MOCK_INTERACTION_DATA_MULTIPLE,
  MOCK_FILE_CHANGE_DATA,
  MOCK_FILE_CHANGE_MODIFY,
  MOCK_TOOL_CALL_DATA,
  MOCK_TOOL_CALL_RUNNING,
  MOCK_ERROR_FIX_DATA,
  MOCK_ERROR_FIX_WARNING,
  MOCK_COMPOSER_DATA,
  MOCK_COMPOSER_DONE,
  MOCK_TASK_DATA,
  MOCK_TASK_DATA_MULTIPLE,
  MOCK_TASK_DATA_REVIEW,
  getMockTaskDataList,
  getMockTaskDataById,
} from '../WORKFLOW_DSL';

describe('WORKFLOW_DSL', () => {
  /* ===== UT-C.1.1: Mock 审批数据 ===== */

  describe('Mock 审批数据', () => {
    it('MOCK_APPROVAL_DATA 应包含完整字段', () => {
      expect(MOCK_APPROVAL_DATA.type).toBe('schema_change');
      expect(MOCK_APPROVAL_DATA.title).toBeTruthy();
      expect(MOCK_APPROVAL_DATA.description).toBeTruthy();
      expect(['low', 'medium', 'high']).toContain(MOCK_APPROVAL_DATA.overallRisk);
      expect(MOCK_APPROVAL_DATA.files.length).toBeGreaterThan(0);
      expect(MOCK_APPROVAL_DATA.onApprove).toBeDefined();
      expect(MOCK_APPROVAL_DATA.onReject).toBeDefined();
    });

    it('MOCK_APPROVAL_DATA 文件项应包含 path、change、risk', () => {
      for (const file of MOCK_APPROVAL_DATA.files) {
        expect(file.path).toBeTruthy();
        expect(file.change).toBeTruthy();
        expect(['low', 'medium', 'high']).toContain(file.risk);
      }
    });

    it('MOCK_APPROVAL_DATA_HIGH_RISK 应为高风险', () => {
      expect(MOCK_APPROVAL_DATA_HIGH_RISK.overallRisk).toBe('high');
      expect(MOCK_APPROVAL_DATA_HIGH_RISK.files.every(f => f.risk === 'high')).toBe(true);
    });

    it('两个审批数据应不同', () => {
      expect(MOCK_APPROVAL_DATA.title).not.toBe(MOCK_APPROVAL_DATA_HIGH_RISK.title);
      expect(MOCK_APPROVAL_DATA.overallRisk).not.toBe(MOCK_APPROVAL_DATA_HIGH_RISK.overallRisk);
    });
  });

  /* ===== UT-C.1.2: Mock 交互数据 ===== */

  describe('Mock 交互数据', () => {
    it('MOCK_INTERACTION_DATA_SINGLE 应为单选模式', () => {
      expect(MOCK_INTERACTION_DATA_SINGLE.type).toBe('single');
      expect(MOCK_INTERACTION_DATA_SINGLE.title).toBeTruthy();
      expect(MOCK_INTERACTION_DATA_SINGLE.question).toBeTruthy();
      expect(MOCK_INTERACTION_DATA_SINGLE.compactAsk).toBeTruthy();
      expect(MOCK_INTERACTION_DATA_SINGLE.options.length).toBeGreaterThanOrEqual(2);
    });

    it('MOCK_INTERACTION_DATA_SINGLE 选项应包含 id、label、desc', () => {
      for (const opt of MOCK_INTERACTION_DATA_SINGLE.options) {
        expect(opt.id).toBeTruthy();
        expect(opt.label).toBeTruthy();
        expect(opt.desc).toBeTruthy();
      }
    });

    it('MOCK_INTERACTION_DATA_MULTIPLE 应为多选模式', () => {
      expect(MOCK_INTERACTION_DATA_MULTIPLE.type).toBe('multiple');
      expect(MOCK_INTERACTION_DATA_MULTIPLE.options.length).toBeGreaterThanOrEqual(2);
    });

    it('选项 tag 和 tagColor 应有效', () => {
      const allOptions = [
        ...MOCK_INTERACTION_DATA_SINGLE.options,
        ...MOCK_INTERACTION_DATA_MULTIPLE.options,
      ];
      for (const opt of allOptions) {
        if (opt.tag) expect(typeof opt.tag).toBe('string');
        if (opt.tagColor) expect(typeof opt.tagColor).toBe('string');
      }
    });
  });

  /* ===== UT-C.1.3: Mock 文件变更数据 ===== */

  describe('Mock 文件变更数据', () => {
    it('MOCK_FILE_CHANGE_DATA 应为创建类型', () => {
      expect(MOCK_FILE_CHANGE_DATA.path).toBeTruthy();
      expect(MOCK_FILE_CHANGE_DATA.change.type).toBe('create');
      expect(MOCK_FILE_CHANGE_DATA.change.additions).toBeGreaterThan(0);
      expect(MOCK_FILE_CHANGE_DATA.change.deletions).toBe(0);
    });

    it('MOCK_FILE_CHANGE_MODIFY 应为修改类型', () => {
      expect(MOCK_FILE_CHANGE_MODIFY.change.type).toBe('modify');
      expect(MOCK_FILE_CHANGE_MODIFY.change.additions).toBeGreaterThan(0);
      expect(MOCK_FILE_CHANGE_MODIFY.change.deletions).toBeGreaterThan(0);
    });

    it('文件路径应以 src/ 开头', () => {
      expect(MOCK_FILE_CHANGE_DATA.path).toMatch(/^src\//);
      expect(MOCK_FILE_CHANGE_MODIFY.path).toMatch(/^src\//);
    });
  });

  /* ===== UT-C.1.4: Mock 工具调用数据 ===== */

  describe('Mock 工具调用数据', () => {
    it('MOCK_TOOL_CALL_DATA 应为成功状态', () => {
      expect(MOCK_TOOL_CALL_DATA.name).toBeTruthy();
      expect(MOCK_TOOL_CALL_DATA.status).toBe('success');
      expect(MOCK_TOOL_CALL_DATA.result).toBeDefined();
      expect(MOCK_TOOL_CALL_DATA.duration).toBeGreaterThan(0);
    });

    it('MOCK_TOOL_CALL_RUNNING 应为运行中状态', () => {
      expect(MOCK_TOOL_CALL_RUNNING.status).toBe('running');
      expect(MOCK_TOOL_CALL_RUNNING.args).toBeDefined();
      // 运行中不应有 result
      expect(MOCK_TOOL_CALL_RUNNING.result).toBeUndefined();
    });

    it('工具调用数据应有 args', () => {
      expect(typeof MOCK_TOOL_CALL_DATA.args).toBe('object');
      expect(typeof MOCK_TOOL_CALL_RUNNING.args).toBe('object');
    });
  });

  /* ===== UT-C.1.5: Mock 错误修复数据 ===== */

  describe('Mock 错误修复数据', () => {
    it('MOCK_ERROR_FIX_DATA 应为 error 级别', () => {
      expect(MOCK_ERROR_FIX_DATA.message).toBeTruthy();
      expect(MOCK_ERROR_FIX_DATA.severity).toBe('error');
      expect(MOCK_ERROR_FIX_DATA.location).toBeTruthy();
      expect(MOCK_ERROR_FIX_DATA.suggestions.length).toBeGreaterThan(0);
    });

    it('MOCK_ERROR_FIX_WARNING 应为 warning 级别且已自动修复', () => {
      expect(MOCK_ERROR_FIX_WARNING.severity).toBe('warning');
      expect(MOCK_ERROR_FIX_WARNING.autoFixed).toBe(true);
    });

    it('建议项应包含 title 和 description', () => {
      for (const s of MOCK_ERROR_FIX_DATA.suggestions) {
        expect(s.title).toBeTruthy();
        expect(s.description).toBeTruthy();
      }
    });
  });

  /* ===== UT-C.1.6: Mock Composer 数据 ===== */

  describe('Mock Composer 数据', () => {
    it('MOCK_COMPOSER_DATA 应为 reviewing 状态', () => {
      expect(MOCK_COMPOSER_DATA.title).toBeTruthy();
      expect(MOCK_COMPOSER_DATA.status).toBe('reviewing');
      expect(MOCK_COMPOSER_DATA.files.length).toBeGreaterThan(0);
      expect(MOCK_COMPOSER_DATA.stats.filesChanged).toBeGreaterThan(0);
    });

    it('MOCK_COMPOSER_DONE 应为 done 状态', () => {
      expect(MOCK_COMPOSER_DONE.status).toBe('done');
    });

    it('stats 应与 files 一致', () => {
      expect(MOCK_COMPOSER_DATA.stats.filesChanged).toBe(MOCK_COMPOSER_DATA.files.length);
      expect(MOCK_COMPOSER_DATA.stats.totalAdditions).toBeGreaterThan(0);
      expect(MOCK_COMPOSER_DATA.stats.totalDeletions).toBeGreaterThanOrEqual(0);
    });

    it('MOCK_COMPOSER_DATA 应有操作按钮', () => {
      expect(MOCK_COMPOSER_DATA.actions).toBeDefined();
      expect(MOCK_COMPOSER_DATA.actions!.length).toBeGreaterThan(0);
    });

    it('MOCK_COMPOSER_DONE 不应有操作按钮', () => {
      // done 状态下不需要操作按钮
      expect(MOCK_COMPOSER_DONE.actions).toBeUndefined();
    });
  });

  /* ===== UT-C.1.7: Mock 任务数据 ===== */

  describe('Mock 任务数据', () => {
    it('MOCK_TASK_DATA 应包含完整字段', () => {
      expect(MOCK_TASK_DATA.id).toBeTruthy();
      expect(MOCK_TASK_DATA.title).toBeTruthy();
      expect(MOCK_TASK_DATA.activeAgent).toBeTruthy();
      expect(MOCK_TASK_DATA.agents.length).toBeGreaterThan(0);
      expect(MOCK_TASK_DATA.progress).toBeDefined();
      expect(MOCK_TASK_DATA.taskList.length).toBeGreaterThan(0);
    });

    it('进度数据应一致', () => {
      const { currentStep, totalSteps, percentage } = MOCK_TASK_DATA.progress;
      expect(currentStep).toBeGreaterThan(0);
      expect(totalSteps).toBeGreaterThanOrEqual(currentStep);
      expect(percentage).toBe(Math.round((currentStep / totalSteps) * 100));
    });

    it('MOCK_TASK_DATA_MULTIPLE 应有更多步骤', () => {
      expect(MOCK_TASK_DATA_MULTIPLE.progress.totalSteps).toBeGreaterThan(
        MOCK_TASK_DATA.progress.totalSteps
      );
    });

    it('任务清单项应包含 text 和 completed', () => {
      for (const item of MOCK_TASK_DATA.taskList) {
        expect(item.text).toBeTruthy();
        expect(typeof item.completed).toBe('boolean');
      }
    });
  });

  /* ===== UT-C.1.8: 工具函数 ===== */

  describe('工具函数', () => {
    it('getMockTaskDataList 应返回 3 条数据', () => {
      const list = getMockTaskDataList();
      expect(list.length).toBe(3);
    });

    it('getMockTaskDataList 应包含 MOCK_TASK_DATA', () => {
      const list = getMockTaskDataList();
      expect(list).toContain(MOCK_TASK_DATA);
      expect(list).toContain(MOCK_TASK_DATA_MULTIPLE);
      expect(list).toContain(MOCK_TASK_DATA_REVIEW);
    });

    it('getMockTaskDataById 应按 ID 查找', () => {
      const task = getMockTaskDataById('task-explore-001');
      expect(task).toBe(MOCK_TASK_DATA);
    });

    it('getMockTaskDataById 不存在的 ID 应返回 undefined', () => {
      const task = getMockTaskDataById('nonexistent');
      expect(task).toBeUndefined();
    });
  });
});
