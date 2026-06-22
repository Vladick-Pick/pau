import { syncAllClubs } from "../src/lib/profile/sync";

async function main() {
  console.log("[sync-profiles] Starting profile sync...");

  const results = await syncAllClubs();

  let totalSynced = 0;
  let totalFailed = 0;

  for (const r of results) {
    console.log(
      `[sync-profiles] Club ${r.clubId}: synced=${r.synced}, failed=${r.failed}`
    );
    totalSynced += r.synced;
    totalFailed += r.failed;
  }

  console.log(
    `[sync-profiles] Done. Total synced=${totalSynced}, total failed=${totalFailed}`
  );

  if (results.length === 0) {
    console.error("[sync-profiles] No clubs found — exiting with error.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[sync-profiles] Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
