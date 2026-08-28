/**
 * Neon connection strings ship `?sslmode=require`. Newer `pg` /
 * `pg-connection-string` print a deprecation warning that it currently
 * treats `require` as an alias for `verify-full` and will change that.
 * We *want* verify-full against Neon (publicly-trusted CA), so make it
 * explicit and the warning goes away without any behaviour change.
 */
export function pgConnectionString(url: string): string {
  return url.replace(/([?&])sslmode=(require|prefer|verify-ca)(\b|$)/i, "$1sslmode=verify-full");
}
