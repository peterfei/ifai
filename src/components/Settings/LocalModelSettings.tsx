/**
 * IfAI Editor - Local Model Settings Component
 * ============================================
 *
 * 本地模型设置组件，用于：
 * - 验证模型文件是否存在
 * - 显示模型信息
 * - 配置本地推理参数
 */

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

// ============================================================================
// Types
// ============================================================================

interface ModelInfo {
  path: string;
  size_mb: number;
  size_bytes: number;
  format: string;
  model: string;
}

interface SystemInfo {
  os: string;
  arch: string;
  family: string;
  model_dir: string;
  model_exists: boolean;
}

interface LocalModelConfig {
  model_name: string;
  enabled: boolean;
  max_seq_length: number;
  temperature: number;
  top_p: number;
  context_size: number;
}

// ============================================================================
// Component
// ============================================================================

export const LocalModelSettings: React.FC = () => {
  const [config, setConfig] = useState<LocalModelConfig | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载配置和系统信息
  useEffect(() => {
    loadInfo();
  }, []);

  const loadInfo = async () => {
    try {
      setLoading(true);

      const [cfg, sys] = await Promise.all([
        invoke<LocalModelConfig>('get_local_model_config'),
        invoke<SystemInfo>('get_system_info'),
      ]);

      setConfig(cfg);
      setSystemInfo(sys);

      // 如果模型存在，加载模型信息
      if (sys.model_exists) {
        const info = await invoke<ModelInfo>('validate_local_model');
        setModelInfo(info);
      }

      setError(null);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  // 验证模型
  const handleValidate = async () => {
    try {
      const info = await invoke<ModelInfo>('validate_local_model');
      setModelInfo(info);
      setError(null);
    } catch (err) {
      setError(err as string);
      setModelInfo(null);
    }
  };

  // 打开模型目录
  const handleOpenModelDir = async () => {
    if (systemInfo) {
      open({ directory: true, path: systemInfo.model_dir }).catch(console.error);
    }
  };

  // 测试工具调用解析
  const handleTestToolParse = async () => {
    const testText = "我会使用 agent_read_file(rel_path='src/auth.ts') 来完成这个任务。";
    try {
      const result = await invoke<any[]>('test_tool_parse', { text: testText });
      console.log('Tool parse result:', result);
      alert(`解析成功！\n${JSON.stringify(result, null, 2)}`);
    } catch (err) {
      console.error(err);
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="border-b pb-4">
        <h2 className="text-xl font-semibold">本地模型设置</h2>
        <p className="text-sm text-gray-500 mt-1">
          配置 Qwen2.5-Coder 微调模型，支持本地推理和工具调用
        </p>
      </div>

      {/* 系统信息 */}
      {systemInfo && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium mb-2">系统信息</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-gray-500">操作系统:</span> {systemInfo.os}</div>
            <div><span className="text-gray-500">架构:</span> {systemInfo.arch}</div>
            <div className="col-span-2">
              <span className="text-gray-500">模型目录:</span> {systemInfo.model_dir}
            </div>
          </div>
        </div>
      )}

      {/* 模型状态 */}
      <div className={`rounded-lg p-4 ${modelInfo ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">模型状态</h3>
            {modelInfo ? (
              <div className="mt-2 text-sm space-y-1">
                <div><span className="text-gray-500">文件:</span> {modelInfo.path}</div>
                <div><span className="text-gray-500">大小:</span> {modelInfo.size_mb.toFixed(2)} MB</div>
                <div><span className="text-gray-500">格式:</span> {modelInfo.format}</div>
                <div><span className="text-gray-500">模型:</span> {modelInfo.model}</div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-yellow-700">
                模型文件未找到。请将模型文件放置在: {systemInfo?.model_dir}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleValidate}
              className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              刷新
            </button>
            <button
              onClick={handleOpenModelDir}
              className="px-3 py-1.5 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              打开目录
            </button>
          </div>
        </div>
      </div>

      {/* 错误信息 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* 配置参数 */}
      {config && (
        <div className="space-y-4">
          <h3 className="font-medium">推理参数</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Temperature</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={config.temperature}
                onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border rounded"
              />
              <p className="text-xs text-gray-400 mt-1">控制随机性 (0.0 - 2.0)</p>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Top P</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={config.top_p}
                onChange={(e) => setConfig({ ...config, top_p: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border rounded"
              />
              <p className="text-xs text-gray-400 mt-1">核采样参数 (0.0 - 1.0)</p>
            </div>
          </div>
        </div>
      )}

      {/* 测试按钮 */}
      <div className="border-t pt-4">
        <h3 className="font-medium mb-2">测试功能</h3>
        <button
          onClick={handleTestToolParse}
          className="px-4 py-2 text-sm bg-purple-500 text-white rounded hover:bg-purple-600"
        >
          测试工具调用解析
        </button>
      </div>

      {/* 功能说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
        <h3 className="font-medium mb-2">当前支持</h3>
        <ul className="list-disc list-inside space-y-1 text-blue-800">
          <li>模型文件验证</li>
          <li>模型信息查看</li>
          <li>工具调用解析测试</li>
        </ul>

        <h3 className="font-medium mt-4 mb-2">即将推出</h3>
        <ul className="list-disc list-inside space-y-1 text-blue-800">
          <li>纯 Rust 本地推理（无需外部依赖）</li>
          <li>流式生成</li>
          <li>Agent 工具调用集成</li>
        </ul>
      </div>
    </div>
  );
};
