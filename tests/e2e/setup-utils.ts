import { Page } from '@playwright/test';

/**
 * 设置 E2E 测试环境，跳过新手引导并配置本地 Ollama
 */
export async function setupE2ETestEnvironment(page: Page) {
  await page.addInitScript(() => {
    // 1. 跳过新手引导
    const onboardingState = {
      completed: true,
      skipped: true,
      remindCount: 0,
      lastRemindDate: null,
    };
    window.localStorage.setItem('ifai_onboarding_state', JSON.stringify(onboardingState));

    // 2. 配置本地 Ollama 为默认模型
    // 注意：Zustand persist 默认使用 'settings-storage' 键，且结构包含 version 和 state
    const ollamaProvider = {
      id: 'ollama-e2e',
      name: 'Ollama E2E',
      protocol: 'openai',
      baseUrl: 'http://localhost:11434/v1/chat/completions',
      apiKey: 'not-needed', // 虽然不需要 token，但为了通过前端的一些非空检查，设置一个占位符
      models: ['qwen2.5-coder:latest', 'deepseek-coder:latest'],
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
        currentModel: 'qwen2.5-coder:latest',
        enableAutocomplete: true,
        useLocalModelForCompletion: true,
        agentAutoApprove: true,
      },
      version: 0
    };
    window.localStorage.setItem('settings-storage', JSON.stringify(settingsState));

    // 3. 默认打开 AI 聊天面板
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
