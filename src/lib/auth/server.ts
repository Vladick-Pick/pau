import { cookies } from "next/headers";

import {
  createSessionToken,
  type Session,
  type SessionRole,
  verifySessionToken,
} from "@/lib/auth/session";
import { getSessionSecret } from "@/lib/env";

export { resolvePasswordRole } from "./credentials";

export const sessionCookieName = "pau_session";

const roleRank: Record<SessionRole, number> = {
  VIEWER: 1,
  MANAGER: 2,
  ADMIN: 3,
};

export async function getCurrentSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(sessionCookieName)?.value, {
    secret: getSessionSecret(),
  });
}

export function canAccess(
  session: Session | null,
  minimumRole: SessionRole
): boolean {
  return Boolean(session && roleRank[session.role] >= roleRank[minimumRole]);
}

export async function setSessionCookie(input: {
  role: SessionRole;
  userName: string;
}) {
  const token = await createSessionToken(input, {
    secret: getSessionSecret(),
    maxAgeSeconds: 60 * 60 * 8,
  });
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}
