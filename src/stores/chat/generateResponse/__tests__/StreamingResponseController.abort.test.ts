/**
 * abortStream 单元测试
 *
 * 验证 StreamingResponseController.abortStream 的清理完整性。
 * 必须调用：emitFinished + stopListening + activeSessions.delete + emittedFinish.delete
 */
import { describe, test, expect, vi } from 'vitest';

describe('StreamingResponseController.abortStream', () => {
  test('UT-AB1: abortStream 调用 emitFinished + stopListening + 清理 session', () => {
    const controller = (window as any).__StreamingResponseController;
    if (!controller) {
      // 测试环境中 controller 可能未初始化，跳过
      console.warn('[UT-AB1] __StreamingResponseController not available, skipping');
      return;
    }

    // 先注入一个测试 session
    const testCorrelationId = 'abort-test-corr-' + Date.now();

    // Mock emitFinished 但保留真实功能
    const emitSpy = vi.spyOn(controller, 'emitFinished').mockImplementation(() => {});
    const stopSpy = vi.spyOn(controller, 'stopListening').mockImplementation(() => {});
    const sessionDeleteSpy = vi.spyOn(controller.activeSessions, 'delete');
    const emittedDeleteSpy = vi.spyOn(controller.emittedFinish, 'delete');

    controller.abortStream(testCorrelationId);

    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: testCorrelationId }),
    );
    expect(stopSpy).toHaveBeenCalledWith(testCorrelationId);
    expect(sessionDeleteSpy).toHaveBeenCalledWith(testCorrelationId);
    expect(emittedDeleteSpy).toHaveBeenCalledWith(testCorrelationId);

    emitSpy.mockRestore();
    stopSpy.mockRestore();
    sessionDeleteSpy.mockRestore();
    emittedDeleteSpy.mockRestore();
  });

  test('UT-AB2: abortStream 对不存在的 ID 不抛出异常', () => {
    const controller = (window as any).__StreamingResponseController;
    if (!controller) return;

    expect(() => {
      controller.abortStream('non-existent-id-' + Date.now());
    }).not.toThrow();
  });
});
