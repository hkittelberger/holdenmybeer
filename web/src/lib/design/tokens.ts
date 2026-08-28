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

const FALLBACK: [string, string] = ['#254742', '#7e5a2e'];

export function accents(a: AlbumColors): [string, string] {
	return [a.accent_1 || FALLBACK[0], a.accent_2 || FALLBACK[1]];
}

export function sleeveGradient(a: AlbumColors): string {
	const [c1, c2] = accents(a);
	return `linear-gradient(152deg, ${c1} 0%, ${c1} 46%, color-mix(in oklab, ${c1} 55%, ${c2}) 100%)`;
}

export function markFor(a: AlbumColors): Mark {
	return MARKS[hashInt(a.id) % MARKS.length];
}

export const fmt = (n: number): string => n.toLocaleString('en-US');
export const rate = (n: number): string => n.toFixed(1);
export const dateShort = (s: string | null): string =>
	s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';
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
