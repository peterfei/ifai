import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Circle, CheckCircle2, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface GhostTask {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'error';
  stage: 'plan' | 'implement' | 'verify' | 'optimize';
}

interface GhostTaskListProps {
  tasks: GhostTask[];
}

export const GhostTaskList: React.FC<GhostTaskListProps> = ({ tasks }) => {
  const { t } = useTranslation();
  if (tasks.length === 0) return null;

  const getStatusIcon = (status: GhostTask['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 size={12} className="theme-text-accent animate-spin" />;
      case 'success':
        return <CheckCircle2 size={12} className="theme-text-success" />;
      case 'error':
        return <AlertCircle size={12} className="theme-text-danger" />;
      default:
        return <Circle size={12} className="theme-text-subtle" />;
    }
  };

  const getStageColor = (stage: GhostTask['stage']) => {
    switch (stage) {
      case 'plan': return 'border-[var(--accent-soft-border)]';
      case 'implement': return 'border-[var(--info-soft-border)]';
      case 'verify': return 'border-[var(--success-soft-border)]';
      case 'optimize': return 'border-[var(--warning-soft-border)]';
    }
  };

  return (
    <div className="ghost-task-list mt-3 space-y-1.5 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
      <AnimatePresence initial={false}>
        {tasks.map((task, index) => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, x: -5, height: 0 }}
            animate={{ opacity: 1, x: 0, height: 'auto' }}
            exit={{ opacity: 0, x: 5, height: 0 }}
            className={`theme-panel-muted flex items-center gap-3 px-3 py-1.5 rounded-md border-l-2 ${getStageColor(task.stage)} transition-all duration-300`}
          >
            <div className="flex-shrink-0">
              {getStatusIcon(task.status)}
            </div>
            
            <div className="flex-1 flex items-center justify-between min-w-0">
              <span className={`text-[11px] truncate ${
                task.status === 'success' ? 'theme-text-subtle line-through' : 
                task.status === 'error' ? 'theme-text-danger' : 'theme-text-muted'
              }`}>
                {task.description}
              </span>
              
              {task.status === 'running' && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="theme-text-accent flex items-center gap-1 text-[9px] font-bold uppercase tracking-tighter opacity-70"
                >
                  {t('ghostTaskList.active')} <ArrowRight size={8} />
                </motion.div>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
