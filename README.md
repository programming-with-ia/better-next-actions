# Next.js Server Actions Client

A typesafe and structured way to build Next.js Server Actions with middleware and validation. This library provides a tRPC-like experience for the Next.js Action paradigm.

## Core Concepts

This library empowers you to build robust Next.js Server Actions by providing:

-   **End-to-end Type Safety:** Automatically infer types from your Zod schemas and middleware, ensuring your actions are typesafe from client to server.
-   **Reusable Middleware:** Define and compose middleware to handle common tasks like authentication, authorization, and logging.
-   **Zod Schema Validation:** Validate action payloads with Zod schemas, providing clear and concise error messages.
-   **Centralized Action Clients:** Create different action clients (e.g., for public, protected, or admin-only actions) in a single, organized file.

## Installation

```bash
npm install better-next-actions
```

## Setup: The Action Client

It's recommended to create a single file to define all your action clients and middleware. This keeps your code organized and easy to maintain.

Create a file at `/lib/action-client.ts`:

```typescript
// /lib/action-client.ts
import "server-only";
import { createActionClient, ActionError } from "better-next-actions";

// This is your base, unauthenticated action client.
export const publicActionClient = createActionClient();

// --- Example: Middleware for authentication ---
const authMiddleware = async () => {
  // In a real app, you'd get the user session here.
  const user = { id: "user_123" }; // Mock user
  if (!user) {
    throw new ActionError({ code: "UNAUTHORIZED", message: "Not logged in." });
  }
  return { user };
};

// Create a new client that uses the auth middleware.
export const protectedActionClient = createActionClient().use(authMiddleware);

// --- Example: Middleware for admin checks ---
const adminMiddleware = async (ctx: { user: { id: string } }) => {
  // This middleware runs *after* authMiddleware, so `ctx.user` is available.
  if (ctx.user.id !== "user_123") { // Mock admin check
      throw new ActionError({ code: "FORBIDDEN", message: "You are not an admin." });
  }
  return { isAdmin: true };
}

// Create a new client that stacks both middlewares.
export const adminActionClient = protectedActionClient.use(adminMiddleware);
```

Now you can import these clients into your server actions.

## Usage

### Using Middleware

Create your actions by importing your clients and defining the action handler.

```typescript
// app/actions.ts
"use server";

import { z } from "zod";
import { protectedActionClient, adminActionClient } from "@/lib/action-client";

// --- Protected Action ---
export const getMyProfile = protectedActionClient.action(
  async (payload, ctx) => {
    // `ctx` is typesafe: { user: { id: string } }
    console.log("Fetching profile for user:", ctx.user.id);
    return { id: ctx.user.id, name: "Test User" };
  }
);

// --- Admin Action with Zod Validation ---
const updateSystemSettingsSchema = z.object({
  maintenanceMode: z.boolean(),
});

export const setMaintenanceMode = adminActionClient
  .input(updateSystemSettingsSchema)
  .action(async (data, ctx) => {
    // `data` is typesafe: { maintenanceMode: boolean }
    // `ctx` is typesafe: { user: { id: string }, isAdmin: true }
    console.log(
      `Admin ${ctx.user.id} is setting maintenance mode to ${data.maintenanceMode}`
    );
    return { success: true, ...data };
  });
```

### Reusable Schemas

You can create a client with a pre-defined schema that can be reused across multiple actions.

```typescript
// /lib/action-client.ts

// ... (previous code)
import { z } from "zod";

export const withIdClient = publicActionClient.input(z.object({ id: z.string().length(6) }));

// app/actions.ts
import { withIdClient } from "@/lib/action-client";

export const getPostById = withIdClient.action(async (data, ctx) => {
  // `data` is typesafe: { id: string }
  console.log("Fetching post with ID:", data.id);
  return { id: data.id, title: "Post Title" };
});

export const deletePostById = withIdClient.action(async (data, ctx) => {
  // `data` is typesafe: { id: string }
  console.log("Deleting post with ID:", data.id);
  return { success: true, deletedId: data.id };
});
```

### Error Handling

When an action fails, it returns an `error` object. You can check for this object on the client to handle errors gracefully.

```typescript
// app/page.tsx
"use client";

import { setMaintenanceMode } from "./actions";

export default function HomePage() {
  const handleAction = async () => {
    const result = await setMaintenanceMode({ maintenanceMode: true });
    if (result.error) {
      alert(`Error: ${result.error.message}`);
      return;
    }
    // Handle success
    console.log(result.data);
  };

  return <button onClick={handleAction}>Set Maintenance Mode</button>;
}
```

## Optional: `react-query` Hooks

This package does not include `react-query` hooks by default to keep the core library dependency-free. If you wish to use `react-query` with your server actions, you can manually copy the hook files from the `evoo/` directory into your project.

**To add the hooks:**

1.  Create a new directory in your project, for example, `/lib/hooks`.
2.  Copy the contents of `evoo/use-action-mutation.ts` and `evoo/use-query-action.ts` into this new directory.
3.  You can now import and use these hooks in your client components.

**Note:** You will need to have `react-query` installed in your project to use these hooks.
