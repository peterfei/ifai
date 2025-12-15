const assert = require('assert');
const { v4: uuidv4 } = require('uuid');

function parseToolCalls(content) {
    const toolCalls = [];
    const replacements = [];

    const addToolCall = (jsonStr, start, end) => {
        try {
            const cleanJson = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
            const parsed = JSON.parse(cleanJson);
            
            if (parsed.tool && parsed.args) {
                 if (parsed.args.content === '<<FILE_CONTENT>>') {
                    const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
                    const blocks = [];
                    let match;
                    while ((match = codeBlockRegex.exec(content)) !== null) {
                        if (match[2].includes('"tool":') && match[2].includes('agent_write_file')) continue;
                        blocks.push({
                            start: match.index,
                            end: match.index + match[0].length,
                            content: match[2]
                        });
                    }
                    if (blocks.length > 0) {
                        parsed.args.content = blocks[blocks.length - 1].content.trim();
                    }
                 }

                const toolCall = {
                    id: uuidv4(),
                    tool: String(parsed.tool).trim(),
                    args: parsed.args,
                    rawJson: jsonStr,
                    startIndex: start,
                    endIndex: end,
                    status: 'pending'
                };
                toolCalls.push(toolCall);
                replacements.push({ start, end, toolCall });
                return true;
            }
        } catch (e) {}
        return false;
    };

    const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?"tool"[\s\S]*?\})\s*```/gi;
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
        addToolCall(match[1], match.index, match.index + match[0].length);
    }

    return { toolCalls };
}

// Escaped backticks for the template string in the file
const specInput = "\nHere is the code for the file:\n\n```javascript\nimport React from 'react';\nconst App = () => <div>Hello World</div>;\nexport default App;\n```\n\n```json\n{\n  \"tool\": \"agent_write_file\",\n  \"args\": {\n    \"rel_path\": \"src/App.js\",\n    \"content\": \"<<FILE_CONTENT>>\"\n  }\n}\n```\n";

console.log("Running Spec Test: Agent Flow Verification...");

const result = parseToolCalls(specInput);

try {
    assert.strictEqual(result.toolCalls.length, 1, "FAILED: No tool call detected from Spec Input");
    const call = result.toolCalls[0];
    assert.strictEqual(call.tool, "agent_write_file", "FAILED: Incorrect tool name");
    assert.strictEqual(call.args.rel_path, "src/App.js", "FAILED: Incorrect file path");
    assert.ok(call.args.content.includes("export default App"), "FAILED: File content was not extracted from code block");
    assert.ok(!call.args.content.includes("<<FILE_CONTENT>>"), "FAILED: Placeholder was not replaced");

    console.log("✅ Spec Test Passed!");
    console.log("Parsed Tool Call:", JSON.stringify(call, null, 2));

} catch (e) {
    console.error("❌ Spec Test Failed:");
    console.error(e.message);
    process.exit(1);
}