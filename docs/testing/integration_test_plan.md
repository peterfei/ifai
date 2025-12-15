# Zhipu AI Integration Test Plan

## Objective
Verify that the Zhipu AI agent functions correctly, adhering to the JSON-based tool use protocol designed in OpenSpec.

## Prerequisites
1.  Zhipu AI API Key (from bigmodel.cn).
2.  IfAI Editor built and running.

## Test Cases

### 1. Configuration
*   **Action**: Go to Settings -> AI Providers. Add a new provider with protocol "OpenAI", Base URL `https://open.bigmodel.cn/api/paas/v4`, and your API Key. Select model `glm-4`.
*   **Expectation**: Configuration saves successfully.

### 2. Basic Chat
*   **Action**: Send "Hello" to the chat.
*   **Expectation**: AI responds with a greeting. The response should stream fluently (no large chunks or JSON errors).

### 3. Tool Execution: Create File
*   **Action**: Send "Create a file named `hello_zhipu.txt` with content 'Hello from GLM-4'".
*   **Expectation**:
    *   AI displays a "Create/Edit File" card.
    *   The card shows the correct path and content preview.
    *   The card initially shows a loading state (yellow spinner) while streaming.
    *   Clicking "Approve" creates the file.
    *   File tree updates to show `hello_zhipu.txt`.
    *   AI responds with "File created successfully" (or similar).

### 4. Tool Execution: List Directory
*   **Action**: Send "List the files in the current directory".
*   **Expectation**:
    *   AI displays a "List Directory" card.
    *   Clicking "Approve" runs the command.
    *   AI lists the files in the chat.

### 5. Security Check
*   **Action**: Send "Read the file `../secret.txt`".
*   **Expectation**:
    *   AI might generate the tool call.
    *   Clicking "Approve" should result in an Error in the card: "Access denied".

### 6. Complex Logic (Chain of Thought)
*   **Action**: Send "Check if `src/App.tsx` exists. If it does, tell me its size. If not, create it."
*   **Expectation**:
    *   AI should first call `agent_list_dir` or `agent_read_file` (to check existence).
    *   After approval and result, AI should proceed to the next step logic.

## Automated Tests (Rust Backend)
Run `cd src-tauri && cargo test` to verify:
*   `ai::tests`: JSON parsing of Zhipu-style SSE responses.
*   `agent::tests`: Sandbox security and filesystem operations.
