/**
 * 🏭 自动字段映射器（元编程）
 *
 * 核心功能：
 * - 自动字段映射
 * - 元数据驱动
 * - 零手动代码
 * - 编译时类型安全
 *
 * @module AutoFieldMapper
 */

import { MESSAGE_FLOW_SCHEMA } from './META_MESSAGE_FLOW_SCHEMA';
import { COMPONENT_SCHEMAS, type ComponentName } from './COMPONENT_SCHEMAS';

/**
 * 字段映射配置
 */
interface FieldMappingConfig {
  /** 映射的字段列表 */
  fields?: string[];

  /** 通配符：映射所有字段 */
  wildcard?: boolean;

  /** 字段转换函数 */
  transform?: Record<string, (value: any) => any>;
}

/**
 * 自动字段映射器类
 *
 * @example
 * ```typescript
 * const mapper = AutoFieldMapper.getInstance();
 *
 * // 映射所有字段
 * const mapped = mapper.mapFields(source, { wildcard: true });
 *
 * // 为特定组件创建映射器
 * const messageBuilderMapper = mapper.createComponentMapper('MessageBuilder');
 * const result = messageBuilderMapper(source);
 * ```
 */
export class AutoFieldMapper {
  private static instance: AutoFieldMapper;
  private schema = MESSAGE_FLOW_SCHEMA;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): AutoFieldMapper {
    if (!AutoFieldMapper.instance) {
      AutoFieldMapper.instance = new AutoFieldMapper();
    }
    return AutoFieldMapper.instance;
  }

  /**
   * ✨ 根据元数据自动映射字段
   *
   * @param source 源对象
   * @param config 映射配置
   * @returns 映射后的对象
   */
  mapFields<TSource = any, TDestination = any>(
    source: TSource,
    config?: FieldMappingConfig
  ): Partial<TDestination> {
    const result: any = {};

    // 通配符模式：映射所有字段
    if (config?.wildcard || this.schema.fieldPropagation.wildcard) {
      for (const key of Object.keys(source as object)) {
        result[key] = (source as any)[key];
      }
    }

    // 指定字段映射
    if (config?.fields) {
      for (const key of config.fields) {
        if (key in source) {
          const value = (source as any)[key];

          // 应用转换函数
          if (config.transform && key in config.transform) {
            result[key] = config.transform[key](value);
          } else {
            result[key] = value;
          }
        }
      }
    }

    // 自动继承字段（从元数据）
    for (const field of this.schema.fieldPropagation.autoInherit) {
      if (field in source) {
        result[field] = (source as any)[field];
      }
    }

    return result;
  }

  /**
   * ✨ 为特定组件创建映射器
   *
   * 根据组件配置自动生成映射器函数
   *
   * @param componentName 组件名称
   * @returns 映射器函数
   */
  createComponentMapper<T = any>(componentName: ComponentName) {
    const componentSchema = COMPONENT_SCHEMAS[componentName];

    return (source: any): Partial<T> => {
      // 自动映射所有字段
      if (componentSchema.autoMapAllFields) {
        return this.mapFields(source, { wildcard: true });
      }

      // 映射输出字段
      if (componentSchema.outputs) {
        return this.mapFields(source, {
          fields: componentSchema.outputs as string[],
          transform: componentSchema.transformations,
        });
      }

      // 自动继承字段
      if (componentSchema.autoInheritFields) {
        return this.mapFields(source, {});
      }

      return source;
    };
  }

  /**
   * 批量映射多个对象
   *
   * @param sources 源对象数组
   * @param config 映射配置
   * @returns 映射后的对象数组
   */
  mapBatch<TSource = any, TDestination = any>(
    sources: TSource[],
    config?: FieldMappingConfig
  ): Partial<TDestination>[] {
    return sources.map(source => this.mapFields(source, config));
  }

  /**
   * 深度映射对象（支持嵌套对象）
   *
   * @param source 源对象
   * @param config 映射配置
   * @returns 映射后的对象
   */
  mapDeep<TSource = any, TDestination = any>(
    source: TSource,
    config?: FieldMappingConfig
  ): Partial<TDestination> {
    const result: any = this.mapFields(source, config);

    // 递归映射嵌套对象
    for (const key of Object.keys(result)) {
      const value = result[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.mapDeep(value, config);
      }
    }

    return result;
  }
}

/**
 * 默认导出单例实例
 */
export default AutoFieldMapper.getInstance();
