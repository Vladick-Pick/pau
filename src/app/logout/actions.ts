"use server";

import { redirect } from "next/navigation";

import { clearSessionCookie } from "@/lib/auth/server";

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
