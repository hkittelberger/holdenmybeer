import { fail, redirect } from '@sveltejs/kit';
import { COOKIE_NAME, mintToken, passwordOk, tokenValid } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	// Already unlocked? The gate has nothing to show — go straight to the tools.
	if (await tokenValid(cookies.get(COOKIE_NAME))) throw redirect(303, '/music/admin/edit');
	return { unlocked: false };
};

/**
 * Soft brute-force guard: a handful of wrong passwords from one IP and the
 * form locks that IP out for a few minutes. In-memory per Worker isolate —
 * not bulletproof across the edge, but it turns "unlimited guesses/sec" into
 * "a few per minute", which is all a single-password personal gate needs.
 */
const MAX_TRIES = 5;
const WINDOW_MS = 5 * 60_000;
const attempts = new Map<string, { n: number; first: number }>();

function throttle(ip: string): { blocked: boolean; retryInSec: number } {
	const rec = attempts.get(ip);
	const now = Date.now();
	if (!rec || now - rec.first > WINDOW_MS) return { blocked: false, retryInSec: 0 };
	if (rec.n >= MAX_TRIES) {
		return { blocked: true, retryInSec: Math.ceil((rec.first + WINDOW_MS - now) / 1000) };
	}
	return { blocked: false, retryInSec: 0 };
}

function noteFailure(ip: string): void {
	const now = Date.now();
	const rec = attempts.get(ip);
	if (!rec || now - rec.first > WINDOW_MS) attempts.set(ip, { n: 1, first: now });
	else rec.n += 1;
}

export const actions: Actions = {
	login: async ({ request, cookies, getClientAddress }) => {
		const ip = getClientAddress();
		const gate = throttle(ip);
		if (gate.blocked) {
			return fail(429, {
				error: `Too many attempts. Try again in ${Math.ceil(gate.retryInSec / 60)} min.`
			});
		}

		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		if (!passwordOk(password)) {
			noteFailure(ip);
			return fail(401, { error: 'Incorrect password.' });
		}

		attempts.delete(ip);
		const token = await mintToken();
		cookies.set(token.name, token.value, {
			path: '/music/admin',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: token.maxAge
		});
		throw redirect(303, '/music/admin');
	},

	logout: async ({ cookies }) => {
		cookies.delete(COOKIE_NAME, { path: '/music/admin' });
		throw redirect(303, '/music/admin');
	}
};
