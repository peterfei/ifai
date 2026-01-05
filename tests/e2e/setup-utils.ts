import { Page } from '@playwright/test';

/**
 * 设置 E2E 测试环境，跳过新手引导并配置本地 Ollama 模拟
 */
export async function setupE2ETestEnvironment(page: Page) {
  // 1. Mock AI API 响应
  await page.route('**/v1/chat/completions', async (route) => {
    const postData = route.request().postDataJSON();
    const lastMessage = postData?.messages?.at(-1)?.content || '';

    let responseContent = 'I am an AI assistant. How can I help you?';
    
    if (lastMessage.includes('/task:start')) {
        responseContent = 'Starting task implementation... I will generate a plan and execute it. [TOOL_CALL: agent_read_file { "rel_path": "README.md" }]';
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'mock-completion-' + Date.now(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'mock-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: responseContent,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 50,
          total_tokens: 60,
        },
      }),
    });
  });

  await page.addInitScript(() => {
    // 2. 跳过新手引导
    const onboardingState = {
      completed: true,
      skipped: true,
      remindCount: 0,
      lastRemindDate: null,
    };
    window.localStorage.setItem('ifai_onboarding_state', JSON.stringify(onboardingState));

    // 3. 配置本地模拟 Ollama 为默认模型
    const ollamaProvider = {
      id: 'ollama-e2e',
      name: 'Ollama Mock',
      protocol: 'openai',
      baseUrl: 'http://localhost:11434/v1/chat/completions',
      apiKey: 'mock-key',
      models: ['mock-model'],
      enabled: true,
      isCustom: true,
      presetTemplate: 'ollama',
      group: 'local',
    };

    const settingsState = {
      state: {
        theme: 'vs-dark',
        fontSize: 16,
        providers: [ollamaProvider],
        currentProviderId: 'ollama-e2e',
        currentModel: 'mock-model',
        enableAutocomplete: true,
        useLocalModelForCompletion: true,
        agentAutoApprove: true,
        maxContextMessages: 15,
        enableSmartContextSelection: true,
      },
      version: 0
    };
    window.localStorage.setItem('settings-storage', JSON.stringify(settingsState));

    // 4. 强制启用聊天输入（防止被 AI Key 校验锁定）
    const chatUIState = {
        state: {
            isLoading: false,
            error: null,
        },
        version: 0
    };
    window.localStorage.setItem('chat-ui-storage', JSON.stringify(chatUIState));

    // 5. 默认打开 AI 聊天面板并开启侧边栏
    const layoutState = {
      state: {
        isChatOpen: true,
        sidebarActiveTab: 'explorer',
        isSidebarOpen: true,
      },
      version: 0
    };
    window.localStorage.setItem('layout-storage', JSON.stringify(layoutState));
  });
}