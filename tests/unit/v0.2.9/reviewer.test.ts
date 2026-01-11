import { describe, it, expect } from 'vitest';
import { MockCodeReviewer } from '../../../src/core/mock-core/v0.2.9/MockCodeReviewer';

describe('Code Review Parser (Mock Implementation)', () => {
  const reviewer = new MockCodeReviewer();

  it('REV-UNIT-01: 应该能正确解析 git diff 格式', () => {
    const diff = `diff --git a/src/main.rs b/src/main.rs
index 83db48f..bf4187f 100644
--- a/src/main.rs
+++ b/src/main.rs
@@ -1,3 +1,3 @@
 fn main() {
-    println!("Hello");
+    println!("Hello World");
 }`;

    const parsedChunks = reviewer.parseDiff(diff);
    
    expect(parsedChunks).toHaveLength(1);
    expect(parsedChunks[0].file).toBe('src/main.rs');
  });

  it('REV-UNIT-02: 静态规则引擎应该能离线标记基础问题', async () => {
    const diffWithConsole = `diff --git a/app.js b/app.js
index 123..456 100644
--- a/app.js
+++ b/app.js
+ console.log("debug");`;

    const chunks = reviewer.parseDiff(diffWithConsole);
    const issues = await reviewer.review(chunks);

    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('no-console');
  });
});
