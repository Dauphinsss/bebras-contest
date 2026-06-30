import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:4321",
    headless: true,
  },
  webServer: [
    {
      command: "cd backend && bun run dev",
      url: "http://localhost:3000/health",
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: "cd frontend && bun run dev",
      url: "http://localhost:4321",
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
});
