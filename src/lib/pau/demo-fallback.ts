export function shouldUseDemoWorkspaceFallback(
  nodeEnv = process.env.NODE_ENV,
  databaseConfigured = Boolean(process.env.DATABASE_URL?.trim())
): boolean {
  return nodeEnv !== "production" && !databaseConfigured;
}
