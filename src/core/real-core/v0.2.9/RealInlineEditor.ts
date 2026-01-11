/**
 * v0.2.9 真实行内编辑服务
 *
 * 使用 LLM API 进行代码编辑（商业版）
 */

import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../../../stores/settingsStore';
import { IInlineEditor, InlineEditorRequest, InlineEditorResponse, InlineEditorOptions } from '../../interfaces/v0.2.9/IInlineEditor';

/**
 * 检测是否在 Tauri 环境中
 */
function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * 获取提供商配置
 */
function getProviderConfig() {
  // 从 settingsStore 获取当前提供商配置
  const { providers, currentProviderId } = useSettingsStore.getState();
  const currentProvider = providers.find((p: any) => p.id === currentProviderId);

  if (!currentProvider || !currentProvider.apiKey || !currentProvider.enabled) {
    throw new Error('No valid AI provider configured. Please check your settings.');
  }

  return {
    id: currentProvider.id,
    name: currentProvider.name,
    protocol: currentProvider.protocol,
    apiKey: currentProvider.apiKey,
    baseUrl: currentProvider.baseUrl,
    models: currentProvider.models,
    enabled: currentProvider.enabled,
  };
}

/**
 * 真实行内编辑器（商业版）
 *
 * 使用 LLM API 进行代码编辑
 * - 在 Tauri 环境中：使用 invoke('ai_completion') 调用后端
 * - 在浏览器环境中：直接使用 fetch 调用 LLM API
 */
export class RealInlineEditor implements IInlineEditor {
  /**
   * 应用代码编辑
   */
  async applyEdit(
    request: InlineEditorRequest,
    options?: InlineEditorOptions
  ): Promise<InlineEditorResponse> {
    console.log('[RealInlineEditor] applyEdit called:', {
      instruction: request.instruction,
      codeLength: request.code.length,
      language: request.language,
      isTauri: isTauriEnvironment(),
    });

    try {
      const providerConfig = getProviderConfig();

      // 构建编辑提示词
      const prompt = this.buildEditPrompt(request);

      // 调用 LLM API
      const messages = [
        {
          role: 'system',
          content: this.getSystemPrompt(request.language),
        },
        {
          role: 'user',
          content: prompt,
        },
      ];

      console.log('[RealInlineEditor] Calling LLM API...');

      // 流式回调
      const onProgress = options?.onProgress;

      let result: string;

      if (isTauriEnvironment()) {
        // 🔥 Tauri 环境：使用后端 invoke
        console.log('[RealInlineEditor] Using Tauri backend invoke');
        const invokeResult = await invoke<string>('ai_completion', {
          providerConfig,
          messages,
          stream: !!onProgress,
        });

        if (typeof invokeResult !== 'string') {
          console.error('[RealInlineEditor] Unexpected result type:', typeof invokeResult, invokeResult);
          throw new Error(`Expected string response from Tauri, got ${typeof invokeResult}`);
        }

        result = invokeResult;
      } else {
        // 🔥 浏览器环境：直接使用 fetch 调用 LLM API
        console.log('[RealInlineEditor] Using direct fetch to LLM API');

        // 自动补全 baseUrl：如果缺少 /chat/completions 后缀，自动添加
        let apiBaseUrl = providerConfig.baseUrl;
        if (apiBaseUrl && !apiBaseUrl.endsWith('/chat/completions')) {
          apiBaseUrl = apiBaseUrl.replace(/\/+$/, '') + '/chat/completions';
        }

        if (!apiBaseUrl) {
          throw new Error('Provider baseUrl is missing');
        }

        const model = providerConfig.models?.[0] || 'gpt-4o-mini';

        console.log('[RealInlineEditor] Fetching from:', {
          baseUrl: apiBaseUrl,
          model,
        });

        const response = await fetch(apiBaseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${providerConfig.apiKey}`
          },
          body: JSON.stringify({
            model,
            messages,
            stream: false
          })
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.choices || !data.choices[0]) {
          console.error('[RealInlineEditor] Invalid API response:', data);
          throw new Error('Invalid API response: missing choices');
        }

        result = data.choices[0].message?.content || '';
      }

      if (!result || result.length === 0) {
        throw new Error('Empty response from LLM API');
      }

      // 解析响应
      const modifiedCode = this.extractCode(result, request.language);

      console.log('[RealInlineEditor] LLM API returned modified code, length:', modifiedCode.length);

      // 流式输出回调
      if (onProgress) {
        onProgress(modifiedCode);
      }

      return {
        originalCode: request.code,
        modifiedCode,
        instruction: request.instruction,
        success: true,
        summary: `Applied: ${request.instruction}`,
        changes: [request.instruction],
      };
    } catch (error) {
      console.error('[RealInlineEditor] Error calling LLM API:', error);
      return {
        originalCode: request.code,
        modifiedCode: request.code,
        instruction: request.instruction,
        success: false,
        summary: 'Failed to apply edit',
        changes: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 流式应用代码编辑
   */
  async applyEditStream(
    request: InlineEditorRequest,
    onProgress: (chunk: string) => void
  ): Promise<InlineEditorResponse> {
    return this.applyEdit(request, { onProgress });
  }

  /**
   * 检查服务是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      getProviderConfig();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取服务提供商信息
   */
  getProviderInfo(): {
    name: string;
    version: string;
    features: string[];
  } {
    try {
      const config = getProviderConfig();
      return {
        name: config.name,
        version: '0.2.9',
        features: ['llm-editing', 'streaming', 'multi-language', 'tauri-and-browser'],
      };
    } catch {
      return {
        name: 'RealInlineEditor (Not Configured)',
        version: '0.2.9',
        features: [],
      };
    }
  }

  // ==========================================================================
  // 私有辅助方法
  // ==========================================================================

  /**
   * 构建编辑提示词
   */
  private buildEditPrompt(request: InlineEditorRequest): string {
    const { instruction, code, language, selectedCode, cursorPosition } = request;

    let prompt = `You are a code editor. Your task is to modify the code according to the user's instruction.

**Language:** ${language}

**User Instruction:** ${instruction}`;

    if (selectedCode) {
      prompt += `\n\n**Selected Code:**\n\`\`\`${language}\n${selectedCode}\n\`\`\``;
    }

    if (cursorPosition) {
      prompt += `\n\n**Cursor Position:** Line ${cursorPosition.line}, Column ${cursorPosition.column}`;
    }

    prompt += `\n\n**Original Code:**\n\`\`\`${language}\n${code}\n\`\`\``;

    prompt += `

**Output Format:**
Reply ONLY with the modified code wrapped in a code block. Do not include any explanations, notes, or markdown outside the code block.

Example output format:
\`\`\`${language}
// modified code here
\`\`\``;

    return prompt;
  }

  /**
   * 获取系统提示词
   */
  private getSystemPrompt(language: string): string {
    return `You are an expert code editor specializing in ${language}. Your role is to:
1. Understand the user's editing instruction
2. Apply the requested changes to the code
3. Maintain code style and formatting
4. Preserve comments and documentation unless instructed to modify them
5. Return ONLY the modified code in a code block

Important:
- Do not include any explanations outside the code block
- Do not add markdown formatting outside the code block
- The output should be directly usable as the complete modified file`;
  }

  /**
   * 从 LLM 响应中提取代码
   */
  private extractCode(response: string, language: string): string {
    // 移除可能的 markdown 代码块标记
    let code = response;

    // 移除 ```language 和 ``` 标记
    code = code.replace(/^```[\w]*\n/i, '');
    code = code.replace(/\n```$/i, '');

    // 移除可能的 "Here's the modified code:" 等前缀
    const prefixes = [
      "Here's the modified code:",
      "Modified code:",
      "Here is the modified code:",
      "The modified code is:",
    ];

    for (const prefix of prefixes) {
      if (code.includes(prefix)) {
        code = code.substring(code.indexOf(prefix) + prefix.length).trim();
      }
    }

    return code.trim();
  }
}

/**
 * 获取默认的 RealInlineEditor 实例
 */
export function getRealInlineEditor(): RealInlineEditor {
  return new RealInlineEditor();
}
