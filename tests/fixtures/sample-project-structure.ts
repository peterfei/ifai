/**
 * ============================================
 * 测试数据基线 - 目录结构样本
 * ============================================
 *
 * 用途: 为工具调用批处理优化提供标准化的测试数据
 * 版本: v0.3.5 基线
 */

/**
 * 标准Java项目结构（Maven/Gradle）
 * 用于测试多层目录递归探索
 */
export const sampleProjectStructure = {
  name: 'oa-app',
  type: 'directory',
  path: 'oa-app',
  children: [
    {
      name: 'src',
      type: 'directory',
      path: 'oa-app/src',
      children: [
        {
          name: 'main',
          type: 'directory',
          path: 'oa-app/src/main',
          children: [
            {
              name: 'java',
              type: 'directory',
              path: 'oa-app/src/main/java',
              children: [
                {
                  name: 'com',
                  type: 'directory',
                  path: 'oa-app/src/main/java/com',
                  children: [
                    {
                      name: 'example',
                      type: 'directory',
                      path: 'oa-app/src/main/java/com/example',
                      children: [
                        {
                          name: 'oa',
                          type: 'directory',
                          path: 'oa-app/src/main/java/com/example/oa',
                          children: [
                            {
                              name: 'controller',
                              type: 'directory',
                              path: 'oa-app/src/main/java/com/example/oa/controller',
                              children: [
                                { name: 'UserController.java', type: 'file', size: 2500, lastModified: '2026-01-15' },
                                { name: 'AuthController.java', type: 'file', size: 1800, lastModified: '2026-01-14' },
                                { name: 'ProcessController.java', type: 'file', size: 3200, lastModified: '2026-01-16' },
                                { name: 'DocumentController.java', type: 'file', size: 2100, lastModified: '2026-01-13' },
                                { name: 'DepartmentController.java', type: 'file', size: 1900, lastModified: '2026-01-12' },
                              ],
                            },
                            {
                              name: 'service',
                              type: 'directory',
                              path: 'oa-app/src/main/java/com/example/oa/service',
                              children: [
                                { name: 'UserService.java', type: 'file', size: 3200, lastModified: '2026-01-15' },
                                { name: 'AuthService.java', type: 'file', size: 2100, lastModified: '2026-01-14' },
                                { name: 'ProcessService.java', type: 'file', size: 4500, lastModified: '2026-01-16' },
                                { name: 'DocumentService.java', type: 'file', size: 3800, lastModified: '2026-01-13' },
                                { name: 'DepartmentService.java', type: 'file', size: 2900, lastModified: '2026-01-12' },
                                { name: 'NotificationService.java', type: 'file', size: 1800, lastModified: '2026-01-11' },
                                { name: 'WorkflowService.java', type: 'file', size: 5200, lastModified: '2026-01-10' },
                                { name: 'ReportService.java', type: 'file', size: 3400, lastModified: '2026-01-09' },
                              ],
                            },
                            {
                              name: 'repository',
                              type: 'directory',
                              path: 'oa-app/src/main/java/com/example/oa/repository',
                              children: [
                                { name: 'UserRepository.java', type: 'file', size: 1200, lastModified: '2026-01-15' },
                                { name: 'ProcessRepository.java', type: 'file', size: 1500, lastModified: '2026-01-16' },
                                { name: 'DocumentRepository.java', type: 'file', size: 1300, lastModified: '2026-01-13' },
                                { name: 'DepartmentRepository.java', type: 'file', size: 1100, lastModified: '2026-01-12' },
                                { name: 'WorkflowRepository.java', type: 'file', size: 1800, lastModified: '2026-01-10' },
                                { name: 'NotificationRepository.java', type: 'file', size: 900, lastModified: '2026-01-11' },
                              ],
                            },
                            {
                              name: 'entity',
                              type: 'directory',
                              path: 'oa-app/src/main/java/com/example/oa/entity',
                              children: [
                                { name: 'User.java', type: 'file', size: 2200, lastModified: '2026-01-15' },
                                { name: 'Process.java', type: 'file', size: 2800, lastModified: '2026-01-16' },
                                { name: 'Document.java', type: 'file', size: 1900, lastModified: '2026-01-13' },
                                { name: 'Department.java', type: 'file', size: 1600, lastModified: '2026-01-12' },
                                { name: 'Workflow.java', type: 'file', size: 2400, lastModified: '2026-01-10' },
                                { name: 'Notification.java', type: 'file', size: 1400, lastModified: '2026-01-11' },
                                { name: 'Report.java', type: 'file', size: 2100, lastModified: '2026-01-09' },
                                { name: 'Approval.java', type: 'file', size: 1700, lastModified: '2026-01-08' },
                              ],
                            },
                            {
                              name: 'config',
                              type: 'directory',
                              path: 'oa-app/src/main/java/com/example/oa/config',
                              children: [
                                { name: 'SecurityConfig.java', type: 'file', size: 1800, lastModified: '2026-01-14' },
                                { name: 'WebConfig.java', type: 'file', size: 1200, lastModified: '2026-01-13' },
                                { name: 'SwaggerConfig.java', type: 'file', size: 900, lastModified: '2026-01-12' },
                                { name: 'CacheConfig.java', type: 'file', size: 1100, lastModified: '2026-01-11' },
                              ],
                            },
                            { name: 'OaApplication.java', type: 'file', size: 1200, lastModified: '2026-01-15' },
                            { name: 'package-info.java', type: 'file', size: 300, lastModified: '2026-01-15' },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              name: 'resources',
              type: 'directory',
              path: 'oa-app/src/main/resources',
              children: [
                { name: 'application.yml', type: 'file', size: 800, lastModified: '2026-01-15' },
                { name: 'application-dev.yml', type: 'file', size: 600, lastModified: '2026-01-14' },
                { name: 'application-prod.yml', type: 'file', size: 500, lastModified: '2026-01-13' },
                {
                  name: 'mapper',
                  type: 'directory',
                  path: 'oa-app/src/main/resources/mapper',
                  children: [
                    { name: 'UserMapper.xml', type: 'file', size: 1200, lastModified: '2026-01-15' },
                    { name: 'ProcessMapper.xml', type: 'file', size: 1500, lastModified: '2026-01-16' },
                  ],
                },
                {
                  name: 'static',
                  type: 'directory',
                  path: 'oa-app/src/main/resources/static',
                  children: [],
                },
                {
                  name: 'templates',
                  type: 'directory',
                  path: 'oa-app/src/main/resources/templates',
                  children: [
                    { name: 'email-template.html', type: 'file', size: 2100, lastModified: '2026-01-12' },
                    { name: 'report-template.html', type: 'file', size: 1800, lastModified: '2026-01-11' },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: 'test',
          type: 'directory',
          path: 'oa-app/src/test',
          children: [
            {
              name: 'java',
              type: 'directory',
              path: 'oa-app/src/test/java',
              children: [
                {
                  name: 'com',
                  type: 'directory',
                  path: 'oa-app/src/test/java/com',
                  children: [
                    {
                      name: 'example',
                      type: 'directory',
                      path: 'oa-app/src/test/java/com/example',
                      children: [
                        {
                          name: 'oa',
                          type: 'directory',
                          path: 'oa-app/src/test/java/com/example/oa',
                          children: [
                            { name: 'OaApplicationTests.java', type: 'file', size: 800, lastModified: '2026-01-15' },
                            { name: 'UserServiceTest.java', type: 'file', size: 2200, lastModified: '2026-01-15' },
                            { name: 'ProcessServiceTest.java', type: 'file', size: 2800, lastModified: '2026-01-16' },
                            {
                              name: 'integration',
                              type: 'directory',
                              path: 'oa-app/src/test/java/com/example/oa/integration',
                              children: [
                                { name: 'AuthIntegrationTest.java', type: 'file', size: 3200, lastModified: '2026-01-14' },
                                { name: 'WorkflowIntegrationTest.java', type: 'file', size: 4500, lastModified: '2026-01-13' },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              name: 'resources',
              type: 'directory',
              path: 'oa-app/src/test/resources',
              children: [
                { name: 'application-test.yml', type: 'file', size: 400, lastModified: '2026-01-15' },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'docs',
      type: 'directory',
      path: 'oa-app/docs',
      children: [
        { name: 'api-guide.md', type: 'file', size: 4500, lastModified: '2026-01-10' },
        { name: 'deployment.md', type: 'file', size: 3200, lastModified: '2026-01-09' },
        { name: 'architecture.md', type: 'file', size: 2800, lastModified: '2026-01-08' },
      ],
    },
    {
      name: 'scripts',
      type: 'directory',
      path: 'oa-app/scripts',
      children: [
        { name: 'build.sh', type: 'file', size: 800, lastModified: '2026-01-05' },
        { name: 'deploy.sh', type: 'file', size: 1200, lastModified: '2026-01-04' },
        { name: 'db-migrate.sh', type: 'file', size: 600, lastModified: '2026-01-03' },
      ],
    },
    { name: 'pom.xml', type: 'file', size: 3500, lastModified: '2026-01-15' },
    { name: 'README.md', type: 'file', size: 2200, lastModified: '2026-01-15' },
    { name: '.gitignore', type: 'file', size: 300, lastModified: '2026-01-01' },
    { name: 'Dockerfile', type: 'file', size: 800, lastModified: '2026-01-08' },
    { name: 'docker-compose.yml', type: 'file', size: 1200, lastModified: '2026-01-07' },
    { name: 'LICENSE', type: 'file', size: 1100, lastModified: '2026-01-01' },
  ],
};

/**
 * 目录结构统计信息
 */
export const structureStats = {
  totalDirectories: 28,
  totalFiles: 58,
  maxDepth: 9,
  totalSize: 156800, // bytes
  javaFiles: 42,
  resourceFiles: 12,
  configFiles: 4,
};

/**
 * 模拟4次串行list_dir调用的响应数据
 * 用于对比优化前后的性能差异
 */
export const mockSerialListDir = [
  {
    path: 'oa-app',
    duration: 320,
    entries: 6,
    directories: 3,
    files: 3,
  },
  {
    path: 'oa-app/src',
    duration: 280,
    entries: 2,
    directories: 2,
    files: 0,
  },
  {
    path: 'oa-app/src/main',
    duration: 350,
    entries: 2,
    directories: 2,
    files: 0,
  },
  {
    path: 'oa-app/src/main/java',
    duration: 410,
    entries: 1,
    directories: 1,
    files: 0,
  },
];

/**
 * 模拟1次批量调用
 * 用于展示优化后的效果
 */
export const mockBatchListDir = {
  duration: 680,
  tree: sampleProjectStructure,
  totalDirs: 28,
  totalFiles: 58,
  entriesScanned: 86,
  maxDepth: 9,
};

/**
 * Node.js项目结构（用于对比测试）
 */
export const nodeProjectStructure = {
  name: 'frontend',
  type: 'directory',
  path: 'frontend',
  children: [
    {
      name: 'src',
      type: 'directory',
      path: 'frontend/src',
      children: [
        {
          name: 'components',
          type: 'directory',
          path: 'frontend/src/components',
          children: [
            {
              name: 'common',
              type: 'directory',
              path: 'frontend/src/components/common',
              children: [
                { name: 'Button.tsx', type: 'file', size: 1800 },
                { name: 'Input.tsx', type: 'file', size: 1500 },
                { name: 'Modal.tsx', type: 'file', size: 2200 },
              ],
            },
            {
              name: 'layout',
              type: 'directory',
              path: 'frontend/src/components/layout',
              children: [
                { name: 'Header.tsx', type: 'file', size: 2800 },
                { name: 'Sidebar.tsx', type: 'file', size: 3200 },
                { name: 'Footer.tsx', type: 'file', size: 1200 },
              ],
            },
            {
              name: 'auth',
              type: 'directory',
              path: 'frontend/src/components/auth',
              children: [
                { name: 'LoginForm.tsx', type: 'file', size: 3500 },
                { name: 'RegisterForm.tsx', type: 'file', size: 3800 },
                { name: 'AuthGuard.tsx', type: 'file', size: 2100 },
              ],
            },
          ],
        },
        {
          name: 'pages',
          type: 'directory',
          path: 'frontend/src/pages',
          children: [
            { name: 'Home.tsx', type: 'file', size: 2500 },
            { name: 'Dashboard.tsx', type: 'file', size: 4200 },
            { name: 'Profile.tsx', type: 'file', size: 3200 },
            { name: 'Settings.tsx', type: 'file', size: 3800 },
          ],
        },
        {
          name: 'hooks',
          type: 'directory',
          path: 'frontend/src/hooks',
          children: [
            { name: 'useAuth.ts', type: 'file', size: 1200 },
            { name: 'useApi.ts', type: 'file', size: 1800 },
            { name: 'useLocalStorage.ts', type: 'file', size: 900 },
          ],
        },
        {
          name: 'utils',
          type: 'directory',
          path: 'frontend/src/utils',
          children: [
            { name: 'api.ts', type: 'file', size: 2200 },
            { name: 'helpers.ts', type: 'file', size: 1500 },
            { name: 'constants.ts', type: 'file', size: 600 },
          ],
        },
        {
          name: 'types',
          type: 'directory',
          path: 'frontend/src/types',
          children: [
            { name: 'index.ts', type: 'file', size: 1800 },
            { name: 'user.ts', type: 'file', size: 900 },
            { name: 'api.ts', type: 'file', size: 1200 },
          ],
        },
        { name: 'App.tsx', type: 'file', size: 2800 },
        { name: 'main.tsx', type: 'file', size: 600 },
        { name: 'index.css', type: 'file', size: 2500 },
      ],
    },
    { name: 'package.json', type: 'file', size: 1800 },
    { name: 'tsconfig.json', type: 'file', size: 900 },
    { name: 'vite.config.ts', type: 'file', size: 700 },
    { name: 'tailwind.config.js', type: 'file', size: 1200 },
    { name: 'index.html', type: 'file', size: 500 },
  ],
};

/**
 * 空目录结构（用于边界情况测试）
 */
export const emptyDirectoryStructure = {
  name: 'empty-dir',
  type: 'directory',
  path: 'empty-dir',
  children: [],
};

/**
 * 超深目录结构（用于边界情况测试）
 */
export const deepDirectoryStructure = {
  name: 'level-0',
  type: 'directory',
  path: 'level-0',
  children: [
    {
      name: 'level-1',
      type: 'directory',
      path: 'level-0/level-1',
      children: [
        {
          name: 'level-2',
          type: 'directory',
          path: 'level-0/level-1/level-2',
          children: [
            {
              name: 'level-3',
              type: 'directory',
              path: 'level-0/level-1/level-2/level-3',
              children: [
                {
                  name: 'level-4',
                  type: 'directory',
                  path: 'level-0/level-1/level-2/level-3/level-4',
                  children: [
                    {
                      name: 'level-5',
                      type: 'directory',
                      path: 'level-0/level-1/level-2/level-3/level-4/level-5',
                      children: [
                        {
                          name: 'level-6',
                          type: 'directory',
                          path: 'level-0/level-1/level-2/level-3/level-4/level-5/level-6',
                          children: [
                            {
                              name: 'level-7',
                              type: 'directory',
                              path: 'level-0/level-1/level-2/level-3/level-4/level-5/level-6/level-7',
                              children: [
                                {
                                  name: 'level-8',
                                  type: 'directory',
                                  path: 'level-0/level-1/level-2/level-3/level-4/level-5/level-6/level-7/level-8',
                                  children: [
                                    { name: 'deep-file.txt', type: 'file', size: 100 },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/**
 * 超多文件目录（用于边界情况测试）
 */
export const manyFilesStructure = {
  name: 'large-dir',
  type: 'directory',
  path: 'large-dir',
  children: Array.from({ length: 150 }, (_, i) => ({
    name: `file-${String(i + 1).padStart(3, '0')}.txt`,
    type: 'file',
    size: 1000 + i * 10,
  })),
};

/**
 * 性能测试数据
 */
export const performanceTestData = {
  // 基线：v0.3.5 串行执行
  baseline: {
    version: '0.3.5',
    serialCalls: [
      { path: 'oa-app', duration: 320 },
      { path: 'oa-app/src', duration: 280 },
      { path: 'oa-app/src/main', duration: 350 },
      { path: 'oa-app/src/main/java', duration: 410 },
      { path: 'oa-app/src/main/java/com', duration: 380 },
      { path: 'oa-app/src/main/java/com/example', duration: 420 },
    ],
    totalDuration: 2560,
    apiRoundTrips: 6,
    verticalSpacePx: 1292,
    scrollCount: 4,
  },
  // 目标：v0.3.6 批量执行
  target: {
    version: '0.3.12',
    batchCall: {
      duration: 680,
      paths: [
        'oa-app',
        'oa-app/src',
        'oa-app/src/main',
        'oa-app/src/main/java',
        'oa-app/src/main/java/com',
        'oa-app/src/main/java/com/example',
      ],
    },
    totalDuration: 680,
    apiRoundTrips: 1,
    verticalSpacePx: 300,
    scrollCount: 0,
  },
};

/**
 * E2E测试期望结果
 */
export const expectedTestResults = {
  BL001: {
    // 单层目录列表
    cardCount: 1,
    minCardHeight: 150,
    shouldContainPath: 'oa-app',
  },
  BL002: {
    // 多层目录递归
    minCardCount: 3,
    maxCardCount: 6,
    minContainerHeight: 800,
  },
  BL003: {
    // 待审批状态
    buttons: ['approve', 'reject'],
    shouldShowPendingBadge: true,
  },
  BL006: {
    // 响应时间
    minDuration: 1000,
    maxDuration: 10000,
    iterations: 3,
  },
};

// 导出所有数据
export default {
  sampleProjectStructure,
  structureStats,
  mockSerialListDir,
  mockBatchListDir,
  nodeProjectStructure,
  emptyDirectoryStructure,
  deepDirectoryStructure,
  manyFilesStructure,
  performanceTestData,
  expectedTestResults,
};
