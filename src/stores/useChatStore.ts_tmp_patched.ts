const patchedSendMessage = async (content: string | any[], providerId: string, modelName: string, options: any = {}) => {
    // 🏆 Refactor Phase 5: Final Physical Replacement
    // 旧版 1100+ 行逻辑已彻底物理移除，由解耦的编排器接管
    console.log('[ChatStore] 🚀 New Architecture Active: Orchestrating message via SendMessageOrchestrator');
    
    // 🔥 物理隔离劫持
    const { sendMessageOrchestrator } = await import('./chat/sendMessage/SendMessageOrchestrator');
    return sendMessageOrchestrator.send(content, providerId, modelName, options);
};

const patchedGenerateResponse = async (history: any[], providerConfig: any, options?: { enableTools?: boolean }) => {
    console.log(">>> patchedGenerateResponse called");
    // 🏆 v0.3.8: PIVO 商业版 Sentinel 扫描
    SentinelService.scanForUuid(history);

    const settings = useSettingsStore.getState();
    const fullProviderConfig = settings.providers.find((p: any) => p.id === providerConfig.id) || providerConfig;

    const backendConfig = {
        ...fullProviderConfig, provider: fullProviderConfig.id, id: fullProviderConfig.id,
        api_key: fullProviderConfig.apiKey || "", base_url: fullProviderConfig.baseUrl || "",
        models: [settings.currentModel], protocol: fullProviderConfig.protocol || "openai"
    };

    coreUseChatStore.setState({ isLoading: true });
    const currentMessages = coreUseChatStore.getState().messages;
    let reusableAssistantMsgId: string | null = null;

    for (let i = currentMessages.length - 1; i >= 0; i--) {
        const msg = currentMessages[i];
        if (msg.role === 'assistant' && (!msg.content || msg.content === '')) {
            reusableAssistantMsgId = msg.id;
            break;
        }
    }

    const assistantMsgId = reusableAssistantMsgId || crypto.randomUUID();
    
    if (!reusableAssistantMsgId) {
        coreUseChatStore.getState().addMessage({
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            timestamp: Date.now()
        } as any);
    }

    // 🔥 Refactor Phase 4: Integration
    // 这里我们将监听器逻辑委派给 StreamingResponseController
    const { streamingResponseController } = await import('./chat/generateResponse/StreamingResponseController');
    const { chatEventBus } = await import('./chat/eventBus/ChatEventBus');
    
    const correlationId = chatEventBus.createCorrelationId();
    const payload = { 
        correlationId, 
        sessionId: useThreadStore.getState().activeThreadId || 'default', 
        timestamp: Date.now() 
    };

    await streamingResponseController.startListening(assistantMsgId, payload);

    try {
        const currentMode = (window as any).__IFAI_EDITOR_MODE__;
        const shouldEnableTools = options?.enableTools ?? (currentMode !== "vibe");

        await invoke('ai_chat', {
            providerConfig: backendConfig,
            messages: history.map(m => ({ role: m.role, content: m.content })),
            eventId: assistantMsgId,
            projectRoot: useFileStore.getState().rootPath,
            enableTools: shouldEnableTools,
            activeSkillIds: (window as any).__IFAI_ACTIVE_SKILLS__ || [],
            mode: currentMode || "vibe"
        });
    } catch (e) {
        console.error('[ChatStore] Response generation failed:', e);
        chatEventBus.emit('chat:error', {
            ...payload,
            code: 'GENERATE_FAILED',
            message: String(e),
            moduleId: 'GenerateResponse'
        });
    }
};
