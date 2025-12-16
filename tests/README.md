# Test Suite Documentation

This directory contains specification tests and debug utilities for the IfAI editor.

## Running Tests

```bash
# Run all spec tests
for test in tests/spec_*.cjs; do node "$test" || exit 1; done

# Run individual test
node tests/spec_agent_flow.cjs
```

## Test Files

### Specification Tests (spec_*.cjs)

These tests verify core functionality and serve as regression tests.

#### `spec_agent_flow.cjs`
**Purpose**: Verifies the agent tool call parsing workflow
**Tests**: Parsing of `agent_write_file` tool calls from AI responses, including the `<<FILE_CONTENT>>` placeholder replacement
**Key Assertions**:
- Tool call extraction from markdown code blocks
- Correct file path extraction
- Content replacement from code blocks

#### `spec_tool_history.cjs`
**Purpose**: Verifies multi-tool call history protocol
**Tests**: Construction of conversation history with multiple tool calls, including rejected tools
**Key Assertions**:
- Correct history payload structure
- Tool call status tracking (completed, failed, rejected)
- Sequential tool execution

#### `spec_escape_fix.cjs`
**Purpose**: Verifies the escape sequence handling in tool arguments
**Tests**: The `unescapeToolArguments` function that fixes Zhipu AI's double-escaped newlines
**Key Assertions**:
- Conversion of `\n` → newline
- Conversion of `\t` → tab
- Conversion of `\"` → quote
- Conversion of `\\` → backslash
- Only `content` field is unescaped
- Edge cases (empty strings, undefined values)

**Background**: Zhipu AI returns tool arguments with double-escaped newlines (e.g., `\\n` as literal text instead of line breaks), causing code to display on a single line. This test ensures the fix works correctly.

#### `spec_openfile_update.cjs`
**Purpose**: Verifies the `openFile` content update logic
**Tests**: File editor refresh behavior when reopening already-opened files
**Key Assertions**:
- Opening a new file
- Reopening a clean file with new content (should update)
- Reopening a dirty file with clean content (should update)
- Reopening a dirty file with dirty content (should NOT update)
- Reopening without new content (should preserve existing content)

**Background**: Previously, when `agent_write_file` updated a file that was already open in the editor, the editor wouldn't refresh the content. This test ensures files are properly refreshed when appropriate.

### Debug Utilities (debug_*.cjs, test_*.cjs)

These files help diagnose issues during development.

#### `debug_zhipu_arguments.cjs`
**Purpose**: Debug tool for analyzing Zhipu AI SSE events
**Usage**: Parses raw SSE events from Zhipu AI to identify JSON structure issues
**Output**: Step-by-step parsing breakdown showing where issues occur

#### `test_full_flow.cjs`
**Purpose**: End-to-end test of the Zhipu AI tool call flow
**Usage**: Simulates the complete flow from SSE event to final unescaped content
**Output**: Demonstrates the before/after state of content escaping

## Test Coverage

Current coverage includes:
- ✅ Tool call parsing from AI responses
- ✅ Multi-tool execution and history construction
- ✅ Escape sequence handling (Zhipu AI compatibility)
- ✅ File editor content refresh logic

## Adding New Tests

When adding new tests:
1. Use the `spec_*.cjs` naming convention for specification tests
2. Include clear assertions with descriptive error messages
3. Add documentation to this README
4. Test should exit with code 1 on failure, 0 on success
5. Include console output showing test progress

## Known Issues Addressed

### Issue 1: Zhipu AI Newline Display
**Problem**: Code from Zhipu AI displayed on a single line with visible `\n` characters
**Solution**: `unescapeToolArguments` function in `useChatStore.ts`
**Test**: `spec_escape_fix.cjs`

### Issue 2: File Editor Not Refreshing
**Problem**: When `agent_write_file` updated an already-open file, editor showed stale content
**Solution**: Enhanced `openFile` logic in `fileStore.ts` to update content when appropriate
**Test**: `spec_openfile_update.cjs`
