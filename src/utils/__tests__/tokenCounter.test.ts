import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  countTokens, 
  countTokensBatch, 
  estimateTokens, 
  getModelMaxTokens, 
  calculateTokenUsagePercentage,
  formatTokenCount,
  countMessagesTokens
} from '../tokenCounter';

// Mock Tauri invoke
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args)
}));

describe('TokenCounter', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  describe('Backend Integration', () => {
    it('should call backend to count tokens', async () => {
      invokeMock.mockResolvedValue(10);
      const text = 'hello world';
      const model = 'gpt-4';
      
      const count = await countTokens(text, model);
      
      expect(invokeMock).toHaveBeenCalledWith('count_tokens', { text, model });
      expect(count).toBe(10);
    });

    it('should call backend to batch count tokens', async () => {
      invokeMock.mockResolvedValue([5, 10]);
      const texts = ['hello', 'hello world'];
      const model = 'gpt-4';
      
      const counts = await countTokensBatch(texts, model);
      
      expect(invokeMock).toHaveBeenCalledWith('count_tokens_batch', { texts, model });
      expect(counts).toEqual([5, 10]);
    });

    it('should call backend to estimate tokens', async () => {
      invokeMock.mockResolvedValue(3);
      const text = 'hello';
      
      const count = await estimateTokens(text);
      
      expect(invokeMock).toHaveBeenCalledWith('estimate_tokens_cmd', { text });
      expect(count).toBe(3);
    });
  });

  describe('Utility Functions', () => {
    it('should get correct max tokens for models', () => {
      expect(getModelMaxTokens('gpt-4')).toBe(8192);
      expect(getModelMaxTokens('gpt-4-turbo')).toBe(128000);
      expect(getModelMaxTokens('claude-3-opus')).toBe(200000);
      expect(getModelMaxTokens('gemini-1.5-pro')).toBe(1000000);
      expect(getModelMaxTokens('unknown-model')).toBe(4096); // default
    });

    it('should calculate usage percentage', () => {
      // gpt-4 limit is 8192
      expect(calculateTokenUsagePercentage(4096, 'gpt-4')).toBe(50);
      expect(calculateTokenUsagePercentage(8192, 'gpt-4')).toBe(100);
      expect(calculateTokenUsagePercentage(10000, 'gpt-4')).toBe(100); // capped at 100
    });

    it('should format token counts', () => {
      expect(formatTokenCount(500)).toBe('500');
      expect(formatTokenCount(1500)).toBe('1.5K');
      expect(formatTokenCount(1500000)).toBe('1.50M');
    });
  });

  describe('Message Token Counting', () => {
    it('should serialize messages and count tokens', async () => {
      invokeMock.mockResolvedValue(20);
      const messages = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' }
      ];
      const model = 'gpt-4';

      const count = await countMessagesTokens(messages, model);

      const expectedText = 'user: hello\nassistant: world';
      expect(invokeMock).toHaveBeenCalledWith('count_tokens', { text: expectedText, model });
      expect(count).toBe(20);
    });
  });
});
