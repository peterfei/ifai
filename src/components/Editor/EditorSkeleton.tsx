import React from 'react';
import { Skeleton } from '../UI/Skeleton';

/**
 * 编辑器骨架屏 - 模拟文档结构
 *
 * 用于文件加载时显示占位符，模拟：
 * - 行号区域
 * - 代码/文本行
 * - 滚动条
 */
export const EditorSkeleton: React.FC = () => {
  return (
    <div
      className="flex h-full w-full bg-[#1e1e1e]"
      data-testid="editor-skeleton"
      style={{
        animation: 'skeleton-fade-in 0.2s ease-in-out forwards',
      }}
    >
      {/* 行号区域 */}
      <div className="flex flex-col items-end pr-3 pl-4 py-2 select-none bg-[#1e1e1e] border-r border-[#333]">
        {[...Array(30)].map((_, i) => (
          <Skeleton
            key={i}
            variant="text"
            width={24}
            height={14}
            className="mb-0.5 bg-gray-800/40"
          />
        ))}
      </div>

      {/* 代码内容区域 */}
      <div className="flex-1 py-2 pr-4 pl-2">
        <div className="space-y-1">
          {/* 模拟代码行 */}
          {[...Array(30)].map((_, i) => (
            <div key={i} className="flex items-center space-x-2">
              {/* 缩进 */}
              {i % 3 === 0 && <div className="w-4" />}
              {i % 5 === 0 && <div className="w-8" />}

              {/* 代码行 */}
              <Skeleton
                variant="text"
                width={Math.random() > 0.5 ? '80%' : Math.random() > 0.5 ? '60%' : '90%'}
                height={14}
                className="bg-gray-800/40"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 滚动条 */}
      <div className="absolute right-0 top-0 bottom-0 w-2 bg-[#1e1e1e]">
        <Skeleton
          variant="rectangular"
          width={8}
          height="30%"
          className="ml-auto mr-1 bg-gray-700/30 rounded"
        />
      </div>

      <style>{`
        @keyframes skeleton-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};
