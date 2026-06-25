"use server";

import { redirect } from "next/navigation";

import { resolveSessionCredentials } from "@/lib/auth/credentials";
import { setSessionCookie } from "@/lib/auth/server";
import { findActiveUserByCredentials } from "@/lib/pau/dashboard";

export async function loginAction(formData: FormData) {
  const login = String(formData.get("login") ?? "");
  const password = String(formData.get("password") ?? "");
  const session = await resolveSessionCredentials(
    { login, password },
    { findActiveUserByCredentials }
  );

  if (!session) {
    redirect("/login?error=invalid");
  }

  await setSessionCookie(session);
  redirect("/");
}
