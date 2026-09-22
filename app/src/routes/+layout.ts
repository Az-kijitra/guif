// The Tauri window has no backend HTTP server to render against, so the
// SvelteKit app runs purely client-side (SPA mode via adapter-static's
// `fallback`, see svelte.config.js).
export const ssr = false;
