/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { z, ZodObject } from "zod/v4";
import { ActionError } from "./action-error";

// ## 1. Result Types (No change)
export type ActionErrorProps = { code?: string; message: string };
export type ActionSuccess<TData> = { data: TData; error: null };
export type ActionFailure = { data: null; error: ActionErrorProps };

/**
 * Checks if an error is an internal Next.js error (e.g., redirect, notFound).
 * These errors should be re-thrown to be handled by the Next.js framework.
 * @param error - The error to check
 * @returns true if the error is a Next.js internal error, false otherwise
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
 * The standard return type for all actions created with the client.
 */
export type ActionResult<TData> = ActionSuccess<TData> | ActionFailure;

// ## 2. Conditional Helper Types (New)
// These types are used to correctly infer input/output
// based on whether a schema is present.

/**
 * If Schema exists, HandlerData is z.infer<Schema>.
 * If Schema does NOT exist, HandlerData is TPayload (inferred from handler).
 */
type HandlerData<
  TSchema extends ZodObject<any> | undefined,
  TPayload
> = TSchema extends ZodObject<any> ? z.infer<TSchema> : TPayload;

/**
 * If Schema exists, ActionPayload is z.input<Schema>.
 * If Schema does NOT exist, ActionPayload is TPayload (inferred from handler).
 */
type ActionPayload<
  TSchema extends ZodObject<any> | undefined,
  TPayload
> = TSchema extends ZodObject<any> ? z.input<TSchema> : TPayload;

// ## 3. The Action Builder (Refactored)

class ActionBuilder<
  // TSchema: The Zod schema, or `undefined` if not set.
  TSchema extends ZodObject<any> | undefined,
  // TContext: The combined type of all middleware.
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
   * Adds Zod object validation.
   * Returns a new, configured ActionBuilder instance.
   */
  public input<Z extends ZodObject<any>>(
    schema: Z
  ): ActionBuilder<Z, TContext> {
    // Returns a new builder instance with the schema
    return new ActionBuilder({ ...this, schema });
  }

  /**
   * Adds stacking middleware.
   * Returns a new, configured ActionBuilder instance.
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
   * Creates the final, typesafe server action.
   */
  public action<
    TOutput,
    // TPayload: Inferred from the *first argument* of the handler function.
    // This is ONLY used if no schema is present.
    TPayload
  >(
    handler: (
      // `data` is z.infer<Schema> if schema exists, otherwise TPayload
      data: HandlerData<TSchema, TPayload>,
      ctx: TContext
    ) => Promise<TOutput>
  ): (
    // `payload` is z.input<Schema> if schema exists, otherwise TPayload
    payload: ActionPayload<TSchema, TPayload>
  ) => Promise<ActionResult<TOutput>> {
    return async (
      payload: ActionPayload<TSchema, TPayload>
    ): Promise<ActionResult<TOutput>> => {
      try {
        // 1. Run the entire stacked middleware chain
        const context = await this.middleware();

        // 2. Validate input
        let validatedInput: HandlerData<TSchema, TPayload>;

        if (this.schema) {
          // Schema exists: run validation
          const result = this.schema.safeParse(payload);
          if (!result.success) {
            throw new ActionError({
              code: "VALIDATION_ERROR",
              message: "Invalid input provided.",
            });
          }
          // `validatedInput` is the parsed data (z.infer)
          validatedInput = result.data as HandlerData<TSchema, TPayload>;
        } else {
          // No schema: `validatedInput` is just the raw payload
          validatedInput = payload as HandlerData<TSchema, TPayload>;
        }

        // 3. Run the user's action handler
        const data = await handler(validatedInput, context);

        // 4. Return successful data
        return { data, error: null };
      } catch (error: unknown) {
        // 5. Handle all errors

        // --- THIS IS THE FIX ---
        // First, check for internal Next.js errors and re-throw them
        if (isNextJsInternalError(error)) {
          throw error;
        }
        // --- END FIX ---

        // Next, check for our custom ActionError
        if (error instanceof ActionError) {
          return {
            data: null,
            error: { code: error.code, message: error.message },
          };
        }

        // Finally, handle any unexpected errors
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

// ## 4. Export the initial Client
// We start with `undefined` schema and an empty context `{}`.
export const actionClient = new ActionBuilder<undefined, {}>({
  schema: undefined,
  middleware: () => Promise.resolve({}),
});

// (You would also export your protected/admin clients here)
// e.g.,
// export const protectedActionClient = actionClient.use(authMiddleware);
