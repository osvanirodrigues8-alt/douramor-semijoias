// Build configuration — Vercel deployment
// cloudflare: false disables @cloudflare/vite-plugin so Vinxi uses the Vercel/Node preset instead.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cfg: any = { nitro: false, tanstackStart: { server: { entry: "server" } } };
export default defineConfig(cfg);
