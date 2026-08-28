// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env?: {
				DATABASE_URL: string;
				ADMIN_PASSWORD: string;
				ADMIN_SECRET: string;
			};
			context?: { waitUntil(promise: Promise<unknown>): void };
			caches?: CacheStorage;
		}
	}
}

export {};
