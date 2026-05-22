import { Registry } from '../registry';
import type { LayoutDescriptor } from './types';

/** 布局注册表：mode → LayoutDescriptor */
export const layoutRegistry = new Registry<LayoutDescriptor>();
