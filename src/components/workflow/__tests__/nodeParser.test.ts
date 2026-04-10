/**
 * 节点解析器单元测试
 *
 * 验证 Claude Code 风格的节点信息解析
 */

/**
 * 解析节点标签，提取操作和参数
 */
function parseNodeInfo(nodeId: string, message: string) {
  const functionMatch = nodeId.match(/^(\w+)\((.*)\)$/);
  if (functionMatch) {
    const [, operation, paramsStr] = functionMatch;
    const parameters: Record<string, string> = {};

    // 解析参数：支持 key:value, key:"value", 或单纯的 value
    if (paramsStr.trim()) {
      // 先尝试匹配带键名的参数
      const keyValuePattern = /(\w+):(?:\s*"([^"]*)"|\s*'([^']*)'|\s*([^\s,]+))/g;
      let match;
      let remainingStr = paramsStr;

      // 提取所有带键名的参数
      while ((match = keyValuePattern.exec(paramsStr)) !== null) {
        const key = match[1];
        const value = match[2] || match[3] || match[4];
        if (key && value) {
          parameters[key] = value;
          // 从字符串中移除已匹配的部分
          remainingStr = remainingStr.replace(match[0], '');
        }
      }

      // 如果还有剩余内容，可能是没有键名的参数
      const trimmedRemaining = remainingStr.trim();
      if (trimmedRemaining && !Object.keys(parameters).length) {
        // 移除引号和逗号，提取纯值
        const pureValue = trimmedRemaining.replace(/^['",]|['",]$/g, '').trim();
        if (pureValue) {
          parameters['arg'] = pureValue;
        }
      }
    }

    return {
      operation,
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      rawLabel: nodeId,
    };
  }

  const messageLower = message.toLowerCase();
  if (messageLower.includes('search') || messageLower.includes('搜索')) {
    return {
      operation: 'Search',
      rawLabel: message,
    };
  }
  if (messageLower.includes('read') || messageLower.includes('读取')) {
    return {
      operation: 'Read',
      rawLabel: message,
    };
  }
  if (messageLower.includes('write') || messageLower.includes('写入')) {
    return {
      operation: 'Write',
      rawLabel: message,
    };
  }
  if (messageLower.includes('agent') || messageLower.includes('代理')) {
    return {
      operation: 'Agent',
      rawLabel: message,
    };
  }

  return {
    operation: nodeId,
    rawLabel: nodeId,
  };
}

/**
 * 格式化节点显示标签（Claude Code 风格）
 */
function formatNodeLabel(parsedInfo: any): string {
  const { operation, parameters } = parsedInfo;

  if (!parameters || Object.keys(parameters).length === 0) {
    return operation;
  }

  const paramsStr = Object.entries(parameters)
    .map(([key, value]) => {
      if (value.includes(' ') || value.includes(',') || value.includes(':')) {
        return `${key}:"${value}"`;
      }
      return `${key}:${value}`;
    })
    .join(', ');

  return `${operation}(${paramsStr})`;
}

// ==================== 测试用例 ====================

function testNodeParser() {
  console.log('🧪 开始测试节点解析器...\n');

  const testCases = [
    {
      input: 'Read(package.json)',
      expectedOp: 'Read',
      expectedParams: { arg: 'package.json' },
      description: '简单文件读取'
    },
    {
      input: 'Search(pattern:"src", path:"./src")',
      expectedOp: 'Search',
      expectedParams: { pattern: 'src', path: './src' },
      description: '带引号的参数'
    },
    {
      input: 'Agent(analyze_project)',
      expectedOp: 'Agent',
      expectedParams: { arg: 'analyze_project' },
      description: 'Agent 操作'
    },
    {
      input: 'Write(output.md)',
      expectedOp: 'Write',
      expectedParams: { arg: 'output.md' },
      description: '文件写入'
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`📝 测试: ${testCase.description}`);
    console.log(`   输入: ${testCase.input}`);

    const result = parseNodeInfo(testCase.input, '');
    const formatted = formatNodeLabel(result);

    console.log(`   解析结果:`);
    console.log(`     - 操作: ${result.operation}`);
    console.log(`     - 参数:`, result.parameters);
    console.log(`   格式化: ${formatted}`);

    // 验证操作名称
    if (result.operation !== testCase.expectedOp) {
      console.log(`   ❌ 失败: 操作应该是 ${testCase.expectedOp}, 实际是 ${result.operation}\n`);
      failed++;
      continue;
    }

    // 验证参数
    const paramsMatch = JSON.stringify(result.parameters) === JSON.stringify(testCase.expectedParams);
    if (!paramsMatch) {
      console.log(`   ❌ 失败: 参数不匹配`);
      console.log(`      期望:`, testCase.expectedParams);
      console.log(`      实际:`, result.parameters);
      console.log();
      failed++;
      continue;
    }

    console.log(`   ✅ 通过\n`);
    passed++;
  }

  console.log('═══════════════════════════════════════');
  console.log(`📊 测试结果: ${passed} 通过, ${failed} 失败`);
  console.log('═══════════════════════════════════════');

  return { passed, failed };
}

// 运行测试
testNodeParser();
