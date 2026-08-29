/**
 * Source-agnostic identity key for an artist or album name.
 *
 * The AUTHORITATIVE implementation is the Postgres `norm_key(text)` function
 * (migrations/013) — every writer (the hourly logger, the Deezer resolver,
 * the Spotify resolver) computes the key in SQL so there is exactly one
 * algorithm and no drift. This JS copy mirrors it and is used only for
 * in-run de-duplication (so a single resolver pass doesn't fetch the same
 * album 40 times) and tests; the DB's `norm_key` unique index is the real
 * guarantee.
 *
 * Algorithm (must match the SQL): de-accent — Postgres `unaccent()` maps
 * é→e, ö→o, æ→ae, ß→ss, … ; here we cover the ligatures explicitly then let
 * NFKD + combining-mark strip handle the rest — lowercase, replace every run
 * of non-[a-z0-9 ] with a single space, collapse whitespace, trim.
 */
const LIGATURES: [RegExp, string][] = [
  [/æ/gi, "ae"],
  [/œ/gi, "oe"],
  [/ø/gi, "o"],
  [/ß/g, "ss"],
  [/ð/gi, "d"],
  [/þ/gi, "th"],
  [/ł/gi, "l"],
  [/đ/gi, "d"],
];

export function normKey(s: string | null | undefined): string {
  let t = s ?? "";
  for (const [re, rep] of LIGATURES) t = t.replace(re, rep);
  return t
    .normalize("NFKD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Album identity = artist key + album key, so "Blush" by two artists stays distinct. */
export function albumKey(artistName: string, albumName: string): string {
  return `${normKey(artistName) || "~"}|${normKey(albumName)}`;
}
