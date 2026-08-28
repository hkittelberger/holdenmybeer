import { SITE_URL } from '$lib/seo';
import type { RequestHandler } from './$types';

// Public, indexable routes only. Admin is excluded (also blocked in robots).
const ROUTES: { path: string; changefreq: string; priority: string }[] = [
	{ path: '/', changefreq: 'monthly', priority: '1.0' },
	{ path: '/music', changefreq: 'weekly', priority: '0.9' },
	{ path: '/music/stats', changefreq: 'daily', priority: '0.8' },
	{ path: '/courses', changefreq: 'yearly', priority: '0.3' },
	{ path: '/design', changefreq: 'yearly', priority: '0.3' },
	{ path: '/photos', changefreq: 'yearly', priority: '0.3' }
];

export const GET: RequestHandler = () => {
	const today = new Date().toISOString().slice(0, 10);
	const body =
		`<?xml version="1.0" encoding="UTF-8"?>\n` +
		`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
		ROUTES.map(
			(r) =>
				`  <url>\n` +
				`    <loc>${SITE_URL}${r.path}</loc>\n` +
				`    <lastmod>${today}</lastmod>\n` +
				`    <changefreq>${r.changefreq}</changefreq>\n` +
				`    <priority>${r.priority}</priority>\n` +
				`  </url>`
		).join('\n') +
		`\n</urlset>\n`;

	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
