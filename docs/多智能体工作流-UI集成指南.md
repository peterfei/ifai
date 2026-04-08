# 多智能体工作流 UI 集成示例

本文档展示如何在编辑器 UI 中集成和使用多智能体工作流系统。

## 🎯 在 UI 对话框中触发工作流

### 方法 1: 使用快速工作流模板

在编辑器对话框或命令面板中：

```typescript
import { invoke } from '@tauri-apps/api/tauri';

// 快速代码审查
async function runCodeReview() {
  const result = await invoke('execute_quick_workflow', {
    workflowType: 'code_review',
    targetPath: './src'
  });

  console.log('工作流已启动:', result);
  // 返回工作流 ID，可以用来查询状态
  return result;
}

// 快速探索
async function runExploration() {
  const result = await invoke('execute_quick_workflow', {
    workflowType: 'exploration',
    targetPath: './src'
  });

  return result;
}

// 质量检查
async function runQualityCheck() {
  const result = await invoke('execute_quick_workflow', {
    workflowType: 'quality_check',
    targetPath: './src'
  });

  return result;
}
```

### 方法 2: 加载默认工作流

```typescript
import { invoke } from '@tauri-apps/api/tauri';

// 获取可用的工作流列表
async function loadDefaultWorkflows() {
  const workflows = await invoke('get_default_workflows');

  console.log('可用工作流:', workflows);
  // [
  //   {
  //     id: "default-code-review",
  //     name: "默认代码审查",
  //     description: "自动探索、审查、测试和生成文档",
  //     file_path: "workflows/default-code-review.yml",
  //     nodes_count: 5
  //   },
  //   ...
  // ]

  return workflows;
}

// 加载并执行特定工作流
async function loadAndExecuteWorkflow(workflowId: string) {
  // 1. 获取工作流列表
  const workflows = await invoke('get_default_workflows');
  const workflow = workflows.find(w => w.id === workflowId);

  if (!workflow) {
    throw new Error(`工作流不存在: ${workflowId}`);
  }

  // 2. 从文件加载
  const loadedWorkflow = await invoke('load_workflow_from_file', {
    filePath: workflow.file_path
  });

  // 3. 验证工作流
  await invoke('validate_workflow', { workflow: loadedWorkflow });

  // 4. 获取执行计划
  const schedule = await invoke('get_workflow_schedule', {
    workflow: loadedWorkflow
  });

  console.log('执行计划:', schedule);
  // {
  //   executionOrder: ["explore", "review", "generate_tests", "refactor", "document"],
  //   parallelGroups: [["explore"], ["review"], ["generate_tests", "refactor"], ["document"]]
  // }

  // 5. 执行工作流
  const workflowIdResult = await invoke('execute_workflow', {
    workflow: loadedWorkflow
  });

  console.log('工作流已启动:', workflowIdResult);

  return workflowIdResult;
}
```

### 方法 3: 自定义工作流

```typescript
import { invoke } from '@tauri-apps/api/tauri';

// 创建自定义工作流
async function createCustomWorkflow() {
  const workflow = await invoke('create_custom_workflow', {
    id: 'my-custom-workflow',
    name: '我的自定义工作流',
    description: '描述',
    nodes: [
      {
        id: 'explore',
        agentType: 'explore',
        label: '探索代码'
      },
      {
        id: 'review',
        agentType: 'review',
        label: '代码审查'
      },
      {
        id: 'refactor',
        agentType: 'refactor',
        label: '重构建议'
      }
    ],
    edges: [
      {
        from: 'explore',
        to: 'review'
      },
      {
        from: 'review',
        to: 'refactor'
      }
    ]
  });

  // 执行工作流
  const result = await invoke('execute_workflow', {
    workflow
  });

  return result;
}
```

## 📊 监听工作流事件

在 React 组件中监听工作流完成事件：

```typescript
import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

function WorkflowMonitor() {
  const [workflowStatus, setWorkflowStatus] = useState(null);

  useEffect(() => {
    // 监听工作流完成事件
    const unlisten = listen('workflow-complete', (event) => {
      console.log('工作流完成:', event.payload);
      const result = event.payload;

      setWorkflowStatus({
        status: 'completed',
        workflowId: result.workflow_id,
        nodeResults: result.node_results
      });
    });

    // 监听工作流错误事件
    const unlistenError = listen('workflow-error', (event) => {
      console.error('工作流错误:', event.payload);

      setWorkflowStatus({
        status: 'error',
        message: event.payload
      });
    });

    return () => {
      unlisten.then(f => f());
      unlistenError.then(f => f());
    };
  }, []);

  return (
    <div>
      <h3>工作流状态</h3>
      {workflowStatus && (
        <div>
          <p>状态: {workflowStatus.status}</p>
          {workflowStatus.nodeResults && (
            <ul>
              {workflowStatus.nodeResults.map((node, i) => (
                <li key={i}>
                  {node.node_id}: {node.status}
                  {node.output && <div>输出: {node.output}</div>}
                  {node.error && <div>错误: {node.error}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

## 🎨 UI 组件示例

### 工作流选择器组件

```typescript
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

function WorkflowSelector() {
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);

  useEffect(() => {
    // 加载默认工作流
    invoke('get_default_workflows')
      .then(setWorkflows)
      .catch(console.error);
  }, []);

  const handleExecute = async () => {
    if (!selectedWorkflow) return;

    try {
      const workflowId = await invoke('execute_quick_workflow', {
        workflowType: selectedWorkflow.id,
        targetPath: './src'
      });

      alert(`工作流已启动: ${workflowId}`);
    } catch (error) {
      alert(`启动失败: ${error}`);
    }
  };

  return (
    <div>
      <h2>选择工作流</h2>
      <select
        value={selectedWorkflow?.id || ''}
        onChange={(e) => {
          const workflow = workflows.find(w => w.id === e.target.value);
          setSelectedWorkflow(workflow);
        }}
      >
        <option value="">-- 选择工作流 --</option>
        {workflows.map(workflow => (
          <option key={workflow.id} value={workflow.id}>
            {workflow.name} - {workflow.description}
          </option>
        ))}
      </select>

      {selectedWorkflow && (
        <div>
          <p>节点数: {selectedWorkflow.nodes_count}</p>
          <button onClick={handleExecute}>
            执行工作流
          </button>
        </div>
      )}
    </div>
  );
}
```

### 工作流执行状态组件

```typescript
function WorkflowStatus({ workflowId }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const result = await invoke('get_workflow_status', {
          workflowId
        });

        setStatus(result);
        setLoading(false);

        // 如果完成或失败，停止轮询
        if (result.status === 'Completed' || result.status === 'Failed') {
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('获取状态失败:', error);
        clearInterval(pollInterval);
      }
    }, 1000); // 每秒轮询一次

    return () => clearInterval(pollInterval);
  }, [workflowId]);

  if (loading) return <div>加载中...</div>;

  return (
    <div>
      <h3>工作流状态</h3>
      <p>ID: {status.id}</p>
      <p>状态: {status.status}</p>
      {status.currentNode && <p>当前节点: {status.currentNode}</p>}
      {status.completed_nodes.length > 0 && (
        <p>已完成节点: {status.completed_nodes.join(', ')}</p>
      )}
    </div>
  );
}
```

## 💬 在对话框中使用

### 对话框命令集成

在编辑器的命令面板中添加工作流命令：

```typescript
// 在命令注册中添加
{
  id: 'workflow.code-review',
  title: '运行代码审查工作流',
  handler: async () => {
    const workflowId = await invoke('execute_quick_workflow', {
      workflowType: 'code_review',
      targetPath: './src'
    });

    return {
      message: `代码审查工作流已启动 (ID: ${workflowId})`,
      type: 'success'
    };
  }
}

{
  id: 'workflow.exploration',
  title: '运行代码探索工作流',
  handler: async () => {
    const workflowId = await invoke('execute_quick_workflow', {
      workflowType: 'exploration',
      targetPath: './src'
    });

    return {
      message: `代码探索工作流已启动 (ID: ${workflowId})`,
      type: 'success'
    };
  }
}

{
  id: 'workflow.quality-check',
  title: '运行质量检查工作流',
  handler: async () => {
    const workflowId = await invoke('execute_quick_workflow', {
      workflowType: 'quality_check',
      targetPath: './src'
    });

    return {
      message: `质量检查工作流已启动 (ID: ${workflowId})`,
      type: 'success'
    };
  }
}
```

### AI 对话中触发

在 AI 对话框中，用户可以输入：

```
请对我的代码运行代码审查工作流
```

然后解析用户意图并调用相应的工作流命令：

```typescript
// AI 响应处理
async function handleAIRequest(message: string) {
  // 检测工作流相关请求
  if (message.includes('代码审查') || message.includes('code review')) {
    const workflowId = await invoke('execute_quick_workflow', {
      workflowType: 'code_review',
      targetPath: './src'
    });

    return `代码审查工作流已启动 (ID: ${workflowId})，请稍候...`;
  }

  if (message.includes('探索') || message.includes('exploration')) {
    const workflowId = await invoke('execute_quick_workflow', {
      workflowType: 'exploration',
      targetPath: './src'
    });

    return `代码探索工作流已启动 (ID: ${workflowId})，请稍候...`;
  }

  // ... 其他 AI 响应
}
```

## 📝 完整使用流程

### 1. 用户在对话框中输入命令

```
/run code-review
```

### 2. 前端解析并执行

```typescript
async function handleCommand(command: string) {
  const [action, ...args] = command.split(' ');

  switch(action) {
    case 'run':
      const workflowType = args[0];

      if (workflowType === 'code-review') {
        const workflowId = await invoke('execute_quick_workflow', {
          workflowType: 'code_review',
          targetPath: './src'
        });

        return `✅ 代码审查工作流已启动`;
      }

      if (workflowType === 'exploration') {
        const workflowId = await invoke('execute_quick_workflow', {
          workflowType: 'exploration',
          targetPath: './src'
        });

        return `✅ 探索工作流已启动`;
      }

      break;

    // ... 其他命令
  }
}
```

### 3. 监听结果并显示

```typescript
// 监听工作流完成
listen('workflow-complete', (event) => {
  const result = event.payload;

  // 在对话框中显示结果
  displayMessage(`
工作流完成！

状态: ${result.status}
执行时间: ${new Date(result.completed_at).toLocaleString()}

节点结果:
${result.node_results.map(node =>
  `• ${node.node_id}: ${node.status}`
).join('\n')}
  `);
});
```

## 🎯 快速开始

1. **在组件中导入**:
```typescript
import { invoke } from '@tauri-apps/api/tauri';
```

2. **调用工作流命令**:
```typescript
const result = await invoke('execute_quick_workflow', {
  workflowType: 'code_review',
  targetPath: './src'
});
```

3. **监听事件**:
```typescript
import { listen } from '@tauri-apps/api/event';

listen('workflow-complete', (event) => {
  console.log('工作流完成:', event.payload);
});
```

4. **查询状态**:
```typescript
const status = await invoke('get_workflow_status', {
  workflowId: 'workflow-id'
});
```

## ✨ 总结

- ✅ **快速工作流**: 3 个开箱即用的模板
- ✅ **默认工作流**: 从 YAML 文件加载
- ✅ **自定义工作流**: 代码创建
- ✅ **事件监听**: 实时状态更新
- ✅ **状态查询**: 轮询获取进度

现在用户可以在编辑器 UI 的对话框中直接触发多智能体工作流了！

---

**版本**: v1.0.0
**更新时间**: 2026-04-08
**维护者**: Claude (with 若爱 IfAI Team)
