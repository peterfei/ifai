import React, { useState, useEffect, useRef } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { useThreadStore } from '../../stores/threadStore';
import {
  X, CheckCircle, AlertCircle, Loader2, Terminal,
  ChevronDown, ChevronUp, Trash2, Clock, MessageSquare
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// Utility for status colors
const getStatusColor = (status: string) => {
    switch (status) {
        case 'completed': return 'text-green-500 bg-green-500/10 border-green-500/20';
        case 'failed': return 'text-red-500 bg-red-500/10 border-red-500/20';
        case 'waitingfortool': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
        case 'initializing': return 'text-purple-500 bg-purple-500/10 border-purple-500/20';
        default: return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    }
};

const getStatusIcon = (status: string) => {
    switch (status) {
        case 'completed': return <CheckCircle size={14} />;
        case 'failed': return <AlertCircle size={14} />;
        case 'waitingfortool': return <Clock size={14} className="animate-pulse" />;
        case 'initializing': return <Loader2 size={14} className="animate-spin opacity-50" />;
        default: return <Loader2 size={14} className="animate-spin" />;
    }
};

export const GlobalAgentMonitor: React.FC = () => {
  const { t } = useTranslation();
  const { runningAgents, removeAgent, clearCompletedAgents } = useAgentStore();
  const threads = useThreadStore(state => state.threads);
  const setActiveThread = useThreadStore(state => state.setActiveThread);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Helper to get thread title by threadId
  const getThreadTitle = (threadId?: string) => {
    if (!threadId) return null;
    const thread = threads[threadId];
    return thread?.title || null;
  };

  // Handle click on thread indicator to switch to that thread
  const handleThreadClick = (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveThread(threadId);
  };

  // Position and Dragging State
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: window.innerHeight - 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const mouseStartPos = useRef({ x: 0, y: 0 });
  const dragStartTime = useRef(0);

  // Snapping Logic
  const snapToCorner = (x: number, y: number) => {
    const margin = 24;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const fabWidth = 160; // Approximate width of the FAB
    
    // Nearest horizontal edge - ensures it stays on screen but at the edge
    const nx = x < screenW / 2 ? margin : screenW - fabWidth - margin;
    // Nearest vertical edge
    const ny = y < screenH / 2 ? margin : screenH - 64 - margin;
    
    return { x: nx, y: ny };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartTime.current = Date.now();
    mouseStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartPos.current = { x: position.x, y: position.y };
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const dx = e.clientX - mouseStartPos.current.x;
      const dy = e.clientY - mouseStartPos.current.y;
      
      setPosition({
        x: dragStartPos.current.x + dx,
        y: dragStartPos.current.y + dy
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      
      setIsDragging(false);
      
      // Determine if it was a click or a drag (less than 5px movement and short time)
      const dx = Math.abs(e.clientX - mouseStartPos.current.x);
      const dy = Math.abs(e.clientY - mouseStartPos.current.y);
      const dt = Date.now() - dragStartTime.current;
      
      if (dx < 5 && dy < 5 && dt < 200) {
        setIsMinimized(prev => !prev);
      } else {
        // Snap to corner
        const snapped = snapToCorner(position.x, position.y);
        setPosition(snapped);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, position]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
        setPosition(prev => snapToCorner(prev.x, prev.y));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-expand latest agent if list was empty
  const prevCount = useRef(0);
  useEffect(() => {
      if (runningAgents.length > prevCount.current) {
          const newAgent = runningAgents[0]; // newest is first
          if (newAgent) {
              setExpandedId(newAgent.id);
              setIsMinimized(false);
          }
      }
      prevCount.current = runningAgents.length;
  }, [runningAgents.length]);

  // Auto-scroll logs when content updates
  useEffect(() => {
    if (expandedId && logsEndRef.current) {
        logsEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [runningAgents, expandedId]);

  // Auto-remove expired agents
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      runningAgents.forEach(agent => {
        // Skip if agent is being hovered
        if (agent.id === hoveredAgentId) return;

        // Check if agent has expired
        if (agent.expiresAt && agent.expiresAt <= now) {
          removeAgent(agent.id);
        }
      });
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [runningAgents, hoveredAgentId, removeAgent]);

  if (runningAgents.length === 0) return null;

  const activeCount = runningAgents.filter(a => a.status !== 'completed' && a.status !== 'failed').length;

  // Determine alignment based on screen position
  const isAtBottom = position.y > window.innerHeight - 150;
  const isAtRight = position.x > window.innerWidth / 2;

  const margin = 24;

  return createPortal(
    <div 
        className={`fixed z-[9999] flex flex-col gap-2 font-sans transition-all duration-300 ease-out ${isDragging ? 'transition-none opacity-80 scale-95' : ''}`}
        style={{ 
            left: isAtRight && !isDragging ? 'auto' : position.x,
            right: isAtRight && !isDragging ? margin : 'auto',
            top: isAtBottom && !isMinimized ? 'auto' : position.y,
            bottom: isAtBottom && !isMinimized ? window.innerHeight - position.y - 48 : 'auto',
            alignItems: isAtRight ? 'flex-end' : 'flex-start'
        }}
    >
        {/* Main Floating Action Button / Status Indicator */}
        <div 
            className="flex items-center gap-3 bg-[#1e1e1e] border border-[#333] shadow-2xl rounded-lg p-2 pr-4 cursor-move hover:border-[#444] transition-all group select-none"
            onMouseDown={handleMouseDown}
        >
            <div className={`p-2 rounded-md transition-colors ${activeCount > 0 ? 'bg-blue-600' : 'bg-green-600'}`}>
                {activeCount > 0 ? <Loader2 size={18} className="text-white animate-spin" /> : <Terminal size={18} className="text-white" />}
            </div>
            <div className="flex flex-col">
                <span className="text-xs font-bold text-gray-200">
                    {activeCount > 0 
                        ? t('agent_monitor_activeTasks', { count: activeCount }) 
                        : t('agent_monitor_allTasksCompleted')}
                </span>
                <span className="text-[10px] text-gray-500">
                    {t('agent_monitor_totalTasks', { count: runningAgents.length })}
                </span>
            </div>
            {isMinimized ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
        </div>

        {/* Task List Panel */}
        {!isMinimized && (
            <div 
                className={`w-96 bg-[#1e1e1e] border border-[#333] rounded-xl shadow-2xl overflow-hidden animate-in duration-200 flex flex-col max-h-[600px] ${
                    isAtBottom ? 'slide-in-from-bottom-2 mb-2' : 'slide-in-from-top-2 mt-2'
                }`}
                style={{ 
                    order: isAtBottom ? -1 : 1 
                }}
            >
                {/* Header */}
                <div className="flex justify-between items-center p-3 border-b border-[#333] bg-[#252526] select-none">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('agent_monitor_title')}</span>
                    {runningAgents.some(a => a.status === 'completed' || a.status === 'failed') && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); clearCompletedAgents(); }}
                            className="text-[10px] flex items-center gap-1 text-gray-400 hover:text-white transition-colors bg-[#333] hover:bg-[#444] px-2 py-1 rounded"
                        >
                            <Trash2 size={12} /> {t('agent_monitor_clearDone')}
                        </button>
                    )}
                </div>

                {/* List */}
                <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 p-2 gap-2 flex flex-col">
                    {runningAgents.map(agent => (
                        <div
                            key={agent.id}
                            className="flex flex-col gap-0 bg-[#2d2d2d] rounded-lg border border-[#333] overflow-hidden transition-all hover:border-[#555]"
                            onMouseEnter={() => setHoveredAgentId(agent.id)}
                            onMouseLeave={() => setHoveredAgentId(null)}
                        >
                            {/* Agent Header */}
                            <div
                                className="flex justify-between items-center p-3 cursor-pointer hover:bg-[#333] transition-colors"
                                onClick={() => setExpandedId(expandedId === agent.id ? null : agent.id)}
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className={`p-1.5 rounded-full flex-shrink-0 ${getStatusColor(agent.status)}`}>
                                        {getStatusIcon(agent.status)}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-gray-200 truncate">{agent.type}</span>
                                            {agent.threadId && getThreadTitle(agent.threadId) && (
                                                <button
                                                    onClick={(e) => handleThreadClick(agent.threadId!, e)}
                                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors flex-shrink-0"
                                                    title={`切换到会话: ${getThreadTitle(agent.threadId)}`}
                                                >
                                                    <MessageSquare size={10} />
                                                    <span className="text-[9px] max-w-[80px] truncate">
                                                        {getThreadTitle(agent.threadId)}
                                                    </span>
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-gray-500 truncate capitalize font-mono">
                                                {t(`agent_status_${agent.status}`, { defaultValue: agent.status })}
                                            </span>
                                            {agent.expiresAt && (agent.status === 'completed' || agent.status === 'failed') ? (
                                                <span className={`text-[9px] border-l border-gray-600 pl-2 ${
                                                    Math.ceil((agent.expiresAt - Date.now()) / 1000) <= 3
                                                        ? 'text-red-400 animate-pulse'
                                                        : 'text-gray-400'
                                                }`}>
                                                    {Math.ceil((agent.expiresAt - Date.now()) / 1000)}s后关闭
                                                </span>
                                            ) : agent.startTime && (
                                                <span className="text-[9px] text-gray-600 border-l border-gray-600 pl-2">
                                                    {Math.round((Date.now() - agent.startTime) / 1000)}s
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {agent.status === 'running' && (
                                        <div className="w-12 h-1 bg-gray-700 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-blue-500 transition-all duration-300" 
                                                style={{ width: `${(agent.progress || 0) * 100}%` }} 
                                            />
                                        </div>
                                    )}
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); removeAgent(agent.id); }}
                                        className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-md text-gray-500 transition-colors"
                                        title={t('agent_monitor_stopRemove')}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Expanded Logs */}
                            {expandedId === agent.id && (
                                <div className="bg-[#1e1e1e] p-3 border-t border-[#333] max-h-[300px] overflow-y-auto font-mono text-[10px] text-gray-400 shadow-inner">
                                    {agent.logs.length === 0 ? (
                                        <span className="opacity-30 italic">{t('agent_monitor_initializing')}</span>
                                    ) : (
                                        agent.logs.map((log, i) => (
                                            <div key={i} className="mb-1 break-words border-l-2 border-transparent hover:border-blue-500/50 pl-2 leading-relaxed">
                                                <span className="text-gray-600 select-none mr-2 opacity-50">❯</span>
                                                {log}
                                            </div>
                                        ))
                                    )}
                                    <div ref={logsEndRef} />
                                </div>
                            )}
                            
                            {/* Latest Log Preview (if not expanded) */}
                            {expandedId !== agent.id && agent.logs.length > 0 && (
                                <div className="px-3 pb-2 text-[10px] text-gray-500 truncate font-mono opacity-70">
                                    <span className="text-blue-500 mr-1">❯</span>
                                    {agent.logs[agent.logs.length - 1]}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        )}
    </div>,
    document.body
  );
};