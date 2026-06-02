// Build configuration — Vercel deployment
// cloudflare: false disables @cloudflare/vite-plugin so Vinxi uses the Vercel/Node preset instead.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cloudflare: false as any,
  tanstackStart: {
    server: { entry: "server" },
  },
});
