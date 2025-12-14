import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChatState } from './chatStore';
import { v4 as uuidv4 } from 'uuid';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      isLoading: false,
      apiKey: '',
      isAutocompleteEnabled: true, // Default to true for now
      setApiKey: (key) => set({ apiKey: key }),
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      updateMessageContent: (id, content) => set((state) => ({
        messages: state.messages.map((msg) =>
          msg.id === id ? { ...msg, content } : msg
        ),
      })),
      setLoading: (loading) => set({ isLoading: loading }),
      toggleAutocomplete: () => set((state) => ({
        isAutocompleteEnabled: !state.isAutocompleteEnabled
      })),
      sendMessage: async (input: string) => {
        const { apiKey, messages, isLoading, addMessage, setLoading, updateMessageContent } = get();
        if (!input.trim() || !apiKey || isLoading) return;

        const userMsgId = uuidv4();
        const assistantMsgId = uuidv4();
        const eventId = `chat_${assistantMsgId}`;

        addMessage({ id: userMsgId, role: 'user', content: input });
        addMessage({ id: assistantMsgId, role: 'assistant', content: '' });
        setLoading(true);

        try {
            // Setup listeners
            const unlistenData = await listen<string>(eventId, (event) => {
                const currentMessages = get().messages;
                const msg = currentMessages.find(m => m.id === assistantMsgId);
                if (msg) {
                    updateMessageContent(assistantMsgId, msg.content + event.payload);
                }
            });

            const cleanup = () => {
                setLoading(false);
                unlistenData();
                unlistenError();
                unlistenFinish();
            };
            
            const unlistenError = await listen<string>(`${eventId}_error`, (event) => {
                console.error('Chat error:', event.payload);
                cleanup();
            });

            const unlistenFinish = await listen<string>(`${eventId}_finish`, () => {
                cleanup();
            });

            // Prepare history
            const history = messages.map(m => ({ role: m.role, content: m.content }));
            history.push({ role: 'user', content: input });

            await invoke('ai_chat', { 
                apiKey, 
                messages: history, 
                eventId 
            });
        } catch (e) {
            console.error('Failed to invoke ai_chat', e);
            setLoading(false);
        }
      }
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({ apiKey: state.apiKey, isAutocompleteEnabled: state.isAutocompleteEnabled }),
    }
  )
);
