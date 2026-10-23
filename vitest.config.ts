import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["api/src/**/*.test.ts", "web/**/*.test.ts", "web/**/*.test.tsx"],
  },
});
