/**
 * Agent 文件读取 UX 测试 - 测试数据定义
 *
 * 用于模拟不同规模的项目和文件场景
 */

/**
 * 小项目测试数据（< 10 个文件）
 */
export const SMALL_PROJECT = {
  name: 'small-project',
  path: '/Users/mac/mock-project/small',
  files: [
    { path: 'src/main.ts', size: 1024, type: 'typescript', content: 'console.log("hello");' },
    { path: 'src/App.tsx', size: 2048, type: 'typescript', content: 'export default function App() { return <div>Hello</div>; }' },
    { path: 'src/index.css', size: 512, type: 'css', content: 'body { margin: 0; }' },
    { path: 'package.json', size: 768, type: 'json', content: '{"name": "small-project"}' },
    { path: 'README.md', size: 256, type: 'markdown', content: '# Small Project' },
    { path: '.gitignore', size: 128, type: 'text', content: 'node_modules' },
    { path: 'tsconfig.json', size: 512, type: 'json', content: '{}' },
  ],
  expectedApprovals: 7,
  expectedTime: 30, // 秒
};

/**
 * 中等项目测试数据（10-50 个文件）
 */
export const MEDIUM_PROJECT = {
  name: 'medium-project',
  path: '/Users/mac/mock-project/medium',
  files: [
    // 核心文件（5个）
    { path: 'src/main.ts', size: 2048, type: 'typescript', content: '// main entry' },
    { path: 'src/App.tsx', size: 4096, type: 'typescript', content: '// app component' },
    { path: 'src/index.tsx', size: 1024, type: 'typescript', content: '// index' },
    { path: 'package.json', size: 1536, type: 'json', content: '{"name": "medium-project"}' },
    { path: 'tsconfig.json', size: 1024, type: 'json', content: '{}' },

    // 组件文件（10个）
    { path: 'src/components/Header.tsx', size: 2048, type: 'typescript', content: '// Header' },
    { path: 'src/components/Footer.tsx', size: 1536, type: 'typescript', content: '// Footer' },
    { path: 'src/components/Sidebar.tsx', size: 2560, type: 'typescript', content: '// Sidebar' },
    { path: 'src/components/Button.tsx', size: 1024, type: 'typescript', content: '// Button' },
    { path: 'src/components/Input.tsx', size: 1024, type: 'typescript', content: '// Input' },
    { path: 'src/components/Modal.tsx', size: 2048, type: 'typescript', content: '// Modal' },
    { path: 'src/components/Card.tsx', size: 1536, type: 'typescript', content: '// Card' },
    { path: 'src/components/List.tsx', size: 1280, type: 'typescript', content: '// List' },
    { path: 'src/components/Avatar.tsx', size: 1024, type: 'typescript', content: '// Avatar' },
    { path: 'src/components/Badge.tsx', size: 768, type: 'typescript', content: '// Badge' },

    // 工具文件（8个）
    { path: 'src/utils/helpers.ts', size: 3072, type: 'typescript', content: '// helpers' },
    { path: 'src/utils/format.ts', size: 2048, type: 'typescript', content: '// format' },
    { path: 'src/utils/validate.ts', size: 2048, type: 'typescript', content: '// validate' },
    { path: 'src/utils/api.ts', size: 2560, type: 'typescript', content: '// api' },
    { path: 'src/utils/storage.ts', size: 1536, type: 'typescript', content: '// storage' },
    { path: 'src/utils/date.ts', size: 1024, type: 'typescript', content: '// date' },
    { path: 'src/utils/string.ts', size: 1024, type: 'typescript', content: '// string' },
    { path: 'src/utils/number.ts', size: 1024, type: 'typescript', content: '// number' },

    // 页面文件（5个）
    { path: 'src/pages/Home.tsx', size: 2048, type: 'typescript', content: '// Home' },
    { path: 'src/pages/About.tsx', size: 1536, type: 'typescript', content: '// About' },
    { path: 'src/pages/Contact.tsx', size: 1536, type: 'typescript', content: '// Contact' },
    { path: 'src/pages/Settings.tsx', size: 2560, type: 'typescript', content: '// Settings' },
    { path: 'src/pages/Profile.tsx', size: 2048, type: 'typescript', content: '// Profile' },

    // 样式文件（5个）
    { path: 'src/styles/main.css', size: 2048, type: 'css', content: '/* main */' },
    { path: 'src/styles/theme.css', size: 1536, type: 'css', content: '/* theme */' },
    { path: 'src/styles/components.css', size: 3072, type: 'css', content: '/* components */' },
    { path: 'src/styles/pages.css', size: 2048, type: 'css', content: '/* pages */' },
    { path: 'src/styles/utilities.css', size: 1024, type: 'css', content: '/* utilities */' },
  ],
  expectedApprovals: 33,
  expectedTime: 120, // 秒
};

/**
 * 大项目测试数据（50+ 个文件）
 */
export const LARGE_PROJECT = {
  name: 'large-project',
  path: '/Users/mac/mock-project/large',
  files: (() => {
    const files = [];

    // 核心文件（10个）
    files.push(
      { path: 'src/main.ts', size: 3072, type: 'typescript', content: '// main' },
      { path: 'src/App.tsx', size: 5120, type: 'typescript', content: '// App' },
      { path: 'src/index.tsx', size: 2048, type: 'typescript', content: '// index' },
      { path: 'package.json', size: 2048, type: 'json', content: '{}' },
      { path: 'tsconfig.json', size: 1536, type: 'json', content: '{}' },
      { path: 'vite.config.ts', size: 1536, type: 'typescript', content: '// vite' },
      { path: '.env.example', size: 512, type: 'text', content: 'API_KEY=xxx' },
      { path: '.gitignore', size: 256, type: 'text', content: 'node_modules' },
      { path: 'README.md', size: 2048, type: 'markdown', content: '# README' },
      { path: 'LICENSE', size: 1024, type: 'text', content: 'MIT' }
    );

    // 组件文件（30个）
    const componentNames = [
      'Header', 'Footer', 'Sidebar', 'Nav', 'Menu', 'Button', 'Input', 'Textarea',
      'Select', 'Checkbox', 'Radio', 'Switch', 'Slider', 'DatePicker', 'TimePicker',
      'Modal', 'Dialog', 'Popover', 'Tooltip', 'Dropdown', 'Accordion', 'Tabs',
      'Card', 'List', 'Table', 'Pagination', 'Breadcrumb', 'Avatar', 'Badge',
      'Progress', 'Spinner', 'Skeleton'
    ];
    componentNames.forEach((name, i) => {
      files.push({
        path: `src/components/${name}.tsx`,
        size: 2048 + (i * 100),
        type: 'typescript',
        content: `// ${name} component`
      });
    });

    // 工具文件（15个）
    const utilNames = [
      'helpers', 'format', 'validate', 'api', 'storage', 'date', 'string',
      'number', 'array', 'object', 'async', 'dom', 'event', 'crypto', 'logger'
    ];
    utilNames.forEach((name, i) => {
      files.push({
        path: `src/utils/${name}.ts`,
        size: 2560 + (i * 150),
        type: 'typescript',
        content: `// ${name} utility`
      });
    });

    // 页面文件（20个）
    const pageNames = [
      'Home', 'About', 'Contact', 'Settings', 'Profile', 'Dashboard', 'Analytics',
      'Reports', 'Users', 'Roles', 'Permissions', 'Audit', 'Logs', 'Activity',
      'Notifications', 'Messages', 'Calendar', 'Tasks', 'Projects', 'Documents'
    ];
    pageNames.forEach((name, i) => {
      files.push({
        path: `src/pages/${name}.tsx`,
        size: 3072 + (i * 200),
        type: 'typescript',
        content: `// ${name} page`
      });
    });

    // 样式文件（10个）
    const styleNames = [
      'main', 'theme', 'variables', 'mixins', 'components', 'pages',
      'utilities', 'animations', 'print', 'responsive'
    ];
    styleNames.forEach((name, i) => {
      files.push({
        path: `src/styles/${name}.css`,
        size: 2048 + (i * 100),
        type: 'css',
        content: `/* ${name} */`
      });
    });

    return files;
  })(),
  expectedApprovals: 85,
  expectedTime: 300, // 秒
};

/**
 * 边界场景测试数据
 */
export const EDGE_CASE_FILES = {
  empty: { path: 'empty.txt', size: 0, type: 'text', content: '' },
  large: { path: 'large.json', size: 5 * 1024 * 1024, type: 'json', content: '{}' },
  binary: { path: 'image.png', size: 102400, type: 'binary', content: '[binary data]' },
  specialName: { path: '文件名称测试.ts', size: 1024, type: 'typescript', content: '// 测试' },
  deepNested: { path: 'a/b/c/d/e/f/g/file.ts', size: 1024, type: 'typescript', content: '// deep' },
};

/**
 * 敏感文件测试数据
 */
export const SENSITIVE_FILES = [
  { path: '.env', size: 256, type: 'text', content: 'API_KEY=secret\nDB_PASSWORD=secret', isSensitive: true },
  { path: '.env.production', size: 256, type: 'text', content: 'PROD_API_KEY=secret', isSensitive: true },
  { path: 'config/secrets.json', size: 512, type: 'json', content: '{"key": "secret"}', isSensitive: true },
  { path: 'credentials.json', size: 512, type: 'json', content: '{"token": "xxx"}', isSensitive: true },
];

/**
 * 测试项目配置
 */
export const TEST_PROJECTS = {
  small: SMALL_PROJECT,
  medium: MEDIUM_PROJECT,
  large: LARGE_PROJECT,
};

/**
 * 用户提示词（用于触发 Agent 文件读取）
 */
export const USER_PROMPTS = {
  readSingleFile: '请读取 package.json 文件',
  readMultipleFiles: '请读取所有 .tsx 文件',
  refactorCode: '请重构 src/components 目录下的所有组件，将样式提取到单独的文件',
  analyzeProject: '请分析整个项目的结构，给出优化建议',
  fixBug: '请检查项目中所有的 TypeScript 类型错误',
  addFeature: '请为项目添加用户认证功能，包括登录、注册和权限管理',
};

/**
 * 性能指标阈值
 */
export const PERFORMANCE_THRESHOLDS = {
  small: {
    maxApprovalTime: 30, // 秒
    maxApprovalCount: 10,
    maxClickCount: 20,
  },
  medium: {
    maxApprovalTime: 120, // 秒
    maxApprovalCount: 50,
    maxClickCount: 100,
  },
  large: {
    maxApprovalTime: 300, // 秒
    maxApprovalCount: 100,
    maxClickCount: 200,
  },
};
