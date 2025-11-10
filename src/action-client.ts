import { z, ZodObject } from "zod";
import { ActionError } from "./action-error";

/**
 * @description Represents the properties of an action error.
 * @property {string} [code] - An optional error code.
 * @property {string} message - A descriptive error message.
 */
export type ActionErrorProps = { code?: string; message: string };

/**
 * @description Represents a successful action result.
 * @template TData - The type of the data returned by the action.
 * @property {TData} data - The data returned by the action.
 * @property {null} error - Indicates that no error occurred.
 */
export type ActionSuccess<TData> = { data: TData; error: null };

/**
 * @description Represents a failed action result.
 * @property {null} data - Indicates that no data was returned.
 * @property {ActionErrorProps} error - The error that occurred during the action.
 */
export type ActionFailure = { data: null; error: ActionErrorProps };

/**
 * @description The standard return type for all actions created with the client.
 * It can be either a success or a failure.
 * @template TData - The type of the data returned by the action.
 */
export type ActionResult<TData> = ActionSuccess<TData> | ActionFailure;

/**
 * @description Checks if an error is an internal Next.js error (e.g., redirect, notFound).
 * These errors should be re-thrown to be handled by the Next.js framework.
 * @param {unknown} error - The error to check.
 * @returns {boolean} - True if the error is a Next.js internal error, false otherwise.
 */
function isNextJsInternalError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return false;
  }

  const digest = (error as { digest?: string }).digest;

  // Checks for NEXT_REDIRECT, NEXT_NOT_FOUND, etc.
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

/**
 * @template TSchema - The Zod schema, or `undefined` if not set.
 * @template TContext - The combined type of all middleware.
 * @class
 * @description A builder for creating typesafe server actions.
 */
class ActionBuilder<
  TSchema extends ZodObject<any> | undefined,
  TContext extends Record<string, unknown>
> {
  private schema: TSchema;
  private middleware: () => Promise<TContext>;

  constructor(config: {
    schema: TSchema;
    middleware: () => Promise<TContext>;
  }) {
    this.schema = config.schema;
    this.middleware = config.middleware;
  }

  /**
   * @description Adds Zod object validation.
   * @param {Z} schema - The Zod schema to use for validation.
   * @returns {ActionBuilder<Z, TContext>} - A new, configured ActionBuilder instance.
   */
  public input<Z extends ZodObject<any>>(
    schema: Z
  ): ActionBuilder<Z, TContext> {
    return new ActionBuilder({ ...this, schema });
  }

  /**
   * @description Adds stacking middleware.
   * @template TNewContext - The type of the new context returned by the middleware.
   * @param {(ctx: TContext) => Promise<TNewContext>} newMiddleware - The middleware to add.
   * @returns {ActionBuilder<TSchema, TContext & TNewContext>} - A new, configured ActionBuilder instance.
   */
  public use<TNewContext extends Record<string, unknown>>(
    newMiddleware: (ctx: TContext) => Promise<TNewContext>
  ): ActionBuilder<TSchema, TContext & TNewContext> {
    const oldMiddleware = this.middleware;

    const newCombinedMiddleware = async () => {
      const baseCtx = await oldMiddleware();
      const newCtx = await newMiddleware(baseCtx);
      return { ...baseCtx, ...newCtx };
    };

    return new ActionBuilder({
      ...this,
      middleware: newCombinedMiddleware as any,
    });
  }

  /**
   * @description Creates the final, typesafe server action.
   * @template TOutput - The output type of the action.
   * @template TPayload - The payload type of the action, inferred from the handler if no schema is present.
   * @param {(data: TSchema extends ZodObject<any> ? z.infer<TSchema> : TPayload, ctx: TContext) => Promise<TOutput>} handler - The action handler.
   * @returns {(payload: TSchema extends ZodObject<any> ? z.input<TSchema> : TPayload) => Promise<ActionResult<TOutput>>} - The created server action.
   */
  public action<
    TOutput,
    TPayload
  >(
    handler: (
      data: TSchema extends ZodObject<any> ? z.infer<TSchema> : TPayload,
      ctx: TContext
    ) => Promise<TOutput>
  ): (
    payload: TSchema extends ZodObject<any> ? z.input<TSchema> : TPayload
  ) => Promise<ActionResult<TOutput>> {
    return async (
      payload: TSchema extends ZodObject<any> ? z.input<TSchema> : TPayload
    ): Promise<ActionResult<TOutput>> => {
      try {
        const context = await this.middleware();

        let validatedInput: TSchema extends ZodObject<any> ? z.infer<TSchema> : TPayload;

        if (this.schema) {
          const result = this.schema.safeParse(payload);
          if (!result.success) {
            throw new ActionError({
              code: "VALIDATION_ERROR",
              message: "Invalid input provided.",
            });
          }
          validatedInput = result.data as TSchema extends ZodObject<any> ? z.infer<TSchema> : TPayload;
        } else {
          validatedInput = payload as TSchema extends ZodObject<any> ? z.infer<TSchema> : TPayload;
        }

        const data = await handler(validatedInput, context);

        return { data, error: null };
      } catch (error: unknown) {
        if (isNextJsInternalError(error)) {
          throw error;
        }

        if (error instanceof ActionError) {
          return {
            data: null,
            error: { code: error.code, message: error.message },
          };
        }

        console.error("Unhandled action error:", error);
        return {
          data: null,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "An unexpected error occurred.",
          },
        };
      }
    };
  }
}

/**
 * @description The initial action client, with an undefined schema and an empty context.
 */
export const actionClient = new ActionBuilder<undefined, {}>({
  schema: undefined,
  middleware: () => Promise.resolve({}),
});
