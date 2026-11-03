import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:3011", trace: "retain-on-failure" },
  webServer: {
    command: "PORT=3011 HOST=127.0.0.1 bun src/index.ts",
    url: "http://127.0.0.1:3011/health",
    reuseExistingServer: false,
  },
});
