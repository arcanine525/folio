import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vitest configuration shared across all Folio unit tests.
// - jsdom: DOM env for component/hook tests
// - @vitejs/plugin-react: JSX transform for .tsx
// - @ alias mirrors tsconfig `paths` so `@/lib/…` resolves identically
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    clearMocks: true,
    restoreMocks: true,
  },
});
