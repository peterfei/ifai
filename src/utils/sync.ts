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

  // 1. Unified File Drop Handler
  const unlistenDrop = await listen<string[]>('tauri://file-drop', async (event) => {
    console.log(`[Sync ${thisWindowLabel}] External file drop:`, event.payload);
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
    unlistenDrop();
    unlistenSync();
    unlistenReady();
    unsubFile();
    unsubLayout();
  };
};
