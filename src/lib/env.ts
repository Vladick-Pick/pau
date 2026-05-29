export function getOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getRequiredEnv(name: string): string {
  const value = getOptionalEnv(name);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

export function getCsvEnv(name: string): string[] {
  return (getOptionalEnv(name) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getOptionalEnv("DATABASE_URL"));
}

export function getSessionSecret(): string {
  const secret = getOptionalEnv("PAU_SESSION_SECRET");
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("PAU_SESSION_SECRET is required in production");
  }

  return "development-session-secret";
}
