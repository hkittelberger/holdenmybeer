/** Small helpers shared by the design components. */

/** Stable 0..n hash of a string (album id → mark index, etc.). */
export function hashInt(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return Math.abs(h);
}

export const MARKS = ['circle', 'band', 'split', 'corner'] as const;
export type Mark = (typeof MARKS)[number];

export interface AlbumColors {
	id: string;
	accent_1: string | null;
	accent_2: string | null;
}

/** Muted, varied placeholder pair keyed off the id — used when the real
 *  cover colours aren't resolved yet, so unresolved sleeves still differ. */
function placeholderPair(id: string): [string, string] {
	const h = hashInt(id);
	const hue1 = h % 360;
	const hue2 = (hue1 + 30 + ((h >> 8) % 60)) % 360;
	return [`hsl(${hue1} 22% 26%)`, `hsl(${hue2} 26% 44%)`];
}

export function accents(a: AlbumColors): [string, string] {
	if (a.accent_1 && a.accent_2) return [a.accent_1, a.accent_2];
	const [p1, p2] = placeholderPair(a.id || 'x');
	return [a.accent_1 || p1, a.accent_2 || p2];
}

export function sleeveGradient(a: AlbumColors): string {
	const [c1, c2] = accents(a);
	return `linear-gradient(152deg, ${c1} 0%, ${c1} 46%, color-mix(in oklab, ${c1} 55%, ${c2}) 100%)`;
}

export function markFor(a: AlbumColors): Mark {
	return MARKS[hashInt(a.id) % MARKS.length];
}

/**
 * Keep the last word (or last two, if the last is tiny) glued to the
 * previous one with a non-breaking space, so a wrapped title never ends
 * with a lonely fragment on its own line.
 */
export function noOrphan(s: string): string {
	const w = s.trim().split(/\s+/);
	if (w.length < 3) return s;
	// bind the last 2 words (or 3 when the very last is tiny) with NBSP so a
	// wrapped title never drops a lonely fragment onto its own line.
	const bind = w[w.length - 1].length <= 3 && w.length >= 4 ? 3 : 2;
	const head = w.slice(0, -bind).join(' ');
	const tail = w.slice(-bind).join(' ');
	return head ? head + ' ' + tail : tail;
}

export const fmt = (n: number): string => n.toLocaleString('en-US');
export const rate = (n: number): string => n.toFixed(1);
export const dateShort = (s: string | null): string =>
	s
		? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
		: '—';
export const dateLong = (s: string | null): string =>
	s
		? new Date(s + 'T00:00:00').toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			})
		: '—';
export const mmss = (ms: number): string => {
	const t = Math.round(ms / 1000);
	return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
export const hmmss = (totalMs: number): string => {
	const t = Math.round(totalMs / 1000);
	const m = Math.floor(t / 60);
	return `${m}:${String(t % 60).padStart(2, '0')}`;
};
