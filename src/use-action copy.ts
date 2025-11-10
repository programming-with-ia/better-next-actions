/* eslint-disable react-hooks/refs */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback, useRef } from "react";
import type { ActionResult, ActionErrorProps } from "./action-client";

// ## 1. Type Definitions

// Extract the TData type from an ActionResult
type ExtractData<TResult> = TResult extends ActionResult<infer D> ? D : never;

// Extract the TInput type from the action function
type ActionInput<TAction> = TAction extends (
  payload: infer TInput
) => Promise<any>
  ? TInput
  : never;

// The state object managed by the hook
export type UseActionState<TData> = {
  isLoading: boolean;
  isError: boolean;
  error: ActionErrorProps | null;
  data: TData | null;
};

// Type for the new `set` function's argument
export type UseActionSetState<TData> = {
  data?: TData | null;
  error?: ActionErrorProps | null;
  isError?: boolean;
};

// Options for the `useAction` hook
type UseActionOptions<TData> = {
  /** Initial data to set in the state. */
  initial?: TData | null;
  /** Callback fired on successful action execution. */
  onSuccess?: (state: UseActionState<TData> & { data: TData }) => void;
  /** Callback fired on failed action execution. */
  onError?: (
    state: UseActionState<TData> & { error: ActionErrorProps }
  ) => void;
  /** Callback fired after execution, regardless of outcome. */
  onSettled?: (state: UseActionState<TData>) => void;
};

// Options for the `execute` function
type ExecuteOptions<TData> = Omit<UseActionOptions<TData>, "initial"> & {
  /** If true, resets state to initial value before executing. */
  reset?: boolean;
};

// ## 2. The `useAction` Hook

export function useAction<
  TAction extends (payload: any) => Promise<ActionResult<any>>,
  TInput = ActionInput<TAction>,
  TData = ExtractData<Awaited<ReturnType<TAction>>>
>(action: TAction, options: UseActionOptions<TData> = {}) {
  // Store hook-level options in a ref to keep them fresh
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // --- State Management (using a single state object) ---
  const getInitialState = useCallback(
    (): UseActionState<TData> => ({
      isLoading: false,
      isError: false,
      error: null,
      data: optionsRef.current.initial ?? null,
    }),
    []
  );

  const [state, setState] = useState<UseActionState<TData>>(getInitialState);

  /**
   * Manually sets the hook's state.
   * `isLoading` will always be set to `false` when using this.
   */
  const set = useCallback((newState: UseActionSetState<TData>) => {
    setState((prevState) => ({
      ...prevState,
      ...newState,
      isLoading: false, // Manual set always stops loading
    }));
  }, []);

  /**
   * Resets the hook's state to its initial values.
   */
  const reset = useCallback(() => {
    setState(getInitialState());
  }, [getInitialState]);

  /**
   * Executes the server action.
   */
  const execute = useCallback(
    async (
      payload: TInput,
      execOptions: ExecuteOptions<TData> = {}
    ): Promise<ActionResult<TData>> => {
      // 1. Set loading state
      if (execOptions.reset) {
        setState({ ...getInitialState(), isLoading: true });
      } else {
        setState((prevState) => ({
          ...prevState,
          isLoading: true,
          isError: false,
          error: null,
        }));
      }

      let result: ActionResult<TData>;

      try {
        // 2. Execute the action
        result = (await action(payload)) as ActionResult<TData>;
      } catch (e: unknown) {
        // Catch unexpected errors
        const unexpectedError = {
          code: "UNEXPECTED_ERROR",
          message: (e as Error).message || "An unexpected error occurred.",
        };
        result = { data: null, error: unexpectedError };
      }

      // 3. Process the result and update state
      let finalState: UseActionState<TData>;

      if (result.error) {
        // --- Failure Case ---
        const newData = execOptions.reset
          ? optionsRef.current.initial ?? null
          : null;

        finalState = {
          isLoading: false,
          isError: true,
          error: result.error,
          data: newData,
        };
        setState(finalState);

        // Call error callbacks
        optionsRef.current.onError?.(finalState as any);
        execOptions.onError?.(finalState as any);
      } else {
        // --- Success Case ---
        finalState = {
          isLoading: false,
          isError: false,
          error: null,
          data: result.data,
        };
        setState(finalState);

        // Call success callbacks
        optionsRef.current.onSuccess?.(finalState as any);
        execOptions.onSuccess?.(finalState as any);
      }

      // 4. Call onSettled callbacks
      optionsRef.current.onSettled?.(finalState);
      execOptions.onSettled?.(finalState);

      // 5. Return the raw result
      return result;
    },
    [action, getInitialState]
  );

  return {
    ...state, // isLoading, isError, error, data
    reset,
    execute,
    set,
  };
}
