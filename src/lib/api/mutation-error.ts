import { Prisma } from "@prisma/client";

import { NotFoundError } from "@/lib/pau/active-store";

/**
 * Map a thrown error from a mutation handler to a safe Response.
 *
 * - `NotFoundError` and Prisma "record not found" (P2025) → 404 with a generic message.
 * - Everything else → 500 with a generic message.
 *
 * Never echoes raw Prisma error text to the client (avoids leaking schema/query internals).
 */
export function mutationErrorResponse(error: unknown): Response {
  if (
    error instanceof NotFoundError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025")
  ) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ error: "Internal server error" }, { status: 500 });
}
