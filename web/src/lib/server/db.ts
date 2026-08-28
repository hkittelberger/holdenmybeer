/**
 * Neon access for the Cloudflare (Pages/Workers) runtime — no raw TCP, so
 * `@neondatabase/serverless`.
 *
 * - `q()` / `sql` : one-shot queries over HTTP. Use for a route that fires
 *   a single statement.
 * - `withPool()`  : a short-lived WebSocket pool for a route that needs
 *   several queries in one request (the stats page). Always ends the pool.
 *
 * `search_path = public` is set on the Neon role (migrations/006), so table
 * names resolve unqualified on every connection and driver.
 */
import { neon, Pool } from '@neondatabase/serverless';
import { env } from '$env/dynamic/private';

function connectionString(): string {
	const u = env.DATABASE_URL;
	if (!u) throw new Error('DATABASE_URL is not set');
	return u;
}

/** Tagged-template / `.query()` client for a single round trip. */
export const sql = () => neon(connectionString());

/** Run one parameterised statement over HTTP; returns the rows. */
export async function q<T = Record<string, unknown>>(
	text: string,
	params: unknown[] = []
): Promise<T[]> {
	const client = neon(connectionString());
	return (await client.query(text, params)) as T[];
}

/** For a request that issues several queries — reuse one connection. */
export async function withPool<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
	const pool = new Pool({ connectionString: connectionString() });
	try {
		return await fn(pool);
	} finally {
		await pool.end();
	}
}
