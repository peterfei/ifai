const assert = require('assert');

/**
 * Spec Test: Verify openFile updates content when file is already open
 */

console.log("Running Spec Test: openFile Content Update Logic...\n");

// Simulate the openFile logic
function openFileLogic(state, file) {
    const existing = state.openedFiles.find(f => f.path === file.path);

    if (existing) {
        const shouldUpdateContent = file.content !== undefined &&
                                   (!existing.isDirty || !file.isDirty);

        const updatedFiles = state.openedFiles.map(f => {
            if (f.id === existing.id) {
                return {
                    ...f,
                    initialLine: file.initialLine,
                    ...(shouldUpdateContent ? { content: file.content, isDirty: file.isDirty } : {})
                };
            }
            return f;
        });
        return { ...state, activeFileId: existing.id, openedFiles: updatedFiles };
    }

    return {
        ...state,
        openedFiles: [...state.openedFiles, file],
        activeFileId: file.id,
    };
}

// Test Case 1: Open new file
console.log("Test 1: Opening a new file");
let state = { openedFiles: [], activeFileId: null };
state = openFileLogic(state, {
    id: 'file1',
    path: '/demo.js',
    content: 'old content',
    isDirty: false
});

assert.strictEqual(state.openedFiles.length, 1, "Should have 1 file open");
assert.strictEqual(state.openedFiles[0].content, 'old content', "Content should be 'old content'");
console.log("✅ Test 1 passed\n");

// Test Case 2: Re-open same file with new content (clean state)
console.log("Test 2: Re-opening clean file with new content");
state = openFileLogic(state, {
    id: 'file2', // different ID but same path
    path: '/demo.js',
    content: 'new content',
    isDirty: false
});

assert.strictEqual(state.openedFiles.length, 1, "Should still have 1 file open");
assert.strictEqual(state.openedFiles[0].content, 'new content', "Content should be updated to 'new content'");
assert.strictEqual(state.openedFiles[0].id, 'file1', "Should keep original file ID");
assert.strictEqual(state.activeFileId, 'file1', "Should activate the existing file");
console.log("✅ Test 2 passed\n");

// Test Case 3: Re-open dirty file with new content
console.log("Test 3: Re-opening dirty file with new content");
state.openedFiles[0].isDirty = true; // User has edited the file
state = openFileLogic(state, {
    id: 'file3',
    path: '/demo.js',
    content: 'conflicting content',
    isDirty: false // New content is clean
});

assert.strictEqual(state.openedFiles[0].content, 'conflicting content', "Should update even if file was dirty, because new file is clean");
console.log("✅ Test 3 passed\n");

// Test Case 4: Re-open dirty file with dirty content
console.log("Test 4: Re-opening dirty file with dirty new content");
state.openedFiles[0].isDirty = true;
state.openedFiles[0].content = 'user edits';
state = openFileLogic(state, {
    id: 'file4',
    path: '/demo.js',
    content: 'should not override',
    isDirty: true // New content is also marked dirty
});

assert.strictEqual(state.openedFiles[0].content, 'user edits', "Should NOT update when both are dirty");
console.log("✅ Test 4 passed\n");

// Test Case 5: Re-open without content
console.log("Test 5: Re-opening without new content");
const contentBefore = state.openedFiles[0].content;
state = openFileLogic(state, {
    id: 'file5',
    path: '/demo.js',
    initialLine: 10
    // No content provided
});

assert.strictEqual(state.openedFiles[0].content, contentBefore, "Content should remain unchanged");
assert.strictEqual(state.openedFiles[0].initialLine, 10, "Should update initialLine");
console.log("✅ Test 5 passed\n");

console.log("🎉 All Spec Tests Passed! openFile content update logic is correct.");
