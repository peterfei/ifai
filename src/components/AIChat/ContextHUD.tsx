import React, { useMemo } from 'react';
import { Cpu } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';

interface ContextHUDProps {
  text: string;
  maxTokens?: number;
}

/**
 * v0.3.6: 状态栏集成版 Context HUD
 */
export const ContextHUD: React.FC<ContextHUDProps> = ({ text, maxTokens = 32000 }) => {
  const estimatedTokens = useMemo(() => Math.ceil(text.length / 4), [text]);
  const percentage = Math.min(100, (estimatedTokens / maxTokens) * 100);
  
  const statusColor = useMemo(() => {
    if (percentage > 80) return 'text-red-500/80';
    if (percentage > 50) return 'text-orange-500/80';
    return 'theme-text-subtle';
  }, [percentage]);

  if (text.length === 0) return null;

  return (
    <div className={clsx(
      "flex items-center gap-2 text-[10px] font-black tracking-tighter transition-all duration-500",
      statusColor
    )}>
      <div className="flex items-center gap-1.5 opacity-80">
        <Cpu size={10} strokeWidth={2.5} />
        <span className="uppercase">{estimatedTokens.toLocaleString()} / {maxTokens.toLocaleString()}</span>
      </div>
      
      <div className="w-8 h-[2px] theme-panel-muted rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className={clsx("h-full", percentage > 80 ? "bg-red-500" : "bg-blue-500/60")} 
        />
      </div>
    </div>
  );
};
