/**
 * Admin gate: one shared password (`ADMIN_PASSWORD`), verified server-side,
 * success sets a signed httpOnly cookie. No per-user accounts.
 *
 * Cookie value = `<expiryMs>.<hmacSHA256(expiryMs, ADMIN_SECRET)>`, base64url.
 * Web Crypto only, so it runs on the Cloudflare Workers runtime.
 *
 * BP6 hardens this (rotation, tighter TTL, rate-limit on the form). The
 * mechanism here is already real, not a stub.
 */
import { env } from '$env/dynamic/private';

const COOKIE = 'hm_admin';
const TTL_MS = 1000 * 60 * 60 * 12; // 12h

function secret(): string {
	const s = env.ADMIN_SECRET ?? env.ADMIN_PASSWORD;
	if (!s) throw new Error('ADMIN_SECRET / ADMIN_PASSWORD not set');
	return s;
}

const b64url = (buf: ArrayBuffer): string =>
	btoa(String.fromCharCode(...new Uint8Array(buf)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

async function hmac(message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret()),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
	return b64url(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let out = 0;
	for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return out === 0;
}

export function passwordOk(candidate: string): boolean {
	const expected = env.ADMIN_PASSWORD;
	if (!expected) throw new Error('ADMIN_PASSWORD not set');
	return candidate.length > 0 && timingSafeEqual(candidate, expected);
}

export async function mintToken(): Promise<{ name: string; value: string; maxAge: number }> {
	const expiry = String(Date.now() + TTL_MS);
	return { name: COOKIE, value: `${expiry}.${await hmac(expiry)}`, maxAge: Math.floor(TTL_MS / 1000) };
}

export async function tokenValid(raw: string | undefined): Promise<boolean> {
	if (!raw) return false;
	const [expiry, sig] = raw.split('.');
	if (!expiry || !sig) return false;
	if (Number(expiry) < Date.now()) return false;
	return timingSafeEqual(sig, await hmac(expiry));
}

export const COOKIE_NAME = COOKIE;
