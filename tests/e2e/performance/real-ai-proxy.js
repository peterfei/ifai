/**
 * 真实 AI HTTP Proxy — 轻量级替代 Tauri HTTP API
 *
 * 启动: node tests/e2e/performance/real-ai-proxy.js
 * 监听: http://localhost:3333/api/ai/chat/stream
 *
 * 与 setup-utils.ts 中 invoke('ai_chat') 的 real AI 模式兼容。
 */

import { createServer } from 'http';

const PORT = 3333;

// 从 .env.e2e.local 读取配置
const E2E_AI_API_KEY = process.env.E2E_AI_API_KEY || process.env.npm_config_E2E_AI_API_KEY || '';
const E2E_AI_BASE_URL = process.env.E2E_AI_BASE_URL || 'https://api.deepseek.com';
const E2E_AI_MODEL = process.env.E2E_AI_MODEL || 'deepseek-chat';

const server = createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || !req.url?.includes('/api/ai/chat/stream')) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', async () => {
    try {
      const { messages, provider_config, model } = JSON.parse(body);
      const apiKey = provider_config?.api_key || E2E_AI_API_KEY;
      const baseUrl = provider_config?.base_url || E2E_AI_BASE_URL;
      const modelName = model || E2E_AI_MODEL;

      // Build chat completions URL
      // DeepSeek: baseUrl=https://api.deepseek.com → /chat/completions
      // OpenAI:   baseUrl=https://api.openai.com/v1 → /chat/completions
      const base = baseUrl.replace(/\/+$/, '');
      const apiUrl = base.endsWith('/chat/completions')
        ? base
        : `${base}/chat/completions`;

      console.log(`[Proxy] → ${apiUrl} model=${modelName} messages=${messages?.length || 0}`);

      const apiRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          model: modelName,
          messages: messages || [],
          stream: true,
        }),
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        console.error(`[Proxy] ❌ API error ${apiRes.status}: ${errText}`);
        res.writeHead(502);
        res.end(JSON.stringify({ error: `API ${apiRes.status}: ${errText}` }));
        return;
      }

      // SSE response to client
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const reader = apiRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        buffer += text;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]' || !data) continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              chunkCount++;
              const eventData = JSON.stringify({
                event_type: 'content_delta',
                content_delta: delta,
              });
              res.write(`data: ${eventData}\n\n`);
            }

            if (parsed.choices?.[0]?.finish_reason === 'stop') {
              const doneData = JSON.stringify({ event_type: 'done' });
              res.write(`data: ${doneData}\n\n`);
            }
          } catch {
            // skip parse errors
          }
        }
      }

      console.log(`[Proxy] ✅ Stream complete (${chunkCount} chunks)`);

      // Emit done if not already sent
      res.write(`data: ${JSON.stringify({ event_type: 'done' })}\n\n`);
      res.end();

    } catch (err) {
      console.error('[Proxy] ❌ Error:', err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(err) }));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  🤖 Real AI HTTP Proxy`);
  console.log(`========================================`);
  console.log(`  Listening:  http://localhost:${PORT}/api/ai/chat/stream`);
  const base = E2E_AI_BASE_URL.replace(/\/+$/, '');
  const displayUrl = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  console.log(`  API URL:    ${displayUrl}`);
  console.log(`  Model:      ${E2E_AI_MODEL}`);
  console.log(`  API Key:    ${E2E_AI_API_KEY ? E2E_AI_API_KEY.substring(0, 12) + '...' : 'NOT SET!'}`);
  console.log(`========================================\n`);
});
