import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { createUser, listUsers, updateUser } from "@/lib/pau/dashboard";

const roleSchema = z.enum(["ADMIN", "MANAGER", "VIEWER"]);

const createUserSchema = z.object({
  login: z.string().trim().min(2),
  displayName: z.string().trim().min(1),
  role: roleSchema,
  password: z.string().min(6),
});

const updateUserSchema = z.object({
  id: z.string().trim().min(1),
  displayName: z.string().trim().min(1).optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export async function GET() {
  const auth = await requireApiRole("ADMIN");
  if (auth.response) {
    return auth.response;
  }

  try {
    return Response.json({ users: await listUsers() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Users list failed" },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireApiRole("ADMIN");
  if (auth.response) {
    return auth.response;
  }

  try {
    const input = createUserSchema.parse(await request.json());
    return Response.json({ user: await createUser(input) }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "User creation failed" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiRole("ADMIN");
  if (auth.response) {
    return auth.response;
  }

  try {
    const input = updateUserSchema.parse(await request.json());
    return Response.json({ user: await updateUser(input) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "User update failed" },
      { status: 400 }
    );
  }
}
