import { defineWorkspace } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

const alias = { "@": resolve(__dirname, "./src") };

export default defineWorkspace([
  {
    // React components: jsdom + Testing Library.
    plugins: [react()],
    resolve: { alias },
    test: {
      name: "web",
      environment: "jsdom",
      globals: true,
      include: ["tests/*.test.{ts,tsx}"],
      setupFiles: ["./tests/setup.ts"],
      css: false,
    },
  },
  {
    // Server code (route handlers, services): plain Node.
    resolve: { alias },
    test: {
      name: "server",
      environment: "node",
      globals: true,
      include: ["tests/server/**/*.test.ts"],
      setupFiles: ["./tests/server/setup.ts"],
    },
  },
]);
