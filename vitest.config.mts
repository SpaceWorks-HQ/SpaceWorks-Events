import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
      "server-only": `${rootDir}tests/helpers/server-only.ts`,
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Hermetic base URL, whatever a developer's shell or .env sets.
    // The sign-in protections are off unless a test turns one on: tests sign in
    // fresh users without devices or authenticators, and never call the breach API.
    env: { NEXT_PUBLIC_BASE_URL: "http://localhost:3000", STAFF_MFA_REQUIRED: "false", LOGIN_NEW_DEVICE_CHECK: "false", PWNED_PASSWORDS_CHECK: "false" },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "app/actions/**/*.ts"],
      exclude: ["**/*.client.ts"],
    },
  },
});
