import React from 'react';
import { Registry } from './registry';

/** 面板组件注册表：paneId → React.ComponentType */
export const componentRegistry = new Registry<React.ComponentType>();
