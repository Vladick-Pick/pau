import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

export const sessionRoleSchema = z.enum(["ADMIN", "MANAGER", "VIEWER"]);

export type SessionRole = z.infer<typeof sessionRoleSchema>;

export type Session = {
  role: SessionRole;
  userName: string;
  expiresAt: Date;
};

type CreateSessionInput = {
  role: SessionRole;
  userName: string;
};

type SessionOptions = {
  secret: string;
  now?: Date;
  maxAgeSeconds?: number;
};

const payloadSchema = z.object({
  role: sessionRoleSchema,
  userName: z.string().min(1),
  exp: z.number().int().positive(),
  v: z.literal(1),
});

export async function createSessionToken(
  input: CreateSessionInput,
  options: SessionOptions
): Promise<string> {
  const now = options.now ?? new Date();
  const maxAgeSeconds = options.maxAgeSeconds ?? 60 * 60 * 8;
  const payload = {
    role: input.role,
    userName: input.userName,
    exp: Math.floor(now.getTime() / 1000) + maxAgeSeconds,
    v: 1 as const,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, options.secret);

  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
  options: Pick<SessionOptions, "secret" | "now">
): Promise<Session | null> {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    return null;
  }

  if (!isSameSignature(signature, sign(encodedPayload, options.secret))) {
    return null;
  }

  const parsed = payloadSchema.safeParse(
    JSON.parse(base64UrlDecode(encodedPayload))
  );
  if (!parsed.success) {
    return null;
  }

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (parsed.data.exp <= nowSeconds) {
    return null;
  }

  return {
    role: parsed.data.role,
    userName: parsed.data.userName,
    expiresAt: new Date(parsed.data.exp * 1000),
  };
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function isSameSignature(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}
