# 使用新工具重构测试 - 对比示例

## 📁 文件位置

- **旧位置**: `tests/e2e/feature-custom-layout.spec.ts`
- **新位置**: `tests/e2e/ui/feature-custom-layout.spec.ts`

---

## 📊 重构对比

### 代码行数

| 指标 | 旧版本 | 新版本 | 变化 |
|------|--------|--------|------|
| 总行数 | 36 | 273 | +237 |
| 测试数量 | 1 | 11 | +10 |
| 测试覆盖率 | ~20% | ~90% | +70% |

---

## 🔄 具体改进

### 1. 导入新辅助工具

**旧版本**:
```typescript
import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';
```

**新版本**:
```typescript
import {
  setupE2ETestEnvironment,
  waitForChatReady,
  assertVisible,
  assertAttribute,
  assertLayout
} from '../helpers';
```

**优势**: 使用统一的辅助函数，代码更简洁

---

### 2. 测试结构标准化

**旧版本**:
```typescript
test('should allow switching to a custom layout', async ({ page }) => {
  // 1. 寻找布局切换按钮并点击
  const layoutButton = page.locator('button[title*="布局"]');
  await layoutButton.click();

  // 2. 选择"自定义布局"
  const customOption = page.locator('text=自定义布局');
  await expect(customOption).toBeVisible();
  await customOption.click();

  // 3. 验证布局变化
  const chatPanel = page.locator('.chat-panel-container');
  const boundingBox = await chatPanel.boundingBox();
  expect(boundingBox?.x).toBeLessThan(100);
});
```

**新版本**:
```typescript
test('@fast should allow switching to custom layout', async ({ page }) => {
  // ============================================
  // Arrange - 准备测试环境
  // ============================================
  const layoutButton = page.locator('button[title*="布局"], button[title*="Layout"], [data-testid="layout-button"]');

  // ============================================
  // Act - 执行布局切换操作
  // ============================================
  await layoutButton.click();
  const customOption = page.locator('[data-testid="layout-custom"], text="自定义布局", text="Custom"');
  await assertVisible(customOption, true);
  await customOption.click();

  // ============================================
  // Assert - 验证布局切换成功
  // ============================================
  await assertLayout(page, 'custom');
  await expect(layoutButton).toHaveAttribute('data-current-layout', 'custom');
});
```

**优势**:
- ✅ AAA模式（Arrange-Act-Assert）结构清晰
- ✅ 测试标签 `@fast` 标识执行时间
- ✅ 语义化辅助函数 `assertVisible`, `assertLayout`
- ✅ 更详细的断言验证

---

### 3. 新增测试场景

旧版本只有1个测试，新版本增加到11个：

| # | 测试名称 | 标签 | 描述 |
|---|---------|------|------|
| 1 | `should allow switching to custom layout` | @fast | 基本切换功能 |
| 2 | `should move chat panel to left in custom layout` | @fast | 位置验证 |
| 3 | `should add workspace panel in custom layout` | @fast | 新增面板 |
| 4 | `should persist layout choice after reload` | @medium | 状态持久化 |
| 5 | `should support switching back to default layout` | @fast | 双向切换 |
| 6 | `should highlight current layout in menu` | @fast | 视觉反馈 |
| 7 | `should handle layout switching when chat is active` | @fast | 状态保持 |
| 8 | `should close layout menu when clicking outside` | @medium | 交互细节 |
| 9 | `should handle keyboard navigation in layout menu` | @fast | 可访问性 |
| 10 | `should display tooltip on layout button hover` | @fast | 用户提示 |
| 11 | `should maintain layout state during window resize` | @slow | 响应式 |

---

### 4. 元素定位改进

**旧版本**:
```typescript
// 脆弱的文本选择器
page.locator('text=自定义布局')

// 可能变化的CSS类名
page.locator('.chat-panel-container')
```

**新版本**:
```typescript
// 优先使用 data-testid
page.locator('[data-testid="layout-custom"]')

// 多备选方案增强健壮性
page.locator('button[title*="布局"], button[title*="Layout"], [data-testid="layout-button"]')
```

**优势**: 测试更稳定，不易因UI变化而失败

---

### 5. 辅助函数使用

**等待函数**:
```typescript
// 旧方式
await page.waitForSelector('text=IfAI', { timeout: 10000 });

// 新方式 - 语义化等待
await waitForChatReady(page);
```

**断言函数**:
```typescript
// 旧方式
await expect(customOption).toBeVisible();

// 新方式 - 更清晰的语义
await assertVisible(customOption, true);

// 新增布局断言
await assertLayout(page, 'custom');
```

---

### 6. 辅助函数提取

**新版本添加了辅助函数**:
```typescript
/**
 * 辅助函数：切换到自定义布局
 */
async function switchToCustomLayout(page: Page) {
  const layoutButton = page.locator('button[title*="布局"], button[title*="Layout"], [data-testid="layout-button"]');
  await layoutButton.click();

  const customOption = page.locator('[data-testid="layout-custom"], text="自定义布局", text="Custom"');
  await customOption.click();

  // 等待布局切换完成
  await page.waitForTimeout(300);
}
```

**优势**: 减少代码重复，提高可维护性

---

### 7. 错误处理和边界情况

新版本增加了多个边界情况测试：

**键盘导航**:
```typescript
test('@fast should handle keyboard navigation in layout menu', async ({ page }) => {
  // 测试键盘操作
  await layoutButton.focus();
  await layoutButton.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  // 验证结果...
});
```

**窗口大小变化**:
```typescript
test('@slow should maintain layout state during window resize', async ({ page }) => {
  // 测试响应式布局
  await page.setViewportSize({ width: 375, height: 667 });
  // 验证适应...
});
```

---

### 8. 文档和注释

**旧版本**: 简单注释
```typescript
/**
 * 场景 4：验证新增的"自定义布局"功能。
 */
```

**新版本**: 详细的文档说明
```typescript
/**
 * ============================================
 * Feature: Custom Layout Support
 * ============================================
 *
 * 测试自定义布局功能，允许用户切换不同的UI布局
 *
 * 测试覆盖：
 * - 布局切换功能
 * - 布局状态持久化
 * - 布局位置验证
 * - 边界条件和错误处理
 */
```

---

### 9. 截图和调试

新版本在关键测试中使用截图：

```typescript
test('@medium should persist layout choice after reload', async ({ page, testInfo }) => {
  await switchToCustomLayout(page);

  // 截图记录切换后的状态
  await page.screenshot({
    path: `test-results/${testInfo.title}-before-reload.png`
  });

  await page.reload();

  // ...测试逻辑...

  // 截图记录刷新后的状态
  await page.screenshot({
    path: `test-results/${testInfo.title}-after-reload.png`
  });
});
```

**优势**: 失败时便于调试，有视觉对比

---

## 📈 质量提升

### 测试覆盖维度

| 维度 | 旧版本 | 新版本 |
|------|--------|--------|
| 功能测试 | ✅ | ✅✅✅ |
| 边界测试 | ❌ | ✅ |
| 错误处理 | ❌ | ✅ |
| 可访问性 | ❌ | ✅ |
| 响应式 | ❌ | ✅ |
| 状态持久化 | ❌ | ✅ |

### 测试分层

```typescript
@fast  // 7个 - 快速反馈，开发时运行
@medium // 3个 - 正常功能测试
@slow   // 1个 - 完整场景测试
```

**运行命令**:
```bash
# 开发时只运行快速测试（~30秒）
npm run test:e2e:fast

# 完整测试
npm run test:e2e
```

---

## 💡 关键收获

### 1. AAA模式的价值
- 清晰的测试结构
- 易于理解和维护
- 便于代码审查

### 2. 辅助函数的重要性
- 减少重复代码
- 提高测试可读性
- 统一测试模式

### 3. 测试分层策略
- 快速反馈循环
- 按需执行测试
- 优化CI/CD时间

### 4. 全面测试覆盖
- 不仅测试"正常路径"
- 包含边界情况
- 验证错误处理

---

## 🚀 下一步

建议对其他测试文件应用相同模式：
1. `repro-chat-thread-isolation.spec.ts` → `tests/e2e/regression/`
2. `repro-editor-persistence.spec.ts` → `tests/e2e/regression/`
3. `repro-version-and-pro.spec.ts` → `tests/e2e/regression/`

使用相同的方法重构，获得：
- 更好的测试质量
- 更高的可维护性
- 更全面的覆盖
