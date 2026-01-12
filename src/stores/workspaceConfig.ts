/**
 * 工作区配置文件格式
 * @since v0.3.0
 */

export interface WorkspaceConfig {
  version: string;                    // 配置版本号，用于兼容性
  name: string;                        // 工作区名称
  description?: string;                // 工作区描述
  createdAt: string;                   // 创建时间 (ISO 8601)
  updatedAt: string;                   // 更新时间 (ISO 8601)

  // 工作区根目录列表
  roots: WorkspaceRootConfig[];

  // 可选：工作区级别的配置
  settings?: {
    activeRootId?: string;             // 当前活动根目录
    expandedPaths?: string[];           // 展开的目录路径
    // 未来可扩展更多配置
  };
}

/**
 * 单个根目录配置
 */
export interface WorkspaceRootConfig {
  path: string;                        // 目录绝对路径
  name?: string;                       // 自定义名称（可选，默认使用目录名）
  alias?: string;                      // 别名（可选，用于显示）

  // 可选：索引配置
  index?: {
    enabled: boolean;                  // 是否启用索引
    lastIndexedAt?: string;            // 最后索引时间
  };

  // 可选：显示配置
  display?: {
    color?: string;                    // 标记颜色
    icon?: string;                     // 自定义图标
  };
}

/**
 * 工作区配置文件名
 */
export const WORKSPACE_CONFIG_FILENAME = '.workspace.json';
export const WORKSPACE_CONFIG_FILE_FILTER = [
  {
    name: 'Workspace Config',
    extensions: ['json']
  }
];
