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
  },
});
