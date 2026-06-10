/**
 * encoding.ts 单元测试
 *
 * ENC-1~7: normalizeEncoding 编码名规范化
 * ENC-8~10: EXT_ENCODING_HINT 扩展名→编码推测
 */

import { describe, it, expect } from 'vitest';
import { normalizeEncoding, EXT_ENCODING_HINT } from '../encoding';

describe('normalizeEncoding', () => {
  // ENC-1: 中文编码统一为 CP936
  it('ENC-1: gb2312 → CP936', () => {
    expect(normalizeEncoding('GB2312')).toBe('CP936');
    expect(normalizeEncoding('gb2312')).toBe('CP936');
  });

  it('ENC-2: gbk → CP936', () => {
    expect(normalizeEncoding('GBK')).toBe('CP936');
    expect(normalizeEncoding('gbk')).toBe('CP936');
  });

  it('ENC-3: cp936 / gb18030 → CP936', () => {
    expect(normalizeEncoding('cp936')).toBe('CP936');
    expect(normalizeEncoding('GB18030')).toBe('CP936');
  });

  // ENC-4: UTF-8 通配
  it('ENC-4: utf-8 / utf8 → UTF-8', () => {
    expect(normalizeEncoding('UTF-8')).toBe('UTF-8');
    expect(normalizeEncoding('utf8')).toBe('UTF-8');
    expect(normalizeEncoding('utf-8')).toBe('UTF-8');
  });

  // ENC-5: 日文编码
  it('ENC-5: Shift-JIS / EUC-JP / EUC-KR → 保持', () => {
    expect(normalizeEncoding('Shift_JIS')).toBe('Shift-JIS');
    expect(normalizeEncoding('shift-jis')).toBe('Shift-JIS');
    expect(normalizeEncoding('EUC-JP')).toBe('EUC-JP');
    expect(normalizeEncoding('euc-kr')).toBe('EUC-KR');
  });

  // ENC-6: Big5
  it('ENC-6: Big5 / big-5 → Big5', () => {
    expect(normalizeEncoding('Big5')).toBe('Big5');
    expect(normalizeEncoding('big-5')).toBe('Big5');
  });

  // ENC-7: 未知编码 → 原样转大写
  it('ENC-7: 未知编码 → toUpperCase() 兜底', () => {
    expect(normalizeEncoding('unknown-encoding')).toBe('UNKNOWN-ENCODING');
    expect(normalizeEncoding('')).toBe('');
    expect(normalizeEncoding('TIS-620')).toBe('TIS-620');
  });
});

describe('EXT_ENCODING_HINT', () => {
  // ENC-8: Delphi 扩展名 → CP936
  it('ENC-8: .pas / .dpr / .dpk → CP936', () => {
    expect(EXT_ENCODING_HINT['.pas']).toBe('CP936');
    expect(EXT_ENCODING_HINT['.dpr']).toBe('CP936');
    expect(EXT_ENCODING_HINT['.dpk']).toBe('CP936');
  });

  it('ENC-9: .dfm / .fmx → CP936', () => {
    expect(EXT_ENCODING_HINT['.dfm']).toBe('CP936');
    expect(EXT_ENCODING_HINT['.fmx']).toBe('CP936');
  });

  // ENC-10: 非 Delphi 扩展名 → undefined
  it('ENC-10: 不在此表中的扩展名 → undefined', () => {
    expect(EXT_ENCODING_HINT['.ts']).toBeUndefined();
    expect(EXT_ENCODING_HINT['.js']).toBeUndefined();
    expect(EXT_ENCODING_HINT['.py']).toBeUndefined();
    expect(EXT_ENCODING_HINT['.txt']).toBeUndefined();
  });
});
