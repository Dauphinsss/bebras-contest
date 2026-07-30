import { defineConfig } from "@playwright/test";

const backendUrl = "http://localhost:3100";
const frontendUrl = "http://localhost:4421";
const backendEnv = {
  ...process.env,
  DATABASE_URL: "file:./test.db",
  FRONTEND_ORIGIN: frontendUrl,
  PORT: "3100",
};
const frontendEnv = {
  ...process.env,
  PUBLIC_API_BASE_URL: backendUrl,
};

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: frontendUrl,
    headless: true,
  },
  webServer: [
    {
      command: "cd backend && bun run dev",
      url: `${backendUrl}/health`,
      env: backendEnv,
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: "cd frontend && bun run dev -- --port 4421",
      url: frontendUrl,
      env: frontendEnv,
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
