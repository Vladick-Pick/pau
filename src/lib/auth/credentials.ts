import type { SessionRole } from "./session";

export type CredentialSession = {
  role: SessionRole;
  userName: string;
};

type ResolveSessionCredentialsInput = {
  login: string | null;
  password: string | null;
  role?: string | null;
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
  if (!login || !password) {
    return null;
  }

  return options.findActiveUserByCredentials
    ? await options.findActiveUserByCredentials({ login, password })
    : null;
}
