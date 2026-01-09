/**
 * 扩展的E2E测试数据生成器
 * 提供更复杂的文件结构、多语言代码示例和真实场景数据
 *
 * 分成多个模块避免文件过大
 */

// ========== 模块 1: 多语言代码示例 ==========

/**
 * 多语言代码示例集合
 */
export const multiLanguageCodeExamples = {
  // JavaScript/TypeScript
  typescript: {
    reactComponent: `import React, { useState, useEffect } from 'react';

interface Props {
  title: string;
  onAction?: () => void;
}

export const MyComponent: React.FC<Props> = ({ title, onAction }) => {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch data on mount
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/data');
      const data = await response.json();
      setCount(data.length);
    } catch (error) {
      console.error('Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="component">
      <h1>{title}</h1>
      <p>Count: {count}</p>
      {loading && <div>Loading...</div>}
      <button onClick={onAction}>Action</button>
    </div>
  );
};`,

    nodejsServer: `const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.get('/api/users', async (req, res) => {
  try {
    const users = await db.users.findAll();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { name, email } = req.body;
  try {
    const user = await db.users.create({ name, email });
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`,
  },

  // Python
  python: {
    flaskApp: `from flask import Flask, jsonify, request
from functools import wraps
import jwt

app = Flask(__name__)

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Missing token'}), 401
        try:
            data = jwt.decode(token, 'SECRET', algorithms=['HS256'])
        except:
            return jsonify({'error': 'Invalid token'}), 401
        return f(*args, **kwargs)
    return decorated

@app.route('/api/data', methods=['GET'])
@require_auth
def get_data():
    data = {
        'users': [
            {'id': 1, 'name': 'Alice', 'role': 'admin'},
            {'id': 2, 'name': 'Bob', 'role': 'user'},
        ],
        'total': 2
    }
    return jsonify(data)

@app.route('/api/data', methods=['POST'])
def create_data():
    payload = request.get_json()
    # Process data
    return jsonify({'success': True, 'data': payload}), 201

if __name__ == '__main__':
    app.run(debug=True, port=5000)`,

    dataAnalysis: `import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error, r2_score

class DataAnalyzer:
    def __init__(self, filepath):
        self.df = pd.read_csv(filepath)
        self.model = None

    def preprocess(self):
        # Handle missing values
        self.df.fillna(self.df.mean(), inplace=True)

        # Remove outliers
        Q1 = self.df.quantile(0.25)
        Q3 = self.df.quantile(0.75)
        IQR = Q3 - Q1
        self.df = self.df[~((self.df < (Q1 - 1.5 * IQR)) | (self.df > (Q3 + 1.5 * IQR))).any(axis=1)]

    def train(self, target_column):
        X = self.df.drop(columns=[target_column])
        y = self.df[target_column]
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

        self.model = LinearRegression()
        self.model.fit(X_train, y_train)

        predictions = self.model.predict(X_test)
        mse = mean_squared_error(y_test, predictions)
        r2 = r2_score(y_test, predictions)

        return {'mse': mse, 'r2': r2}

# Usage
analyzer = DataAnalyzer('data.csv')
analyzer.preprocess()
results = analyzer.train('target')`,
  },

  // Rust
  rust: {
    asyncHandler: `use tokio::time::{sleep, Duration};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct User {
    id: u32,
    name: String,
    email: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

async fn fetch_user(user_id: u32) -> Result<User, Box<dyn std::error::Error>> {
    // Simulate async operation
    sleep(Duration::from_millis(100)).await;

    let user = User {
        id: user_id,
        name: "Alice".to_string(),
        email: "alice@example.com".to_string(),
    };

    Ok(user)
}

async fn get_user_handler(user_id: u32) -> ApiResponse<User> {
    match fetch_user(user_id).await {
        Ok(user) => ApiResponse {
            success: true,
            data: Some(user),
            error: None,
        },
        Err(e) => ApiResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        },
    }
}

#[tokio::main]
async fn main() {
    let response = get_user_handler(1).await;
    println!("{:?}", response);
}`,
  },

  // Go
  go: {
    restApi: `package main

import (
    "encoding/json"
    "fmt"
    "log"
    "net/http"
)

type User struct {
    ID    int    \`json:"id"\`
    Name  string \`json:"name"\`
    Email string \`json:"email"\`
}

type Response struct {
    Success bool   \`json:"success"\`
    Data    []User \`json:"data,omitempty"\`
    Error   string \`json:"error,omitempty"\`
}

var users = []User{
    {ID: 1, Name: "Alice", Email: "alice@example.com"},
    {ID: 2, Name: "Bob", Email: "bob@example.com"},
}

func usersHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")

    response := Response{
        Success: true,
        Data:    users,
    }

    json.NewEncoder(w).Encode(response)
}

func main() {
    http.HandleFunc("/api/users", usersHandler)
    fmt.Println("Server running on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}`,
  },

  // Java
  java: {
    springService: `@Service
@Transactional
public class UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public User createUser(UserRegistrationDTO dto) {
        User user = new User();
        user.setUsername(dto.getUsername());
        user.setEmail(dto.getEmail());
        user.setPassword(passwordEncoder.encode(dto.getPassword()));
        user.setRoles(Arrays.asList(Role.USER));
        user.setCreatedAt(LocalDateTime.now());

        return userRepository.save(user);
    }

    @Transactional(readOnly = true)
    public Optional<User> getUserById(Long id) {
        return userRepository.findById(id);
    }

    public Page<User> getAllUsers(Pageable pageable) {
        return userRepository.findAll(pageable);
    }

    public User updateUser(Long id, UserUpdateDTO dto) {
        User user = userRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        if (dto.getEmail() != null) {
            user.setEmail(dto.getEmail());
        }
        user.setUpdatedAt(LocalDateTime.now());

        return userRepository.save(user);
    }

    public void deleteUser(Long id) {
        User user = userRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        userRepository.delete(user);
    }
}`,
  },
};

/**
 * 获取指定语言的代码示例
 */
export function getCodeExample(language: keyof typeof multiLanguageCodeExamples, exampleType: string): string {
  const examples = multiLanguageCodeExamples[language];
  if (examples && examples[exampleType as keyof typeof examples]) {
    return examples[exampleType as keyof typeof examples] as string;
  }
  return '// Example not found';
}

// ========== 模块 2: 复杂文件结构 ==========

/**
 * 生成复杂的项目文件结构
 * 模拟真实的 monorepo 或多模块项目
 */
export function createComplexProjectStructure(): MockDirectoryNode {
  return {
    id: 'root',
    name: 'monorepo-project',
    kind: 'directory',
    path: '/Users/mac/projects/monorepo-project',
    children: [
      // apps 目录（微前端应用）
      {
        id: 'apps',
        name: 'apps',
        kind: 'directory',
        path: '/Users/mac/projects/monorepo-project/apps',
        children: [
          {
            id: 'app-admin',
            name: 'admin',
            kind: 'directory',
            path: '/Users/mac/projects/monorepo-project/apps/admin',
            children: [
              { id: 'admin-src', name: 'src', kind: 'directory', path: '/Users/mac/projects/monorepo-project/apps/admin/src', children: [
                { id: 'admin-index', name: 'index.tsx', kind: 'file', path: '/Users/mac/projects/monorepo-project/apps/admin/src/index.tsx' },
                { id: 'admin-app', name: 'App.tsx', kind: 'file', path: '/Users/mac/projects/monorepo-project/apps/admin/src/App.tsx' },
                { id: 'admin-components', name: 'components', kind: 'directory', path: '/Users/mac/projects/monorepo-project/apps/admin/src/components', children: [
                  { id: 'admin-layout', name: 'Layout.tsx', kind: 'file', path: '/Users/mac/projects/monorepo-project/apps/admin/src/components/Layout.tsx' },
                ]},
              ]},
              { id: 'admin-package', name: 'package.json', kind: 'file', path: '/Users/mac/projects/monorepo-project/apps/admin/package.json' },
              { id: 'admin-vite', name: 'vite.config.ts', kind: 'file', path: '/Users/mac/projects/monorepo-project/apps/admin/vite.config.ts' },
            ],
          },
          {
            id: 'app-web',
            name: 'web',
            kind: 'directory',
            path: '/Users/mac/projects/monorepo-project/apps/web',
            children: [
              { id: 'web-src', name: 'src', kind: 'directory', path: '/Users/mac/projects/monorepo-project/apps/web/src', children: [
                { id: 'web-index', name: 'index.html', kind: 'file', path: '/Users/mac/projects/monorepo-project/apps/web/src/index.html' },
                { id: 'web-main', name: 'main.tsx', kind: 'file', path: '/Users/mac/projects/monorepo-project/apps/web/src/main.tsx' },
              ]},
              { id: 'web-package', name: 'package.json', kind: 'file', path: '/Users/mac/projects/monorepo-project/apps/web/package.json' },
            ],
          },
        ],
      },
      // packages 目录（共享包）
      {
        id: 'packages',
        name: 'packages',
        kind: 'directory',
        path: '/Users/mac/projects/monorepo-project/packages',
        children: [
          {
            id: 'pkg-ui',
            name: 'ui-components',
            kind: 'directory',
            path: '/Users/mac/projects/monorepo-project/packages/ui-components',
            children: [
              { id: 'ui-src', name: 'src', kind: 'directory', path: '/Users/mac/projects/monorepo-project/packages/ui-components/src', children: [
                { id: 'ui-button', name: 'Button.tsx', kind: 'file', path: '/Users/mac/projects/monorepo-project/packages/ui-components/src/Button.tsx' },
                { id: 'ui-input', name: 'Input.tsx', kind: 'file', path: '/Users/mac/projects/monorepo-project/packages/ui-components/src/Input.tsx' },
                { id: 'ui-modal', name: 'Modal.tsx', kind: 'file', path: '/Users/mac/projects/monorepo-project/packages/ui-components/src/Modal.tsx' },
                { id: 'ui-index', name: 'index.ts', kind: 'file', path: '/Users/mac/projects/monorepo-project/packages/ui-components/src/index.ts' },
              ]},
              { id: 'ui-package', name: 'package.json', kind: 'file', path: '/Users/mac/projects/monorepo-project/packages/ui-components/package.json' },
              { id: 'ui-tsconfig', name: 'tsconfig.json', kind: 'file', path: '/Users/mac/projects/monorepo-project/packages/ui-components/tsconfig.json' },
            ],
          },
          {
            id: 'pkg-utils',
            name: 'utils',
            kind: 'directory',
            path: '/Users/mac/projects/monorepo-project/packages/utils',
            children: [
              { id: 'utils-src', name: 'src', kind: 'directory', path: '/Users/mac/projects/monorepo-project/packages/utils/src', children: [
                { id: 'utils-date', name: 'date.ts', kind: 'file', path: '/Users/mac/projects/monorepo-project/packages/utils/src/date.ts' },
                { id: 'utils-format', name: 'format.ts', kind: 'file', path: '/Users/mac/projects/monorepo-project/packages/utils/src/format.ts' },
                { id: 'utils-validate', name: 'validate.ts', kind: 'file', path: '/Users/mac/projects/monorepo-project/packages/utils/src/validate.ts' },
              ]},
              { id: 'utils-package', name: 'package.json', kind: 'file', path: '/Users/mac/projects/monorepo-project/packages/utils/package.json' },
            ],
          },
          {
            id: 'pkg-api',
            name: 'api-client',
            kind: 'directory',
            path: '/Users/mac/projects/monorepo-project/packages/api-client',
            children: [
              { id: 'api-src', name: 'src', kind: 'directory', path: '/Users/mac/projects/monorepo-project/packages/api-client/src', children: [
                { id: 'api-client', name: 'client.ts', kind: 'file', path: '/Users/mac/projects/monorepo-project/packages/api-client/src/client.ts' },
                { id: 'api-types', name: 'types.ts', kind: 'file', path: '/Users/mac/projects/monorepo-project/packages/api-client/src/types.ts' },
              ]},
              { id: 'api-package', name: 'package.json', kind: 'file', path: '/Users/mac/projects/monorepo-project/packages/api-client/package.json' },
            ],
          },
        ],
      },
      // services 目录（后端服务）
      {
        id: 'services',
        name: 'services',
        kind: 'directory',
        path: '/Users/mac/projects/monorepo-project/services',
        children: [
          {
            id: 'svc-api',
            name: 'api-gateway',
            kind: 'directory',
            path: '/Users/mac/projects/monorepo-project/services/api-gateway',
            children: [
              { id: 'api-src', name: 'src', kind: 'directory', path: '/Users/mac/projects/monorepo-project/services/api-gateway/src', children: [
                { id: 'api-main', name: 'main.ts', kind: 'file', path: '/Users/mac/projects/monorepo-project/services/api-gateway/src/main.ts' },
                { id: 'api-routes', name: 'routes', kind: 'directory', path: '/Users/mac/projects/monorepo-project/services/api-gateway/src/routes', children: [
                  { id: 'api-users', name: 'users.ts', kind: 'file', path: '/Users/mac/projects/monorepo-project/services/api-gateway/src/routes/users.ts' },
                  { id: 'api-auth', name: 'auth.ts', kind: 'file', path: '/Users/mac/projects/monorepo-project/services/api-gateway/src/routes/auth.ts' },
                ]},
                { id: 'api-controllers', name: 'controllers', kind: 'directory', path: '/Users/mac/projects/monorepo-project/services/api-gateway/src/controllers' },
              ]},
              { id: 'api-package', name: 'package.json', kind: 'file', path: '/Users/mac/projects/monorepo-project/services/api-gateway/package.json' },
              { id: 'api-tsconfig', name: 'tsconfig.json', kind: 'file', path: '/Users/mac/projects/monorepo-project/services/api-gateway/tsconfig.json' },
            ],
          },
          {
            id: 'svc-worker',
            name: 'background-worker',
            kind: 'directory',
            path: '/Users/mac/projects/monorepo-project/services/background-worker',
            children: [
              { id: 'worker-src', name: 'src', kind: 'directory', path: '/Users/mac/projects/monorepo-project/services/background-worker/src', children: [
                { id: 'worker-index', name: 'index.ts', kind: 'file', path: '/Users/mac/projects/monorepo-project/services/background-worker/src/index.ts' },
                { id: 'worker-jobs', name: 'jobs', kind: 'directory', path: '/Users/mac/projects/monorepo-project/services/background-worker/src/jobs' },
              ]},
              { id: 'worker-package', name: 'package.json', kind: 'file', path: '/Users/mac/projects/monorepo-project/services/background-worker/package.json' },
            ],
          },
        ],
      },
      // 根配置文件
      {
        id: 'root-package',
        name: 'package.json',
        kind: 'file',
        path: '/Users/mac/projects/monorepo-project/package.json',
      },
      {
        id: 'root-turbo',
        name: 'turbo.json',
        kind: 'file',
        path: '/Users/mac/projects/monorepo-project/turbo.json',
      },
      {
        id: 'root-readme',
        name: 'README.md',
        kind: 'file',
        path: '/Users/mac/projects/monorepo-project/README.md',
      },
      {
        id: 'root-gitignore',
        name: '.gitignore',
        kind: 'file',
        path: '/Users/mac/projects/monorepo-project/.gitignore',
      },
      {
        id: 'root-docker',
        name: 'docker-compose.yml',
        kind: 'file',
        path: '/Users/mac/projects/monorepo-project/docker-compose.yml',
      },
    ],
  };
}

// ========== 模块 3: 真实场景数据 ==========

/**
 * 真实开发场景的对话数据
 * 用于测试代码生成、调试、重构等功能
 */
export const realWorldScenarios = {
  // 场景1: 代码审查
  codeReview: {
    user: '请帮我审查这段 React 组件代码，看看有没有性能问题或可以改进的地方',
    assistant: `我来帮您审查这段代码。让我先查看代码内容。

从性能角度来看，有几个潜在问题：

1. **缺少依赖项优化**: useEffect 的依赖数组可能不完整
2. **不必要的重渲染**: 组件可能在父组件更新时频繁重渲染
3. **状态更新问题**: 可能在循环中直接调用 setState

建议改进：
- 使用 useMemo 缓存计算结果
- 使用 useCallback 稳定函数引用
- 确保 useEffect 依赖数组完整
- 考虑使用 React.memo 包装组件

需要我提供具体的重构代码吗？`,
  },

  // 场景2: Bug 调试
  bugDebugging: {
    user: '我的 React 应用中，状态更新后 UI 没有立即响应，延迟了1-2秒。帮我找出问题',
    assistant: `这是一个典型的状态更新延迟问题。让我帮您排查：

可能的原因：
1. **异步状态更新**: 可能在 Promise 回调或 setTimeout 中更新状态
2. **批量更新**: React 可能批量处理了状态更新
3. **不必要的 useEffect**: 可有不正确的依赖导致额外渲染

调试步骤：
1. 检查状态更新的位置（是否在异步回调中）
2. 查看 useEffect 的依赖数组
3. 使用 React DevTools Profiler 检查渲染时机
4. 添加 console.log 跟踪状态变化

能否提供相关的代码片段？`,
  },

  // 场景3: 重构建议
  refactoring: {
    user: '这个组件有500行代码，包含了太多逻辑。如何重构让它更易维护？',
    assistant: `500行的大组件确实需要重构。我建议采用以下策略：

**重构步骤：**

1. **提取自定义 Hooks**
   - useState 逻辑 → useFormData
   - 副作用逻辑 → useDataFetching
   - 事件处理 → useEventHandlers

2. **拆分组件**
   - 表单部分 → FormSection
   - 列表部分 → ListSection
   - 详情部分 → DetailSection
   - 操作按钮 → ActionButtons

3. **提取常量和配置**
   - 表单验证规则 → validation.ts
   - API 端点 → api.ts
   - 工具函数 → utils.ts

4. **使用组合模式**
   - 使用 Context API 或状态管理
   - 通过 props 传递回调

我可以帮您逐步重构，先从哪个部分开始？`,
  },

  // 场景4: API 集成
  apiIntegration: {
    user: '我需要集成一个第三方 API，需要处理认证、错误重试和缓存',
    assistant: `好的，我来帮您设计一个健壮的 API 集成方案：

**架构设计：**

1. **API Client 基础类**
   - 统一的请求方法
   - 拦截器处理认证
   - 错误处理中间件

2. **认证处理**
   - Token 存储（localStorage/IndexedDB）
   - Token 刷新机制
   - 401 自动重试

3. **重试策略**
   - 指数退避算法
   - 最大重试次数限制
   - 幂等性保证

4. **缓存策略**
   - 内存缓存（短时效数据）
   - IndexedDB（长时效数据）
   - 缓存失效机制

5. **类型安全**
   - TypeScript 接口定义
   - Zod schema 验证

要我开始实现这个 API Client 吗？`,
  },

  // 场景5: 性能优化
  performanceOptimization: {
    user: '页面加载太慢，首屏渲染需要3秒。帮我优化',
    assistant: `3秒的首屏时间确实需要优化。让我分析一下：

**诊断工具：**
- Lighthouse 评分
- React DevTools Profiler
- Network 面板

**常见优化点：**

1. **代码分割**
   - 路由级别分割（React.lazy）
   - 组件级别分割
   - 第三方库异步加载

2. **资源优化**
   - 图片压缩和懒加载
   - 字体子集化
   - CSS/JS 压缩

3. **渲染优化**
   - 虚拟列表（react-window）
   - 防抖/节流
   - useMemo/useCallback

4. **数据加载**
   - 并行请求
   - 预加载关键数据
   - Skeleton screens

5. **构建优化**
   - Tree shaking
   - 代码压缩
   - Gzip/Brotli

让我先检查您的项目配置，然后给出具体优化方案。`,
  },
};

/**
 * 生成真实场景的对话消息
 */
export function createRealWorldConversation(
  scenario: keyof typeof realWorldScenarios
): MockMessage[] {
  const scenarioData = realWorldScenarios[scenario];

  return [
    createMockUserMessage(scenarioData.user),
    createMockAssistantMessage(scenarioData.assistant, {
      toolCalls: [
        createMockToolCall({
          name: 'read_file',
          arguments: { path: '/project/src/App.tsx' },
        }),
      ],
    }),
  ];
}

// ========== 类型导入 ==========

// 从 data-generators.ts 导入类型
interface MockDirectoryNode {
  id: string;
  name: string;
  kind: 'file' | 'directory';
  path: string;
  children?: MockDirectoryNode[];
}

interface MockMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string | { Text: string } | any;
  threadId?: string;
  timestamp: number;
  status: 'pending' | 'streaming' | 'completed' | 'failed';
  toolCalls?: MockToolCall[];
}

interface MockToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    [key: string]: any;
  };
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp?: number;
}

// 简化的创建函数（避免循环依赖）
function createMockUserMessage(content: string): MockMessage {
  return {
    id: `msg-${Date.now()}-user`,
    role: 'user',
    content: content,
    timestamp: Date.now(),
    status: 'completed',
    toolCalls: [],
  };
}

function createMockAssistantMessage(
  content: string,
  options?: { toolCalls?: MockToolCall[] }
): MockMessage {
  return {
    id: `msg-${Date.now()}-assistant`,
    role: 'assistant',
    content: content,
    timestamp: Date.now() + 1,
    status: 'completed',
    toolCalls: options?.toolCalls || [],
  };
}

function createMockToolCall(overrides?: Partial<MockToolCall>): MockToolCall {
  return {
    id: `tool-${Date.now()}`,
    name: 'bash',
    arguments: {},
    status: 'completed',
    ...overrides,
  };
}

// ========== 导出汇总 ==========

export const extendedGenerators = {
  // 多语言代码
  getCodeExample,

  // 复杂文件结构
  createComplexProjectStructure,

  // 真实场景
  createRealWorldConversation,
};

