// Client-side two-colour accent pair from an image — the artist-photo
// counterpart to the album `accent_1` / `accent_2` that
// scripts/extract-cover-colors.ts precomputes for covers. Same semantics:
// [0] = a dark prominent tone (the gradient's base), [1] = a contrasting,
// more saturated tone (the highlight). Spotify's image CDN (i.scdn.co) sends
// `Access-Control-Allow-Origin: *`, so the canvas isn't tainted.

const cache = new Map<string, Promise<[string, string] | null>>();

type Px = { r: number; g: number; b: number; h: number; s: number; l: number };

function hsl(r: number, g: number, b: number): [number, number, number] {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	h *= 60;
	return [h, s, l];
}

const hex = (p: { r: number; g: number; b: number }) =>
	'#' + [p.r, p.g, p.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function mean(px: Px[]) {
	const n = Math.max(1, px.length);
	return {
		r: px.reduce((a, p) => a + p.r, 0) / n,
		g: px.reduce((a, p) => a + p.g, 0) / n,
		b: px.reduce((a, p) => a + p.b, 0) / n
	};
}

function pick(data: Uint8ClampedArray): [string, string] {
	const px: Px[] = [];
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] < 128) continue;
		const [h, s, l] = hsl(data[i], data[i + 1], data[i + 2]);
		px.push({ r: data[i], g: data[i + 1], b: data[i + 2], h, s, l });
	}
	// Bucket by hue (12 × 30°); weight by saturation so a photo's coloured
	// light wins over its grey background. Near-greys get their own bucket.
	const buckets = new Map<number, Px[]>();
	for (const p of px) {
		const k = p.s < 0.14 || p.l < 0.08 || p.l > 0.94 ? -1 : Math.floor(p.h / 30);
		(buckets.get(k) ?? buckets.set(k, []).get(k)!).push(p);
	}
	const score = (k: number, ps: Px[]) =>
		k === -1 ? ps.length * 0.25 : ps.reduce((a, p) => a + 0.35 + p.s, 0);
	const ranked = [...buckets.entries()].sort((a, b) => score(b[0], b[1]) - score(a[0], a[1]));

	const dominant = ranked[0]?.[1] ?? px;
	// base: the darker half of the dominant bucket
	const darkHalf = [...dominant].sort((a, b) => a.l - b.l).slice(0, Math.ceil(dominant.length / 2));
	const base = mean(darkHalf);
	// highlight: the most saturated, mid-light pixels of the strongest
	// *coloured* bucket (a grey-dominant photo still gets its colour accent)
	const colored = ranked.filter(([k]) => k !== -1);
	const hiBucket = colored[0]?.[1] ?? dominant;
	const vivid = [...hiBucket]
		.filter((p) => p.l > 0.2 && p.l < 0.8)
		.sort((a, b) => b.s - a.s)
		.slice(0, Math.max(4, Math.ceil(hiBucket.length / 3)));
	const hi = mean(vivid.length ? vivid : hiBucket);
	return [hex(base), hex(hi)];
}

/** Resolve an accent pair for `src`, or null if it can't be read. Cached. */
export function imageAccents(src: string): Promise<[string, string] | null> {
	let p = cache.get(src);
	if (!p) {
		p = new Promise((resolve) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.decoding = 'async';
			img.onload = () => {
				try {
					const N = 32;
					const c = document.createElement('canvas');
					c.width = c.height = N;
					const ctx = c.getContext('2d', { willReadFrequently: true });
					if (!ctx) return resolve(null);
					ctx.drawImage(img, 0, 0, N, N);
					resolve(pick(ctx.getImageData(0, 0, N, N).data));
				} catch {
					resolve(null);
				}
			};
			img.onerror = () => resolve(null);
			img.src = src;
		});
		cache.set(src, p);
	}
	return p;
}
