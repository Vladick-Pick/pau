import { getOptionalEnv } from "../env";
import type { SessionRole } from "./session";

export type CredentialSession = {
  role: SessionRole;
  userName: string;
};

type ResolveSessionCredentialsInput = {
  login: string | null;
  password: string | null;
  role: string | null;
};

type FindActiveUserByCredentials = (input: {
  login: string;
  password: string;
}) => Promise<CredentialSession | null>;

type ResolveSessionCredentialsOptions = {
  findActiveUserByCredentials?: FindActiveUserByCredentials;
};

export async function resolveSessionCredentials(
  input: ResolveSessionCredentialsInput,
  options: ResolveSessionCredentialsOptions = {}
): Promise<CredentialSession | null> {
  const login = input.login?.trim() ?? "";
  const password = input.password ?? "";
  if (!password) {
    return null;
  }

  if (login) {
    return options.findActiveUserByCredentials
      ? options.findActiveUserByCredentials({ login, password })
      : null;
  }

  return resolvePasswordRole(input.role, password);
}

export function resolvePasswordRole(
  role: string | null,
  password: string | null
): CredentialSession | null {
  const parsedRole = parseRole(role);
  if (!parsedRole || !password) {
    return null;
  }

  const expectedPassword = getPasswordForRole(parsedRole);
  if (password !== expectedPassword) {
    return null;
  }

  return {
    role: parsedRole,
    userName: roleName(parsedRole),
  };
}

function parseRole(role: string | null): SessionRole | null {
  if (role === "ADMIN" || role === "MANAGER" || role === "VIEWER") {
    return role;
  }

  return null;
}

function getPasswordForRole(role: SessionRole): string {
  const envName = `PAU_${role}_PASSWORD`;
  const configured = getOptionalEnv(envName);
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${envName} is required in production`);
  }

  return role.toLowerCase();
}

function roleName(role: SessionRole): string {
  if (role === "ADMIN") {
    return "Администратор";
  }

  if (role === "MANAGER") {
    return "Менеджер";
  }

  return "Наблюдатель";
}
