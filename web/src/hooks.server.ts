import type { Handle } from '@sveltejs/kit';

/**
 * Edge middleware:
 *  1. www → apex 301 (both hostnames are Cloudflare custom domains; the
 *     apex is canonical). Trailing-slash normalisation is handled by
 *     SvelteKit's `trailingSlash: 'never'`.
 *  2. Security headers on every response. CSP is configured separately in
 *     vite.config.ts (SvelteKit's `csp` — it needs to inject per-render
 *     nonces, which a header set here can't do).
 *
 * gzip/brotli: Cloudflare compresses compressible responses at the edge
 * automatically based on Accept-Encoding, for both Worker output (HTML,
 * JSON from the API routes) and static assets — nothing to enable here, and
 * setting Content-Encoding manually would double-encode. We just make sure
 * responses stay a compressible content-type and carry sane Cache-Control.
 */

const SECURITY_HEADERS: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'X-Frame-Options': 'DENY',
	'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
	'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
	'X-DNS-Prefetch-Control': 'off'
};

export const handle: Handle = async ({ event, resolve }) => {
	const { url } = event;

	// www → apex
	if (url.hostname.startsWith('www.')) {
		const target = new URL(url);
		target.hostname = url.hostname.slice(4);
		return new Response(null, {
			status: 301,
			headers: { location: target.toString() }
		});
	}

	const response = await resolve(event);

	for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(k, v);
	}

	// Long-cache immutable build assets; everything else negotiates normally.
	if (url.pathname.startsWith('/_app/immutable/')) {
		response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
	}

	return response;
};
