// Use dynamic imports to prevent Vite's static analysis from tripping over Tauri APIs
const getTauriApi = async () => {
    try {
        const event = await import('@tauri-apps/api/event');
        const windowApi = await import('@tauri-apps/api/window');
        return { 
            listen: event.listen, 
            emit: event.emit, 
            getCurrentWindow: windowApi.getCurrentWindow 
        };
    } catch (e) {
        console.error("[Sync] Failed to load Tauri APIs:", e);
        return null;
    }
};

import { useFileStore } from '../stores/fileStore';
import { useLayoutStore } from '../stores/layoutStore';
import { useDragDropStore } from '../stores/dragDropStore';
import { openFileFromPath } from './fileActions';

const SYNC_EVENT = 'sync-state';
const READY_EVENT = 'window-ready';

export const initializeSync = async () => {
  const api = await getTauriApi();
  if (!api) return () => {};

  const { listen, emit, getCurrentWindow } = api;
  const currentWindow = getCurrentWindow();
  const thisWindowLabel = currentWindow.label;

  console.log(`[Sync] Window "${thisWindowLabel}" is booting up...`);

  // v0.3.0: 追踪鼠标位置用于判断拖拽目标区域
  let currentCursorPos: { x: number; y: number } | null = null;
  let isDragging = false;

  // 全局追踪鼠标位置（使用 pointermove 以在拖拽时也能捕获）
  const updateCursorPosition = (e: Event) => {
    const pointerEvent = e as PointerEvent;
    currentCursorPos = { x: pointerEvent.clientX, y: pointerEvent.clientY };
    // v0.3.0: 暴露到 window 对象供 AIChat 使用
    (window as any).__lastDragCursorPos = currentCursorPos;
  };
  // 使用 pointermove 而不是 mousemove，因为 pointermove 在拖拽时也会触发
  window.addEventListener('pointermove', updateCursorPosition, { passive: true });

  // v0.3.0: 持续轮询检测鼠标位置（每 50ms 检测一次）
  // 用于捕获外部文件拖拽（dragenter 可能不触发）
  const pollingInterval = window.setInterval(() => {
    if (!currentCursorPos) return;

    const { x, y } = currentCursorPos;

    // 检查该位置是否在聊天面板内
    const element = document.elementFromPoint(x, y);

    // 改进检测逻辑 - 检查元素或其父元素是否在聊天面板内
    let isInChatArea = false;
    if (element) {
      // 方法1: 检查 closest
      const chatPanel = element.closest('[data-testid="chat-panel"]');
      if (chatPanel) {
        isInChatArea = true;
      } else {
        // 方法2: 检查聊天面板的边界矩形
        const chatPanelEl = document.querySelector('[data-testid="chat-panel"]');
        if (chatPanelEl) {
          const rect = (chatPanelEl as HTMLElement).getBoundingClientRect();
          isInChatArea = x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
        }
      }
    }

    // 只在状态变化时更新
    const currentState = useDragDropStore.getState().isDragOverChat;
    if (currentState !== isInChatArea) {
      useDragDropStore.getState().setDragOverChat(isInChatArea);
    }
  }, 50); // 每 50ms 检测一次

  // 使用全局 dragover 事件追踪鼠标位置（浏览器内拖拽 + 外部文件拖拽）
  const handleDragOver = (e: DragEvent) => {
    // v0.3.0: 关键修复 - 必须调用 preventDefault() 才能让 dragover 持续触发
    e.preventDefault();

    currentCursorPos = { x: e.clientX, y: e.clientY };
    // 暴露到 window 对象供 AIChat 使用
    (window as any).__lastDragCursorPos = currentCursorPos;

    // 检查鼠标位置的元素是否在聊天面板内
    const element = document.elementFromPoint(e.clientX, e.clientY);
    const chatPanel = element?.closest('[data-testid="chat-panel"]');
    const isInChatArea = !!chatPanel;

    console.log(`[Sync ${thisWindowLabel}] dragover at:`, e.clientX, e.clientY, 'isInChatArea:', isInChatArea, 'element:', element?.tagName, chatPanel ? '(in chat panel)' : '');

    useDragDropStore.getState().setDragOverChat(isInChatArea);
  };

  const handleDragEnd = () => {
    console.log(`[Sync ${thisWindowLabel}] dragend`);
    useDragDropStore.getState().setDragOverChat(false);
  };

  // v0.3.0: 使用 capture phase 确保在 AIChat 的处理器之前捕获
  window.addEventListener('dragover', handleDragOver, { capture: true, passive: false });
  window.addEventListener('dragend', handleDragEnd);

  // 1. Unified File Drop Handler
  const unlistenDrop = await listen<string[]>('tauri://file-drop', async (event) => {
    console.log(`[Sync ${thisWindowLabel}] External file drop:`, event.payload);

    // v0.3.0: 实时检测鼠标位置判断是否在聊天区域
    let isDragOverChat = useDragDropStore.getState().isDragOverChat;

    // 如果状态未设置或为 false，实时检测鼠标位置
    if (!isDragOverChat) {
      // 尝试检测鼠标当前位置的元素
      // 由于 Tauri file-drop 不提供鼠标位置，我们尝试通过其他方式获取
      // 方法1: 检查是否有最后记录的鼠标位置
      if (currentCursorPos) {
        console.log(`[Sync ${thisWindowLabel}] Using last cursor position:`, currentCursorPos);

        // 检查该位置的元素是否在聊天面板内
        const element = document.elementFromPoint(currentCursorPos.x, currentCursorPos.y);
        const chatPanel = element?.closest('[data-testid="chat-panel"]');
        isDragOverChat = !!chatPanel;

        console.log(`[Sync ${thisWindowLabel}] Element at cursor:`, element?.tagName, chatPanel ? '(in chat panel)' : '(not in chat panel)');
      }
    }

    console.log(`[Sync ${thisWindowLabel}] isDragOverChat:`, isDragOverChat);

    if (isDragOverChat) {
      console.log(`[Sync ${thisWindowLabel}] 文件拖拽到聊天区域，跳过编辑器打开（由 AIChat 处理）`);
      // 不重置状态，让 AIChat 处理完后重置
      return;
    }

    for (const path of event.payload) {
      await openFileFromPath(path);
    }
  });

  // 2. State Sync Listener
  const unlistenSync = await listen(SYNC_EVENT, (event: any) => {
    const { store, state, origin } = event.payload;
    
    if (origin === thisWindowLabel) return;
    
    console.log(`[Sync ${thisWindowLabel}] Received ${store} update from ${origin}`);
    
    if (store === 'file') {
      const currentRootPath = useFileStore.getState().rootPath;
      useFileStore.getState().syncState(state);
      
      // Reload contents for newly added files
      if (state.openedFiles) {
          state.openedFiles.forEach((file: any) => {
              const currentFile = useFileStore.getState().openedFiles.find(f => f.id === file.id);
              if (currentFile && !currentFile.content && currentFile.path) {
                  useFileStore.getState().reloadFileContent(file.id);
              }
          });
      }
      
      if (state.rootPath && state.rootPath !== currentRootPath) {
          useFileStore.getState().refreshFileTree();
      }
    } else if (store === 'layout') {
      useLayoutStore.getState().syncState(state);
    }
  });

  // 3. New Window Ready Handler
  const unlistenReady = await listen(READY_EVENT, (event: any) => {
    const { origin } = event.payload;
    if (origin !== thisWindowLabel) {
      console.log(`[Sync ${thisWindowLabel}] Window "${origin}" is ready. Syncing in 200ms...`);
      // Delay response slightly to ensure the new window is listening
      setTimeout(() => {
          broadcastFullState();
      }, 200);
    }
  });

  const broadcastFullState = () => {
      const fileState = useFileStore.getState();
      const layoutState = useLayoutStore.getState();
      
      console.log(`[Sync ${thisWindowLabel}] Broadcasting full state...`);

      emit(SYNC_EVENT, {
          origin: thisWindowLabel,
          store: 'file',
          state: {
              openedFiles: fileState.openedFiles.map(f => ({ ...f, content: '' })),
              activeFileId: fileState.activeFileId,
              rootPath: fileState.rootPath
          }
      });
      
      emit(SYNC_EVENT, {
          origin: thisWindowLabel,
          store: 'layout',
          state: {
              panes: layoutState.panes,
              activePaneId: layoutState.activePaneId,
              isChatOpen: layoutState.isChatOpen,
              isTerminalOpen: layoutState.isTerminalOpen
          }
      });
  };

  // 4. Store Subscriptions
  const unsubFile = useFileStore.subscribe((state, prevState) => {
      // Only broadcast if the identity of relevant objects changed
      if (state.activeFileId !== prevState.activeFileId || 
          state.rootPath !== prevState.rootPath ||
          state.openedFiles.length !== prevState.openedFiles.length) {
          
          emit(SYNC_EVENT, {
              origin: thisWindowLabel,
              store: 'file',
              state: {
                  openedFiles: state.openedFiles.map(f => ({ ...f, content: '' })),
                  activeFileId: state.activeFileId,
                  rootPath: state.rootPath
              }
          });
      }
  });

  const unsubLayout = useLayoutStore.subscribe((state, prevState) => {
      if (state.activePaneId !== prevState.activePaneId ||
          state.isChatOpen !== prevState.isChatOpen ||
          state.isTerminalOpen !== prevState.isTerminalOpen ||
          state.panes.length !== prevState.panes.length) {
          
          emit(SYNC_EVENT, {
              origin: thisWindowLabel,
              store: 'layout',
              state: {
                  panes: state.panes,
                  activePaneId: state.activePaneId,
                  isChatOpen: state.isChatOpen,
                  isTerminalOpen: state.isTerminalOpen
              }
          });
      }
  });

  // 5. Announce self to others
  emit(READY_EVENT, { origin: thisWindowLabel });

  return () => {
    // 清除持续轮询定时器
    clearInterval(pollingInterval);
    // 移除事件监听器
    window.removeEventListener('pointermove', updateCursorPosition);
    window.removeEventListener('dragover', handleDragOver);
    window.removeEventListener('dragend', handleDragEnd);
    unlistenDrop();
    unlistenSync();
    unlistenReady();
    unsubFile();
    unsubLayout();
  };
};
