/**
 * SkillsDock — 技能广场浮动入口按钮
 *
 * 精简版：仅保留左下角浮动按钮，点击打开 SkillMarketModal。
 * 原内联详情面板 / 创建表单 / 旧市场已移除，全部交由 SkillMarketModal 处理。
 */

import React from 'react';
import { Gamepad2 } from 'lucide-react';
import { useLayoutStore } from '@/stores/layoutStore';
import { useSkillStore } from '@/stores/skillStore';

export const SkillsDock: React.FC = () => {
  const installedCount = useSkillStore((s) => s.stats?.installed ?? 0);
  const openMarket = () => useLayoutStore.getState().setSkillMarketOpen(true);

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <button
        onClick={openMarket}
        className="flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg transition-all
                   bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600
                   hover:border-blue-500"
        title="技能广场"
      >
        <Gamepad2 size={16} />
        <span className="text-sm font-medium">技能广场 ({installedCount})</span>
      </button>
    </div>
  );
};
