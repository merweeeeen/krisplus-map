import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The data changes only when the pipeline reruns, so the site builds as a static SPA with no server.
export default defineConfig({
	plugins: [tanstackStart({ spa: { enabled: true, prerender: { outputPath: "/index.html" } } }), viteReact()],
});
