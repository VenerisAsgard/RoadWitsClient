import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

// см. https://v2.tauri.app/start/frontend/sveltekit/ — рекомендованная
// связка Tauri + SvelteKit: фиксированный порт для dev-сервера (его же
// ждёт beforeDevCommand в src-tauri/tauri.conf.json) и игнор HMR-сообщений
// из самого Tauri, чтобы вебвью не пытался их обработать как обычные.
export default defineConfig(async () => ({
  plugins: [sveltekit()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
