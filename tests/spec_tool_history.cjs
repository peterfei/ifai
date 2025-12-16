
const assert = require('assert');

// This is a simplified, in-memory mock of the Zustand store's logic
// to test history construction without running the full application.

function buildHistoryForMultiToolApproval(messages, msgIndex) {
    const historySoFar = messages.slice(0, msgIndex + 1);
    const assistantMessage = messages[msgIndex];

    const history = historySoFar.map(m => {
        const textContent = (m.content && m.content.trim().length > 0) ? m.content : ""; // Changed from null to ""
        
        return {
            role: m.role,
            content: textContent,
            tool_calls: m.toolCalls?.map(tc => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.tool, arguments: JSON.stringify(tc.args) },
            })),
            tool_call_id: m.role === 'tool' ? m.tool_call_id : undefined,
        };
    });

    const completedToolCalls = assistantMessage.toolCalls.filter(tc => tc.status === 'completed' || tc.status === 'failed');
    for (const completedCall of completedToolCalls) {
        history.push({
            role: 'tool',
            content: completedCall.result,
            tool_call_id: completedCall.id,
        });
    }

    return history;
}


console.log("Running Spec Test: Multi-Tool Call History Protocol...");

// --- Test Setup ---
const USER_PROMPT = "Create demo.js and also list the files in src.";
const TOOL_ID_1 = "call_write_123";
const TOOL_ID_2 = "call_list_456";
const FAKE_TOOL_RESULT_1 = "Successfully wrote to demo.js";
const FAKE_TOOL_RESULT_2 = "src/main.tsx\nsrc/App.tsx";

// 1. Initial state: user has sent a prompt
const initialMessages = [
    { id: "msg_user_1", role: 'user', content: USER_PROMPT },
];

// 2. AI responds with two tool calls. We simulate that both have been approved and now have a status and result.
const assistantMessageWithToolCalls = {
    id: "msg_asst_1",
    role: 'assistant',
    content: "", // This reflects the updated state
    toolCalls: [
        {
            id: TOOL_ID_1,
            tool: 'agent_write_file',
            args: { rel_path: "demo.js", content: "console.log('hello')" },
            status: 'completed',
            result: FAKE_TOOL_RESULT_1
        },
        {
            id: TOOL_ID_2,
            tool: 'agent_list_dir',
            args: { rel_path: "src" },
            status: 'completed',
            result: FAKE_TOOL_RESULT_2
        }
    ]
};
const messagesAfterAI = [...initialMessages, assistantMessageWithToolCalls];

// 3. Simulate history construction after all tools are completed
const historyForNextTurn = buildHistoryForMultiToolApproval(
    messagesAfterAI,
    1 // index of assistant message
);

// --- Verification ---
try {
    console.log("Verifying history payload for multi-tool scenario...");
    
    assert.strictEqual(historyForNextTurn.length, 4, "History should have 4 messages (user, assistant, tool, tool).");
    
    const asstMsg = historyForNextTurn[1];
    const toolMsg1 = historyForNextTurn[2];
    const toolMsg2 = historyForNextTurn[3];

    // Verify Assistant Message
    assert.strictEqual(asstMsg.role, 'assistant', "The second message must be from the assistant.");
    assert.strictEqual(asstMsg.content, "", "Assistant message content should be an empty string when it contains tool_calls.");
    assert.strictEqual(asstMsg.tool_calls.length, 2, "Assistant message in history must contain 2 tool_calls.");
    assert.strictEqual(asstMsg.tool_calls[0].id, TOOL_ID_1, "Assistant's first tool_call ID does not match.");
    assert.strictEqual(asstMsg.tool_calls[1].id, TOOL_ID_2, "Assistant's second tool_call ID does not match.");

    // Verify First Tool Message
    assert.strictEqual(toolMsg1.role, 'tool', "The third message must have role 'tool'.");
    assert.strictEqual(toolMsg1.tool_call_id, TOOL_ID_1, "First tool message's 'tool_call_id' is incorrect.");
    assert.strictEqual(toolMsg1.content, FAKE_TOOL_RESULT_1, "First tool message content is incorrect.");

    // Verify Second Tool Message
    assert.strictEqual(toolMsg2.role, 'tool', "The fourth message must have role 'tool'.");
    assert.strictEqual(toolMsg2.tool_call_id, TOOL_ID_2, "Second tool message's 'tool_call_id' is incorrect.");
    assert.strictEqual(toolMsg2.content, FAKE_TOOL_RESULT_2, "Second tool message content is incorrect.");

    console.log("✅ Spec Test Passed: History construction for multi-tool feedback is correct.");

} catch (e) {
    console.error("❌ Spec Test Failed:");
    console.error(e.message);
    console.error("Generated History:", JSON.stringify(historyForNextTurn, null, 2));
    process.exit(1);
}
