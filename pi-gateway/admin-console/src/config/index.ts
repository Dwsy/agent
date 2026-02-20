/**
 * Config 模块统一导出
 */
export { AdminConfigSchema, type FeaturesConfig, type NavItem } from './schema';
export type { AdminConfig } from './types';
export { defaultConfig, defaultNavigation } from './defaults';
export { deepMerge, extractEnvConfig, mergeConfigLayers } from './merge';
export {
  parseAndValidateConfig,
  validateConfig,
  parseJSON,
  ConfigParseError,
  ParseErrorCode,
} from './parser';
export { loadConfig, loadConfigSync, type ConfigLoadOptions, type ConfigLoadResult } from './loader';
export {
  ConfigProvider,
  useConfig,
  useConfigSection,
  withConfig,
} from './config-provider';
export { getNavItemById, getNavItemByPath, getNavItemsByFeature, iconNameMap } from './navigation';
