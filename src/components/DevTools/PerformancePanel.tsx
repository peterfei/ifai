import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { usePerformanceMetrics } from './usePerformanceMetrics';
import { X, Activity, Cpu, Database } from 'lucide-react';

interface PerformancePanelProps {
  onClose?: () => void;
}

export const PerformancePanel: React.FC<PerformancePanelProps> = ({ onClose }) => {
  const { metrics, currentMetrics } = usePerformanceMetrics(1000);
  const [minimized, setMinimized] = useState(false);

  if (minimized) {
    return (
      <div 
        className="fixed bottom-4 right-4 bg-gray-800 p-2 rounded-lg shadow-lg cursor-pointer hover:bg-gray-700 border border-gray-700 z-50"
        onClick={() => setMinimized(false)}
        role="button"
        aria-label="Expand Performance Panel"
      >
        <Activity className="w-5 h-5 text-green-400" />
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-[#1e1e1e] border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden font-sans text-xs">
      {/* Header */}
      <div className="flex items-center justify-between p-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2 font-semibold text-gray-200">
          <Activity className="w-4 h-4" />
          <span>Performance Monitor</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setMinimized(true)}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
          >
            _
          </button>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-3 gap-2 p-3 bg-[#1e1e1e]">
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
          value={currentMetrics.tokens} 
          unit="" 
          status="good" 
        />
      </div>

      {/* Chart */}
      <div className="h-32 w-full p-2 bg-[#1e1e1e]">
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
              contentStyle={{ backgroundColor: '#2d2d2d', border: 'none', borderRadius: '4px', fontSize: '10px' }}
              itemStyle={{ color: '#ccc' }}
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
    <div className="flex flex-col items-center p-2 bg-gray-800 rounded">
      <span className="text-gray-500 mb-1">{label}</span>
      <span className={`text-lg font-bold ${colorClass}`}>
        {value}<span className="text-xs text-gray-500 ml-0.5">{unit}</span>
      </span>
    </div>
  );
};
