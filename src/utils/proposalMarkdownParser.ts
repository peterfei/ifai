/**
 * Proposal Markdown 解析器
 * 从 Markdown 格式的 proposal 中提取结构化数据
 * 不需要 LLM 调用，纯前端解析
 */

import { OpenSpecProposal, ProposalTask, SpecDelta, Scenario } from '../types/proposal';

export interface ParsedProposal {
  changeId: string;
  why: string;
  whatChanges: string[];
  impact: {
    specs: string[];
    files: string[];
    breakingChanges: boolean;
  };
  tasks: ProposalTask[];
  specDeltas: SpecDelta[];
}

/**
 * 从 Markdown 中提取 proposal 数据
 */
export function parseProposalFromMarkdown(markdown: string): ParsedProposal | null {
  try {
    // 提取变更ID
    const changeIdMatch = markdown.match(/## 变更ID\s*\n\s*`([^`]+)`/);
    const changeId = changeIdMatch?.[1]?.trim() || '';

    // 提取"为什么需要这个变更"（使用更灵活的匹配）
    let why = '';
    const whyPatterns = [
      /### 为什么需要这个变更[？\?]*\s*\n([\s\S]*?)\n\s*### 具体变更/,
      /### 为什么[？\?]*\s*\n([\s\S]*?)\n\s*###/,
      /为什么[：:]\s*\n([\s\S]*?)(?=\n###|\n##|$)/
    ];

    for (const pattern of whyPatterns) {
      const whyMatch = markdown.match(pattern);
      if (whyMatch && whyMatch[1]) {
        why = whyMatch[1].trim();
        break;
      }
    }

    // 提取具体变更列表
    const whatChanges: string[] = [];
    const whatChangesPatterns = [
      /### 具体变更\s*\n([\s\S]*?)\n\s*###/,
      /变更[：:]\s*\n([\s\S]*?)(?=\n###|\n##|$)/
    ];

    for (const pattern of whatChangesPatterns) {
      const match = markdown.match(pattern);
      if (match && match[1]) {
        const lines = match[1].split('\n');
        for (const line of lines) {
          const itemMatch = line.match(/-\s*\[?\s*\]?\s*(.+)/);
          if (itemMatch) {
            const item = itemMatch[1].trim();
            if (item && !item.startsWith('**')) {
              whatChanges.push(item);
            }
          }
        }
        if (whatChanges.length > 0) break;
      }
    }

    // 提取影响范围
    const specs: string[] = [];
    const files: string[] = [];
    let breakingChanges = false;

    // 查找影响范围部分
    const impactSectionMatch = markdown.match(/### 影响范围\s*\n([\s\S]*?)(?=\n##|\n###|$)/);
    if (impactSectionMatch) {
      const impactText = impactSectionMatch[1];

      // 提取 specs
      const specsMatch = impactText.match(/受影响的规格[：:]\s*(.+?)(?:\n|-|\*|$)/);
      if (specsMatch) {
        const specsStr = specsMatch[1].replace(/\*\*/g, '').trim();
        if (specsStr) {
          specs.push(...specsStr.split(',').map(s => s.trim()).filter(s => s));
        }
      }

      // 提取 files
      const filesMatch = impactText.match(/受影响的文件[：:]\s*(.+?)(?:\n|-|\*|$)/);
      if (filesMatch) {
        const filesStr = filesMatch[1].replace(/\*\*/g, '').trim();
        if (filesStr) {
          files.push(...filesStr.split(',').map(f => f.trim()).filter(f => f));
        }
      }

      // 提取 breakingChanges
      const breakingMatch = impactText.match(/\*\*破坏性变更\*\*[：:]\s*(是|否|true|false)/i);
      if (breakingMatch) {
        const value = breakingMatch[1].toLowerCase();
        breakingChanges = value === '是' || value === 'true';
      }
    }

    // 提取任务列表
    const tasks: ProposalTask[] = [];
    const taskSectionMatch = markdown.match(/## 任务清单\s*\n([\s\S]+)(?=\n##|$)/);

    if (taskSectionMatch) {
      const taskText = taskSectionMatch[1];
      const taskMatches = taskText.matchAll(/### \[([^\]]+)\]\s+([\s\S]+?)(?=\n### \[|$)/gs);

      for (const match of taskMatches) {
        const taskId = match[1];
        const taskSection = match[2];

        // 提取任务标题
        const titleMatch = taskSection.match(/^([^\n**]+)/);
        const title = titleMatch?.[1]?.trim() || taskId;

        // 提取分类
        const categoryMatch = taskSection.match(/\*\*分类\*\*[：:]\s*(\w+)/);
        const category = (categoryMatch?.[1] || 'development') as ProposalTask['category'];

        // 提取预估时间
        const hoursMatch = taskSection.match(/\*\*预估\*\*[：:]\s*(\d+)\s*小时/);
        const estimatedHours = parseInt(hoursMatch?.[1] || '4', 10);

        // 提取依赖
        const dependenciesMatch = taskSection.match(/\*\*依赖\*\*[：:]\s*(.+?)(?:\n|\*\*|$)/);
        let dependencies: string[] = [];
        if (dependenciesMatch && dependenciesMatch[1].trim() !== '无') {
          dependencies = dependenciesMatch[1].split(',').map(d => d.trim()).filter(d => d);
        }

        // 提取描述（剩余内容）
        const descMatch = taskSection.match(/\*\*预估\*\*[：:].+?\n([\s\S]*?)(?=\n### \[|\n\*\*|$)/);
        const description = descMatch?.[1]?.trim() || '';

        tasks.push({
          id: taskId,
          title,
          description,
          category,
          estimatedHours,
          dependencies
        });
      }
    }

    // 提取规格增量
    const specDeltas: SpecDelta[] = [];
    const specSectionMatch = markdown.match(/## 规格增量\s*\n([\s\S]*?)$/);

    if (specSectionMatch) {
      const specText = specSectionMatch[1];
      const specDeltaMatches = specText.matchAll(/### \[(ADDED|MODIFIED|REMOVED)\]\s+(\S+)(?=\n|$)/gs);

      for (const match of specDeltaMatches) {
        const type = match[1] as SpecDelta['type'];
        const capability = match[2];
        const sectionStart = match.index + match[0].length;
        const sectionEnd = specText.length;
        const sectionText = specText.slice(sectionStart, sectionEnd);

        // 提取描述
        const contentMatch = sectionText.match(/\*\*描述\*\*[：:]\s*(.+?)(?:\n|$)/);
        const content = contentMatch?.[1]?.trim() || '';

        // 提取场景
        const scenarios: Scenario[] = [];
        const scenarioMatches = sectionText.matchAll(/#### 场景\d+:\s*(.+?)(?=\n|$)/gs);

        for (const scenarioMatch of scenarioMatches) {
          const scenarioName = scenarioMatch[1];
          const scenarioStart = scenarioMatch.index + scenarioMatch[0].length;
          const nextScenarioMatch = sectionText.slice(scenarioStart).search(/#### 场景/);
          const scenarioEnd = nextScenarioMatch > 0 ? nextScenarioMatch : sectionText.length;
          const scenarioText = sectionText.slice(scenarioStart, scenarioEnd);

          const descMatch = scenarioText.match(/-\s*\*\*描述\*\*[：:]\s*(.+?)(?:\n|$)/);
          const givenMatch = scenarioText.match(/-\s*\*\*前置\*\*[：:]\s*(.+?)(?:\n|$)/);
          const whenMatch = scenarioText.match(/-\s*\*\*操作\*\*[：:]\s*(.+?)(?:\n|$)/);
          const thenMatch = scenarioText.match(/-\s*\*\*结果\*\*[：:]\s*(.+?)(?:\n|$)/);

          scenarios.push({
            name: scenarioName.trim(),
            description: descMatch?.[1]?.trim() || '',
            given: givenMatch?.[1]?.trim(),
            when: whenMatch?.[1]?.trim() || '',
            then: thenMatch?.[1]?.trim() || ''
          });
        }

        specDeltas.push({
          capability,
          type,
          content,
          scenarios
        });
      }
    }

    // 验证必要字段
    if (!changeId) {
      console.warn('[ProposalParser] Missing changeId');
      return null;
    }

    const result = {
      changeId,
      why,
      whatChanges,
      impact: { specs, files, breakingChanges },
      tasks,
      specDeltas
    };

    console.log('[ProposalParser] Parsed result:', {
      changeId: result.changeId,
      whyLength: result.why?.length || 0,
      whatChangesCount: result.whatChanges?.length || 0,
      specsCount: result.impact.specs?.length || 0,
      tasksCount: result.tasks?.length || 0,
      specDeltasCount: result.specDeltas?.length || 0
    });

    return result;
  } catch (error) {
    console.error('[ProposalParser] Failed to parse proposal from Markdown:', error);
    return null;
  }
}
