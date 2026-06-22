import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    env: {
      DATABASE_URL:
        "postgresql://pau:pau@localhost:54329/pau?schema=public",
    },
    // DB integration tests hit a shared Postgres and can be slow under load;
    // give them headroom so they don't hit the 5s default when the machine is
    // busy. Parallel forks are kept so unit-test module mocks stay isolated.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
