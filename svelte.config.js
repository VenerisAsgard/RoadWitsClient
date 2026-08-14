import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Полностью статическая SPA-сборка — Tauri раздаёт её как обычные файлы,
    // серверная часть SvelteKit (SSR/эндпоинты) тут не участвует и не нужна.
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "index.html", // SPA-фолбэк: один HTML на все маршруты
      precompress: false,
      strict: false,
    }),
  },
};

export default config;
