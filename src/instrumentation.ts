export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startBitrixAutoSyncScheduler } = await import("./lib/pau/dashboard");
  startBitrixAutoSyncScheduler();
}
