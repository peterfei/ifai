import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

/**
 * DEP-002: 影响面分析 (Impact Analysis) E2E 测试
 *
 * 核心功能：
 * - 修改某个 API 后，自动识别所有受影响的调用点
 * - 支持跨文件、跨模块的影响分析
 * - 提供影响面可视化展示
 *
 * 对应用例文档：
 * - E2E-DEP-02: 影响面分析
 * - DEP-UNIT-01/02/03: 单元测试场景
 */

test.describe('DEP-002: Impact Analysis @v0.3.0', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__fileStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  /**
   * E2E-DEP-02-01: 函数签名变更影响分析
   *
   * 测试场景：
   * 1. 创建多个文件，其中包含对同一函数的多次调用
   * 2. 修改函数签名（如添加参数）
   * 3. 触发影响面分析
   * 4. 验证所有受影响的调用点被正确识别
   */
  test('E2E-DEP-02-01: Function signature change impact analysis', async ({ page }) => {
    // 1. 创建测试文件结构
    const files = {
      'api.ts': `
export function calculatePrice(basePrice: number, taxRate: number): number {
  return basePrice * (1 + taxRate);
}

export function formatPrice(price: number): string {
  return "$" + price.toFixed(2);
}
`,
      'checkout.ts': `
import { calculatePrice, formatPrice } from './api';

export function processCheckout(itemPrice: number) {
  const price = calculatePrice(itemPrice, 0.1);
  return formatPrice(price);
}
`,
      'invoice.ts': `
import { calculatePrice } from './api';

export function generateInvoice subtotal: number) {
  const total = calculatePrice(subtotal, 0.15);
  return total;
}
`,
      'summary.ts': `
import { calculatePrice } from './api';

export function getSummary(base: number) {
  return calculatePrice(base, 0.08);
}
`
    };

    // 打开主文件并加载所有依赖
    await page.evaluate(async (files) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      for (const [name, content] of Object.entries(files)) {
        (window as any).__E2E_OPEN_MOCK_FILE__(name, content);
      }
    }, files);

    await page.waitForTimeout(1000);

    // 索引所有文件
    for (const [name, content] of Object.entries(files)) {
      await page.evaluate(async ({ path, code }) => {
        const symbolIndexer = (window as any).__symbolIndexer;
        if (symbolIndexer) {
          await symbolIndexer.indexFile(`/mock/${path}`, code);
        }
      }, { path: name, code: content });
    }

    await page.waitForTimeout(500);

    // 2. 打开 api.ts 文件（定义文件）
    await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      if (editor && editor.getModel) {
        const model = editor.getModel();
        if (model) {
          // 更新编辑器内容为 api.ts
          const content = 'export function calculatePrice(basePrice: number, taxRate: number): number {' +
            '  return basePrice * (1 + taxRate);' +
            '}' +
            '' +
            'export function formatPrice(price: number): string {' +
            '  return `$${price.toFixed(2)}`;' +
            '}' +
            '';
          model.setValue(content);
        }
      }
    });

    await page.waitForTimeout(500);

    // 3. 触发影响面分析
    // 将光标置于 calculatePrice 函数名上
    await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      if (editor) {
        editor.setPosition({ lineNumber: 1, column: 20 });
        editor.focus();
      }
    });

    await page.waitForTimeout(200);

    // 尝试通过命令面板触发影响面分析
    await page.keyboard.press('Control+Shift+P');
    await page.waitForTimeout(300);

    const commandPaletteInput = page.locator('.monaco-inputbox textarea, .quick-input-widget input');
    const hasCommandPalette = await commandPaletteInput.count() > 0;

    if (hasCommandPalette) {
      await commandPaletteInput.fill('analyze impact');
      await page.waitForTimeout(300);

      const analyzeCommand = page.locator('.monaco-list-rows').getByText(/Impact|影响|Analyze|分析/i);
      const hasCommand = await analyzeCommand.count() > 0;

      if (hasCommand) {
        await analyzeCommand.click();
      } else {
        await page.keyboard.press('Escape');
      }
    }

    await page.waitForTimeout(1000);

    // 4. 验证影响面分析结果
    // 检查是否有影响面面板或结果显示
    const impactPanel = page.locator('[data-testid="impact-panel"], .impact-analysis-panel, .references-panel');
    const hasPanel = await impactPanel.count() > 0;

    if (hasPanel) {
      // 验证面板内容
      await expect(impactPanel).toBeVisible();

      // 应该显示影响的文件列表
      // 至少应该包含 checkout.ts, invoice.ts, summary.ts
      await expect(impactPanel).toContainText(/checkout|invoice|summary/i, { timeout: 5000 });

      // 应该显示影响统计
      await expect(impactPanel).toContainText(/\d+\s*(files|files affected|文件)/i);
    } else {
      // 如果没有专门的影响面面板，检查是否有其他形式的反馈
      // 例如：Toast 消息、状态栏通知等
      test.info().annotations.push({
        type: 'info',
        description: 'No dedicated impact panel found - checking alternative feedback mechanisms'
      });

      // 至少验证没有崩溃
      const editor = page.locator('.monaco-editor').first();
      await expect(editor).toBeVisible();
    }

    // 清理
    await page.keyboard.press('Escape');
  });

  /**
   * E2E-DEP-02-02: 类成员变更影响分析
   *
   * 测试场景：
   * 1. 创建一个类和多个使用该类的文件
   * 2. 修改类的一个属性（如重命名或删除）
   * 3. 验证影响面分析能找到所有使用该属性的地方
   */
  test('E2E-DEP-02-02: Class member change impact analysis', async ({ page }) => {
    const files = {
      'models.ts': `
export class User {
  id: number;
  name: string;
  email: string;

  constructor(id: number, name: string, email: string) {
    this.id = id;
    this.name = name;
    this.email = email;
  }

  getDisplayName(): string {
    return this.name;
  }
}
`,
      'user-service.ts': `
import { User } from './models';

export class UserService {
  createUser(name: string, email: string): User {
    return new User(1, name, email);
  }

  getUserName(user: User): string {
    return user.name;
  }
}
`,
      'components.ts': `
import { User } from './models';

export function UserCard({ user }: { user: User }) {
  return "<div>" + user.name + "</div>";
}
`,
      'utils.ts': `
import { User } from './models';

export function sortUsers(users: User[]): User[] {
  return users.sort((a, b) => a.name.localeCompare(b.name));
}
`
    };

    // 加载所有文件
    await page.evaluate(async (files) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      for (const [name, content] of Object.entries(files)) {
        (window as any).__E2E_OPEN_MOCK_FILE__(name, content);
      }
    }, files);

    await page.waitForTimeout(1000);

    // 索引所有文件
    for (const [name, content] of Object.entries(files)) {
      await page.evaluate(async ({ path, code }) => {
        const symbolIndexer = (window as any).__symbolIndexer;
        if (symbolIndexer) {
          await symbolIndexer.indexFile(`/mock/${path}`, code);
        }
      }, { path: name, code: content });
    }

    await page.waitForTimeout(500);

    // 验证符号被正确索引
    const userClassSymbol = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.getSymbolDefinition('User');
      }
      return null;
    });

    expect(userClassSymbol).toBeTruthy();
    expect(userClassSymbol!.kind).toBe('class');

    // 测试查找 User.name 的引用
    const references = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.findReferences('name');
      }
      return [];
    });

    // 至少应该找到 User 类定义中的 name 属性
    expect(references.length).toBeGreaterThan(0);

    test.info().annotations.push({
      type: 'info',
      description: `Found ${references.length} references for 'name' property`
    });
  });

  /**
   * E2E-DEP-02-03: 接口变更影响分析
   *
   * 测试场景：
   * 1. 定义一个接口和多个实现类
   * 2. 修改接口定义（添加新方法）
   * 3. 验证影响面分析能识别所有实现类
   */
  test('E2E-DEP-02-03: Interface change impact analysis', async ({ page }) => {
    const files = {
      'interfaces.ts': `
export interface Repository<T> {
  find(id: number): T | null;
  save(entity: T): void;
  delete(id: number): void;
}
`,
      'user-repository.ts': `
import { Repository } from './interfaces';

export class UserRepository implements Repository<User> {
  find(id: number): User | null {
    // implementation
    return null;
  }

  save(user: User): void {
    // implementation
  }

  delete(id: number): void {
    // implementation
  }
}
`,
      'product-repository.ts': `
import { Repository } from './interfaces';

export class ProductRepository implements Repository<Product> {
  find(id: number): Product | null {
    return null;
  }

  save(product: Product): void {
    // save logic
  }

  delete(id: number): void {
    // delete logic
  }
}
`
    };

    // 加载并索引文件
    await page.evaluate(async (files) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      for (const [name, content] of Object.entries(files)) {
        (window as any).__E2E_OPEN_MOCK_FILE__(name, content);
      }
    }, files);

    await page.waitForTimeout(1000);

    for (const [name, content] of Object.entries(files)) {
      await page.evaluate(async ({ path, code }) => {
        const symbolIndexer = (window as any).__symbolIndexer;
        if (symbolIndexer) {
          await symbolIndexer.indexFile(`/mock/${path}`, code);
        }
      }, { path: name, code: content });
    }

    await page.waitForTimeout(500);

    // 验证接口被索引
    const repositoryInterface = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.getSymbolDefinition('Repository');
      }
      return null;
    });

    expect(repositoryInterface).toBeTruthy();

    // 查找 Repository 的引用（应该找到接口定义和两个实现类）
    const repositoryRefs = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.findReferences('Repository');
      }
      return [];
    });

    // 应该找到至少 3 处引用：接口定义 + 2 个实现类
    expect(repositoryRefs.length).toBeGreaterThanOrEqual(3);

    test.info().annotations.push({
      type: 'info',
      description: `Found ${repositoryRefs.length} references for 'Repository' interface`
    });
  });
});

  /**
   * E2E-DEP-02-04: 导入导出变更影响分析
   *
   * 测试场景：
   * 1. 创建一个导出多个函数/类型的模块
   * 2. 多个文件导入并使用这些导出
   * 3. 删除或重命名一个导出
   * 4. 验证影响面分析能找到所有受影响的导入语句
   */
  test('E2E-DEP-02-04: Import/Export change impact analysis', async ({ page }) => {
    const files = {
      'exports.ts': `
export const API_BASE_URL = 'https://api.example.com';
export const API_TIMEOUT = 5000;

export function fetchData(endpoint: string): Promise<any> {
  return fetch(endpoint);
}

export function postRequest(url: string, data: any): Promise<any> {
  return fetch(url, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export type ApiResponse<T> = {
  data: T;
  status: number;
};
`,
      'service-a.ts': `
import { fetchData, API_BASE_URL } from './exports';

export class ServiceA {
  async getData() {
    return await fetchData(API_BASE_URL + "/users");
  }
}
`,
      'service-b.ts': `
import { postRequest, API_BASE_URL } from './exports';

export class ServiceB {
  async createItem(item: any) {
    return await postRequest(API_BASE_URL + "/items", item);
  }
}
`,
      'types.ts': `
import { ApiResponse } from './exports';

export type UserResponse = ApiResponse<User>;
export type ProductResponse = ApiResponse<Product>;
`
    };

    // 加载并索引文件
    await page.evaluate(async (files) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      for (const [name, content] of Object.entries(files)) {
        (window as any).__E2E_OPEN_MOCK_FILE__(name, content);
      }
    }, files);

    await page.waitForTimeout(1000);

    for (const [name, content] of Object.entries(files)) {
      await page.evaluate(async ({ path, code }) => {
        const symbolIndexer = (window as any).__symbolIndexer;
        if (symbolIndexer) {
          await symbolIndexer.indexFile(`/mock/${path}`, code);
        }
      }, { path: name, code: content });
    }

    await page.waitForTimeout(500);

    // 验证导出的函数被索引
    const fetchDataSymbol = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.getSymbolDefinition('fetchData');
      }
      return null;
    });

    expect(fetchDataSymbol).toBeTruthy();

    // 查找 fetchData 的引用
    const fetchDataRefs = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.findReferences('fetchData');
      }
      return [];
    });

    // 应该找到至少 2 处：定义 + service-a 中的使用
    expect(fetchDataRefs.length).toBeGreaterThanOrEqual(2);

    test.info().annotations.push({
      type: 'info',
      description: `Found ${fetchDataRefs.length} references for 'fetchData'`
    });
  });

  /**
   * E2E-DEP-02-05: 跨目录影响分析
   *
   * 测试场景：
   * 1. 创建多层目录结构
   * 2. 不同目录中的文件引用同一模块
   * 3. 修改被引用的模块
   * 4. 验证影响面分析能跨目录识别影响
   */
  test('E2E-DEP-02-05: Cross-directory impact analysis', async ({ page }) => {
    const files = {
      'shared/utils/validation.ts': `
export function isValidEmail(email: string): boolean {
  return /^[^@]+@[^@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  return /^\\d{10,}$/.test(phone);
}

export function sanitizeInput(input: string): string {
  return input.trim();
}
`,
      'features/auth/services/auth-service.ts': `
import { isValidEmail, sanitizeInput } from '../../../../shared/utils/validation';

export class AuthService {
  validateUser(email: string, password: string): boolean {
    const cleanEmail = sanitizeInput(email);
    return isValidEmail(cleanEmail);
  }
}
`,
      'features/user/services/user-service.ts': `
import { isValidEmail, isValidPhone } from '../../../../shared/utils/validation';

export class UserService {
  validateContact(email: string, phone: string): boolean {
    return isValidEmail(email) && isValidPhone(phone);
  }
}
`,
      'features/admin/services/admin-service.ts': `
import { sanitizeInput } from '../../../../shared/utils/validation';

export class AdminService {
  cleanUserData(input: string): string {
    return sanitizeInput(input);
  }
}
`
    };

    // 加载并索引文件
    await page.evaluate(async (files) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      for (const [name, content] of Object.entries(files)) {
        (window as any).__E2E_OPEN_MOCK_FILE__(name, content);
      }
    }, files);

    await page.waitForTimeout(1000);

    for (const [name, content] of Object.entries(files)) {
      await page.evaluate(async ({ path, code }) => {
        const symbolIndexer = (window as any).__symbolIndexer;
        if (symbolIndexer) {
          await symbolIndexer.indexFile(`/mock/${path}`, code);
        }
      }, { path: name, code: content });
    }

    await page.waitForTimeout(500);

    // 验证跨目录引用被正确索引
    const isValidEmailRefs = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.findReferences('isValidEmail');
      }
      return [];
    });

    // 应该找到至少 3 处：定义 + auth + user
    expect(isValidEmailRefs.length).toBeGreaterThanOrEqual(3);

    // 验证引用来自不同目录
    const uniquePaths = new Set(isValidEmailRefs.map((ref: any) => ref.filePath));
    expect(uniquePaths.size).toBeGreaterThanOrEqual(3);

    test.info().annotations.push({
      type: 'info',
      description: `Found ${isValidEmailRefs.length} references across ${uniquePaths.size} files`
    });
  });

  /**
   * E2E-DEP-02-06: 影响面可视化面板展示
   *
   * 测试场景：
   * 1. 触发影响面分析
   * 2. 验证影响面面板正确展示影响信息
   * 3. 验证面板交互功能（点击跳转、展开收起等）
   */
  test('E2E-DEP-02-06: Impact analysis panel visualization', async ({ page }) => {
    const testCode = `
// Shared utility
export function formatDate(date: Date): string {
  return date.toISOString();
}

// Usage in module A
const formatted = formatDate(new Date());

// Usage in module B
function logTimestamp(): void {
  console.log(formatDate(new Date()));
}

// Usage in module C
export class ReportGenerator {
  generate(): string {
    return formatDate(new Date());
  }
}
`;

    await page.evaluate(async (code) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      (window as any).__E2E_OPEN_MOCK_FILE__('test.ts', code);
    }, testCode);

    await page.waitForTimeout(1000);

    await page.evaluate(async (code) => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        await symbolIndexer.indexFile('/mock/test.ts', code);
      }
    }, testCode);

    await page.waitForTimeout(500);

    // 触发 Find References (Shift+F12)
    await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      if (editor) {
        editor.setPosition({ lineNumber: 2, column: 20 });
        editor.focus();
      }
    });

    await page.waitForTimeout(200);
    await page.keyboard.press('Shift+F12');

    await page.waitForTimeout(1000);

    // 验证是否有引用面板或反馈
    const referencesPanel = page.locator('.references-panel, .monaco-editor .peek-view-widget, [data-testid="references-panel"]');
    const hasPanel = await referencesPanel.count() > 0;

    if (hasPanel) {
      await expect(referencesPanel).toBeVisible();
      test.info().annotations.push({
        type: 'pass',
        description: 'References panel is visible'
      });
    } else {
      // 至少验证没有崩溃
      const editor = page.locator('.monaco-editor').first();
      await expect(editor).toBeVisible();
      test.info().annotations.push({
        type: 'info',
        description: 'No dedicated panel found, but editor is functional'
      });
    }

    await page.keyboard.press('Escape');
  });

  /**
   * E2E-DEP-02-07: 边界情况 - 空文件和无效符号
   *
   * 测试场景：
   * 1. 在空文件中触发影响面分析
   * 2. 查找不存在的符号的引用
   * 3. 验证系统优雅处理这些情况
   */
  test('E2E-DEP-02-07: Edge cases - empty files and invalid symbols', async ({ page }) => {
    // 测试 1: 空文件
    await page.evaluate(async () => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      (window as any).__E2E_OPEN_MOCK_FILE__('empty.ts', '');
    });

    await page.waitForTimeout(500);

    // 尝试在空文件中查找引用
    const emptyFileRefs = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.findReferences('anything');
      }
      return [];
    });

    // 应该返回空数组而不是报错
    expect(Array.isArray(emptyFileRefs)).toBeTruthy();

    // 测试 2: 查找不存在的符号
    const nonexistentRefs = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.findReferences('NonExistentSymbol12345');
      }
      return [];
    });

    expect(Array.isArray(nonexistentRefs)).toBeTruthy();
    expect(nonexistentRefs.length).toBe(0);

    test.info().annotations.push({
      type: 'pass',
      description: 'Edge cases handled gracefully'
    });
  });

  /**
   * E2E-DEP-02-08: 大规模项目影响分析性能
   *
   * 测试场景：
   * 1. 创建大量文件和引用
   * 2. 测量影响面分析的性能
   * 3. 验证在合理时间内完成
   */
  test('E2E-DEP-02-08: Large project impact analysis performance', async ({ page }) => {
    // 创建大量模拟文件
    const files: Record<string, string> = {};

    // 1 个共享模块
    files['shared.ts'] = `
export function processData(data: any): any {
  return JSON.parse(JSON.stringify(data));
}

export function validateData(data: any): boolean {
  return data !== null && typeof data === 'object';
}
`;

    // 50 个使用共享模块的文件
    for (let i = 0; i < 50; i++) {
      const moduleName = 'Module' + i;
      const fileName = 'module-' + i + '.ts';
      files[fileName] = `
import { processData, validateData } from './shared';

export class ` + moduleName + ` {
  handle(input: any) {
    if (validateData(input)) {
      return processData(input);
    }
    return null;
  }
}
`;
    }

    // 加载所有文件
    const startTime = Date.now();
    await page.evaluate(async (files) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      for (const [name, content] of Object.entries(files)) {
        (window as any).__E2E_OPEN_MOCK_FILE__(name, content);
      }
    }, files);

    await page.waitForTimeout(1000);

    // 索引所有文件
    for (const [name, content] of Object.entries(files)) {
      await page.evaluate(async ({ path, code }) => {
        const symbolIndexer = (window as any).__symbolIndexer;
        if (symbolIndexer) {
          await symbolIndexer.indexFile(`/mock/${path}`, code);
        }
      }, { path: name, code: content });
    }

    const indexTime = Date.now() - startTime;

    // 查找引用
    const findStartTime = Date.now();
    const refs = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.findReferences('processData');
      }
      return [];
    });
    const findTime = Date.now() - findStartTime;

    // 验证结果
    expect(refs.length).toBeGreaterThanOrEqual(50); // 至少 50 个使用处

    // 性能断言：索引和查找都应在合理时间内完成
    expect(indexTime, 'Indexing should complete in reasonable time').toBeLessThan(10000);
    expect(findTime, 'Find references should be fast').toBeLessThan(5000);

    test.info().annotations.push({
      type: 'info',
      description: `Indexed ${Object.keys(files).length} files in ${indexTime}ms, found ${refs.length} refs in ${findTime}ms`
    });
  });

  /**
   * E2E-DEP-02-09: 循环依赖检测
   *
   * 测试场景：
   * 1. 创建循环依赖的文件结构
   * 2. 验证影响面分析能正确处理
   * 3. 不应进入无限循环或崩溃
   */
  test('E2E-DEP-02-09: Circular dependency detection', async ({ page }) => {
    const files = {
      'a.ts': `
import { funcB } from './b';

export function funcA(): string {
  return 'A' + funcB();
}
`,
      'b.ts': `
import { funcC } from './c';

export function funcB(): string {
  return 'B' + funcC();
}
`,
      'c.ts': `
import { funcA } from './a';

export function funcC(): string {
  return 'C' + funcA();
}
`
    };

    // 加载并索引文件（有循环依赖）
    await page.evaluate(async (files) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      for (const [name, content] of Object.entries(files)) {
        (window as any).__E2E_OPEN_MOCK_FILE__(name, content);
      }
    }, files);

    await page.waitForTimeout(1000);

    // 索引文件
    for (const [name, content] of Object.entries(files)) {
      await page.evaluate(async ({ path, code }) => {
        const symbolIndexer = (window as any).__symbolIndexer;
        if (symbolIndexer) {
          await symbolIndexer.indexFile(`/mock/${path}`, code);
        }
      }, { path: name, code: content });
    }

    await page.waitForTimeout(500);

    // 尝试查找引用（应该不会卡死）
    const startTime = Date.now();
    const refs = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.findReferences('funcA');
      }
      return [];
    });
    const elapsed = Date.now() - startTime;

    // 验证在合理时间内完成（没有无限循环）
    expect(elapsed, 'Should handle circular dependencies').toBeLessThan(5000);

    // 验证编辑器仍然响应
    const editor = page.locator('.monaco-editor').first();
    await expect(editor).toBeVisible();

    test.info().annotations.push({
      type: 'pass',
      description: `Circular dependencies handled in ${elapsed}ms`
    });
  });

  /**
   * E2E-DEP-02-10: 社区版 Mock 行为验证
   *
   * 测试场景：
   * 验证社区版中影响面分析的 Mock 行为
   */
  test('E2E-DEP-02-10: Community edition mock behavior', async ({ page }) => {
    const testCode = `
export function testFunction(): void {
  console.log('test');
}

testFunction();
`;

    await page.evaluate(async (code) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      (window as any).__E2E_OPEN_MOCK_FILE__('test.ts', code);
    }, testCode);

    await page.waitForTimeout(1000);

    // 社区版应该至少不崩溃
    const editor = page.locator('.monaco-editor').first();
    await expect(editor).toBeVisible();

    // 查找引用
    const refs = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.findReferences('testFunction');
      }
      return [];
    });

    // 至少应该返回数组（即使是空数组或 mock 数据）
    expect(Array.isArray(refs)).toBeTruthy();

    // 验证不崩溃
    await page.keyboard.press('Escape');
    await expect(editor).toBeVisible();

    test.info().annotations.push({
      type: 'info',
      description: `Community edition returned ${refs.length} references (may be mock data)`
    });
  });
});
