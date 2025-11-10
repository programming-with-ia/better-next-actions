// lib/action-error.ts

/**
 * Custom error class for server actions.
 * Allows returning a structured error object from the action.
 * @param input - A simple error message string or an object with a message and optional code.
 */
export class ActionError extends Error {
  public readonly code?: string;

  constructor(input: string | { code?: string; message: string }) {
    const { message, code } =
      typeof input === 'string'
        ? { message: input, code: undefined }
        : input;

    super(message);
    this.name = 'ActionError';
    this.code = code;
  }
}
