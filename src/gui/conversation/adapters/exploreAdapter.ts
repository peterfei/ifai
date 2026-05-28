/**
 * exploreAdapter — 将 message.exploreProgress / exploreFindings 适配为 ExploreCard
 *
 * 数据来源：agentStore 监听 Tauri explore_progress / explore_findings 事件后，
 * 通过 coreUseChatStore.setState() 同步到消息上。
 *
 * match: 消息含 exploreProgress 或 exploreFindings
 * adapt: 映射为 ExploreData { phases[] }
 */

import type { MessageAdapter } from '../MessageAdapterRegistry';
import type { ExploreData, ExplorePhase, ExploreSubItem } from '../../../types/agent-collaboration';

export const exploreAdapter: MessageAdapter = {
  id: 'explore',
  match: (msg: any) => {
    // 仅在无 workflowData 时匹配，避免与 agentWorkspaceAdapter 冲突
    if (msg.metadata?.workflowData || msg.metadata?.phaseData) return false;
    return !!msg.exploreProgress || !!msg.exploreFindings;
  },
  adapt: (msg: any) => {
    const phases: ExplorePhase[] = [];
    const progress = msg.exploreProgress;
    const findings = msg.exploreFindings;

    // Phase 1: scan/analyze phase from exploreProgress
    if (progress) {
      const sub: ExploreSubItem[] = [];

      // Map byDirectory entries to sub items
      if (progress.progress?.byDirectory) {
        for (const [dirPath, dirStatus] of Object.entries(
          progress.progress.byDirectory as Record<
            string,
            { total: number; scanned: number; status: string }
          >
        )) {
          sub.push({
            name: dirPath,
            status:
              dirStatus.status === 'completed'
                ? 'done'
                : dirStatus.status === 'scanning'
                  ? 'running'
                  : 'pending',
          });
        }
      }

      // Map scannedFiles as individual done items
      if (progress.scannedFiles?.length) {
        for (const file of progress.scannedFiles) {
          sub.push({ name: file, status: 'done' });
        }
      }

      const total = progress.progress?.total || 0;
      const scanned = progress.progress?.scanned || 0;
      const pct = total > 0 ? Math.round((scanned / total) * 100) : 0;

      phases.push({
        mode: 'sequential',
        intent: progress.currentPath
          ? `扫描 ${progress.currentPath}`
          : progress.phase === 'completed'
            ? '扫描完成'
            : '扫描项目结构',
        progress: progress.phase === 'completed' ? 100 : pct,
        status:
          progress.phase === 'completed'
            ? 'done'
            : progress.phase === 'analyzing'
              ? 'running'
              : 'running',
        sub,
      });
    }

    // Phase 2: findings phase from exploreFindings
    if (findings) {
      const sub: ExploreSubItem[] = [];

      if (findings.directories) {
        for (const dir of findings.directories) {
          sub.push({ name: dir.path, status: 'done' });
        }
      }

      if (findings.patterns) {
        for (const p of findings.patterns) {
          sub.push({ name: p.description, status: 'done' });
        }
      }

      phases.push({
        mode: 'sequential',
        intent: findings.summary ? `发现: ${findings.summary}` : '分析结果',
        progress: 100,
        status: 'done',
        sub,
      });
    }

    return {
      cardType: 'explore',
      id: msg.id,
      role: msg.role,
      content: msg.content,
      data: { phases } as ExploreData,
    };
  },
};
