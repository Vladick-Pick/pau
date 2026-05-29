export function shouldUseDemoWorkspaceFallback(
  nodeEnv = process.env.NODE_ENV
): boolean {
  return nodeEnv !== "production";
}
