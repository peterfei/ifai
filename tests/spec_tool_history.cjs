
const assert = require('assert');
const { v4: uuidv4 } = require('uuid');

// This is a simplified, in-memory mock of the Zustand store's logic
// to test history construction without running the full application.

function buildHistoryForToolApproval(messages, msgIndex, toolCall, result) {
    const historySoFar = messages.slice(0, msgIndex + 1);

    const history = historySoFar.map(m => {
        let contentParts = [];
        if (m.multiModalContent && m.multiModalContent.length > 0) {
            contentParts = m.multiModalContent;
        } else if (m.content) {
            contentParts = [{ type: 'text', text: m.content }];
        }
        
        let content = contentParts;
        if (contentParts.length === 1 && contentParts[0].type === 'text') {
            content = contentParts[0].text || ".";
        }

        return {
            role: m.role,
            content: content,
            tool_calls: m.toolCalls?.map((tc, index) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.tool, arguments: JSON.stringify(tc.args) },
                index,
            })),
            tool_call_id: m.tool_call_id,
        };
    });

    history.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
    });

    return history;
}


console.log("Running Spec Test: Tool Call History Protocol...");

// --- Test Setup ---
const USER_PROMPT = "Create demo.js";
const TOOL_ID = "call_12345";
const FAKE_TOOL_RESULT = "Successfully wrote to demo.js";

// 1. Initial state: user has sent a prompt
const initialMessages = [
    { id: "msg_user_1", role: 'user', content: USER_PROMPT },
];

// 2. AI responds with a tool call
const assistantMessageWithToolCall = {
    id: "msg_asst_1",
    role: 'assistant',
    content: null, // Native tool calls have null content
    toolCalls: [{
        id: TOOL_ID,
        tool: 'agent_write_file',
        args: { rel_path: "demo.js", content: "console.log('hello')" },
        status: 'pending'
    }]
};
const messagesAfterAI = [...initialMessages, assistantMessageWithToolCall];

// 3. Simulate `approveToolCall`
const toolCallToApprove = assistantMessageWithToolCall.toolCalls[0];
const historyForNextTurn = buildHistoryForToolApproval(
    messagesAfterAI,
    1, // index of assistant message
    toolCallToApprove,
    FAKE_TOOL_RESULT
);

// --- Verification ---
try {
    console.log("Verifying history payload...");
    
    // R1.3 Verification: Check the last two messages
    assert.ok(historyForNextTurn.length >= 2, "History should have at least two messages.");
    
    const lastMessage = historyForNextTurn[historyForNextTurn.length - 1];
    const secondToLastMessage = historyForNextTurn[historyForNextTurn.length - 2];

    // Verify Assistant Message
    assert.strictEqual(secondToLastMessage.role, 'assistant', "The message before the tool result must be from the assistant.");
    assert.ok(secondToLastMessage.tool_calls, "Assistant message in history must contain 'tool_calls' array.");
    assert.strictEqual(secondToLastMessage.tool_calls[0].id, TOOL_ID, "Assistant's tool_call ID does not match.");

    // Verify Tool Message
    assert.strictEqual(lastMessage.role, 'tool', "The last message must have role 'tool'.");
    assert.ok(lastMessage.tool_call_id, "Tool message is missing 'tool_call_id'.");
    assert.strictEqual(lastMessage.tool_call_id, TOOL_ID, "Tool message's 'tool_call_id' does not match the assistant's tool call ID.");
    assert.strictEqual(lastMessage.content, FAKE_TOOL_RESULT, "Tool message content is incorrect.");

    console.log("✅ Spec Test Passed: History construction for tool feedback is correct.");

} catch (e) {
    console.error("❌ Spec Test Failed:");
    console.error(e.message);
    console.error("Generated History:", JSON.stringify(historyForNextTurn, null, 2));
    process.exit(1);
}
