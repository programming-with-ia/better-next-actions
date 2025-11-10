/* eslint-disable react-hooks/refs */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback, useRef, useTransition } from "react";
// Assuming 'ActionResult' and 'ActionErrorProps' are defined in './action-client'
// You may need to create this file or adjust these types
// Example:
// export type ActionErrorProps = { code: string; message: string; };
// export type ActionResult<T> = { data: T | null; error: ActionErrorProps | null; };

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

// The state object managed by the hook (isLoading is removed)
export type UseActionState<TData> = {
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

  // Add useTransition. `isPending` will be our new `isLoading`.
  const [isPending, startTransition] = useTransition();

  // --- State Management ---
  const getInitialState = useCallback(
    (): UseActionState<TData> => ({
      isError: false,
      error: null,
      data: optionsRef.current.initial ?? null,
    }),
    []
  );

  const [state, setState] = useState<UseActionState<TData>>(getInitialState);

  /**
   * Manually sets the hook's state as a transition.
   */
  const set = useCallback((newState: UseActionSetState<TData>) => {
    startTransition(() => {
      setState((prevState) => ({
        ...prevState,
        ...newState,
      }));
    });
  }, []);

  /**
   * Resets the hook's state to its initial values as a transition.
   */
  const reset = useCallback(() => {
    startTransition(() => {
      setState(getInitialState());
    });
  }, [getInitialState]);

  /**
   * Executes the server action.
   * This is a "fire-and-forget" function that manages its own pending state.
   */
  const execute = useCallback(
    (payload: TInput, execOptions: ExecuteOptions<TData> = {}) => {
      // Wrap the entire async operation in startTransition
      startTransition(async () => {
        // 1. Set "loading" state (by resetting if requested)
        if (execOptions.reset) {
          setState(getInitialState());
        } else {
          setState((prevState) => ({
            ...prevState,
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

        // 3. Process the result and update state (still inside the transition)
        let finalState: UseActionState<TData>;

        if (result.error) {
          // --- Failure Case ---
          const newData = execOptions.reset
            ? optionsRef.current.initial ?? null
            : null;

          finalState = {
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
      });
    },
    [action, getInitialState]
  );

  return {
    ...state, // isError, error, data
    isLoading: isPending, // The loading state is now just isPending
    reset,
    execute,
    set,
  };
}
