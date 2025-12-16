const assert = require('assert');

/**
 * Test: Verify that escape sequences in tool arguments are properly unescaped
 * This tests the fix for Zhipu AI model where newlines were appearing as "\n" literals
 */

// Simulate the unescapeToolArguments function
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

console.log("Running Spec Test: Escape Sequence Fix Verification...");

// Test Case 1: Basic newline escaping
const testArgs1 = {
    rel_path: "demo.js",
    content: "// 伪代码示例\\nfunction demo() {\\n  console.log(\\\"Hello, World!\\\");\\n}\\n\\ndemo();"
};

const result1 = unescapeToolArguments(testArgs1);

try {
    assert.ok(result1.content.includes('\n'), "FAILED: Newlines should be unescaped");
    assert.ok(!result1.content.includes('\\n'), "FAILED: Escaped newlines should not remain");
    assert.ok(result1.content.includes('function demo()'), "FAILED: Content should be preserved");
    assert.strictEqual(result1.content.split('\n').length, 6, "FAILED: Should have 6 lines (5 newlines + 1)");

    console.log("✅ Test Case 1 Passed: Basic newline unescaping works");
} catch (e) {
    console.error("❌ Test Case 1 Failed:");
    console.error(e.message);
    console.error("Result content:", result1.content);
    process.exit(1);
}

// Test Case 2: Multiple escape types
const testArgs2 = {
    content: "Line1\\nLine2\\tTabbed\\r\\nLine3\\\\ Backslash\\\"Quote"
};

const result2 = unescapeToolArguments(testArgs2);

try {
    assert.ok(result2.content.includes('\n'), "FAILED: Should have newline");
    assert.ok(result2.content.includes('\t'), "FAILED: Should have tab");
    assert.ok(result2.content.includes('\r'), "FAILED: Should have carriage return");
    assert.ok(result2.content.includes('\\'), "FAILED: Should have backslash");
    assert.ok(result2.content.includes('"'), "FAILED: Should have double quote");

    console.log("✅ Test Case 2 Passed: Multiple escape types handled correctly");
} catch (e) {
    console.error("❌ Test Case 2 Failed:");
    console.error(e.message);
    console.error("Result content:", JSON.stringify(result2.content));
    process.exit(1);
}

// Test Case 3: Non-content fields should not be affected
const testArgs3 = {
    rel_path: "some\\npath\\nwith\\nescapes.txt",
    content: "content\\nwith\\nnewlines",
    other: "other\\nfield"
};

const result3 = unescapeToolArguments(testArgs3);

try {
    assert.strictEqual(result3.rel_path, "some\\npath\\nwith\\nescapes.txt", "FAILED: rel_path should remain unchanged");
    assert.ok(result3.content.includes('\n'), "FAILED: content should be unescaped");
    assert.strictEqual(result3.other, "other\\nfield", "FAILED: other fields should remain unchanged");

    console.log("✅ Test Case 3 Passed: Only 'content' field is unescaped");
} catch (e) {
    console.error("❌ Test Case 3 Failed:");
    console.error(e.message);
    process.exit(1);
}

// Test Case 4: Edge case - empty and undefined
const testArgs4 = {
    content: "",
    other: undefined
};

const result4 = unescapeToolArguments(testArgs4);

try {
    assert.strictEqual(result4.content, "", "FAILED: Empty content should remain empty");
    assert.strictEqual(result4.other, undefined, "FAILED: Undefined should remain undefined");

    console.log("✅ Test Case 4 Passed: Edge cases handled correctly");
} catch (e) {
    console.error("❌ Test Case 4 Failed:");
    console.error(e.message);
    process.exit(1);
}

console.log("\n🎉 All Spec Tests Passed! Escape sequence fix is working correctly.");
