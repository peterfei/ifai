const { v4: uuidv4 } = require('uuid');

function parseToolCalls(content) {
    const toolCalls = [];
    let cleanContent = content;
    const replacements = [];

    const addToolCall = (jsonStr, start, end) => {
        try {
            const cleanJson = jsonStr
                .replace(/,\s*}/g, '}')
                .replace(/,\s*]/g, ']');
            const parsed = JSON.parse(cleanJson);
            if (parsed.tool && parsed.args) {
                 if (parsed.args.content === '<<FILE_CONTENT>>') {
                    parsed.args.content = "EXTRACTED_CONTENT"; 
                 }
                const isOverlap = replacements.some(r => 
                    (start >= r.start && start < r.end) ||
                    (end > r.start && end <= r.end)
                );
                if (!isOverlap) {
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
            }
        } catch (e) {}
        return false;
    };

    const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?"tool"[\s\S]*?\})\s*```/gi;
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
        addToolCall(match[1], match.index, match.index + match[0].length);
    }

    const bareJsonStartRegex = /\{\s*"tool"\s*:/g;
    
    while ((match = bareJsonStartRegex.exec(content)) !== null) {
        const start = match.index;
        if (replacements.some(r => start >= r.start && start < r.end)) continue;
        let braceCount = 0;
        let inString = false;
        let escape = false;
        let end = -1;
        for (let i = start; i < content.length; i++) {
            const char = content[i];
            if (escape) { escape = false; continue; }
            if (char === '\\') { escape = true; continue; }
            if (char === '"') { inString = !inString; continue; }
            if (!inString) {
                if (char === '{') braceCount++;
                if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        end = i + 1;
                        break;
                    }
                }
            }
        }
        if (end !== -1) {
            addToolCall(content.substring(start, end), start, end);
        }
    }

    const streamingRegex = /```(?:json)?\s*(\{[\s\S]*?"tool"[\s\S]*)$/i;
    const streamingMatch = streamingRegex.exec(content);
    if (streamingMatch) {
        const start = streamingMatch.index;
        const potentialJson = streamingMatch[1];
        const end = content.length;
        const isOverlap = replacements.some(r => start < r.end && r.start < end);
        if (!isOverlap) {
            toolCalls.push({
                id: 'streaming-tool',
                tool: 'loading',
                args: {},
                isPartial: true
            });
        }
    }

    return { toolCalls };
}

const testCase1_NoJSON = `
import requests
# ... code ...
print('Done')

This code uploads a file.
`;

const testCase2_ValidJSON = `
\
console.log("Hi");
\

\
{
  "tool": "agent_write_file",
  "args": {
    "rel_path": "Demo.js",
    "content": "<<FILE_CONTENT>>"
  }
}
\
`;

const testCase3_Streaming = `
\
{
  "tool": "agent_write_file",
  "args": {
`;

console.log("--- Test Case 1: Code but no JSON ---");
const res1 = parseToolCalls(testCase1_NoJSON);
console.log(JSON.stringify(res1, null, 2));
if (res1.toolCalls.length === 0) console.log("PASS: No tool calls detected (as expected). Problem is AI not outputting JSON.");

console.log("\n--- Test Case 2: Valid JSON ---");
const res2 = parseToolCalls(testCase2_ValidJSON);
console.log(JSON.stringify(res2, null, 2));
if (res2.toolCalls.length === 1) console.log("PASS: 1 tool call detected.");

console.log("\n--- Test Case 3: Streaming ---");
const res3 = parseToolCalls(testCase3_Streaming);
console.log(JSON.stringify(res3, null, 2));
if (res3.toolCalls.length === 1 && res3.toolCalls[0].isPartial) console.log("PASS: Streaming detected.");

