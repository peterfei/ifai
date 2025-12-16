const assert = require('assert');

/**
 * Debug Test: Analyze Zhipu AI tool_call arguments parsing issue
 */

console.log("=== Debug: Zhipu AI Arguments Parsing ===\n");

// Simulate the problematic SSE event from Zhipu AI (from the logs)
const zhipuSSE = '{"id":"20251217001840c9b9004b98c84b5a","created":1765901920,"model":"glm-4","choices":[{"index":0,"finish_reason":"tool_calls","delta":{"role":"assistant","tool_calls":[{"id":"call_20251217001840c9b9004b98c84b5a_0","index":0,"type":"function","function":{"name":"agent_write_file","arguments":"{\\"content\\":\\"// 伪代码示例\\\\\\\\nfunction demo() {\\\\\\\\n  console.log(\\\\\\"这是一个简单的JavaScript示例\\\\\\");\\\\\\\\n}\\\\\\\\n\\\\\\\\ndemo();\\",\\"rel_path\\":\\"demo.js\\"}"}}]}}]}';

console.log("1. Raw SSE event from Zhipu:");
console.log(zhipuSSE);
console.log();

// Parse the SSE event
let parsed;
try {
    parsed = JSON.parse(zhipuSSE);
    console.log("✅ Step 1: SSE JSON parse successful");
} catch (e) {
    console.error("❌ Step 1: SSE JSON parse failed:", e.message);
    process.exit(1);
}

// Extract arguments
const toolCall = parsed.choices[0].delta.tool_calls[0];
const argumentsStr = toolCall.function.arguments;

console.log("\n2. Extracted arguments string:");
console.log(argumentsStr);
console.log();

// Parse arguments
let args;
try {
    args = JSON.parse(argumentsStr);
    console.log("✅ Step 2: Arguments JSON parse successful");
    console.log("Parsed args:", args);
} catch (e) {
    console.error("❌ Step 2: Arguments JSON parse failed:", e.message);
    console.log("\nThis is the problem! Arguments string is not valid JSON.");
    process.exit(1);
}

// Check if args have required fields
console.log("\n3. Checking required fields:");
console.log("- rel_path:", args.rel_path || "(missing)");
console.log("- content:", args.content ? `${args.content.substring(0, 50)}...` : "(missing)");

if (!args.rel_path || !args.content) {
    console.error("\n❌ Missing required fields!");
    process.exit(1);
}

// Check content newlines
console.log("\n4. Checking content newlines:");
const contentLines = args.content.split('\n');
console.log("Content has", contentLines.length, "lines");
if (contentLines.length === 1) {
    console.error("⚠️  Content is on single line - newlines are escaped!");
    console.log("Content contains literal \\n:", args.content.includes('\\n'));
} else {
    console.log("✅ Content has proper newlines");
}

console.log("\n=== End Debug ===");
