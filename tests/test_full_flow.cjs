const assert = require('assert');

/**
 * Test: Full flow from Zhipu AI SSE to file write
 */

console.log("=== Test: Full Flow with Unescape ===\n");

// Simulate unescapeToolArguments function
function unescapeToolArguments(args) {
    const result = { ...args };
    if (typeof result.content === 'string') {
        result.content = result.content
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
    }
    return result;
}

// Step 1: Parse SSE event (this happens in Rust/ai.rs)
const zhipuSSE = '{"id":"20251217001840c9b9004b98c84b5a","created":1765901920,"model":"glm-4","choices":[{"index":0,"finish_reason":"tool_calls","delta":{"role":"assistant","tool_calls":[{"id":"call_20251217001840c9b9004b98c84b5a_0","index":0,"type":"function","function":{"name":"agent_write_file","arguments":"{\\"content\\":\\"// 伪代码示例\\\\\\\\nfunction demo() {\\\\\\\\n  console.log(\\\\\\"这是一个简单的JavaScript示例\\\\\\");\\\\\\\\n}\\\\\\\\n\\\\\\\\ndemo();\\",\\"rel_path\\":\\"demo.js\\"}"}}]}}]}';

const parsed = JSON.parse(zhipuSSE);
const argumentsStr = parsed.choices[0].delta.tool_calls[0].function.arguments;

// Step 2: Parse arguments (this happens in useChatStore.ts, line 122)
let args = JSON.parse(argumentsStr);
console.log("1. After JSON.parse(arguments):");
console.log("   Content preview:", args.content.substring(0, 60) + "...");
console.log("   Content lines:", args.content.split('\n').length);
console.log();

// Step 3: Apply unescape (this should happen in useChatStore.ts, line 129)
args = unescapeToolArguments(args);
console.log("2. After unescapeToolArguments:");
console.log("   Content preview:", args.content.substring(0, 60) + "...");
console.log("   Content lines:", args.content.split('\n').length);
console.log();

// Verify the result
try {
    assert.strictEqual(args.rel_path, 'demo.js', "rel_path should be demo.js");
    assert.ok(args.content.includes('\n'), "Content should have real newlines");
    assert.strictEqual(args.content.split('\n').length, 6, "Content should have 6 lines");
    assert.ok(args.content.includes('function demo()'), "Content should have function");

    console.log("✅ Full flow test passed!");
    console.log("\nFinal content that should be written to demo.js:");
    console.log("---");
    console.log(args.content);
    console.log("---");

} catch (e) {
    console.error("❌ Test failed:", e.message);
    process.exit(1);
}
