import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { usePerformanceMetrics } from './usePerformanceMetrics';
import { useEditorStore } from '../../stores/editorStore';
import { X, Activity, Cpu, Database } from 'lucide-react';

interface PerformancePanelProps {
  onClose?: () => void;
}

export const PerformancePanel: React.FC<PerformancePanelProps> = ({ onClose }) => {
  const { metrics, currentMetrics } = usePerformanceMetrics(1000);
  const activeFileTokenCount = useEditorStore(state => state.activeFileTokenCount);
  const [minimized, setMinimized] = useState(false);

  if (minimized) {
    return (
      <div 
        className="theme-panel-elevated theme-border theme-shadow theme-hoverable fixed bottom-4 right-4 z-50 cursor-pointer rounded-lg border p-2"
        onClick={() => setMinimized(false)}
        role="button"
        aria-label="Expand Performance Panel"
      >
        <Activity className="w-5 h-5 text-green-400" />
      </div>
    );
  }

  return (
    <div className="theme-panel-elevated theme-border theme-shadow fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-lg border font-sans text-xs">
      {/* Header */}
      <div className="theme-panel-muted theme-border flex items-center justify-between border-b p-2">
        <div className="theme-text flex items-center gap-2 font-semibold">
          <Activity className="w-4 h-4" />
          <span>Performance Monitor</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setMinimized(true)}
            className="theme-button-ghost rounded p-1"
          >
            _
          </button>
          <button 
            onClick={onClose}
            className="theme-button-ghost rounded p-1"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-3 gap-2 p-3">
        <MetricCard 
          label="FPS" 
          value={currentMetrics.fps} 
          unit="" 
          status={currentMetrics.fps < 30 ? 'warning' : 'good'} 
        />
        <MetricCard 
          label="Memory" 
          value={currentMetrics.memory || 0} 
          unit="MB" 
          status={currentMetrics.memory > 500 ? 'warning' : 'good'} 
        />
        <MetricCard 
          label="Tokens" 
          value={activeFileTokenCount} 
          unit="" 
          status="good" 
        />
      </div>

      {/* Chart */}
      <div className="h-32 w-full p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={metrics}>
            <defs>
              <linearGradient id="colorFps" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#82ca9d" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="timestamp" hide />
            <YAxis domain={[0, 70]} hide />
            <Tooltip 
              contentStyle={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '10px', color: 'var(--text-primary)' }}
              itemStyle={{ color: 'var(--text-primary)' }}
              labelStyle={{ display: 'none' }}
            />
            <Area 
              type="monotone" 
              dataKey="fps" 
              stroke="#82ca9d" 
              fillOpacity={1} 
              fill="url(#colorFps)" 
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: number; unit: string; status: 'good' | 'warning' | 'error' }> = ({ label, value, unit, status }) => {
  const colorClass = status === 'good' ? 'text-green-400' : status === 'warning' ? 'text-yellow-400' : 'text-red-400';
  
  return (
    <div className="theme-panel-muted flex flex-col items-center rounded p-2">
      <span className="theme-text-subtle mb-1">{label}</span>
      <span className={`text-lg font-bold ${colorClass}`}>
        {value}<span className="theme-text-subtle ml-0.5 text-xs">{unit}</span>
      </span>
    </div>
  );
};
