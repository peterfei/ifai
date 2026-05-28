/**
 * agentWorkspaceAdapter — 将 message.metadata.workflowData / phaseData 适配为 AgentWorkspaceCard
 *
 * 数据来源：StoreMapper 监听 Tauri workflow:started / workflow:progress 事件后，
 * 在消息的 metadata 上设置 workflowData 和/或 phaseData。
 *
 * match: 消息含 metadata.workflowData 且其中涉及至少 2 种不同 agentType
 *        或 metadata.phaseData 且长度 >= 2
 * adapt: 映射为 AgentWorkspaceData（stepLabel, activeAgents, progress 等）
 */

import type { MessageAdapter } from '../MessageAdapterRegistry';
import type { AgentWorkspaceData } from '../../../types/agent-collaboration';
import { getAgent } from '../../conversation/AGENT_DSL';
import type { WorkflowData, PhaseData } from '../../../types/workflow';

/**
 * 从 AGENT_DSL type ID → AGENT_DOT_CONFIG key
 *
 * AGENT_DSL 使用完整单词缩写（EXP / REF / TST），
 * 而 AgentWorkspaceCard/AgentCompactBar 用 AGENT_DOT_CONFIG 查渐变。
 * 此函数做跨系统映射。
 */
const AGENT_TO_DOT_KEY: Record<string, string> = {
  explore: 'EX',
  refactor: 'RF',
  test: 'TS',
  review: 'REV',
  doc: 'DOC',
  proposal: 'PRP',
  task: 'TSK',
  pm: 'PM',
  git_commit: 'CD',
  unknown: 'AN',
};

function agentTypeToAbbr(agentType: string): string {
  // 优先用 AGENT_DOT_CONFIG 映射
  const dotKey = AGENT_TO_DOT_KEY[agentType];
  if (dotKey) return dotKey;

  // 回退到 AGENT_DSL 查表
  const agent = getAgent(agentType);
  if (agent?.abbr) return agent.abbr;

  // 最终回退
  return agentType.slice(0, 2).toUpperCase();
}

/** 从 WorkflowData 推断活跃 Agent 缩写列表 */
function getActiveAgentsFromWorkflow(wf: WorkflowData): string[] {
  const agents = new Set<string>();
  for (const node of wf.nodes) {
    const abbr = agentTypeToAbbr(node.agentType);
    const runningStatuses = ['running', 'pending'];
    if (runningStatuses.includes(node.status)) {
      agents.add(abbr);
    }
  }
  // Fallback: if none running, use all
  if (agents.size === 0) {
    for (const node of wf.nodes) {
      agents.add(agentTypeToAbbr(node.agentType));
    }
  }
  return Array.from(agents);
}

/** 从 PhaseData 推断活跃 Agent 缩写列表 */
function getActiveAgentsFromPhaseData(phases: PhaseData[]): string[] {
  const agents = new Set<string>();
  for (const phase of phases) {
    if (!phase.nodeId) continue;
    const parts = phase.nodeId.split('_');
    const agentType = parts.length > 1 ? parts[0] : phase.nodeId;
    const abbr = agentTypeToAbbr(agentType);
    if (phase.status === 'running' || phase.status === 'pending') {
      agents.add(abbr);
    }
  }
  // Fallback: if none running, use first few
  if (agents.size === 0) {
    for (const phase of phases.slice(0, 3)) {
      const parts = phase.nodeId.split('_');
      const agentType = parts.length > 1 ? parts[0] : phase.nodeId;
      agents.add(agentTypeToAbbr(agentType));
    }
  }
  return Array.from(agents);
}

/** 检查是否应该匹配（多 agent 或多 phase） */
function shouldMatch(msg: any): boolean {
  const wf: WorkflowData | undefined = msg.metadata?.workflowData;
  const phases: PhaseData[] | undefined = msg.metadata?.phaseData;

  if (wf) {
    const agentTypes = new Set(wf.nodes.map((n) => n.agentType));
    if (agentTypes.size >= 2) return true;
  }

  if (phases && phases.length >= 2) return true;

  return false;
}

export const agentWorkspaceAdapter: MessageAdapter = {
  id: 'agent-workspace',
  match: (msg: any) => shouldMatch(msg),
  adapt: (msg: any) => {
    const wf: WorkflowData | undefined = msg.metadata?.workflowData;
    const phases: PhaseData[] | undefined = msg.metadata?.phaseData;

    // Derive active agents
    let activeAgents: string[];
    if (wf) {
      activeAgents = getActiveAgentsFromWorkflow(wf);
    } else if (phases) {
      activeAgents = getActiveAgentsFromPhaseData(phases);
    } else {
      activeAgents = [];
    }

    // Derive progress per agent
    const progress: Record<string, number> = {};
    if (wf) {
      for (const node of wf.nodes) {
        const abbr = agentTypeToAbbr(node.agentType);
        // Estimate progress from tools completed vs total
        const doneTools = node.tools.filter((t) => t.status === 'done').length;
        const totalTools = node.tools.length || 1;
        progress[abbr] = Math.round((doneTools / totalTools) * 100);
      }
    } else if (phases) {
      for (const p of phases) {
        const parts = p.nodeId.split('_');
        const agentType = parts.length > 1 ? parts[0] : p.nodeId;
        const abbr = agentTypeToAbbr(agentType);
        progress[abbr] = p.progress;
      }
    }

    // Derive step info
    const stepLabel = wf?.intent || phases?.[0]?.intent || '工作流执行';
    const totalSteps = wf?.nodes.length || phases?.length || 1;
    const runningIdx = wf
      ? wf.nodes.findIndex((n) => n.status === 'running' || n.status === 'pending')
      : phases?.findIndex((p) => p.status === 'running' || p.status === 'pending') ?? 0;
    const stepIndex = runningIdx >= 0 ? runningIdx : totalSteps - 1;

    // Derive compactMsg
    const runningAgents = activeAgents.filter((a) => progress[a] !== undefined && progress[a] < 100);
    const compactMsg = runningAgents.length > 0
      ? `${runningAgents.join('/')} Agent 正在执行 ${stepLabel}`
      : `${stepLabel} — ${activeAgents.join('/')} Agents`;

    // Derive steps list
    const steps: string[] = [];
    if (wf) {
      for (const node of wf.nodes) {
        steps.push(node.intent);
      }
    } else if (phases) {
      for (const p of phases) {
        steps.push(p.intent);
      }
    }

    // Derive taskBreakdown from sub items
    const taskBreakdown: Array<{ task: string; agent: string }> = [];
    if (phases) {
      for (const p of phases) {
        if (p.sub) {
          for (const sub of p.sub) {
            const parts = p.nodeId.split('_');
            const agentType = parts.length > 1 ? parts[0] : p.nodeId;
            taskBreakdown.push({
              task: sub.name,
              agent: agentTypeToAbbr(agentType),
            });
          }
        }
      }
    }

    // assignFromPM: 工作流涉及 2+ 种 agentType（含已完成）
    const totalAgentTypes = wf
      ? new Set(wf.nodes.map((n) => n.agentType)).size
      : phases
        ? new Set(phases.map((p) => {
            const parts = p.nodeId.split('_');
            return parts.length > 1 ? parts[0] : p.nodeId;
          })).size
        : activeAgents.length;

    const data: AgentWorkspaceData = {
      stepLabel,
      stepIndex,
      totalSteps,
      activeAgents,
      assignFromPM: totalAgentTypes >= 2,
      compactMsg,
      progress,
      steps: steps.length > 0 ? steps : undefined,
      taskBreakdown: taskBreakdown.length > 0 ? taskBreakdown : undefined,
    };

    return {
      cardType: 'agent_workspace',
      id: msg.id,
      role: msg.role,
      content: msg.content,
      data,
    };
  },
};
