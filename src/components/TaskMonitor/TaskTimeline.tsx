import React, { useMemo } from 'react';
import { useTaskStore } from '../../stores/taskStore';
import { CheckCircle2, Clock, PlayCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export const TaskTimeline: React.FC = () => {
  const tasks = useTaskStore(state => state.tasks);

  // Memoize the sorted array to avoid infinite re-renders
  const sortedTasks = useMemo(() => {
    return Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [tasks]);

  if (sortedTasks.length === 0) {
    return <div className="p-8 text-center text-gray-500 text-xs">No activity recorded yet</div>;
  }

  return (
    <div className="relative p-4">
      {/* Vertical Line */}
      <div className="absolute left-7 top-0 bottom-0 w-px bg-gray-700/50" />

      <div className="space-y-6">
        {sortedTasks.map((task) => (
          <div key={task.id} className="relative flex gap-4 group">
            {/* Icon Column */}
            <div className="z-10 bg-[#1e1e1e] rounded-full p-1 ring-4 ring-[#1e1e1e]">
              {task.status === 'success' ? (
                <CheckCircle2 size={16} className="text-green-500" />
              ) : task.status === 'running' ? (
                <PlayCircle size={16} className="text-blue-500 animate-pulse" />
              ) : task.status === 'failed' ? (
                <XCircle size={16} className="text-red-500" />
              ) : (
                <Clock size={16} className="text-gray-500" />
              )}
            </div>

            {/* Content Column */}
            <div className="flex-1 min-w-0 bg-[#252526] rounded-lg border border-gray-700/50 p-3 hover:border-gray-600 transition-colors shadow-sm">
              <div className="flex justify-between items-start mb-1">
                <h4 className="text-xs font-semibold text-gray-200 truncate">{task.title}</h4>
                <span className="text-[10px] text-gray-500 shrink-0">
                  {formatDistanceToNow(task.createdAt, { addSuffix: true })}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 line-clamp-2">{task.description}</p>
              
              {task.logs && task.logs.length > 0 && (
                <div className="mt-2 bg-black/40 rounded p-2 font-mono text-[9px] text-gray-400 overflow-hidden">
                  <div className="opacity-70 italic mb-1 border-b border-gray-800 pb-1">Recent Log:</div>
                  {task.logs.slice(-1)[0].message}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};