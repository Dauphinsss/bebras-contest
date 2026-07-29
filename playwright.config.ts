import { defineConfig } from "@playwright/test";

const backendEnv = {
  ...process.env,
  DATABASE_URL: "file:./test.db",
};

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
      env: backendEnv,
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: "cd frontend && bun run dev",
      url: "http://localhost:4321",
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
