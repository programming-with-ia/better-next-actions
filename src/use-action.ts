import { useState, useCallback, useRef, useTransition } from "react";
import type { ActionResult, ActionErrorProps } from "./action-client";

type ExtractData<TResult> = TResult extends ActionResult<infer D> ? D : never;
type ActionInput<TAction> = TAction extends (payload: infer TInput) => Promise<any> ? TInput : never;

/**
 * @description The state object managed by the `useAction` hook.
 * @template TData - The type of the data returned by the action.
 * @property {boolean} isError - True if the action resulted in an error.
 * @property {ActionErrorProps | null} error - The error object if an error occurred.
 * @property {TData | null} data - The data returned by the action if successful.
 */
export type UseActionState<TData> = {
  isError: boolean;
  error: ActionErrorProps | null;
  data: TData | null;
};

/**
 * @description The type for the `set` function's argument.
 * @template TData - The type of the data.
 */
export type UseActionSetState<TData> = {
  data?: TData | null;
  error?: ActionErrorProps | null;
  isError?: boolean;
};

/**
 * @description Options for the `useAction` hook.
 * @template TData - The type of the data returned by the action.
 */
type UseActionOptions<TData> = {
  /** Initial data to set in the state. */
  initial?: TData | null;
  /** Callback fired on successful action execution. */
  onSuccess?: (state: UseActionState<TData> & { data: TData }) => void;
  /** Callback fired on failed action execution. */
  onError?: (state: UseActionState<TData> & { error: ActionErrorProps }) => void;
  /** Callback fired after execution, regardless of outcome. */
  onSettled?: (state: UseActionState<TData>) => void;
};

/**
 * @description Options for the `execute` function.
 * @template TData - The type of the data returned by the action.
 */
type ExecuteOptions<TData> = Omit<UseActionOptions<TData>, "initial"> & {
  /** If true, resets state to initial value before executing. */
  reset?: boolean;
};

/**
 * @description A hook for invoking server actions.
 * @template TAction - The type of the server action.
 * @template TInput - The input type of the action.
 * @template TData - The data type returned by the action.
 * @param {TAction} action - The server action to execute.
 * @param {UseActionOptions<TData>} [options={}] - Options for the hook.
 * @returns {{
 *   isError: boolean;
 *   error: ActionErrorProps | null;
 *   data: TData | null;
 *   isLoading: boolean;
 *   reset: () => void;
 *   execute: (payload: TInput, execOptions?: ExecuteOptions<TData>) => void;
 *   set: (newState: UseActionSetState<TData>) => void;
 * }}
 */
export function useAction<
  TAction extends (payload: any) => Promise<ActionResult<any>>,
  TInput = ActionInput<TAction>,
  TData = ExtractData<Awaited<ReturnType<TAction>>>
>(action: TAction, options: UseActionOptions<TData> = {}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [isPending, startTransition] = useTransition();

  const getInitialState = useCallback(
    (): UseActionState<TData> => ({
      isError: false,
      error: null,
      data: optionsRef.current.initial ?? null,
    }),
    []
  );

  const [state, setState] = useState<UseActionState<TData>>(getInitialState);

  const set = useCallback((newState: UseActionSetState<TData>) => {
    startTransition(() => {
      setState((prevState) => ({
        ...prevState,
        ...newState,
      }));
    });
  }, []);

  const reset = useCallback(() => {
    startTransition(() => {
      setState(getInitialState());
    });
  }, [getInitialState]);

  const execute = useCallback(
    (payload: TInput, execOptions: ExecuteOptions<TData> = {}) => {
      startTransition(async () => {
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
          result = (await action(payload)) as ActionResult<TData>;
        } catch (e: unknown) {
          const unexpectedError = {
            code: "UNEXPECTED_ERROR",
            message: (e as Error).message || "An unexpected error occurred.",
          };
          result = { data: null, error: unexpectedError };
        }

        let finalState: UseActionState<TData>;

        if (result.error) {
          const newData = execOptions.reset
            ? optionsRef.current.initial ?? null
            : null;

          finalState = {
            isError: true,
            error: result.error,
            data: newData,
          };
          setState(finalState);

          optionsRef.current.onError?.(finalState as any);
          execOptions.onError?.(finalState as any);
        } else {
          finalState = {
            isError: false,
            error: null,
            data: result.data,
          };
          setState(finalState);

          optionsRef.current.onSuccess?.(finalState as any);
          execOptions.onSuccess?.(finalState as any);
        }

        optionsRef.current.onSettled?.(finalState);
        execOptions.onSettled?.(finalState);
      });
    },
    [action, getInitialState]
  );

  return {
    ...state,
    isLoading: isPending,
    reset,
    execute,
    set,
  };
}
