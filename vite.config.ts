import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The data changes only when the pipeline reruns, so the site builds as a static SPA with no server.
// GitHub Pages serves the site under /krisplus-map/, so the deploy workflow sets BASE_PATH. Local runs use the root.
export default defineConfig({
	base: process.env.BASE_PATH ?? "/",
	plugins: [tanstackStart({ spa: { enabled: true, prerender: { outputPath: "/index.html" } } }), viteReact()],
});
