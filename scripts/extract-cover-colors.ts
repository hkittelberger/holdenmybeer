/**
 * BP4 — derive each album's two-colour accent pair from its real Spotify
 * cover, for the gradient sleeve / row rule / popup tint.
 *
 * `accent_1` = darkest prominent swatch (top of the gradient, the 3px row
 * rule), `accent_2` = a contrasting prominent swatch (bottom of the
 * gradient). Falls back to the design's copper/teal pair if a cover has
 * too little colour to read.
 *
 * Resumable: processes `albums` with a `cover_url` and `colors_refreshed
 * IS NULL`. Idempotent. No Spotify API — pulls the image straight from
 * i.scdn.co.
 *
 *   node --experimental-strip-types --env-file=.env scripts/extract-cover-colors.ts [--limit N] [--force]
 */

import pg from 'pg';
import { Vibrant } from 'node-vibrant/node';

const { Pool } = pg;

const FALLBACK: [string, string] = ['#254742', '#7E5A2E']; // design c1/c2

type RGB = [number, number, number];
const toRgb = (hex: string): RGB => {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = ([r, g, b]: RGB): string =>
	'#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const lum = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const sat = (c: RGB): number => {
	const mx = Math.max(...c), mn = Math.min(...c);
	return mx === 0 ? 0 : (mx - mn) / mx;
};
/** Nudge a colour toward a target luminance band so gradients stay in the
 *  muted register the design uses (both stops mid-dark, harmonious). */
const clampLum = (c: RGB, lo: number, hi: number): RGB => {
	const L = lum(c);
	if (L >= lo && L <= hi) return c;
	const k = (L < lo ? lo : hi) / (L || 1);
	return [c[0] * k, c[1] * k, c[2] * k];
};

async function accentPair(url: string): Promise<[string, string]> {
	const p = await Vibrant.from(url).getPalette();
	const all = Object.entries(p)
		.filter(([, s]) => !!s)
		.map(([name, s]) => ({ name, rgb: toRgb(s!.hex), pop: s!.population }))
		.filter((s) => s.pop > 0);
	if (all.length < 2) return FALLBACK;

	// drop washed-out and near-black swatches; rank the rest by "presence"
	// (population × a little saturation bonus).
	const usable = all
		.filter((s) => lum(s.rgb) > 14 && lum(s.rgb) < 205)
		.sort((a, b) => b.pop * (0.6 + sat(b.rgb)) - a.pop * (0.6 + sat(a.rgb)));
	const pool = usable.length >= 2 ? usable : all;

	const ranked = [...pool].sort((a, b) => lum(a.rgb) - lum(b.rgb));
	let c1 = ranked[0].rgb;
	let c2 =
		pool.find((s) => Math.abs(lum(s.rgb) - lum(c1)) > 18 && toHex(s.rgb) !== toHex(c1))?.rgb ??
		ranked[ranked.length - 1].rgb;

	// keep both stops in the design's muted band
	c1 = clampLum(c1, 26, 105);
	c2 = clampLum(c2, 55, 150);
	return [toHex(c1), toHex(c2)];
}

async function main(): Promise<number> {
	const args = process.argv.slice(2);
	const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : null;
	const force = args.includes('--force');
	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error('DATABASE_URL not set');
		return 1;
	}

	const pool = new Pool({ connectionString: url, max: 4 });
	try {
		const { rows } = await pool.query<{ id: string; name: string; cover_url: string }>(
			`select id, name, cover_url from albums
			 where cover_url is not null ${force ? '' : 'and colors_refreshed is null'}
			 order by id ${limit ? `limit ${limit}` : ''}`
		);
		console.log(`${rows.length} album cover(s) to process`);

		let ok = 0,
			fell = 0,
			failed = 0;
		for (const a of rows) {
			try {
				const [c1, c2] = await accentPair(a.cover_url);
				if (c1 === FALLBACK[0] && c2 === FALLBACK[1]) fell++;
				await pool.query(
					`update albums set accent_1 = $2, accent_2 = $3, colors_refreshed = now() where id = $1`,
					[a.id, c1, c2]
				);
				ok++;
				if (ok % 25 === 0) process.stdout.write(`\r  ${ok}/${rows.length}`);
			} catch (err) {
				failed++;
				console.error(`\n  ${a.name}: ${(err as Error).message}`);
			}
		}
		process.stdout.write('\n');
		console.log(`done: ${ok} set (${fell} used fallback), ${failed} failed`);

		const sample = await pool.query(
			`select name, accent_1, accent_2 from albums where accent_1 is not null order by random() limit 8`
		);
		console.table(sample.rows);
		return 0;
	} finally {
		await pool.end();
	}
}

main().then((c) => process.exit(c));
