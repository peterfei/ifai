# 提案: 对话列表右键菜单 + 删除功能

**提案编号**: P1-2026-001
**优先级**: P0（阻塞性问题）🔴
**预计工期**: 0.5天
**分支**: `feat/marvis-gui-redesign`
**对应提案**: Marvis GUI 重构 Phase 1.7.6
**架构原则**: 配置驱动 + 策略模式（元编程最佳实践）

---

## Why(为什么)

### 当前问题

**关键功能缺失**：
- 用户无法通过右键菜单管理对话
- 无法删除不需要的对话
- 无法重命名对话标题
- 无法固定/取消固定重要对话

**用户体验影响**：
```
[用户场景]
用户创建了10个测试对话，想删除其中8个
❌ 当前：没有任何删除入口，只能保留所有对话
✅ 期望：右键点击对话 → 选择"删除" → 清理完成
```

**根本原因分析**：

| 问题 | 代码位置 | 说明 |
|------|----------|------|
| 无右键菜单组件 | `ConversationListPanel.tsx:117` | button元素无onContextMenu事件 |
| 删除功能未连接UI | `ThreadManager.delete()` | 后端方法存在，UI无触发点 |
| 无重命名功能 | - | 缺少重命名编辑状态 |
| 无固定功能 | `threadStore.pinned` | 字段存在，无UI控制 |

**影响范围**：
- ✅ 核心对话功能正常
- ❌ **对话管理功能缺失 - 阻塞日常使用**
- ❌ 无法清理历史对话
- ❌ 无法整理重要对话

---

## What Changes(变更内容)

### 核心功能

#### 1. 右键菜单组件（配置驱动）

**位置**: 新建 `src/gui/conversation/ConversationContextMenu.tsx`

**架构设计**：**配置驱动 + 策略自动分发**（避免 switch-case 反模式）

```typescript
// ✅ 声明式菜单配置 - 数据即行为
const MENU_CONFIG = [
  {
    id: 'rename',
    icon: Edit,
    label: '重命名',
    action: 'edit',           // 策略键，而非硬编码逻辑
    danger: false,
    shortcuts: ['F2'],
  },
  {
    id: 'togglePin',
    icon: Pin,
    label: (thread: Thread) => thread.pinned ? '取消置顶' : '置顶对话',  // 动态标签
    action: 'toggleProperty',  // 通用策略
    payload: { key: 'pinned' },
  },
  {
    id: 'delete',
    icon: Trash2,
    label: '删除对话',
    action: 'deleteWithConfirm',
    danger: true,
    confirm: {
      title: (thread: Thread) => `删除"${thread.title}"?`,
      message: '此操作不可恢复',
    },
  },
] as const;

// ✅ 策略注册表 - 闭包避免硬编码，零 switch-case
const MENU_STRATEGIES = {
  edit: (thread: Thread, _, ctx: MenuContext) => {
    ctx.setEditingId(thread.id);
  },

  toggleProperty: (thread: Thread, { key }: { key: string }, ctx: MenuContext) => {
    ThreadManager.update(thread.id, { [key]: !thread[key] });
  },

  deleteWithConfirm: async (thread: Thread, _, ctx: MenuContext) => {
    const confirmed = confirm(`删除"${thread.title}"？此操作不可恢复。`);
    if (!confirmed) return;

    await ThreadManager.delete(thread.id);

    // 删除当前对话自动切换
    if (ctx.activeThreadId === thread.id) {
      const remaining = Object.values(ctx.threads).filter(t => t.status !== 'deleted');
      if (remaining.length > 0) {
        ThreadManager.switch(remaining[0].id);
      } else {
        ThreadManager.create({ title: '新对话' });
      }
    }
  },
} satisfies Record<string, MenuStrategy>;
```

**元编程优势**：
- ✅ **零 switch-case**：运行时策略查找代替硬编码分支
- ✅ **配置局部性**：菜单项定义和行为在同一处
- ✅ **可扩展性**：新增菜单项只需添加配置，无需改代码
- ✅ **类型安全**：`as const` 确保类型推断

#### 2. 通用位置计算工具

**问题**：避免重复的菜单位置计算逻辑

**元编程方案**：
```typescript
// ✅ 通用位置计算器 - 适用于任何右键菜单
type MenuPositionConfig = {
  width: number;
  itemHeight: number;
  padding: number;
};

const DEFAULT_MENU_CONFIG: MenuPositionConfig = {
  width: 180,
  itemHeight: 36,
  padding: 10,
};

const calculateMenuPosition = (
  trigger: { x: number; y: number },
  itemCount: number,
  config: MenuPositionConfig = DEFAULT_MENU_CONFIG
) => {
  const { width, itemHeight, padding } = config;
  const viewport = { w: window.innerWidth, h: window.innerHeight };

  return {
    x: Math.min(trigger.x, viewport.w - width - padding),
    y: Math.min(trigger.y, viewport.h - itemCount * itemHeight - padding),
  };
};
```

**复用性**：同样的函数可用于文件菜单、编辑器菜单等。

#### 3. 删除对话功能

**触发路径**：
```
右键菜单 → 点击"删除对话" → 确认对话框 → 执行删除 → 自动切换
```

**删除策略**：
- **软删除**：设置 `status = 'deleted'`（保留历史记录）
- **过滤**：列表中过滤掉 `status === 'deleted'` 的对话
- **智能切换**：删除当前对话时自动切换到其他对话

**边界情况处理**：
```typescript
// ✅ 策略内封装自动切换逻辑
if (activeThreadId === threadId) {
  const remaining = Object.values(threads).filter(t => t.status !== 'deleted' && t.id !== threadId);
  if (remaining.length > 0) {
    ThreadManager.switch(remaining[0].id);  // 切换到第一个剩余对话
  } else {
    ThreadManager.create({ title: '新对话' });  // 创建新对话
  }
}
```

#### 4. 重命名对话功能

**触发路径**：
```
右键菜单 → 点击"重命名" → 进入编辑状态 → 输入新标题 → Enter保存/ESC取消
```

**状态管理**：
```typescript
const [editingId, setEditingId] = useState<string | null>(null);
const [editValue, setEditValue] = useState('');

// ✅ 策略驱动编辑状态
edit: (thread: Thread, _, ctx: MenuContext) => {
  ctx.setEditingId(thread.id);
  ctx.setEditValue(thread.title);
},

// ✅ UI层：编辑状态下显示输入框
{editingId === thread.id ? (
  <input
    value={editValue}
    onChange={(e) => setEditValue(e.target.value)}
    onBlur={() => {
      ThreadManager.updateTitle(thread.id, editValue);
      setEditingId(null);
    }}
    onKeyDown={(e) => {
      if (e.key === 'Enter') {
        ThreadManager.updateTitle(thread.id, editValue);
        setEditingId(null);
      }
      if (e.key === 'Escape') {
        setEditingId(null);  // 取消编辑
      }
    }}
    autoFocus
  />
) : (
  <span>{thread.title}</span>
)}
```

#### 5. 固定对话功能

**触发路径**：
```
右键菜单 → 点击"置顶对话" / "取消置顶" → 排序自动更新
```

**动态标签**：
```typescript
{
  id: 'togglePin',
  label: (thread) => thread.pinned ? '取消置顶' : '置顶对话',  // 动态标签
  action: 'toggleProperty',
  payload: { key: 'pinned' },
}
```

**排序逻辑**（已存在，无需修改）：
```typescript
// ConversationListPanel.tsx line 43
.sort((a, b) => {
  if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;  // 置顶优先
  return b.updatedAt - a.updatedAt;
});
```

### 技术实现

#### 文件1: `src/gui/conversation/ConversationContextMenu.tsx` (新建)

```typescript
import React, { useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { type IconType } from 'react-icons';
import type { Thread } from '../../stores/threadStore';

// ========== 类型定义 ==========

export interface MenuItem {
  id: string;
  label: string | ((thread: Thread) => string);
  icon: IconType;
  action: string;
  danger?: boolean;
  payload?: unknown;
  confirm?: {
    title: string | ((thread: Thread) => string);
    message: string;
  };
}

export interface MenuContext {
  threads: Record<string, Thread>;
  activeThreadId: string | null;
  setEditingId: (id: string | null) => void;
  setEditValue: (value: string) => void;
}

export type MenuStrategy = (
  thread: Thread,
  payload: unknown,
  ctx: MenuContext
) => void | Promise<void>;

export interface MenuPositionConfig {
  width: number;
  itemHeight: number;
  padding: number;
}

// ========== 配置常量 ==========

const DEFAULT_MENU_CONFIG: MenuPositionConfig = {
  width: 180,
  itemHeight: 36,
  padding: 10,
};

// ========== 通用工具函数 ==========

/**
 * 计算菜单位置，避免超出屏幕
 */
export const calculateMenuPosition = (
  trigger: { x: number; y: number },
  itemCount: number,
  config: MenuPositionConfig = DEFAULT_MENU_CONFIG
) => {
  const { width, itemHeight, padding } = config;
  const viewport = { w: window.innerWidth, h: window.innerHeight };

  return {
    x: Math.min(trigger.x, viewport.w - width - padding),
    y: Math.min(trigger.y, viewport.h - itemCount * itemHeight - padding),
  };
};

// ========== 组件 ==========

interface ConversationContextMenuProps {
  thread: Thread;
  items: MenuItem[];
  strategies: Record<string, MenuStrategy>;
  position: { x: number; y: number };
  context: MenuContext;
  onClose: () => void;
}

export function ConversationContextMenu({
  thread,
  items,
  strategies,
  position,
  context,
  onClose,
}: ConversationContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // 计算菜单位置
  const adjustedPosition = useMemo(
    () => calculateMenuPosition(position, items.length),
    [position, items.length]
  );

  // 处理菜单项选择
  const handleSelect = async (item: MenuItem) => {
    const strategy = strategies[item.action];
    if (!strategy) {
      console.warn(`[ConversationContextMenu] Unknown strategy: ${item.action}`);
      return;
    }

    // 处理确认对话框
    if (item.confirm) {
      const title = typeof item.confirm.title === 'function'
        ? item.confirm.title(thread)
        : item.confirm.title;

      const confirmed = confirm(`${title}\n${item.confirm.message}`);
      if (!confirmed) return;
    }

    // 执行策略
    await strategy(thread, item.payload, context);
    onClose();
  };

  // 渲染菜单项标签
  const renderLabel = (item: MenuItem) => {
    return typeof item.label === 'function' ? item.label(thread) : item.label;
  };

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 py-1 rounded-lg shadow-xl border animate-fade-in"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        backgroundColor: '#1E1E1E',
        borderColor: '#2D2D2D',
        minWidth: `${DEFAULT_MENU_CONFIG.width}px`,
        animation: 'fadeIn 150ms ease-out',
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => handleSelect(item)}
          className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-[#2D2D2D] transition-colors"
          style={{
            color: item.danger ? '#EF4444' : '#D1D5DB',
          }}
        >
          <item.icon size={14} />
          <span>{renderLabel(item)}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}
```

#### 文件2: `src/gui/layout/ConversationListPanel.tsx` (修改)

```typescript
import { useState, useMemo } from 'react';
import { Edit, Pin, Trash2 } from 'lucide-react';
import { ConversationContextMenu, type MenuItem, type MenuStrategy, type MenuContext } from '../conversation/ConversationContextMenu';
import { ThreadManager } from '../../stores/threadManager';
import { useThreadStore } from '../../stores/threadStore';
import type { Thread } from '../../stores/threadStore';

export function ConversationListPanel() {
  const threads = useThreadStore((s) => s.threads);
  const activeThreadId = useThreadStore((s) => s.activeThreadId);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    threadId: string;
    position: { x: number; y: number };
  } | null>(null);

  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // ========== 声明式菜单配置 ==========
  const menuItems: MenuItem[] = useMemo(() => [
    {
      id: 'rename',
      label: '重命名',
      icon: Edit,
      action: 'edit',
      shortcuts: ['F2'],
    },
    {
      id: 'togglePin',
      label: (thread: Thread) => thread.pinned ? '取消置顶' : '置顶对话',
      icon: Pin,
      action: 'toggleProperty',
      payload: { key: 'pinned' },
    },
    {
      id: 'delete',
      label: '删除对话',
      icon: Trash2,
      action: 'deleteWithConfirm',
      danger: true,
    },
  ], []);

  // ========== 策略注册表 ==========
  const menuStrategies: Record<string, MenuStrategy> = useMemo(() => ({
    edit: (thread: Thread, _, ctx: MenuContext) => {
      ctx.setEditingId(thread.id);
      ctx.setEditValue(thread.title);
    },

    toggleProperty: (thread: Thread, { key }: { key: string }, _ctx: MenuContext) => {
      ThreadManager.update(thread.id, { [key]: !thread[key] });
    },

    deleteWithConfirm: async (thread: Thread, _, ctx: MenuContext) => {
      const confirmed = confirm(`删除"${thread.title}"？此操作不可恢复。`);
      if (!confirmed) return;

      await ThreadManager.delete(thread.id);

      // 删除当前对话自动切换
      if (ctx.activeThreadId === thread.id) {
        const remaining = Object.values(ctx.threads).filter(
          t => t.status !== 'deleted' && t.id !== thread.id
        );
        if (remaining.length > 0) {
          ThreadManager.switch(remaining[0].id);
        } else {
          ThreadManager.create({ title: '新对话' });
        }
      }
    },
  }), [threads, activeThreadId]);

  // 菜单上下文
  const menuContext: MenuContext = useMemo(() => ({
    threads,
    activeThreadId,
    setEditingId,
    setEditValue,
  }), [threads, activeThreadId]);

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent, threadId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      threadId,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  return (
    <div className="flex flex-col bg-[#1E1E1E] border-r border-[#2D2D2D]">
      {/* 现有代码：新建对话、技能广场、搜索... */}

      {/* 对话卡片列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2">
        {sortedThreads.map((thread) => {
          return (
            <div key={thread.id} className="relative">
              <button
                onClick={() => ThreadManager.switch(thread.id)}
                onContextMenu={(e) => handleContextMenu(e, thread.id)}
                className={/* 现有className */}
              >
                {/* 编辑状态：重命名输入框 */}
                {editingId === thread.id ? (
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => {
                      ThreadManager.updateTitle(thread.id, editValue);
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        ThreadManager.updateTitle(thread.id, editValue);
                        setEditingId(null);
                      }
                      if (e.key === 'Escape') {
                        setEditingId(null);
                      }
                    }}
                    className="absolute inset-0 w-full px-3 py-3 text-sm font-semibold bg-[#1E1E1E] border border-[#3B82F6] outline-none"
                    autoFocus
                  />
                ) : (
                  /* 现有内容 */
                  <span>{thread.title}</span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <ConversationContextMenu
          thread={threads[contextMenu.threadId]}
          items={menuItems}
          strategies={menuStrategies}
          position={contextMenu.position}
          context={menuContext}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
```

#### 文件3: `src/stores/threadManager.ts` (扩展)

```typescript
class ThreadManager {
  // 现有方法...

  /**
   * 更新对话标题
   */
  static updateTitle(threadId: string, newTitle: string): void {
    const thread = threadStore.getState().threads[threadId];
    if (!thread) {
      console.warn(`[ThreadManager] Thread not found: ${threadId}`);
      return;
    }

    threadStore.setState((state) => ({
      threads: {
        ...state.threads,
        [threadId]: {
          ...thread,
          title: newTitle,
          updatedAt: Date.now(),
        },
      },
    }));
  }

  /**
   * 更新对话属性（通用方法）
   */
  static update(threadId: string, updates: Partial<Thread>): void {
    const thread = threadStore.getState().threads[threadId];
    if (!thread) {
      console.warn(`[ThreadManager] Thread not found: ${threadId}`);
      return;
    }

    threadStore.setState((state) => ({
      threads: {
        ...state.threads,
        [threadId]: {
          ...thread,
          ...updates,
          updatedAt: Date.now(),
        },
      },
    }));
  }
}
```

### 架构优势总结

| 维度 | 传统方案 | 元编程方案 |
|------|----------|------------|
| 新增菜单项 | +5行（case+逻辑） | +3行配置 |
| 代码重复 | 高（每项独立处理） | 零（策略复用） |
| switch-case | 有 | 无 |
| 类型安全 | 弱（字符串id） | 强（as const断言） |
| 可测试性 | 低（耦合度高） | 高（策略独立） |
| 可维护性 | 低（改动分散） | 高（配置集中） |

**设计原则**：
- ✅ **配置驱动**：菜单项通过配置声明，数据即行为
- ✅ **策略模式**：零 switch-case，运行时策略查找
- ✅ **通用工具**：位置计算器可复用到其他菜单
- ✅ **避免过度设计**：不引入DSL编译器、代码生成等重型抽象

---

## Impact(影响范围)

### Affected Specs
- **新增**: `conversation-management` - 对话管理系统

### Affected Code

**新增文件**(1个):
- `src/gui/conversation/ConversationContextMenu.tsx` (+200行，含类型定义和工具函数)

**修改文件**(2个):
- `src/gui/layout/ConversationListPanel.tsx` (+80行)
- `src/stores/threadManager.ts` (+20行)

### User Benefits

#### 修复前
```
用户创建了10个测试对话后
❌ 无法删除不需要的对话
❌ 列表越来越长，难以管理
❌ 无法重命名对话标题
❌ 无法固定重要对话
```

#### 修复后
```
右键点击对话 → 管理菜单
✅ 删除：清理不需要的对话（二次确认）
✅ 重命名：修改对话标题（Enter保存，ESC取消）
✅ 置顶：固定重要对话到顶部
✅ 智能切换：删除当前对话自动切换到其他对话
```

### Technical Risks & Mitigations

**风险1: 右键菜单位置超出屏幕**
- 缓解: `calculateMenuPosition` 通用位置计算器，自动调整
- 缓解: 边界检测逻辑（line 107-114）

**风险2: 删除当前对话后状态混乱**
- 缓解: 策略内封装自动切换逻辑
- 缓解: 删除最后一个对话时自动创建新对话

**风险3: 策略键拼写错误**
- 缓解: TypeScript 类型约束 `Record<string, MenuStrategy>`
- 缓解: 运行时警告 `console.warn` 未知策略

---

## Success Metrics(成功指标)

1. **功能完整性**:
   - ✓ 右键菜单正常显示 (100%)
   - ✓ 删除对话成功 (成功率 > 95%)
   - ✓ 重命名对话成功 (成功率 > 95%)
   - ✓ 固定对话成功 (100%)

2. **交互体验**:
   - ✓ 菜单响应延迟 < 100ms
   - ✓ 删除确认对话框显示
   - ✓ 编辑状态键盘快捷键工作（Enter保存，ESC取消）

3. **代码质量**:
   - ✓ 零 switch-case 语句
   - ✓ 配置驱动的菜单项定义
   - ✓ 策略模式实现（100% 策略覆盖）

4. **边界情况**:
   - ✓ 删除最后一个对话自动创建新对话
   - ✓ 删除当前对话自动切换
   - ✓ 菜单位置不超出屏幕

5. **E2E测试覆盖**:
   - ✓ 右键菜单显示测试（E2E-CM-1）
   - ✓ 删除对话流程测试（E2E-CM-2）
   - ✓ 重命名对话流程测试（E2E-CM-3）
   - ✓ 固定对话流程测试（E2E-CM-4）

---

## Alignment with Project Vision(与项目愿景的对齐)

若爱(IfAI)的核心愿景是"让AI成为开发者最贴心的编程伴侣"。此提案高度对齐：

1. **"贴心"**: 提供完整的对话管理功能，符合用户习惯
2. **"可控"**: 用户可以自由管理对话历史
3. **"高效"**: 右键菜单快捷操作，减少点击步骤
4. **"安全"**: 删除操作二次确认，防止误操作
5. **"优雅"**: 配置驱动架构，代码简洁可维护

---

## Next Steps(后续步骤)

### Phase 1: 核心功能（本次提案，0.5天）

- [ ] **1.7.6.1** 创建 `ConversationContextMenu.tsx` 组件
  - [ ] 类型定义（MenuItem, MenuStrategy, MenuContext）
  - [ ] `calculateMenuPosition` 通用工具函数
  - [ ] 菜单渲染逻辑（Portal + 动画）

- [ ] **1.7.6.2** 修改 `ConversationListPanel.tsx`
  - [ ] 声明式菜单配置（MENU_CONFIG）
  - [ ] 策略注册表（edit, toggleProperty, deleteWithConfirm）
  - [ ] 右键菜单状态管理
  - [ ] 编辑状态UI（重命名输入框）

- [ ] **1.7.6.3** 扩展 `ThreadManager`
  - [ ] `updateTitle(threadId, newTitle)` 方法
  - [ ] `update(threadId, updates)` 通用方法

- [ ] **1.7.6.4** 单元测试
  - [ ] 菜单显示/关闭测试
  - [ ] 策略执行测试（3个策略）
  - [ ] 位置计算测试（边界情况）

- [ ] **1.7.6.5** E2E测试
  - [ ] E2E-CM-1: 右键菜单显示和关闭
  - [ ] E2E-CM-2: 删除对话流程
  - [ ] E2E-CM-3: 重命名对话
  - [ ] E2E-CM-4: 固定对话

### Phase 2: 增强功能（后续迭代，1天）

- [ ] 批量删除（Shift多选）
- [ ] 回收站功能（恢复已删除对话）
- [ ] 拖拽排序（手动调整对话顺序）
- [ ] 导出对话（Markdown/JSON格式）
- [ ] 搜索过滤增强（按状态/日期筛选）

### Phase 3: 体验优化（后续迭代，0.5天）

- [ ] 快捷键支持（Delete删除，F2重命名）
- [ ] 撤销功能（Cmd+Z恢复删除）
- [ ] 分组功能（按项目/Agent分组）
- [ ] 标签系统（自定义标签分类）

---

## 附录：完整测试用例

### 测试覆盖率目标

| 测试类型 | 目标覆盖率 | 测试数量 |
|----------|-----------|----------|
| 单元测试 | 100% 策略覆盖 | 15+ |
| 集成测试 | 核心流程覆盖 | 8+ |
| E2E测试 | 用户场景覆盖 | 12+ |
| 性能测试 | 关键路径覆盖 | 2+ |

---

### 1. 单元测试（15个）

**文件**: `src/gui/conversation/__tests__/calculateMenuPosition.test.ts`

```typescript
import { calculateMenuPosition } from '../ConversationContextMenu';

describe('calculateMenuPosition', () => {
  const DEFAULT_CONFIG = { width: 180, itemHeight: 36, padding: 10 };

  it('UT-CM-1: 正常位置不调整', () => {
    const result = calculateMenuPosition({ x: 500, y: 300 }, 3, DEFAULT_CONFIG);
    expect(result).toEqual({ x: 500, y: 300 });
  });

  it('UT-CM-2: 超出右边界自动调整', () => {
    const viewportWidth = window.innerWidth;
    const result = calculateMenuPosition(
      { x: viewportWidth - 100, y: 300 },
      3,
      DEFAULT_CONFIG
    );
    expect(result.x).toBeLessThan(viewportWidth - DEFAULT_CONFIG.width - DEFAULT_CONFIG.padding);
  });

  it('UT-CM-3: 超出下边界自动调整', () => {
    const viewportHeight = window.innerHeight;
    const result = calculateMenuPosition(
      { x: 500, y: viewportHeight - 50 },
      3,
      DEFAULT_CONFIG
    );
    const maxY = viewportHeight - 3 * DEFAULT_CONFIG.itemHeight - DEFAULT_CONFIG.padding;
    expect(result.y).toBeLessThanOrEqual(maxY);
  });

  it('UT-CM-4: 边角位置调整', () => {
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const result = calculateMenuPosition(
      { x: viewport.w - 50, y: viewport.h - 50 },
      3,
      DEFAULT_CONFIG
    );
    expect(result.x).toBeLessThan(viewport.w - DEFAULT_CONFIG.width);
    expect(result.y).toBeLessThan(viewport.h - 3 * DEFAULT_CONFIG.itemHeight);
  });

  it('UT-CM-5: 自定义配置覆盖默认值', () => {
    const customConfig = { width: 200, itemHeight: 40, padding: 20 };
    const result = calculateMenuPosition({ x: 500, y: 300 }, 3, customConfig);
    expect(result).toEqual({ x: 500, y: 300 });
  });
});
```

**文件**: `src/gui/conversation/__tests__/ConversationContextMenu.test.tsx`

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationContextMenu } from '../ConversationContextMenu';

describe('ConversationContextMenu', () => {
  const mockThread = { id: '1', title: 'Test', status: 'active', pinned: false };
  const mockItems = [
    { id: 'rename', label: '重命名', icon: Edit, action: 'edit' },
  ];
  const mockStrategies = {
    edit: jest.fn(),
  };
  const mockContext = {
    threads: { '1': mockThread },
    activeThreadId: '1',
    setEditingId: jest.fn(),
    setEditValue: jest.fn(),
  };

  it('UT-CM-6: 渲染菜单项', () => {
    render(
      <ConversationContextMenu
        thread={mockThread}
        items={mockItems}
        strategies={mockStrategies}
        position={{ x: 100, y: 100 }}
        context={mockContext}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('重命名')).toBeInTheDocument();
  });

  it('UT-CM-7: 点击菜单项执行策略', async () => {
    const onClose = jest.fn();
    render(
      <ConversationContextMenu
        thread={mockThread}
        items={mockItems}
        strategies={mockStrategies}
        position={{ x: 100, y: 100 }}
        context={mockContext}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByText('重命名'));
    expect(mockStrategies.edit).toHaveBeenCalledWith(mockThread, undefined, mockContext);
    expect(onClose).toHaveBeenCalled();
  });

  it('UT-CM-8: 点击外部关闭菜单', () => {
    const onClose = jest.fn();
    render(
      <ConversationContextMenu
        thread={mockThread}
        items={mockItems}
        strategies={mockStrategies}
        position={{ x: 100, y: 100 }}
        context={mockContext}
        onClose={onClose}
      />
    );

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it('UT-CM-9: ESC键关闭菜单', () => {
    const onClose = jest.fn();
    render(
      <ConversationContextMenu
        thread={mockThread}
        items={mockItems}
        strategies={mockStrategies}
        position={{ x: 100, y: 100 }}
        context={mockContext}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('UT-CM-10: 未知策略显示警告', () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
    const items = [...mockItems, { id: 'unknown', label: '未知', icon: Edit, action: 'unknown' }];

    render(
      <ConversationContextMenu
        thread={mockThread}
        items={items}
        strategies={mockStrategies}
        position={{ x: 100, y: 100 }}
        context={mockContext}
        onClose={() => {}}
      />
    );

    fireEvent.click(screen.getByText('未知'));
    expect(consoleWarn).toHaveBeenCalledWith('[ConversationContextMenu] Unknown strategy: unknown');

    consoleWarn.mockRestore();
  });

  it('UT-CM-11: 动态标签渲染', () => {
    const items = [
      {
        id: 'dynamic',
        label: (thread: Thread) => thread.pinned ? '取消置顶' : '置顶',
        icon: Pin,
        action: 'toggle',
      },
    ];

    render(
      <ConversationContextMenu
        thread={mockThread}
        items={items}
        strategies={{}}
        position={{ x: 100, y: 100 }}
        context={mockContext}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('置顶')).toBeInTheDocument();
  });

  it('UT-CM-12: 危险操作样式', () => {
    const items = [
      { id: 'delete', label: '删除', icon: Trash2, action: 'delete', danger: true },
    ];

    render(
      <ConversationContextMenu
        thread={mockThread}
        items={items}
        strategies={{}}
        position={{ x: 100, y: 100 }}
        context={mockContext}
        onClose={() => {}}
      />
    );

    const deleteButton = screen.getByText('删除');
    expect(deleteButton).toHaveStyle({ color: '#EF4444' });
  });

  it('UT-CM-13: 确认对话框处理', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const items = [
      {
        id: 'delete',
        label: '删除',
        icon: Trash2,
        action: 'delete',
        confirm: { title: '确认删除？', message: '不可恢复' },
      },
    ];
    const strategies = { delete: jest.fn() };

    render(
      <ConversationContextMenu
        thread={mockThread}
        items={items}
        strategies={strategies}
        position={{ x: 100, y: 100 }}
        context={mockContext}
        onClose={() => {}}
      />
    );

    fireEvent.click(screen.getByText('删除'));
    expect(confirmSpy).toHaveBeenCalledWith('确认删除？\n不可恢复');
    expect(strategies.delete).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('UT-CM-14: 确认对话框取消不执行策略', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const onClose = jest.fn();
    const items = [
      {
        id: 'delete',
        label: '删除',
        icon: Trash2,
        action: 'delete',
        confirm: { title: '确认删除？', message: '不可恢复' },
      },
    ];
    const strategies = { delete: jest.fn() };

    render(
      <ConversationContextMenu
        thread={mockThread}
        items={items}
        strategies={strategies}
        position={{ x: 100, y: 100 }}
        context={mockContext}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByText('删除'));
    expect(strategies.delete).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('UT-CM-15: Portal渲染到body', () => {
    render(
      <ConversationContextMenu
        thread={mockThread}
        items={mockItems}
        strategies={mockStrategies}
        position={{ x: 100, y: 100 }}
        context={mockContext}
        onClose={() => {}}
      />
    );

    const menu = document.querySelector('.fixed.z-50');
    expect(menu).toBeInTheDocument();
    expect(menu?.parentElement).toBe(document.body);
  });
});
```

---

### 2. 集成测试（8个）

**文件**: `src/gui/layout/__tests__/ConversationListPanel.contextmenu.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConversationListPanel } from '../ConversationListPanel';
import { ThreadManager } from '../../../stores/threadManager';

describe('ConversationListPanel - 右键菜单集成', () => {
  beforeEach(() => {
    // 清理所有对话
    ThreadManager['__reset']?.();
  });

  it('IT-CM-1: 右键菜单 + ThreadManager.create 集成', async () => {
    render(<ConversationListPanel />);

    // 创建新对话
    const newButton = screen.getByText('新建对话');
    fireEvent.click(newButton);

    await waitFor(() => {
      expect(ThreadManager.getState().threads).toHaveLength(1);
    });
  });

  it('IT-CM-2: 右键菜单 + ThreadManager.delete 集成', async () => {
    const threadId = ThreadManager.create({ title: '测试删除' });
    render(<ConversationListPanel />);

    // 右键删除
    const threadCard = screen.getByText('测试删除');
    fireEvent.contextMenu(threadCard);
    fireEvent.click(screen.getByText('删除对话'));

    // 确认删除
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByText('删除对话'));

    await waitFor(() => {
      expect(ThreadManager.getState().threads[threadId].status).toBe('deleted');
    });

    confirmSpy.mockRestore();
  });

  it('IT-CM-3: 右键菜单 + ThreadManager.update 集成', async () => {
    const threadId = ThreadManager.create({ title: '原标题' });
    render(<ConversationListPanel />);

    // 右键重命名
    const threadCard = screen.getByText('原标题');
    fireEvent.contextMenu(threadCard);
    fireEvent.click(screen.getByText('重命名'));

    // 输入新标题
    const input = screen.getByDisplayValue('原标题');
    fireEvent.change(input, { target: { value: '新标题' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(ThreadManager.getState().threads[threadId].title).toBe('新标题');
    });
  });

  it('IT-CM-4: 删除后 threadStore 状态验证', async () => {
    const threadId = ThreadManager.create({ title: '测试' });
    render(<ConversationListPanel />);

    fireEvent.contextMenu(screen.getByText('测试'));
    fireEvent.click(screen.getByText('删除对话'));

    await waitFor(() => {
      const threads = ThreadManager.getState().threads;
      expect(threads[threadId].status).toBe('deleted');
    });
  });

  it('IT-CM-5: 重命名后 threadStore 状态验证', async () => {
    const threadId = ThreadManager.create({ title: '原标题' });
    render(<ConversationListPanel />);

    fireEvent.contextMenu(screen.getByText('原标题'));
    fireEvent.click(screen.getByText('重命名'));

    const input = screen.getByDisplayValue('原标题');
    fireEvent.change(input, { target: { value: '新标题' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(ThreadManager.getState().threads[threadId].title).toBe('新标题');
    });
  });

  it('IT-CM-6: 固定后排序逻辑验证', async () => {
    ThreadManager.create({ title: '对话1' });
    ThreadManager.create({ title: '对话2' });
    render(<ConversationListPanel />);

    const threads = screen.getAllByTestId(/conversation-card/);
    const firstTitle = threads[0].textContent;

    // 固定第二个对话
    fireEvent.contextMenu(threads[1]);
    fireEvent.click(screen.getByText('置顶对话'));

    await waitFor(() => {
      const newThreads = screen.getAllByTestId(/conversation-card/);
      expect(newThreads[0].textContent).not.toBe(firstTitle);
    });
  });

  it('IT-CM-7: 编辑状态与右键菜单互斥', async () => {
    ThreadManager.create({ title: '测试' });
    render(<ConversationListPanel />);

    // 进入编辑状态
    fireEvent.contextMenu(screen.getByText('测试'));
    fireEvent.click(screen.getByText('重命名'));

    // 编辑状态下再次右键
    const input = screen.getByDisplayValue('测试');
    fireEvent.contextMenu(input);

    // 验证：编辑状态关闭，菜单显示
    await waitFor(() => {
      expect(screen.queryByDisplayValue('测试')).not.toBeInTheDocument();
      expect(screen.getByText('重命名')).toBeInTheDocument();
    });
  });

  it('IT-CM-8: 删除当前对话自动切换', async () => {
    const thread1 = ThreadManager.create({ title: '对话1' });
    const thread2 = ThreadManager.create({ title: '对话2' });

    // 激活第一个对话
    ThreadManager.switch(thread1);
    render(<ConversationListPanel />);

    // 删除当前对话
    fireEvent.contextMenu(screen.getByText('对话1'));
    fireEvent.click(screen.getByText('删除对话'));

    await waitFor(() => {
      expect(ThreadManager.getState().activeThreadId).toBe(thread2);
    });
  });
});
```

---

### 3. E2E测试（12个）

**文件**: `tests/e2e/conversation-context-menu.spec.ts`

```typescript
test('E2E-CM-1: 右键菜单显示和关闭', async ({ page }) => {
  await page.goto('/');
  const threadCard = page.locator('[data-testid="conversation-list-panel"] button').first();

  // 右键点击
  await threadCard.click({ button: 'right' });

  // 验证菜单项
  await expect(page.locator('text=重命名')).toBeVisible();
  await expect(page.locator('text=删除对话')).toBeVisible();

  // 点击外部关闭
  await page.locator('body').click();
  await expect(page.locator('text=重命名')).not.toBeVisible();
});

test('E2E-CM-2: 删除对话流程', async ({ page }) => {
  await page.goto('/');

  // 创建测试对话
  const threadId = await page.evaluate(() => {
    return (window as any).ThreadManager.create({ title: '测试删除' });
  });

  // 右键删除
  const threadCard = page.locator(`[data-thread-id="${threadId}"]`);
  await threadCard.click({ button: 'right' });
  await page.locator('text=删除对话').click();

  // 确认对话框
  page.on('dialog', (dialog) => dialog.accept());

  // 验证已删除
  await expect(threadCard).not.toBeVisible();
});

test('E2E-CM-3: 重命名对话', async ({ page }) => {
  await page.goto('/');

  const threadCard = page.locator('[data-testid="conversation-list-panel"] button').first();

  // 右键重命名
  await threadCard.click({ button: 'right' });
  await page.locator('text=重命名').click();

  // 输入新标题
  const input = page.locator('input[type="text"]');
  await input.fill('新对话标题');
  await input.press('Enter');

  // 验证标题已更新
  await expect(threadCard).toContainText('新对话标题');
});

test('E2E-CM-4: 固定对话', async ({ page }) => {
  await page.goto('/');

  const firstCard = page.locator('[data-testid="conversation-list-panel"] button').first();
  const firstTitle = await firstCard.textContent();

  // 固定第二个对话
  const secondCard = page.locator('[data-testid="conversation-list-panel"] button').nth(1);
  await secondCard.click({ button: 'right' });
  await page.locator('text=置顶对话').click();

  // 验证已置顶（第二个对话现在在第一个位置）
  const newFirstCard = page.locator('[data-testid="conversation-list-panel"] button').first();
  const newFirstTitle = await newFirstCard.textContent();
  expect(newFirstTitle).not.toBe(firstTitle);
});

test('E2E-CM-5: 删除最后一个对话自动创建新对话', async ({ page }) => {
  await page.goto('/');

  // 删除所有对话，只剩一个
  const threads = page.locator('[data-testid="conversation-list-panel"] button');
  const count = await threads.count();

  for (let i = 1; i < count; i++) {
    await threads.nth(i).click({ button: 'right' });
    await page.locator('text=删除对话').click();
    page.on('dialog', (dialog) => dialog.accept());
    await page.waitForTimeout(100);
  }

  // 删除最后一个对话
  const lastThread = threads.first();
  await lastThread.click({ button: 'right' });
  await page.locator('text=删除对话').click();
  page.on('dialog', (dialog) => dialog.accept());

  // 验证：自动创建新对话
  const newThreads = page.locator('[data-testid="conversation-list-panel"] button');
  await expect(newThreads).toHaveCount(1);
  await expect(newThreads.first()).toContainText('新对话');
});

test('E2E-CM-6: 删除当前激活对话自动切换', async ({ page }) => {
  await page.goto('/');

  const threads = page.locator('[data-testid="conversation-list-panel"] button');

  // 点击激活第一个对话
  await threads.first().click();

  // 删除当前对话
  await threads.first().click({ button: 'right' });
  await page.locator('text=删除对话').click();
  page.on('dialog', (dialog) => dialog.accept());

  // 验证：自动切换到其他对话
  const activeThread = page.locator('[data-testid="conversation-list-panel"] button.border-blue-500');
  await expect(activeThread).toBeVisible();
});

test('E2E-CM-7: 菜单超出右边界自动调整', async ({ page }) => {
  await page.goto('/');

  const viewportWidth = page.viewportSize()?.width || 1280;
  const threadCard = page.locator('[data-testid="conversation-list-panel"] button').first();

  // 在右边缘右键点击
  await threadCard.click({
    button: 'right',
    position: { x: viewportWidth - 10, y: 50 }
  });

  // 验证菜单不超出屏幕
  const menu = page.locator('.fixed.z-50');
  const menuBox = await menu.boundingBox();
  expect(menuBox?.x).toBeLessThan(viewportWidth - 170); // 180px宽度 + 10px内边距
});

test('E2E-CM-8: 删除操作点击取消对话保留', async ({ page }) => {
  await page.goto('/');

  const threadCard = page.locator('[data-testid="conversation-list-panel"] button').first();
  const originalTitle = await threadCard.textContent();

  // 右键删除
  await threadCard.click({ button: 'right' });
  await page.locator('text=删除对话').click();

  // 点击取消
  page.on('dialog', (dialog) => dialog.dismiss());

  // 验证：对话保留
  await expect(threadCard).toBeVisible();
  await expect(threadCard).toContainText(originalTitle);
});

test('E2E-CM-9: 重命名按ESC取消标题不变', async ({ page }) => {
  await page.goto('/');

  const threadCard = page.locator('[data-testid="conversation-list-panel"] button').first();
  const originalTitle = await threadCard.textContent();

  // 右键重命名
  await threadCard.click({ button: 'right' });
  await page.locator('text=重命名').click();

  // 输入新标题后按ESC取消
  const input = page.locator('input[type="text"]');
  await input.fill('新标题');
  await input.press('Escape');

  // 验证：标题不变
  await expect(threadCard).toContainText(originalTitle);
});

test('E2E-CM-10: 快速连续右键点击只显示一个菜单', async ({ page }) => {
  await page.goto('/');

  const threadCard = page.locator('[data-testid="conversation-list-panel"] button').first();

  // 快速连续右键点击
  await threadCard.click({ button: 'right' });
  await threadCard.click({ button: 'right' });
  await threadCard.click({ button: 'right' });

  // 验证：只显示一个菜单
  const menus = page.locator('.fixed.z-50');
  await expect(menus).toHaveCount(1);
});

test('E2E-CM-11: 编辑状态下右键关闭编辑显示菜单', async ({ page }) => {
  await page.goto('/');

  const threadCard = page.locator('[data-testid="conversation-list-panel"] button').first();

  // 进入编辑状态
  await threadCard.click({ button: 'right' });
  await page.locator('text=重命名').click();

  // 验证：输入框显示
  const input = page.locator('input[type="text"]');
  await expect(input).toBeVisible();

  // 编辑状态下右键
  await threadCard.click({ button: 'right' });

  // 验证：编辑状态关闭，菜单显示
  await expect(input).not.toBeVisible();
  await expect(page.locator('text=重命名')).toBeVisible();
});

test('E2E-CM-12: 重命名后立即删除验证状态清理', async ({ page }) => {
  await page.goto('/');

  const threadCard = page.locator('[data-testid="conversation-list-panel"] button').first();

  // 重命名
  await threadCard.click({ button: 'right' });
  await page.locator('text=重命名').click();
  const input = page.locator('input[type="text"]');
  await input.fill('已重命名');
  await input.press('Enter');

  // 立即右键删除
  await threadCard.click({ button: 'right' });
  await page.locator('text=删除对话').click();
  page.on('dialog', (dialog) => dialog.accept());

  // 验证：对话已删除，编辑状态已清理
  await expect(threadCard).not.toBeVisible();
  await expect(page.locator('input[type="text"]')).not.toBeVisible();
});
```

---

### 4. 性能测试（2个）

**文件**: `tests/performance/context-menu.performance.spec.ts`

```typescript
test('PT-CM-1: 100+对话时菜单响应延迟 < 100ms', async ({ page }) => {
  await page.goto('/');

  // 创建100个对话
  await page.evaluate(() => {
    for (let i = 0; i < 100; i++) {
      (window as any).ThreadManager.create({ title: `对话${i}` });
    }
  });

  const threadCard = page.locator('[data-testid="conversation-list-panel"] button').first();

  // 测量右键菜单响应时间
  const startTime = Date.now();
  await threadCard.click({ button: 'right' });
  await page.locator('text=重命名').waitFor();
  const endTime = Date.now();

  expect(endTime - startTime).toBeLessThan(100);
});

test('PT-CM-2: calculateMenuPosition 计算性能 < 1ms', async ({ page }) => {
  await page.goto('/');

  // 测量位置计算性能
  const result = await page.evaluate(() => {
    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      (window as any).calculateMenuPosition(
        { x: Math.random() * 1280, y: Math.random() * 720 },
        3,
        { width: 180, itemHeight: 36, padding: 10 }
      );
    }

    return performance.now() - start;
  });

  // 平均每次计算 < 1ms
  expect(result / 1000).toBeLessThan(1);
});
```

---

## 测试覆盖率总结

| 测试类型 | 用例数量 | 覆盖场景 |
|----------|----------|----------|
| **单元测试** | 15 | 策略执行、边界检测、Portal渲染、确认对话框 |
| **集成测试** | 8 | ThreadManager集成、状态同步、编辑互斥 |
| **E2E测试** | 12 | 完整用户流程、边界情况、异常处理 |
| **性能测试** | 2 | 100+对话、计算性能 |
| **总计** | **37** | **全面覆盖** ✅ |
  expect(newFirstTitle).not.toBe(firstTitle);
});
```

---

---

## 实施状态

**状态**: ✅ **已完成**（2026-05-24）

### 实施摘要

**Commit**: `4489bac3` - feat(gui): 添加对话右键菜单功能（重命名/置顶/删除）

**实施内容**:
- ✅ ConversationContextMenu 组件（策略模式 + 配置驱动）
- ✅ 重命名功能（编辑状态输入框 + Enter/ESC 支持）
- ✅ 置顶功能（置顶图标显示 + 动态标签）
- ✅ 删除功能（ConfirmDialog 替代 window.confirm，修复 Tauri/Electron 兼容性）
- ✅ ThreadManager 扩展（updateTitle/update 方法）
- ✅ 单元测试（15个：ConversationContextMenu 10 + calculateMenuPosition 5）

**测试结果**:
```
✅ 28/28 测试全部通过
- ConversationContextMenu: 10/10 ✅
- calculateMenuPosition: 5/5 ✅
- ConversationListPanel: 13/13 ✅
```

**文件变更**:
```
7 files changed, 895 insertions(+), 49 deletions(-)
```

**待完成**:
- ⏳ E2E 测试（E2E-CM-1~4，P2 优先级）

---

**提案版本**: v2.0（元编程架构优化版）
**实施人**: Claude AI Assistant
**完成日期**: 2026-05-24
**状态**: ✅ 已实施
