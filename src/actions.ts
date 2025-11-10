// app/actions.ts
"use server";

import { z } from "zod";
import { actionClient } from "./action-client";
import { ActionError } from "./action-error";
import { notFound, redirect } from "next/navigation";
import { cacheLife, cacheTag, revalidatePath, revalidateTag } from "next/cache";

// --- Example 1: Simple action (manually typed) ---
// NOTE: The handler now takes `(payload, ctx)`
// `ctx` will be `{}` here, but it's always present.
export const deleteItem = actionClient.action(
  async (payload: { id: string }, ctx) => {
    // `ctx` is `{}`
    if (!payload.id) {
      throw new ActionError("Item ID is required");
    }
    console.log("Deleting item:", payload.id);
    return { success: true, deletedId: payload.id };
  }
);

// --- Example 2: Action with Zod validation ---
// NOTE: The handler is now `(data, ctx)`
const createPostSchema = z.object({
  title: z.string().min(3),
});

export const createPost = actionClient
  .input(createPostSchema)
  .action(async (data, ctx) => {
    // `data` is typesafe: { title: string }
    // `ctx` is `{}`
    console.log("Creating post with title:", data.title);
    return { id: "123", ...data };
  });

// --- Example 3: REUSABLE Middleware Clients ---

// 3a. Define reusable middleware
const authMiddleware = async (ctx: {}) => {
  // `ctx` is `{}` from the base client
  // const { userId } = auth(); // Real auth logic
  const userId = "user_abc123"; // Mock user
  console.log("authMiddleware");

  if (!userId) {
    throw new ActionError({ code: "UNAUTHORIZED", message: "Not logged in." });
  }
  return { userId };
};

const adminMiddleware = async (ctx: { userId: string }) => {
  // `ctx` is `{ userId: string }` from the authMiddleware
  const { userId } = ctx;
  console.log("adminMiddleware");

  if (userId !== "admin_user") {
    // Mock admin check
    // revalidatePath("/admin");
    // revalidateTag("admin", "days");
    // notFound();
    redirect("/admin");
    // cacheTag("admin", "days");
    // cacheLife("days");
    throw new ActionError({ code: "FORBIDDEN", message: "Not an admin." });
  }
  return { isAdmin: true };
};

// 3b. Create your reusable clients
const protectedActionClient = actionClient.use(authMiddleware);
const adminProtectedActionClient = protectedActionClient.use(adminMiddleware);

// --- Example 4: Using the reusable clients ---

// Use the protected client
export const getMyProfile = protectedActionClient.action(
  async (payload: Record<string, string>, ctx) => {
    // `payload` is `any`
    // `ctx` is typesafe: { userId: string }

    console.log("Fetching profile for user:", ctx.userId);
    return { id: ctx.userId, name: "Test User" };
  }
);

// Use the admin client with input validation
const updateSystemSettingsSchema = z.object({
  maintenanceMode: z.boolean(),
});

export const setMaintenanceMode = adminProtectedActionClient
  .input(updateSystemSettingsSchema)
  .action(async (data, ctx) => {
    // `data` is typesafe: { maintenanceMode: boolean }
    // `ctx` is typesafe: { userId: string; isAdmin: true }

    console.log(
      `Admin ${ctx.userId} is setting maintenance mode to ${data.maintenanceMode}`
    );
    return { success: true, ...data };
  });
