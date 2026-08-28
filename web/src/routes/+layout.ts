// Every route has exactly one canonical URL: no trailing slash. SvelteKit
// 308-redirects `/foo/` → `/foo` (this is also the framework default, set
// here explicitly so it can't silently change).
export const trailingSlash = 'never';
