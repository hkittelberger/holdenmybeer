import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter(),

			// Content-Security-Policy. `auto` = per-render nonces for SSR pages
			// (this site is fully SSR on Workers), hashes for anything prerendered.
			// SvelteKit injects the nonce/hash into its own <script>/<style>; the
			// host allowlists below cover Google Fonts and Spotify cover art.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
					'font-src': ['self', 'data:', 'https://fonts.gstatic.com'],
					'img-src': ['self', 'data:', 'https://*.scdn.co', 'https://*.spotifycdn.com'],
					'connect-src': ['self'],
					'frame-ancestors': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'object-src': ['none'],
					'upgrade-insecure-requests': true
				}
			}
		})
	]
});
