# v0.2.9 行内编辑功能 - TDD 任务清单

## 概述

本文档定义了行内编辑 (Inline Edit) 功能的 TDD 测试规范和实现任务。

---

## 一、核心库 (ifainew-core) 任务

### 1.1 接口定义

#### 任务 1.1.1: 创建 IInlineEditor 接口
**文件**: `../ifainew-core/typescript/src/interfaces/IInlineEditor.ts`

```typescript
/**
 * v0.2.9 行内编辑接口
 *
 * 提供基于 AI 的代码编辑建议功能
 */
export interface IInlineEditor {
  /**
   * 应用代码编辑
   *
   * @param instruction 用户的编辑指令（例如："添加错误处理"）
   * @param code 原始代码
   * @param language 代码语言（例如："typescript"）
   * @param filePath 文件路径（用于上下文）
   * @returns 修改后的代码
   */
  applyEdit(
    instruction: string,
    code: string,
    language: string,
    filePath?: string
  ): Promise<string>;

  /**
   * 流式应用代码编辑
   *
   * @param instruction 用户的编辑指令
   * @param code 原始代码
   * @param language 代码语言
   * @param onProgress 进度回调 (chunk: string) => void
   * @param filePath 文件路径
   * @returns 修改后的代码
   */
  applyEditStream(
    instruction: string,
    code: string,
    language: string,
    onProgress: (chunk: string) => void,
    filePath?: string
  ): Promise<string>;
}
```

#### 任务 1.1.2: 创建 InlineEditorRequest 接口
**文件**: `../ifainew-core/typescript/src/interfaces/IInlineEditor.ts`

```typescript
export interface InlineEditorRequest {
  instruction: string;
  code: string;
  language: string;
  filePath?: string;
  selectedCode?: string; // 用户选中的代码片段
}

export interface InlineEditorResponse {
  originalCode: string;
  modifiedCode: string;
  instruction: string;
  success: boolean;
  error?: string;
}

export interface InlineEditorOptions {
  stream?: boolean; // 是否使用流式响应
  onProgress?: (chunk: string) => void; // 进度回调
}
```

### 1.2 服务实现

#### 任务 1.2.1: 创建 InlineEditorService
**文件**: `../ifainew-core/typescript/src/services/InlineEditorService.ts`

**功能要求**:
1. 构建 LLM prompt
2. 调用 LLM API（复用 useChatStore 的逻辑）
3. 解析响应代码（从 markdown 代码块中提取）
4. 错误处理

**测试用例**:
- [ ] EDT-UNIT-01: 应该构建包含指令和原始代码的 prompt
- [ ] EDT-UNIT-02: 应该正确解析 markdown 代码块响应
- [ ] EDT-UNIT-03: 应该处理 LLM 错误响应
- [ ] EDT-UNIT-04: 应该支持流式响应

### 1.3 Mock 实现

#### 任务 1.3.1: 创建 MockInlineEditor
**文件**: `../ifainew-core/typescript/src/mock-core/v0.2.9/MockInlineEditor.ts`

**功能要求**:
1. 提供模拟的代码编辑响应
2. 支持常见指令模式（错误处理、类型转换等）
3. 可配置的延迟（模拟网络请求）

---

## 二、社区版项目 (ifainew) 任务

### 2.1 接口集成

#### 任务 2.1.1: 在 mock-core 中导出 IInlineEditor
**文件**: `src/core/mock-core/index.ts`

```typescript
export { IInlineEditor, InlineEditorRequest, InlineEditorResponse } from './interfaces/IInlineEditor';
```

#### 任务 2.1.2: 创建社区版 MockInlineEditor
**文件**: `src/core/mock-core/v0.2.9/MockInlineEditor.ts`

### 2.2 Store 集成

#### 任务 2.2.1: 更新 inlineEditStore 使用 IInlineEditor
**文件**: `src/stores/inlineEditStore.ts`

**修改内容**:
- 注入 IInlineEditor 服务
- 移除 mock 逻辑
- 调用 `editor.applyEdit()`

---

## 三、单元测试任务

### 3.1 SymbolIndexer 测试
**文件**: `tests/unit/v0.2.9/symbol-indexer.test.ts`

**测试用例**:
- [ ] EDT-UNIT-01: 应该提取 TypeScript 函数声明
- [ ] EDT-UNIT-02: 应该提取箭头函数
- [ ] EDT-UNIT-03: 应该提取类声明
- [ ] EDT-UNIT-04: 应该提取接口声明
- [ ] EDT-UNIT-05: 应该提取 const 声明
- [ ] EDT-UNIT-06: 应该提取 export 导入的符号
- [ ] EDT-UNIT-07: 应该正确搜索符号（前缀匹配）
- [ ] EDT-UNIT-08: 应该管理 LRU 缓存（最近文件优先）
- [ ] EDT-UNIT-09: 应该支持多语言（TypeScript, Python, Rust）

### 3.2 InlineEditStore 测试
**文件**: `tests/unit/v0.2.9/inline-edit-store.test.ts`

**测试用例**:
- [ ] EDT-UNIT-01: showInlineEdit 应该设置正确的状态
- [ ] EDT-UNIT-02: hideInlineEdit 应该清除输入和状态
- [ ] EDT-UNIT-03: submitInstruction 应该调用 editor 服务
- [ ] EDT-UNIT-04: showDiffEditor 应该保存历史记录
- [ ] EDT-UNIT-05: undo 应该恢复到上一个状态
- [ ] EDT-UNIT-06: redo 应该前进到下一个状态

### 3.3 SymbolCompletionProvider 测试
**文件**: `tests/unit/v0.2.9/symbol-completion-provider.test.ts`

**测试用例**:
- [ ] EDT-UNIT-01: 应该返回匹配前缀的符号
- [ ] EDT-UNIT-02: 应该显示来源文件
- [ ] EDT-UNIT-03: 应该按最近访问文件排序
- [ ] EDT-UNIT-04: 应该排除当前文件的符号

---

## 四、E2E 测试补充

### 4.1 真实 LLM 测试
**文件**: `tests/e2e/v0.2.9/native-editing-real-ai.spec.ts`

**测试用例**:
- [ ] EDT-E2E-REAL-01: 使用真实 LLM 进行代码编辑
- [ ] EDT-E2E-REAL-02: 验证流式响应显示
- [ ] EDT-E2E-REAL-03: 验证复杂重构场景

---

## 五、实施优先级

### P0 (必须)
- [x] E2E 测试框架（已完成）
- [ ] IInlineEditor 接口定义
- [ ] MockInlineEditor 实现
- [ ] inlineEditStore 集成

### P1 (重要)
- [ ] InlineEditorService 实现
- [ ] SymbolIndexer 单元测试
- [ ] inlineEditStore 单元测试

### P2 (可选)
- [ ] 流式响应支持
- [ ] 真实 LLM E2E 测试
- [ ] 性能优化

---

## 六、验收标准

### 功能验收
- [ ] 所有 7 个 E2E 测试通过
- [ ] 至少 80% 的单元测试通过
- [ ] 真实 LLM 调用成功（商业版）

### 代码质量
- [ ] TypeScript 编译无错误
- [ ] 无 ESLint 警告
- [ ] 代码覆盖率 > 60%

---

*创建时间: 2025-01-11*
*版本: v0.2.9*
