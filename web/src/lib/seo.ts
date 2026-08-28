/**
 * Site-wide SEO constants. One source of truth for the canonical origin,
 * the site/author identity, and the default social-share image.
 */
export const SITE_URL = 'https://holdenmybeer.me';
export const SITE_NAME = 'HoldenMyBeer';
export const SITE_TAGLINE = 'A personal site — album ratings and a seven-year listening record.';
export const AUTHOR_NAME = 'Holden Kittelberger';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
export const LOCALE = 'en_US';

/** Absolute canonical URL for a route path (always apex host, no query). */
export const canonical = (pathname: string): string =>
	pathname === '/' ? `${SITE_URL}/` : SITE_URL + pathname.replace(/\/$/, '');
