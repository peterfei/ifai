import React from 'react';
import { Circle, Loader2, CheckCircle2, XCircle, AlertTriangle, Sparkles } from 'lucide-react';
import { TaskNode, usePivoStore } from '../../stores/pivoStore';
import { clsx } from 'clsx';
import { Skeleton } from '../UI/Skeleton';

interface PivoTreeListProps {
  tasks: TaskNode[];
  level?: number;
}

const TaskItem: React.FC<{ task: TaskNode; level: number }> = ({ task, level }) => {
  const getStatusConfig = () => {
    switch (task.status) {
      case 'running':
        return {
          icon: <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />,
          color: "text-blue-500",
          bg: "bg-blue-500/10",
          border: "border-blue-500/30"
        };
      case 'success':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
          color: "theme-text-subtle",
          bg: "bg-emerald-500/5",
          border: "border-emerald-500/10"
        };
      case 'failed':
        return {
          icon: <XCircle className="w-3.5 h-3.5 text-rose-400" />,
          color: "text-rose-500",
          bg: "bg-rose-500/10",
          border: "border-rose-500/30"
        };
      case 'healing':
        return {
          icon: <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />,
          color: "text-amber-500",
          bg: "bg-amber-500/10",
          border: "border-amber-500/30"
        };
      default:
        return {
          icon: <Circle className="w-3.5 h-3.5 theme-text-subtle" />,
          color: "theme-text-muted",
          bg: "theme-panel",
          border: "theme-border"
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="flex flex-col w-full">
      <div 
        className={clsx(
          "group flex items-center gap-3 py-1.5 px-3 rounded-lg transition-all duration-300 border mb-0.5",
          config.bg,
          config.border,
          task.status === 'running' && "shadow-[0_0_15px_rgba(59,130,246,0.1)] ring-1 ring-blue-500/20"
        )}
        style={{ marginLeft: `${level * 12}px` }}
      >
        <div className="flex-shrink-0">{config.icon}</div>
        <span className={clsx(
          "text-[13px] font-medium tracking-tight truncate",
          config.color,
          task.status === 'success' && "line-through opacity-50"
        )}>
          {task.label}
        </span>
        
        {task.status === 'running' && (
            <div className="ml-auto flex gap-1">
                <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce"></span>
            </div>
        )}

        {task.status === 'healing' && (
            <div className="ml-auto flex gap-1 items-center">
                <span className="text-[9px] font-bold text-amber-400/80 mr-1 uppercase tracking-tighter">Healing</span>
                <span className="w-1 h-1 rounded-full bg-amber-400 animate-ping [animation-delay:-0.3s]"></span>
                <span className="w-1 h-1 rounded-full bg-amber-400 animate-ping"></span>
            </div>
        )}

        <span className="opacity-0 group-hover:opacity-100 text-[9px] font-black uppercase tracking-tighter theme-text-subtle ml-auto transition-opacity">
          {task.task_type}
        </span>
      </div>
      {task.children.length > 0 && (
        <div className="flex flex-col border-l theme-border ml-4">
          {task.children.map((child) => (
            <TaskItem key={child.id} task={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export const PivoTreeList: React.FC<PivoTreeListProps> = ({ tasks, level = 0 }) => {
  const isHydrating = usePivoStore(state => state.isHydrating);

  // 🏆 PIVO 3.0: 处理异步加载态
  if (isHydrating) {
    return (
      <div className="my-4 p-4 rounded-xl theme-panel-muted border theme-border space-y-2 animate-pulse">
        <Skeleton width={150} height={12} className="mb-4 opacity-20" />
        <Skeleton height={32} className="opacity-10" />
        <Skeleton height={32} className="opacity-10" />
      </div>
    );
  }

  if (!tasks || tasks.length === 0) return null;

  return (
    <div className="my-4 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-700">
      <div className="relative p-2 rounded-xl theme-panel-elevated backdrop-blur-xl border theme-border theme-shadow">
        <div className="flex items-center gap-2 mb-2 px-2 text-[10px] font-black theme-text-subtle uppercase tracking-[0.2em]">
            <div className="w-1 h-3 bg-blue-500 rounded-full shadow-[0_0_8px_#3b82f6]"></div>
            Mission Execution Plan
        </div>
        <div className="space-y-1">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} level={level} />
          ))}
        </div>
      </div>
    </div>
  );
};
