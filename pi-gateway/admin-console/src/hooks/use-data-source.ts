/**
 * useDataSource Hook
 * 数据源抽象层，统一管理数据获取策略
 * 支持 polling 模式（为 realtime 模式预留接口）
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, useQueries, type UseQueryOptions } from '@tanstack/react-query';
import { useConfig } from '../config/config-provider';
import type { PollingConfig } from '../config/schema';
import { 
  trackQueryEvent, 
  trackMutationEvent, 
  recordQueryDuration, 
  recordMutationDuration,
  recordErrorCount 
} from './use-observability';

/**
 * 数据源模式
 */
export type DataSourceMode = 'polling' | 'realtime' | 'hybrid';

/**
 * 页面标识（对应 polling 配置的 key）
 */
export type PageKey = keyof PollingConfig;

/**
 * 查询函数类型
 */
export type QueryFunction<T> = () => Promise<T>;

/**
 * 数据源配置
 */
interface DataSourceConfig<T> {
  /** 查询 Key */
  queryKey: string[];
  /** 查询函数 */
  queryFn: QueryFunction<T>;
  /** 所属页面，用于获取轮询间隔 */
  page: PageKey;
  /** 自定义模式（覆盖全局配置） */
  mode?: DataSourceMode;
  /** 自定义轮询间隔（覆盖配置） */
  interval?: number;
  /** 是否启用轮询 */
  enabled?: boolean;
  /** 错误重试次数 */
  retry?: number;
  /** 是否启用防抖 */
  debounce?: boolean;
  /** 防抖延迟（毫秒） */
  debounceDelay?: number;
}

/**
 * useDataSource 返回值
 */
interface UseDataSourceReturn<T> {
  /** 查询数据 */
  data: T | undefined;
  /** 是否加载中 */
  isLoading: boolean;
  /** 是否获取中（包括后台刷新） */
  isFetching: boolean;
  /** 是否错误 */
  isError: boolean;
  /** 错误对象 */
  error: Error | null;
  /** 手动刷新 */
  refetch: () => Promise<void>;
  /** 获取数据的时间戳 */
  dataUpdatedAt: number;
}

/**
 * useDataSource Hook
 * 统一的数据获取抽象层
 * 
 * 示例：
 * const { data, isLoading, refetch } = useDataSource({
 *   queryKey: ['health'],
 *   queryFn: fetchGatewayHealth,
 *   page: 'overview'
 * });
 */
export function useDataSource<T>(config: DataSourceConfig<T>): UseDataSourceReturn<T> {
  const { config: appConfig } = useConfig();
  const { realtime, polling } = appConfig;

  // 确定数据获取模式
  const mode = config.mode ?? realtime.mode;

  // 获取轮询间隔（页面特定配置 > 自定义配置 > 默认配置）
  const interval = useMemo(() => {
    if (config.interval !== undefined) return config.interval;
    return polling[config.page] ?? 5000;
  }, [config.interval, config.page, polling]);

  // 是否启用轮询
  const isPollingEnabled = useMemo(() => {
    if (config.enabled === false) return false;
    if (mode === 'polling') return true;
    if (mode === 'hybrid') return true;
    return false;
  }, [config.enabled, mode]);

  // TanStack Query 配置 - 包装 queryFn 以追踪性能
  const instrumentedQueryFn = useCallback(async (): Promise<T> => {
    const startTime = performance.now();
    const queryKeyStr = config.queryKey.join('/');
    
    try {
      const result = await config.queryFn();
      const duration = Math.round(performance.now() - startTime);
      
      trackQueryEvent('info', `Query succeeded: ${queryKeyStr}`, {
        queryKey: queryKeyStr,
        page: config.page,
        duration,
      });
      recordQueryDuration(queryKeyStr, duration, { page: config.page, status: 'success' });
      
      return result;
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      const error = err instanceof Error ? err : new Error(String(err));
      
      trackQueryEvent('error', `Query failed: ${queryKeyStr}`, {
        queryKey: queryKeyStr,
        page: config.page,
        duration,
        error: error.message,
      });
      recordQueryDuration(queryKeyStr, duration, { page: config.page, status: 'error' });
      recordErrorCount('query', { queryKey: queryKeyStr, page: config.page });
      
      throw err;
    }
  }, [config.queryFn, config.queryKey, config.page]);

  const queryOptions: UseQueryOptions<T, Error, T, string[]> = useMemo(
    () => ({
      queryKey: config.queryKey,
      queryFn: instrumentedQueryFn,
      refetchInterval: isPollingEnabled ? interval : false,
      refetchOnWindowFocus: true,
      retry: config.retry ?? 3,
    }),
    [config.queryKey, instrumentedQueryFn, isPollingEnabled, interval, config.retry]
  );

  const query = useQuery(queryOptions);

  // 手动刷新包装
  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}

/**
 * 使用多个数据源的 Hook
 * 用于需要同时获取多个数据源的页面
 */
export function useMultiDataSource<T extends Record<string, unknown>>(
  configs: { [K in keyof T]: DataSourceConfig<T[K]> }
): {
  data: { [K in keyof T]: T[K] | undefined };
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetchAll: () => Promise<void>;
} {
  const entries = useMemo(() => Object.entries(configs) as Array<[keyof T, DataSourceConfig<T[keyof T]>]>, [configs]);

  const queryResults = useQueries({
    queries: entries.map(([, cfg]) => ({
      queryKey: cfg.queryKey,
      queryFn: cfg.queryFn,
      refetchInterval: cfg.interval ?? 5000,
      enabled: cfg.enabled !== false,
      retry: cfg.retry ?? 3,
    })),
  });

  const data = useMemo(() => {
    const result = {} as { [K in keyof T]: T[K] | undefined };
    entries.forEach(([key], index) => {
      const value = queryResults[index]?.data as T[keyof T] | undefined;
      result[key] = value as T[typeof key] | undefined;
    });
    return result;
  }, [entries, queryResults]);

  const isLoading = queryResults.some((q) => q.isLoading);
  const isFetching = queryResults.some((q) => q.isFetching);
  const isError = queryResults.some((q) => q.isError);

  const refetchAll = useCallback(async () => {
    await Promise.all(queryResults.map((q) => q.refetch()));
  }, [queryResults]);

  return {
    data,
    isLoading,
    isFetching,
    isError,
    refetchAll,
  };
}

/**
 * 使用数据变更的 Hook
 * 封装 mutation 并提供自动刷新功能
 */
interface UseDataMutationConfig<TData, TVariables> {
  /** 变更函数 */
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** 成功后刷新的查询 Key */
  invalidateKeys?: string[][];
  /** 成功回调 */
  onSuccess?: (data: TData, variables: TVariables) => void;
  /** 错误回调 */
  onError?: (error: Error, variables: TVariables) => void;
}

export function useDataMutation<TData, TVariables = void>(
  config: UseDataMutationConfig<TData, TVariables>
) {
  const queryClient = useQueryClient();

  // 包装 mutationFn 以追踪性能
  const instrumentedMutationFn = useCallback(
    async (variables: TVariables): Promise<TData> => {
      const startTime = performance.now();
      const mutationName = config.mutationFn.name || 'unknown';
      
      try {
        const result = await config.mutationFn(variables);
        const duration = Math.round(performance.now() - startTime);
        
        trackMutationEvent('info', `Mutation succeeded: ${mutationName}`, {
          mutationName,
          duration,
        });
        recordMutationDuration(mutationName, duration, { status: 'success' });
        
        return result;
      } catch (err) {
        const duration = Math.round(performance.now() - startTime);
        const error = err instanceof Error ? err : new Error(String(err));
        
        trackMutationEvent('error', `Mutation failed: ${mutationName}`, {
          mutationName,
          duration,
          error: error.message,
        });
        recordMutationDuration(mutationName, duration, { status: 'error' });
        recordErrorCount('mutation', { mutationName });
        
        throw err;
      }
    },
    [config.mutationFn]
  );

  const mutation = useMutation({
    mutationFn: instrumentedMutationFn,
    onSuccess: (data, variables) => {
      // 自动刷新相关查询
      if (config.invalidateKeys) {
        config.invalidateKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
      config.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      config.onError?.(error as Error, variables);
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
    data: mutation.data,
    reset: mutation.reset,
  };
}

/**
 * 实时模式 Hook（预留接口）
 * 用于 WebSocket/SSE 模式的数据获取
 * 当前回退到 polling 模式
 */
export function useRealtimeDataSource<T>(config: DataSourceConfig<T>): UseDataSourceReturn<T> {
  const { config: appConfig } = useConfig();

  // 如果配置为 websocket/sse，暂时回退到 hybrid（预留扩展）
  const effectiveMode: DataSourceMode =
    appConfig.realtime.mode === 'polling' ? 'polling' : 'hybrid';

  return useDataSource({
    ...config,
    mode: effectiveMode,
  });
}

/**
 * 使用页面数据源的快捷 Hook
 * 预配置常用页面参数
 */
export function usePageDataSource<T>(
  page: PageKey,
  queryKey: string[],
  queryFn: QueryFunction<T>
): UseDataSourceReturn<T> {
  return useDataSource({
    page,
    queryKey,
    queryFn,
  });
}

/**
 * 手动刷新特定查询 Key 的工具
 */
export function useDataSourceRefresher() {
  const queryClient = useQueryClient();

  const refresh = useCallback(
    async (queryKey: string[]) => {
      await queryClient.invalidateQueries({ queryKey });
    },
    [queryClient]
  );

  const refreshAll = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  return {
    refresh,
    refreshAll,
  };
}
