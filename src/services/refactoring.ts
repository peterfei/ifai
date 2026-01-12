/**
 * v0.3.0: 代码重构服务
 *
 * 提供结构化重构功能：重命名、提取函数、移动文件等
 */

import { symbolIndexer } from '../core/indexer/SymbolIndexer';

export interface RefactoringEdit {
  filePath: string;
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  oldText: string;
  newText: string;
}

export interface RefactoringPreview {
  name: string;
  description: string;
  edits: RefactoringEdit[];
  summary: {
    filesChanged: number;
    totalEdits: number;
  };
}

export interface RefactoringResult {
  success: boolean;
  preview: RefactoringPreview;
  error?: string;
}

export interface RenameOptions {
  filePath: string;
  oldName: string;
  newName: string;
  kind: 'variable' | 'function' | 'class' | 'interface' | 'type' | 'enum' | 'namespace' | 'import';
}

export interface ExtractFunctionOptions {
  filePath: string;
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  functionName: string;
  parameters?: string[];
  returnType?: string;
}

/**
 * v0.3.0: 代码重构服务类
 */
export class RefactoringService {
  private static instance: RefactoringService;

  private constructor() {}

  static getInstance(): RefactoringService {
    if (!RefactoringService.instance) {
      RefactoringService.instance = new RefactoringService();
    }
    return RefactoringService.instance;
  }

  /**
   * 预览重命名操作
   */
  async previewRename(options: RenameOptions): Promise<RefactoringResult> {
    try {
      const edits: RefactoringEdit[] = [];

      // 1. 在当前文件中查找所有引用
      const fileEdits = await this.findReferencesInFile(
        options.filePath,
        options.oldName,
        options.newName,
        options.kind
      );
      edits.push(...fileEdits);

      // 2. 使用符号索引器查找跨文件引用
      const crossFileRefs = await this.findCrossFileReferences(
        options.filePath,
        options.oldName,
        options.newName,
        options.kind
      );
      edits.push(...crossFileRefs);

      // 3. 如果是 import 或 export，还需要更新导入语句
      if (options.kind === 'import') {
        const importEdits = await this.updateImports(
          options.filePath,
          options.oldName,
          options.newName
        );
        edits.push(...importEdits);
      }

      const preview: RefactoringPreview = {
        name: `重命名: ${options.oldName} → ${options.newName}`,
        description: `将 ${options.kind} "${options.oldName}" 重命名为 "${options.newName}"`,
        edits,
        summary: {
          filesChanged: new Set(edits.map(e => e.filePath)).size,
          totalEdits: edits.length,
        },
      };

      return { success: true, preview };
    } catch (error) {
      return {
        success: false,
        preview: {
          name: '重命名失败',
          description: '无法预览重命名操作',
          edits: [],
          summary: { filesChanged: 0, totalEdits: 0 },
        },
        error: String(error),
      };
    }
  }

  /**
   * 执行重命名操作
   */
  async executeRename(options: RenameOptions): Promise<RefactoringResult> {
    const previewResult = await this.previewRename(options);
    if (!previewResult.success) {
      return previewResult;
    }

    try {
      // 应用所有编辑
      for (const edit of previewResult.preview.edits) {
        await this.applyEdit(edit);
      }

      // 更新符号索引
      await this.updateIndexes(options.filePath, options.oldName, options.newName);

      return previewResult;
    } catch (error) {
      return {
        success: false,
        preview: previewResult.preview,
        error: String(error),
      };
    }
  }

  /**
   * 预览提取函数操作
   */
  async previewExtractFunction(options: ExtractFunctionOptions): Promise<RefactoringResult> {
    try {
      const edits: RefactoringEdit[] = [];

      // 1. 提取选中的代码到新函数
      const functionEdit = await this.createExtractedFunction(options);
      edits.push(functionEdit);

      // 2. 在原位置插入函数调用
      const callEdit = await this.createFunctionCall(options);
      edits.push(callEdit);

      const preview: RefactoringPreview = {
        name: `提取函数: ${options.functionName}`,
        description: `从 ${options.range.startLineNumber}:${options.range.startColumn} 提取为新函数`,
        edits,
        summary: {
          filesChanged: 1,
          totalEdits: edits.length,
        },
      };

      return { success: true, preview };
    } catch (error) {
      return {
        success: false,
        preview: {
          name: '提取函数失败',
          description: '无法预览提取函数操作',
          edits: [],
          summary: { filesChanged: 0, totalEdits: 0 },
        },
        error: String(error),
      };
    }
  }

  /**
   * 在文件中查找所有引用
   */
  private async findReferencesInFile(
    filePath: string,
    oldName: string,
    newName: string,
    kind: string
  ): Promise<RefactoringEdit[]> {
    const edits: RefactoringEdit[] = [];

    try {
      const { readFileContent } = await import('../utils/fileSystem');
      const content = await readFileContent(filePath);
      const lines = content.split('\n');

      // 构建正则表达式模式（简化版）
      const patterns = this.getSearchPatterns(oldName, kind);

      lines.forEach((line, lineIndex) => {
        patterns.forEach(pattern => {
          const regex = new RegExp(pattern, 'g');
          let match;

          while ((match = regex.exec(line)) !== null) {
            edits.push({
              filePath,
              range: {
                startLineNumber: lineIndex + 1,
                startColumn: match.index + 1,
                endLineNumber: lineIndex + 1,
                endColumn: match.index + match[0].length + 1,
              },
              oldText: match[0],
              newText: this.replaceName(match[0], oldName, newName),
            });
          }
        });
      });
    } catch (error) {
      console.error('[RefactoringService] Failed to find references in file:', error);
    }

    return edits;
  }

  /**
   * 查找跨文件引用
   */
  private async findCrossFileReferences(
    filePath: string,
    oldName: string,
    newName: string,
    kind: string
  ): Promise<RefactoringEdit[]> {
    const edits: RefactoringEdit[] = [];

    try {
      // 使用符号索引器查找引用
      const references = await symbolIndexer.findReferences(oldName);

      for (const ref of references) {
        if (ref.filePath === filePath) continue; // 跳过当前文件

        const { readFileContent } = await import('../utils/fileSystem');
        const content = await readFileContent(ref.filePath);
        const lines = content.split('\n');
        const line = lines[ref.line - 1];

        // 查找符号在行中的位置
        const symbolIndex = line.indexOf(oldName);
        if (symbolIndex !== -1) {
          edits.push({
            filePath: ref.filePath,
            range: {
              startLineNumber: ref.line,
              startColumn: symbolIndex + 1,
              endLineNumber: ref.line,
              endColumn: symbolIndex + oldName.length + 1,
            },
            oldText: oldName,
            newText: newName,
          });
        }
      }
    } catch (error) {
      console.error('[RefactoringService] Failed to find cross-file references:', error);
    }

    return edits;
  }

  /**
   * 更新导入语句
   */
  private async updateImports(
    filePath: string,
    oldName: string,
    newName: string
  ): Promise<RefactoringEdit[]> {
    const edits: RefactoringEdit[] = [];

    try {
      const { readFileContent } = await import('../utils/fileSystem');
      const content = await readFileContent(filePath);
      const lines = content.split('\n');

      // 查找导入语句
      const importPatterns = [
        `import.*\\b${oldName}\\b`,
        `from.*\\b${oldName}\\b`,
        `require\\(['"].*${oldName}['"]\\)`,
      ];

      lines.forEach((line, lineIndex) => {
        for (const pattern of importPatterns) {
          const regex = new RegExp(pattern);
          if (regex.test(line)) {
            const newRegex = new RegExp(oldName, 'g');
            const newLine = line.replace(newRegex, newName);

            edits.push({
              filePath,
              range: {
                startLineNumber: lineIndex + 1,
                startColumn: 1,
                endLineNumber: lineIndex + 1,
                endColumn: line.length + 1,
              },
              oldText: line,
              newText: newLine,
            });
            break; // 每行只处理一次
          }
        }
      });
    } catch (error) {
      console.error('[RefactoringService] Failed to update imports:', error);
    }

    return edits;
  }

  /**
   * 创建提取的函数
   */
  private async createExtractedFunction(
    options: ExtractFunctionOptions
  ): Promise<RefactoringEdit> {
    const { readFileContent } = await import('../utils/fileSystem');
    const content = await readFileContent(options.filePath);
    const lines = content.split('\n');

    // 获取要提取的代码
    const extractedLines = lines.slice(
      options.range.startLineNumber - 1,
      options.range.endLineNumber
    );

    // 计算缩进
    const indent = extractedLines[0]?.match(/^\s*/)?.[0] || '';
    const dedentedLines = extractedLines.map(line => line.replace(new RegExp(`^${indent}`), ''));

    // 构建函数签名
    const params = options.parameters?.join(', ') || '';
    const returnType = options.returnType ? `: ${options.returnType}` : '';

    const functionCode = `function ${options.functionName}(${params})${returnType} {\n${dedentedLines.map(l => '  ' + l).join('\n')}\n}`;

    // 找到插入位置（函数后或文件末尾）
    const insertLine = options.range.endLineNumber;

    return {
      filePath: options.filePath,
      range: {
        startLineNumber: insertLine + 1,
        startColumn: 1,
        endLineNumber: insertLine + 1,
        endColumn: 1,
      },
      oldText: '',
      newText: '\n' + functionCode,
    };
  }

  /**
   * 创建函数调用
   */
  private async createFunctionCall(
    options: ExtractFunctionOptions
  ): Promise<RefactoringEdit> {
    const { readFileContent } = await import('../utils/fileSystem');
    const content = await readFileContent(options.filePath);
    const lines = content.split('\n');

    // 构建函数调用
    const params = options.parameters?.map(() => '_')?.join(', ') || '';

    const callText = `${options.functionName}(${params})`;

    return {
      filePath: options.filePath,
      range: options.range,
      oldText: lines
        .slice(options.range.startLineNumber - 1, options.range.endLineNumber)
        .join('\n'),
      newText: callText,
    };
  }

  /**
   * 应用编辑
   */
  private async applyEdit(edit: RefactoringEdit): Promise<void> {
    const { readFileContent, writeFileContent } = await import('../utils/fileSystem');
    const content = await readFileContent(edit.filePath);
    const lines = content.split('\n');

    // 简化版：只处理单行编辑
    if (edit.range.startLineNumber === edit.range.endLineNumber) {
      const line = lines[edit.range.startLineNumber - 1];
      const before = line.substring(0, edit.range.startColumn - 1);
      const after = line.substring(edit.range.endColumn - 1);
      lines[edit.range.startLineNumber - 1] = before + edit.newText + after;
    } else {
      // 多行编辑（TODO: 实现）
      console.warn('[RefactoringService] Multi-line edits not yet implemented');
    }

    await writeFileContent(edit.filePath, lines.join('\n'));
  }

  /**
   * 更新符号索引
   */
  private async updateIndexes(
    filePath: string,
    oldName: string,
    newName: string
  ): Promise<void> {
    // 触发符号索引更新
    try {
      const { readFileContent } = await import('../utils/fileSystem');
      const content = await readFileContent(filePath);
      await symbolIndexer.indexFile(filePath, content);
    } catch (error) {
      console.error('[RefactoringService] Failed to update indexes:', error);
    }
  }

  /**
   * 获取搜索模式
   */
  private getSearchPatterns(name: string, kind: string): string[] {
    const patterns: string[] = [];

    // 基本模式：精确匹配
    patterns.push(`\\b${name}\\b`);

    // 根据类型添加特定模式
    switch (kind) {
      case 'function':
        patterns.push(`function\\s+${name}\\b`);
        patterns.push(`${name}\\s*\\(`);
        break;
      case 'variable':
        patterns.push(`\\b${name}\\s*=`); // 赋值
        patterns.push(`\\b${name}\\b`); // 引用
        break;
      case 'class':
      case 'interface':
      case 'type':
        patterns.push(`(class|interface|type)\\s+${name}\\b`);
        break;
      case 'import':
        patterns.push(`import.*\\b${name}\\b`);
        break;
    }

    return patterns;
  }

  /**
   * 替换名称
   */
  private replaceName(text: string, oldName: string, newName: string): string {
    // 使用新名称替换旧名称
    return text.replace(new RegExp(`\\b${oldName}\\b`, 'g'), newName);
  }
}

// 导出单例
export const refactoringService = RefactoringService.getInstance();
