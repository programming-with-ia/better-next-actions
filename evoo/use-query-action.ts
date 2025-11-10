/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import {
  useQuery,
  UseQueryOptions,
  QueryKey,
  UseQueryResult, // Import this for the return type
} from 'react-query';
import type { ActionResult, ActionErrorProps } from './action-client';

// ## 1. Helper Type (Unchanged)
type ExtractData<TResult> = TResult extends ActionResult<infer D>
  ? D
  : never;

// ## 2. Hook Options (FIXED)
// We update this type to explicitly accept TData and TQueryFn.
// TQueryFn is now constrained by TData.
export type UseQueryActionOptions<
  TData,
  TQueryFn extends () => Promise<ActionResult<TData>>,
> = Omit<
  UseQueryOptions<TData, ActionErrorProps, TData, QueryKey>,
  'queryFn'
> & {
  /**
   * A function that calls your server action.
   * This function is responsible for passing any parameters.
   *
   * @example () => getPosts({ page: 1 })
   */
  queryFn: TQueryFn;
};

// ## 3. The `useQueryAction` Hook (FIXED)
export function useQueryAction<
  // TQueryFn is constrained loosely so TypeScript can infer its specific type
  TQueryFn extends () => Promise<ActionResult<any>>,
  // TData is then correctly inferred from TQueryFn's *actual* return type
  TData = ExtractData<Awaited<ReturnType<TQueryFn>>>,
>(
  // We pass the inferred TData and the specific TQueryFn to our options type
  // This ensures `...restOptions` has the correct types
  options: UseQueryActionOptions<TData, TQueryFn>,
): UseQueryResult<TData, ActionErrorProps> { // Add explicit return type
  const { queryKey, queryFn, ...restOptions } = options;

  return useQuery<TData, ActionErrorProps, TData, QueryKey>({
    // ...restOptions is now correctly typed with the inferred TData
    ...restOptions,

    queryKey: queryKey,

    // This adapter function is now correctly typed
    queryFn: async () => {
      const result = await queryFn();

      if (result.error) {
        throw result.error;
      }

      // result.data is now correctly inferred as TData
      return result.data;
    },
  });
}