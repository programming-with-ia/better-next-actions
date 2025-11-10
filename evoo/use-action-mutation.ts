/* eslint-disable @typescript-eslint/no-explicit-any */
// hooks/use-action-mutation.ts

import { useMutation, UseMutationOptions, QueryKey } from "react-query";
import type { ActionResult, ActionErrorProps } from "./action-client";

// ## 1. Helper Types

type ExtractData<TResult> = TResult extends ActionResult<infer D> ? D : never;

type ActionInput<TAction> = TAction extends (
  payload: infer TInput
) => Promise<any>
  ? TInput
  : never;

// ## 2. Hook Options
// These are the options you pass to the hook itself
type UseActionMutationHookOptions<TData, TInput> = Omit<
  UseMutationOptions<TData, ActionErrorProps, TInput>,
  "mutationFn"
> & {
  /**
   * Optional query key(s) to invalidate upon success.
   */
  invalidateKeys?: QueryKey[];
};

// These are the options you can pass to the `execute` function
type UseActionMutationExecuteOptions<TData, TInput> = {
  onSuccess?: (data: TData) => void;
  onError?: (error: ActionErrorProps) => void;
  onSettled?: (data: TData | undefined, error: ActionErrorProps | null) => void;
  /** If true, resets mutation state to initial before executing. */
  reset?: boolean;
};

// ## 3. The Hook

export function useActionMutation<
  TAction extends (payload: any) => Promise<ActionResult<any>>,
  TInput = ActionInput<TAction>,
  TData = ExtractData<Awaited<ReturnType<TAction>>>
>(
  action: TAction,
  hookOptions: UseActionMutationHookOptions<TData, TInput> = {}
) {
  const {
    // Our custom option
    invalidateKeys,
    // Standard react-query options
    onSuccess: hookOnSuccess,
    onError: hookOnError,
    onSettled: hookOnSettled,
    ...restHookOptions
  } = hookOptions;

  const { mutateAsync, reset, isLoading, isError, error, data, status } =
    useMutation<TData, ActionErrorProps, TInput>({
      // 1. The Adapter Function:
      // This bridges our actionClient ({data, error})
      // with react-query (return data / throw error).
      mutationFn: async (payload: TInput) => {
        const result = (await action(payload)) as ActionResult<TData>;
        if (result.error) {
          throw result.error;
        }
        return result.data;
      },

      // 2. Hook-level callbacks
      onSuccess: (data, variables, context) => {
        // (Cache invalidation logic would go here if needed)
        hookOnSuccess?.(data, variables, context);
      },
      onError: (error, variables, context) => {
        hookOnError?.(error, variables, context);
      },
      onSettled: (data, error, variables, context) => {
        hookOnSettled?.(data, error, variables, context);
      },

      // Pass all other react-query options
      ...restHookOptions,
    });

  // 3. The `execute` function
  // This mirrors the `execute` from `useAction`
  const execute = async (
    payload: TInput,
    executeOptions: UseActionMutationExecuteOptions<TData, TInput> = {}
  ) => {
    // Support for `reset: true`
    if (executeOptions.reset) {
      reset();
    }

    try {
      // Call the mutation
      const result = await mutateAsync(payload, {
        onSuccess: executeOptions.onSuccess,
        onError: executeOptions.onError,
        onSettled: executeOptions.onSettled,
      });
      return { data: result, error: null } as ActionResult<TData>;
    } catch (e: unknown) {
      // The hook's `mutationFn` throws on error, so we catch it
      return {
        data: null,
        error: e as ActionErrorProps,
      } as ActionResult<TData>;
    }
  };

  return {
    execute,
    reset,
    isLoading,
    isError,
    error,
    data: data ?? null,
    status,
  };
}
