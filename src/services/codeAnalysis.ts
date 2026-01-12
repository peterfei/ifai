/**
 * v0.3.0: 代码分析服务
 *
 * 提供 AST 分析和代码异味检测功能
 */

export interface CodeSmell {
  id: string;
  type: 'long-function' | 'complex-function' | 'duplicate-code' | 'magic-number' | 'deep-nesting';
  severity: 'error' | 'warning' | 'info';
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  suggestion?: string;
  metrics?: {
    complexity?: number;
    length?: number;
    duplicationCount?: number;
    nestingLevel?: number;
  };
}

export interface CodeAnalysisResult {
  filePath: string;
  language: string;
  smells: CodeSmell[];
  summary: {
    total: number;
    error: number;
    warning: number;
    info: number;
  };
  metrics: {
    totalLines: number;
    totalFunctions: number;
    averageComplexity: number;
    maxComplexity: number;
  };
}

/**
 * 复杂度分析结果
 */
export interface ComplexityMetrics {
  cyclomaticComplexity: number;
  nestingDepth: number;
  linesOfCode: number;
  parameters: number;
}

/**
 * v0.3.0: 代码分析服务类
 */
export class CodeAnalysisService {
  private static instance: CodeAnalysisService;

  private constructor() {}

  static getInstance(): CodeAnalysisService {
    if (!CodeAnalysisService.instance) {
      CodeAnalysisService.instance = new CodeAnalysisService();
    }
    return CodeAnalysisService.instance;
  }

  /**
   * 分析代码并检测异味
   */
  async analyzeCode(filePath: string, content: string, language: string): Promise<CodeAnalysisResult> {
    const smells: CodeSmell[] = [];
    // v0.3.0: 生成唯一分析 ID，防止 ID 冲突
    const analysisId = Date.now().toString(36) + Math.random().toString(36).substring(2);

    // 根据语言选择不同的分析策略
    switch (language) {
      case 'typescript':
      case 'javascript':
      case 'tsx':
      case 'jsx':
        smells.push(...this.analyzeJavaScriptLike(content, filePath, analysisId));
        break;
      case 'python':
        smells.push(...this.analyzePython(content, filePath, analysisId));
        break;
      case 'rust':
        smells.push(...this.analyzeRust(content, filePath, analysisId));
        break;
      case 'go':
        smells.push(...this.analyzeGo(content, filePath, analysisId));
        break;
      default:
        // 对于不支持的语言，使用简单的通用分析
        smells.push(...this.analyzeGeneric(content, filePath, analysisId));
    }

    return this.buildResult(filePath, language, content, smells);
  }

  /**
   * 分析 JavaScript/TypeScript 代码
   */
  private analyzeJavaScriptLike(content: string, filePath: string, analysisId: string): CodeSmell[] {
    const smells: CodeSmell[] = [];
    const lines = content.split('\n');

    // 简单的基于正则表达式的分析（生产环境应该使用 TypeScript Compiler API）
    const functionPattern = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>))/g;
    const arrowFunctionPattern = /(?:\b(\w+)\s*)?\([^)]*\)\s*=>/g;

    let match;
    const functions: Array<{ name: string; startLine: number; endLine: number; complexity: number }> = [];

    // 查找函数定义
    lines.forEach((line, index) => {
      functionPattern.lastIndex = 0;
      if ((match = functionPattern.exec(line)) !== null) {
        const funcName = match[1] || match[2] || 'anonymous';
        functions.push({
          name: funcName,
          startLine: index + 1,
          endLine: index + 1,
          complexity: 1
        });
      }

      arrowFunctionPattern.lastIndex = 0;
      if ((match = arrowFunctionPattern.exec(line)) !== null) {
        const funcName = match[1] || 'arrow';
        functions.push({
          name: funcName,
          startLine: index + 1,
          endLine: index + 1,
          complexity: 1
        });
      }
    });

    // 分析每个函数
    functions.forEach((func, idx) => {
      // 计算函数长度（简单估算）
      let braceCount = 0;
      let foundBrace = false;
      for (let i = func.startLine - 1; i < lines.length; i++) {
        const line = lines[i];
        for (const char of line) {
          if (char === '{') {
            braceCount++;
            foundBrace = true;
          } else if (char === '}') {
            braceCount--;
          }
        }
        if (foundBrace && braceCount === 0) {
          func.endLine = i + 1;
          break;
        }
      }

      const funcLength = func.endLine - func.startLine + 1;

      // 检测长函数（超过 50 行）
      if (funcLength > 50) {
        smells.push({
          id: `${analysisId}-long-function-${idx}`,
          type: 'long-function',
          severity: funcLength > 100 ? 'error' : 'warning',
          filePath,
          line: func.startLine,
          column: 1,
          endLine: func.endLine,
          message: `函数 "${func.name}" 过长 (${funcLength} 行)`,
          suggestion: '考虑将此函数拆分为更小的、职责单一的函数',
          metrics: { length: funcLength }
        });
      }

      // 计算圈复杂度
      const functionContent = lines.slice(func.startLine - 1, func.endLine).join('\n');
      func.complexity = this.calculateCyclomaticComplexity(functionContent);

      // 检测高复杂度函数（圈复杂度 > 10）
      if (func.complexity > 10) {
        smells.push({
          id: `${analysisId}-complex-function-${idx}`,
          type: 'complex-function',
          severity: func.complexity > 20 ? 'error' : 'warning',
          filePath,
          line: func.startLine,
          column: 1,
          endLine: func.endLine,
          message: `函数 "${func.name}" 复杂度过高 (圈复杂度: ${func.complexity})`,
          suggestion: '考虑简化逻辑、提取条件或使用早返回模式',
          metrics: { complexity: func.complexity }
        });
      }

      // 检测深层嵌套（超过 4 层）
      const maxNesting = this.calculateMaxNestingLevel(functionContent);
      if (maxNesting > 4) {
        smells.push({
          id: `${analysisId}-deep-nesting-${idx}`,
          type: 'deep-nesting',
          severity: 'warning',
          filePath,
          line: func.startLine,
          column: 1,
          message: `函数 "${func.name}" 存在深层嵌套 (最大嵌套层数: ${maxNesting})`,
          suggestion: '考虑使用卫语句或提取函数来减少嵌套',
          metrics: { nestingLevel: maxNesting }
        });
      }
    });

    // 检测魔法数字
    const magicNumberPattern = /(?<![a-zA-Z0-9_])(?<!\$)([0-9]+)(?![a-zA-Z0-9_])/g;
    lines.forEach((line, lineIndex) => {
      // 跳过注释行
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;

      magicNumberPattern.lastIndex = 0;
      while ((match = magicNumberPattern.exec(line)) !== null) {
        const num = parseInt(match[1], 10);
        // 排除 0, 1, 2 等常见数字
        if (num > 2 && num < 100 && !this.isInExcludedContext(line, match.index)) {
          smells.push({
            id: `${analysisId}-magic-number-${lineIndex}-${match.index}`,
            type: 'magic-number',
            severity: 'info',
            filePath,
            line: lineIndex + 1,
            column: match.index + 1,
            message: `发现魔法数字: ${num}`,
            suggestion: '考虑将此数字提取为命名常量'
          });
        }
      }
    });

    return smells;
  }

  /**
   * 分析 Python 代码
   */
  private analyzePython(content: string, filePath: string, analysisId: string): CodeSmell[] {
    const smells: CodeSmell[] = [];
    const lines = content.split('\n');

    // 检测 Python 特定的异味
    const functionPattern = /^(\s*)def\s+(\w+)\s*\(/gm;
    let match;

    const functions: Array<{ name: string; startLine: number; indentLevel: number }> = [];

    while ((match = functionPattern.exec(content)) !== null) {
      const indent = match[1].length;
      const funcName = match[2];
      const startLine = content.substring(0, match.index).split('\n').length;

      functions.push({ name: funcName, startLine, indentLevel: indent });
    }

    // 分析每个函数
    functions.forEach((func, idx) => {
      // 查找函数结束位置
      let endLine = func.startLine;
      for (let i = func.startLine; i < lines.length; i++) {
        if (lines[i].trim().length > 0 && lines[i].match(/^\s/)) {
          const indent = lines[i].search(/\S/);
          if (indent <= func.indentLevel && i > func.startLine) {
            endLine = i;
            break;
          }
        }
        endLine = i + 1;
      }

      const funcLength = endLine - func.startLine;

      // 检测长函数
      if (funcLength > 50) {
        smells.push({
          id: `${analysisId}-long-function-${idx}`,
          type: 'long-function',
          severity: funcLength > 100 ? 'error' : 'warning',
          filePath,
          line: func.startLine,
          column: 1,
          endLine: endLine,
          message: `函数 "${func.name}" 过长 (${funcLength} 行)`,
          suggestion: '考虑将此函数拆分为更小的函数',
          metrics: { length: funcLength }
        });
      }

      // 计算复杂度
      const functionContent = lines.slice(func.startLine - 1, endLine).join('\n');
      const complexity = this.calculatePythonComplexity(functionContent);

      if (complexity > 10) {
        smells.push({
          id: `${analysisId}-complex-function-${idx}`,
          type: 'complex-function',
          severity: complexity > 20 ? 'error' : 'warning',
          filePath,
          line: func.startLine,
          column: 1,
          endLine: endLine,
          message: `函数 "${func.name}" 复杂度过高 (圈复杂度: ${complexity})`,
          suggestion: '考虑简化逻辑或提取辅助函数',
          metrics: { complexity }
        });
      }
    });

    return smells;
  }

  /**
   * 分析 Rust 代码
   */
  private analyzeRust(content: string, filePath: string, analysisId: string): CodeSmell[] {
    // TODO: 实现 Rust 特定的分析
    return this.analyzeGeneric(content, filePath, analysisId);
  }

  /**
   * 分析 Go 代码
   */
  private analyzeGo(content: string, filePath: string, analysisId: string): CodeSmell[] {
    // TODO: 实现 Go 特定的 的分析
    return this.analyzeGeneric(content, filePath, analysisId);
  }

  /**
   * 通用代码分析（用于不支持的语言）
   */
  private analyzeGeneric(content: string, filePath: string, analysisId: string): CodeSmell[] {
    const smells: CodeSmell[] = [];
    const lines = content.split('\n');

    // 检测超长行（超过 120 字符）
    lines.forEach((line, index) => {
      if (line.length > 120) {
        smells.push({
          id: `${analysisId}-long-line-${index}`,
          type: 'long-function',
          severity: 'warning',
          filePath,
          line: index + 1,
          column: 120,
          message: `行过长 (${line.length} 字符)`,
          suggestion: '考虑将此行拆分为多行'
        });
      }
    });

    return smells;
  }

  /**
   * 计算圈复杂度（JavaScript/TypeScript）
   * 基于控制流语句数量
   */
  private calculateCyclomaticComplexity(code: string): number {
    let complexity = 1; // 基础复杂度

    // 控制流关键字
    const controlFlowPatterns = [
      /\bif\b/g,
      /\belse\b/g,
      /\belse\s+if\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bswitch\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\btry\b/g,
      /\?\./g, // 可选链
      /&&/g,
      /\|\|/g,
      /\?[^:]/g, // 三元运算符
    ];

    controlFlowPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        complexity++;
      }
    });

    return complexity;
  }

  /**
   * 计算 Python 代码的圈复杂度
   */
  private calculatePythonComplexity(code: string): number {
    let complexity = 1;

    const pythonControlFlow = [
      /\bif\b/g,
      /\belif\b/g,
      /\belse\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\btry\b/g,
      /\bexcept\b/g,
      /\bwith\b/g,
      /\band\b/g,
      /\bor\b/g,
    ];

    pythonControlFlow.forEach(pattern => {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        complexity++;
      }
    });

    return complexity;
  }

  /**
   * 计算最大嵌套层级
   */
  private calculateMaxNestingLevel(code: string): number {
    const lines = code.split('\n');
    let maxNesting = 0;
    let currentNesting = 0;

    lines.forEach(line => {
      const trimmed = line.trim();

      // 增加嵌套
      if (trimmed.startsWith('if') || trimmed.startsWith('for') || trimmed.startsWith('while') ||
          trimmed.startsWith('switch') || trimmed.startsWith('case') || trimmed.match(/^{/)) {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      }

      // 减少嵌套
      if (trimmed.startsWith('}') || trimmed.startsWith('break') || trimmed.startsWith('continue')) {
        currentNesting = Math.max(0, currentNesting - 1);
      }
    });

    return maxNesting;
  }

  /**
   * 检查数字是否在排除的上下文中（如数组索引、常量定义等）
   */
  private isInExcludedContext(line: string, index: number): boolean {
    // 检查是否在数组访问中
    const before = line.substring(0, index);
    if (before.endsWith('[')) return true;

    // 检查是否在常量定义中
    if (line.match(/const\s+\w+\s*=/)) return true;

    return false;
  }

  /**
   * 构建分析结果
   */
  private buildResult(filePath: string, language: string, content: string, smells: CodeSmell[]): CodeAnalysisResult {
    const summary = {
      total: smells.length,
      error: smells.filter(s => s.severity === 'error').length,
      warning: smells.filter(s => s.severity === 'warning').length,
      info: smells.filter(s => s.severity === 'info').length,
    };

    const lines = content.split('\n');
    const metrics = {
      totalLines: lines.length,
      totalFunctions: smells.filter(s => s.type === 'long-function' || s.type === 'complex-function').length,
      averageComplexity: 0,
      maxComplexity: 0,
    };

    // 计算平均和最大复杂度
    const complexities = smells
      .filter(s => s.metrics?.complexity)
      .map(s => s.metrics!.complexity!);

    if (complexities.length > 0) {
      metrics.averageComplexity = complexities.reduce((a, b) => a + b, 0) / complexities.length;
      metrics.maxComplexity = Math.max(...complexities);
    }

    return {
      filePath,
      language,
      smells,
      summary,
      metrics,
    };
  }
}

// 导出单例
export const codeAnalysisService = CodeAnalysisService.getInstance();
