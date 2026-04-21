import type { TFunction } from 'i18next';

const normalizeWorkflowStatus = (status: string): string => status.toLowerCase();
const normalizeWorkflowType = (type: string): string => type.trim().toLowerCase().replace(/-/g, '_');

const getPayloadString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const getWorkflowTypeLabel = (type: string | undefined, t: TFunction): string | null => {
  if (!type) {
    return null;
  }

  switch (normalizeWorkflowType(type)) {
    case 'code_review':
      return t('workflow.selector.quick.codeReview.title');
    case 'exploration':
      return t('workflow.selector.quick.exploration.title');
    case 'quality_check':
      return t('workflow.selector.quick.qualityCheck.title');
    case 'explore':
      return t('workflow.editor.agentTypes.explore');
    case 'review':
      return t('workflow.editor.agentTypes.review');
    case 'refactor':
      return t('workflow.editor.agentTypes.refactor');
    case 'test':
      return t('workflow.editor.agentTypes.test');
    case 'doc':
    case 'document':
      return t('workflow.editor.agentTypes.doc');
    case 'task_breakdown':
      return t('workflow.editor.agentTypes.taskBreakdown');
    case 'proposal_generator':
      return t('workflow.editor.agentTypes.proposalGenerator');
    case 'general_purpose':
      return t('workflow.editor.agentTypes.generalPurpose');
    default:
      return null;
  }
};

export const resolveWorkflowDisplayName = (
  payload: Record<string, unknown>,
  t: TFunction,
  fallbackKey: string,
  fallbackDefault: string,
): string => {
  const explicitName =
    getPayloadString(payload.workflowName) || getPayloadString(payload.workflow_name);
  if (explicitName) {
    return explicitName;
  }

  const workflowType =
    getPayloadString(payload.workflowType) || getPayloadString(payload.workflow_type);
  const translatedType = getWorkflowTypeLabel(workflowType, t);
  if (translatedType) {
    return translatedType;
  }

  return t(fallbackKey, { defaultValue: fallbackDefault });
};

export const getWorkflowStatusLabel = (status: string, t: TFunction): string => {
  switch (normalizeWorkflowStatus(status)) {
    case 'completed':
      return t('workflow.shared.status.completed');
    case 'failed':
      return t('workflow.shared.status.failed');
    case 'running':
      return t('workflow.shared.status.running');
    case 'skipped':
      return t('workflow.shared.status.skipped');
    case 'waiting':
    case 'pending':
      return t('workflow.shared.status.waiting');
    default:
      return status;
  }
};

export const getWorkflowStatusBadgeClass = (status: string): string => {
  switch (normalizeWorkflowStatus(status)) {
    case 'completed':
      return 'theme-badge-success';
    case 'failed':
      return 'theme-badge-danger';
    case 'running':
      return 'theme-badge-info';
    case 'skipped':
      return 'theme-panel-elevated theme-border theme-text-muted border';
    case 'waiting':
    case 'pending':
      return 'theme-badge-warning';
    default:
      return 'theme-panel-elevated theme-border theme-text-muted border';
  }
};

export const getWorkflowStatusTextClass = (status: string): string => {
  switch (normalizeWorkflowStatus(status)) {
    case 'completed':
      return 'theme-text-success';
    case 'failed':
      return 'theme-text-danger';
    case 'running':
      return 'theme-text-info';
    case 'skipped':
      return 'theme-text-muted';
    case 'waiting':
    case 'pending':
      return 'theme-text-warning';
    default:
      return 'theme-text-subtle';
  }
};
