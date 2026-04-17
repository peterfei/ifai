import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Circle, CheckCircle2, Loader2, AlertCircle, ArrowRight } from 'lucide-react';

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
  if (tasks.length === 0) return null;

  const getStatusIcon = (status: GhostTask['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 size={12} className="text-blue-400 animate-spin" />;
      case 'success':
        return <CheckCircle2 size={12} className="text-emerald-400" />;
      case 'error':
        return <AlertCircle size={12} className="text-red-400" />;
      default:
        return <Circle size={12} className="theme-text-subtle" />;
    }
  };

  const getStageColor = (stage: GhostTask['stage']) => {
    switch (stage) {
      case 'plan': return 'border-blue-500/30';
      case 'implement': return 'border-purple-500/30';
      case 'verify': return 'border-emerald-500/30';
      case 'optimize': return 'border-amber-500/30';
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
                task.status === 'error' ? 'text-red-400' : 'theme-text-muted'
              }`}>
                {task.description}
              </span>
              
              {task.status === 'running' && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-1 text-[9px] font-bold text-blue-400/60 uppercase tracking-tighter"
                >
                  Active <ArrowRight size={8} />
                </motion.div>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
