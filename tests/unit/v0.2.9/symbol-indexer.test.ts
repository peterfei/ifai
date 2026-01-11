/**
 * v0.2.9 SymbolIndexer 单元测试
 *
 * 测试符号索引系统的核心功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SymbolIndexer, SymbolInfo } from '../../../src/core/indexer/SymbolIndexer';

describe('SymbolIndexer', () => {
  let indexer: SymbolIndexer;

  beforeEach(() => {
    indexer = new SymbolIndexer();
  });

  describe('EDT-UNIT-01: 应该提取 TypeScript 函数声明', () => {
    it('应该识别 function 关键字声明的函数', async () => {
      const code = `
function myFunction() {
  return 42;
}

export async function fetchData() {
  return await fetch('/api');
}
`;
      const symbols = await indexer.indexFile('/test/test.ts', code);

      const functionSymbols = symbols.filter(s => s.kind === 'function');
      expect(functionSymbols).toHaveLength(2);
      expect(functionSymbols.some(s => s.name === 'myFunction')).toBe(true);
      expect(functionSymbols.some(s => s.name === 'fetchData')).toBe(true);
    });

    it('应该正确设置符号的行号', async () => {
      const code = `
function firstLine() {}
function secondLine() {}
`;
      const symbols = await indexer.indexFile('/test/test.ts', code);

      const first = symbols.find(s => s.name === 'firstLine');
      const second = symbols.find(s => s.name === 'secondLine');

      expect(first?.line).toBe(2);
      expect(second?.line).toBe(3);
    });
  });

  describe('EDT-UNIT-02: 应该提取箭头函数', () => {
    it('应该识别 const/let/var 声明的箭头函数', async () => {
      const code = `
const myArrow = () => {
  return 1;
};

const asyncArrow = async (x: number) => x * 2;

let another = () => {};
`;
      const symbols = await indexer.indexFile('/test/test.ts', code);

      const arrowFunctions = symbols.filter(s => s.kind === 'function');
      expect(arrowFunctions.length).toBeGreaterThanOrEqual(3);
      expect(arrowFunctions.some(s => s.name === 'myArrow')).toBe(true);
      expect(arrowFunctions.some(s => s.name === 'asyncArrow')).toBe(true);
      expect(arrowFunctions.some(s => s.name === 'another')).toBe(true);
    });

    it('应该正确识别导出的箭头函数', async () => {
      const code = `
export const exported = () => {};
export const myFunc = async () => {};
`;
      const symbols = await indexer.indexFile('/test/test.ts', code);

      expect(symbols.some(s => s.name === 'exported' && s.kind === 'function')).toBe(true);
      expect(symbols.some(s => s.name === 'myFunc' && s.kind === 'function')).toBe(true);
    });
  });

  describe('EDT-UNIT-03: 应该提取类声明', () => {
    it('应该识别 class 关键字声明的类', async () => {
      const code = `
class MyClass {
  constructor() {}
}

export class ExportedClass {
  method() {}
}

abstract class AbstractClass {}
`;
      const symbols = await indexer.indexFile('/test/test.ts', code);

      const classSymbols = symbols.filter(s => s.kind === 'class');
      expect(classSymbols.length).toBeGreaterThanOrEqual(3);
      expect(classSymbols.some(s => s.name === 'MyClass')).toBe(true);
      expect(classSymbols.some(s => s.name === 'ExportedClass')).toBe(true);
      expect(classSymbols.some(s => s.name === 'AbstractClass')).toBe(true);
    });
  });

  describe('EDT-UNIT-04: 应该提取接口声明', () => {
    it('应该识别 interface 关键字声明的接口', async () => {
      const code = `
interface MyInterface {
  name: string;
}

export interface ExportedInterface {
  value: number;
}
`;
      const symbols = await indexer.indexFile('/test/test.ts', code);

      const interfaceSymbols = symbols.filter(s => s.kind === 'interface');
      expect(interfaceSymbols.length).toBeGreaterThanOrEqual(2);
      expect(interfaceSymbols.some(s => s.name === 'MyInterface')).toBe(true);
      expect(interfaceSymbols.some(s => s.name === 'ExportedInterface')).toBe(true);
    });

    it('应该提取 type 别名声明', async () => {
      const code = `
type MyType = string | number;
export type ExportedType = { value: boolean };
`;
      const symbols = await indexer.indexFile('/test/test.ts', code);

      const typeSymbols = symbols.filter(s => s.kind === 'type');
      expect(typeSymbols.length).toBeGreaterThanOrEqual(2);
      expect(typeSymbols.some(s => s.name === 'MyType')).toBe(true);
      expect(typeSymbols.some(s => s.name === 'ExportedType')).toBe(true);
    });
  });

  describe('EDT-UNIT-05: 应该提取 const 声明', () => {
    it('应该识别 const 关键字声明的常量', async () => {
      const code = `
const MY_CONSTANT = 42;
export const EXPORTED_CONST = 'value';
let myVariable = 123;
var oldVar = 456;
`;
      const symbols = await indexer.indexFile('/test/test.ts', code);

      const constantSymbols = symbols.filter(s => s.kind === 'constant');
      expect(constantSymbols.length).toBeGreaterThanOrEqual(4);
      expect(constantSymbols.some(s => s.name === 'MY_CONSTANT')).toBe(true);
      expect(constantSymbols.some(s => s.name === 'EXPORTED_CONST')).toBe(true);
      expect(constantSymbols.some(s => s.name === 'myVariable')).toBe(true);
      expect(constantSymbols.some(s => s.name === 'oldVar')).toBe(true);
    });

    it('应该正确标记符号类型', async () => {
      const code = `
const myConst = 1;
function myFunc() {}
class MyClass {}
`;
      const symbols = await indexer.indexFile('/test/test.ts', code);

      expect(symbols.find(s => s.name === 'myConst')?.kind).toBe('constant');
      expect(symbols.find(s => s.name === 'myFunc')?.kind).toBe('function');
      expect(symbols.find(s => s.name === 'MyClass')?.kind).toBe('class');
    });
  });

  describe('EDT-UNIT-06: 应该提取 export 导入的符号', () => {
    it('应该识别 import { } from 语法导入的符号', async () => {
      const code = `
import { useState, useEffect, useCallback } from 'react';
import { Button, Input } from './components';
`;
      const symbols = await indexer.indexFile('/test/test.ts', code);

      // 导入的符号应该被索引为 kind: 'function'
      expect(symbols.some(s => s.name === 'useState')).toBe(true);
      expect(symbols.some(s => s.name === 'useEffect')).toBe(true);
      expect(symbols.some(s => s.name === 'useCallback')).toBe(true);
      expect(symbols.some(s => s.name === 'Button')).toBe(true);
      expect(symbols.some(s => s.name === 'Input')).toBe(true);
    });

    it('应该正确设置导入符号的 detail', async () => {
      const code = `
import { myFunction } from './utils';
`;
      const symbols = await indexer.indexFile('/test/test.ts', code);

      const importedSymbol = symbols.find(s => s.name === 'myFunction');
      expect(importedSymbol?.detail).toContain('imported from');
      expect(importedSymbol?.detail).toContain('./utils');
    });

    it('应该处理带别名的导入', async () => {
      const code = `
import { myFunc as alias } from './module';
`;
      const symbols = await indexer.indexFile('/test/test.ts', code);

      // 应该使用原始名称而不是别名
      expect(symbols.some(s => s.name === 'myFunc')).toBe(true);
    });
  });

  describe('EDT-UNIT-07: 应该正确搜索符号（前缀匹配）', () => {
    beforeEach(async () => {
      // 设置测试数据
      await indexer.indexFile('/utils.ts', `
export function util1() {}
export function util2() {}
export function utilHelper() {}
export const CONST_VALUE = 123;
`);

      await indexer.indexFile('/helpers.ts', `
export function helperFunc() {}
export const helperConst = 456;
`);
    });

    it('应该返回匹配前缀的所有符号', () => {
      const results = indexer.search('util');

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(s => s.name.startsWith('util'))).toBe(true);
    });

    it('应该支持空字符串返回所有符号', () => {
      const results = indexer.search('');

      expect(results.length).toBeGreaterThan(0);
    });

    it('应该支持 maxResults 限制结果数量', () => {
      const results = indexer.search('util', { maxResults: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('应该支持排除当前文件', () => {
      const results = indexer.search('util', { excludeCurrentFile: '/utils.ts' });

      // 不应该包含 /utils.ts 中的符号
      expect(results.every(s => s.filePath !== '/utils.ts')).toBe(true);
    });

    it('应该按最近访问文件排序结果', async () => {
      // 清除之前的索引，重新开始
      indexer.clear();

      // 先索引 utils.ts，再索引 helpers.ts
      await indexer.indexFile('/utils.ts', `
export function util1() {}
`);
      await indexer.indexFile('/helpers.ts', `
export function util2() {}
`);

      // helpers.ts 是最近访问的，它的符号应该排在前面
      const results = indexer.search('util');

      if (results.length > 0) {
        const firstResult = results[0];
        // 最近访问文件的符号应该优先
        expect(firstResult.filePath).toBe('/helpers.ts');
      }
    });
  });

  describe('EDT-UNIT-08: 应该管理 LRU 缓存（最近文件优先）', () => {
    it('应该将最近访问的文件放在列表前面', async () => {
      await indexer.indexFile('/first.ts', 'export const a = 1;');
      await indexer.indexFile('/second.ts', 'export const b = 2;');
      await indexer.indexFile('/first.ts', 'export const c = 3;'); // 再次访问 first.ts

      const stats = indexer.getStats();

      // first.ts 应该是最近访问的
      expect(stats.recentFiles[0]).toBe('/first.ts');
    });

    it('应该限制最近文件列表的大小', async () => {
      const smallIndexer = new SymbolIndexer({ maxFiles: 3 });

      await smallIndexer.indexFile('/file1.ts', 'export const a = 1;');
      await smallIndexer.indexFile('/file2.ts', 'export const b = 2;');
      await smallIndexer.indexFile('/file3.ts', 'export const c = 3;');
      await smallIndexer.indexFile('/file4.ts', 'export const d = 4;');

      const stats = smallIndexer.getStats();

      // 最近文件列表不应该超过 maxFiles
      expect(stats.recentFiles.length).toBeLessThanOrEqual(3);
    });

    it('应该在搜索结果中优先显示最近文件的符号', async () => {
      // 索引两个包含同名符号的文件
      await indexer.indexFile('/old.ts', 'export function shared() {}');
      await indexer.indexFile('/new.ts', 'export function shared() {}'); // 新文件

      const results = indexer.search('shared');

      expect(results.length).toBeGreaterThan(0);
      // /new.ts 是最近访问的，它的符号应该排在前面
      expect(results[0].filePath).toBe('/new.ts');
    });

    it('应该正确计算符号权重', async () => {
      await indexer.indexFile('/recent.ts', 'export function func() {}');
      await indexer.indexFile('/old.ts', 'export function func() {}'); // 覆盖同名符号

      const results = indexer.search('func');

      // 两个文件都有 func，最近文件的应该权重更高
      expect(results.length).toBe(2);
      // 检查第一个结果的 score 属性
      expect((results[0] as any).score).toBeGreaterThanOrEqual((results[1] as any).score);
    });
  });

  describe('EDT-UNIT-09: 应该支持多语言（TypeScript, Python, Rust）', () => {
    it('应该提取 Python 函数和类', async () => {
      const pythonCode = `
def my_function():
    return 42

async def async_function():
    await something()

class MyClass:
    pass

CONSTANT_VALUE = 123
`;
      const symbols = await indexer.indexFile('/test.py', pythonCode);

      const functions = symbols.filter(s => s.kind === 'function');
      const classes = symbols.filter(s => s.kind === 'class');
      const constants = symbols.filter(s => s.kind === 'constant');

      expect(functions.length).toBeGreaterThanOrEqual(2);
      expect(functions.some(s => s.name === 'my_function')).toBe(true);
      expect(functions.some(s => s.name === 'async_function')).toBe(true);

      expect(classes.some(s => s.name === 'MyClass')).toBe(true);

      expect(constants.some(s => s.name === 'CONSTANT_VALUE')).toBe(true);
    });

    it('应该提取 Rust 函数和结构体', async () => {
      const rustCode = `
pub fn my_function() -> i32 {
    42
}

async pub fn async_function() {
    something().await
}

pub struct MyStruct {
    field: i32,
}

pub enum MyEnum {
    Variant1,
    Variant2,
}

pub trait MyTrait {
    fn method(&self);
}

pub const CONSTANT: i32 = 123;
`;
      const symbols = await indexer.indexFile('/test.rs', rustCode);

      const functions = symbols.filter(s => s.kind === 'function');
      const classes = symbols.filter(s => s.kind === 'class');
      const types = symbols.filter(s => s.kind === 'type');
      const interfaces = symbols.filter(s => s.kind === 'interface');
      const constants = symbols.filter(s => s.kind === 'constant');

      expect(functions.some(s => s.name === 'my_function')).toBe(true);
      expect(functions.some(s => s.name === 'async_function')).toBe(true);

      expect(classes.some(s => s.name === 'MyStruct')).toBe(true);

      expect(types.some(s => s.name === 'MyEnum')).toBe(true);

      expect(interfaces.some(s => s.name === 'MyTrait')).toBe(true);

      expect(constants.some(s => s.name === 'CONSTANT')).toBe(true);
    });

    it('应该根据文件扩展名选择正确的解析器', async () => {
      const tsCode = 'function tsFunc() {}';
      const pyCode = 'def py_func(): pass';
      const rsCode = 'pub fn rs_func() {}';

      const tsSymbols = await indexer.indexFile('/test.ts', tsCode);
      const pySymbols = await indexer.indexFile('/test.py', pyCode);
      const rsSymbols = await indexer.indexFile('/test.rs', rsCode);

      expect(tsSymbols.some(s => s.name === 'tsFunc')).toBe(true);
      expect(pySymbols.some(s => s.name === 'py_func')).toBe(true);
      expect(rsSymbols.some(s => s.name === 'rs_func')).toBe(true);
    });
  });

  describe('其他功能测试', () => {
    it('应该能够清除索引', async () => {
      await indexer.indexFile('/test.ts', 'export const a = 1;');

      expect(indexer.getStats().filesIndexed).toBe(1);

      indexer.clear();

      expect(indexer.getStats().filesIndexed).toBe(0);
    });

    it('应该能够获取文件的符号', async () => {
      await indexer.indexFile('/test.ts', 'export function myFunc() {}');

      const symbols = indexer.getFileSymbols('/test.ts');

      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('myFunc');
    });

    it('应该能够获取符号定义', async () => {
      await indexer.indexFile('/test.ts', 'export function myFunc() {}');

      const definition = indexer.getSymbolDefinition('myFunc');

      expect(definition).toBeDefined();
      expect(definition?.name).toBe('myFunc');
      expect(definition?.kind).toBe('function');
    });

    it('应该正确统计索引信息', async () => {
      await indexer.indexFile('/test1.ts', 'export function func1() {}');
      await indexer.indexFile('/test2.ts', 'export function func2() {}\nexport function func3() {}');

      const stats = indexer.getStats();

      expect(stats.filesIndexed).toBe(2);
      expect(stats.totalSymbols).toBe(3);
      expect(stats.recentFiles.length).toBe(2);
    });

    it('应该跳过注释行', async () => {
      const code = `
// This is a comment
function realFunction() {}
/* Another comment */
const realConst = 123;
`;
      const symbols = await indexer.indexFile('/test.ts', code);

      // 注释不应该被索引
      expect(symbols.every(s => s.name !== 'This')).toBe(true);
      expect(symbols.every(s => s.name !== 'is')).toBe(true);

      // 真实符号应该被索引
      expect(symbols.some(s => s.name === 'realFunction')).toBe(true);
      expect(symbols.some(s => s.name === 'realConst')).toBe(true);
    });
  });
});
