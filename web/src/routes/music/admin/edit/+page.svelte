<script lang="ts">
	import { enhance } from '$app/forms';
	import Sleeve from '$lib/design/Sleeve.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { rate, hmmss } from '$lib/design/tokens';
	import type { AlbumFull, AlbumSearchHit } from '$lib/spotify-types';
	import type { PageProps } from './$types';
	import type { RatedAlbum } from './+page.server';

	type FormMsg = {
		scope?: string;
		saved?: boolean;
		deleted?: boolean;
		error?: string;
		warnings?: string[];
	};

	let { data, form }: PageProps = $props();

	// ── add / edit an album ────────────────────────────────────────────────
	let query = $state('');
	let results = $state<AlbumSearchHit[]>([]);
	let searching = $state(false);
	let searchError = $state('');
	let debounce: ReturnType<typeof setTimeout>;

	// the album currently loaded into the form
	let picked = $state<{ album: AlbumFull; fromSpotify: boolean } | null>(null);
	let editingId = $state<string | null>(null); // set when the album is already rated

	let rating = $state(8);
	let dateRated = $state('');
	let top1 = $state('');
	let top2 = $state('');
	let top3 = $state('');
	let notes = $state('');

	const ratedById = $derived(new Map(data.ratedAlbums.map((a) => [a.id, a])));
	const trackOptions = $derived(picked?.album.tracks ?? []);

	function runSearch() {
		clearTimeout(debounce);
		justFiled = null;
		const q = query.trim();
		if (q.length < 2) {
			results = [];
			return;
		}
		debounce = setTimeout(async () => {
			searching = true;
			searchError = '';
			try {
				const res = await fetch(`/music/admin/search?q=${encodeURIComponent(q)}`);
				if (!res.ok)
					throw new Error((await res.json().catch(() => ({}))).message ?? `HTTP ${res.status}`);
				results = (await res.json()).results;
			} catch (e) {
				searchError = (e as Error).message || 'Search failed.';
				results = [];
			} finally {
				searching = false;
			}
		}, 300);
	}

	// a search hit carries everything except the tracklist — enough to file a
	// rating when the tracklist endpoint is rate-locked
	const partialFromHit = (h: AlbumSearchHit): AlbumFull => ({
		...h,
		uri: `spotify:album:${h.id}`,
		artist_uri: h.artist_id ? `spotify:artist:${h.artist_id}` : '',
		total_duration_ms: 0,
		tracks: []
	});

	let degraded = $state(false);

	async function pick(hit: AlbumSearchHit) {
		searching = true;
		searchError = '';
		try {
			const res = await fetch(`/music/admin/lookup/${hit.id}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as {
				album: AlbumFull | null;
				degraded: boolean;
				existing: {
					rating: string;
					date_rated: string | null;
					review_notes: string | null;
					top_songs: string[] | null;
				} | null;
			};
			degraded = body.degraded || !body.album;
			picked = { album: body.album ?? partialFromHit(hit), fromSpotify: true };
			results = [];
			query = '';
			loadExisting(hit.id, body.existing);
		} catch (e) {
			searchError = (e as Error).message || 'Lookup failed.';
		} finally {
			searching = false;
		}
	}

	function loadExisting(
		id: string,
		existing: {
			rating: string | number;
			date_rated: string | null;
			review_notes: string | null;
			top_songs: string[] | null;
		} | null
	) {
		if (existing) {
			editingId = id;
			rating = Number(existing.rating);
			dateRated = existing.date_rated ?? '';
			notes = existing.review_notes ?? '';
			[top1, top2, top3] = [
				existing.top_songs?.[0] ?? '',
				existing.top_songs?.[1] ?? '',
				existing.top_songs?.[2] ?? ''
			];
		} else {
			editingId = null;
			rating = 8;
			dateRated = new Date().toISOString().slice(0, 10);
			notes = '';
			top1 = top2 = top3 = '';
		}
	}

	// pick an already-rated album straight from the list (no Spotify round trip)
	function editRated(a: RatedAlbum) {
		justFiled = null;
		degraded = a.tracks.length === 0;
		picked = {
			album: {
				id: a.id,
				name: a.name,
				artist: a.artist,
				artist_id: '',
				artist_uri: '',
				uri: `spotify:album:${a.id}`,
				cover_url: a.cover_url,
				release_date: null,
				total_tracks: a.tracks.length || null,
				total_duration_ms: 0,
				tracks: a.tracks.map((t) => ({
					uri: t.uri,
					id: '',
					name: t.name,
					duration_ms: 0,
					track_number: t.track_number,
					disc_number: t.disc_number
				}))
			},
			fromSpotify: false
		};
		loadExisting(a.id, { ...a, rating: a.rating });
		document.getElementById('album-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function clearForm() {
		picked = null;
		editingId = null;
		degraded = false;
		query = '';
		results = [];
	}

	// ── top five wheel ────────────────────────────────────────────────────
	const wheelFromData = () => {
		const slots = ['', '', '', '', ''];
		for (const a of data.ratedAlbums) {
			if (a.showcase_rank && a.showcase_rank >= 1 && a.showcase_rank <= 5) {
				slots[a.showcase_rank - 1] = a.id;
			}
		}
		return slots;
	};
	let slots = $state<string[]>(wheelFromData());
	// re-seed whenever the server data changes (after a save)
	let lastRatedSig = $state('');
	$effect(() => {
		const sig = data.ratedAlbums.map((a) => `${a.id}:${a.showcase_rank}`).join('|');
		if (sig !== lastRatedSig) {
			lastRatedSig = sig;
			slots = wheelFromData();
		}
	});

	const albumOptions = $derived([...data.ratedAlbums].sort((a, b) => a.name.localeCompare(b.name)));
	const frontName = $derived(slots[0] ? (ratedById.get(slots[0])?.name ?? '—') : '—');

	function moveSlot(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= slots.length) return;
		const next = [...slots];
		[next[i], next[j]] = [next[j], next[i]];
		slots = next;
	}

	// ── yearly playlists ──────────────────────────────────────────────────
	// svelte-ignore state_referenced_locally -- re-seeded from data by the $effect below
	let links = $state(data.playlists.map((p) => ({ ...p })));
	// ── spotify profile ──────────────────────────────────────────────────
	// svelte-ignore state_referenced_locally
	let profileUrl = $state(data.spotifyProfileUrl);

	// after any save, `use:enhance` reloads `data` — pull the persisted values
	// back into the editable state so the fields reflect what's actually stored
	let lastCfgSig = $state('');
	$effect(() => {
		const sig = JSON.stringify(data.playlists) + '|' + data.spotifyProfileUrl;
		if (sig !== lastCfgSig) {
			lastCfgSig = sig;
			links = data.playlists.map((p) => ({ ...p }));
			profileUrl = data.spotifyProfileUrl;
		}
	});

	const msg = (scope: string): FormMsg | null => {
		const f = form as FormMsg | null;
		return f && f.scope === scope ? f : null;
	};

	// keep the bound form fields intact after a save (don't native-reset)
	const keepValues =
		() =>
		async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) =>
			update({ reset: false });

	// after filing / removing a rating, collapse the editor back to the bare
	// search box and leave a one-line confirmation above it
	let justFiled = $state<string | null>(null);
	const afterRating = (kind: 'save' | 'delete') => () => {
		const name = picked?.album.name ?? 'album';
		const verb = kind === 'delete' ? 'Removed' : editingId ? 'Saved' : 'Filed';
		return async ({
			result,
			update
		}: {
			result: { type: string };
			update: (o?: { reset?: boolean }) => Promise<void>;
		}) => {
			await update({ reset: false });
			if (result.type === 'success') {
				justFiled = `${verb} “${name}”`;
				clearForm();
			}
		};
	};
</script>

<Seo title="Curator Tools" description="Private curator tools." path="/music/admin/edit" noindex />
<Breadcrumbs
	items={[
		{ label: 'Home', href: '/' },
		{ label: 'Music', href: '/music' },
		{ label: 'Admin', href: '/music/admin' },
		{ label: 'Curator Tools', href: '/music/admin/edit' }
	]}
/>

<div class="mx-auto max-w-[920px] px-[22px] py-10">
	<!-- admin mode bar -->
	<div
		class="flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-ink bg-ink px-4 py-3 text-paper"
	>
		<span class="u-caps font-mono text-[10px] tracking-[0.16em]"
			>Curator tools · writes to the live index</span
		>
		<form method="POST" action="/music/admin?/logout" use:enhance>
			<button
				class="u-caps rounded-sm border border-ink-faint px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] hover:border-copper-light hover:text-copper-light"
			>
				Lock
			</button>
		</form>
	</div>

	<!-- ══ add / edit an album ══════════════════════════════════════════ -->
	<h2
		class="u-caps mt-8 font-display text-[26px] font-bold"
		style="font-variation-settings:'wdth' 116"
	>
		Add / edit an album
	</h2>
	<p class="u-caps font-mono text-[10px] tracking-[0.1em] text-ink-faint">
		Step 1 — look up. Step 2 — rate.
	</p>

	<div id="album-form" class="mt-4 rounded-[3px] border border-border bg-raised p-5">
		{#if justFiled && !picked}
			<p
				class="u-caps mb-3 rounded-sm border border-copper/40 bg-copper-wash px-3 py-2 font-mono text-[11px] tracking-[0.06em] text-copper"
			>
				{justFiled} ✓ — search for the next one
			</p>
		{/if}
		<label class="block">
			<span class="u-caps mb-1.5 block font-mono text-[9px] tracking-[0.14em] text-ink-faint">
				Search Spotify catalogue
			</span>
			<input
				type="search"
				bind:value={query}
				oninput={runSearch}
				placeholder="album or artist"
				class="w-full rounded-sm border border-border-strong bg-field px-3 py-2.5 text-sm focus-visible:border-copper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper"
			/>
		</label>

		{#if searching}
			<p class="u-caps mt-2 font-mono text-[10px] tracking-[0.1em] text-ink-faint">
				Fetching catalogue…
			</p>
		{/if}
		{#if searchError}
			<div
				class="mt-2 flex items-start gap-2 rounded-sm border border-copper bg-copper-wash px-3 py-2"
			>
				<span class="font-mono text-[12px] text-copper">!</span>
				<p class="text-[13px] text-ink-muted">{searchError}</p>
			</div>
		{/if}

		{#if results.length}
			<div class="mt-2.5 overflow-hidden rounded-sm border border-border-disabled">
				{#each results as r (r.id)}
					<button
						type="button"
						onclick={() => pick(r)}
						class="flex w-full items-center gap-3 border-b border-rule bg-field px-3 py-2.5 text-left last:border-0 hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-copper"
					>
						<span class="h-10 w-10 shrink-0 overflow-hidden rounded-[2px] bg-sunken">
							{#if r.cover_url}<img
									src={r.cover_url}
									alt="{r.name} by {r.artist} — album cover"
									class="h-full w-full object-cover"
								/>{/if}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[14px]">{r.name}</span>
							<span class="block truncate text-[11px] text-ink-faint">
								{r.artist} · {r.release_date?.slice(0, 4) ?? '—'} · {r.total_tracks ?? '?'} tracks
							</span>
						</span>
						<span class="u-caps font-mono text-[10px] tracking-[0.08em] text-copper">Select</span>
					</button>
				{/each}
			</div>
		{/if}

		{#if picked}
			{@const a = picked.album}
			<div
				class="mt-4 flex flex-wrap gap-4 rounded-sm border border-border-disabled bg-sunken p-3.5"
			>
				<span
					class="h-16 w-16 shrink-0 overflow-hidden rounded-[2px] shadow-[0_3px_10px_rgba(24,32,26,.16)]"
				>
					{#if a.cover_url}
						<img
							src={a.cover_url}
							alt="{a.name} by {a.artist} — album cover"
							class="h-full w-full object-cover"
						/>
					{:else}
						<Sleeve album={{ id: a.id, accent_1: null, accent_2: null }} />
					{/if}
				</span>
				<div class="flex min-w-0 flex-1 flex-wrap gap-x-7 gap-y-2.5">
					{#each [['Album', a.name], ['Artist', a.artist], ['Released', a.release_date ?? '—'], ['Tracks', String(a.total_tracks ?? a.tracks.length)], ['Length', a.total_duration_ms ? hmmss(a.total_duration_ms) : '—']] as [k, v] (k)}
						<div>
							<div class="u-caps font-mono text-[9px] tracking-[0.14em] text-ink-faint">{k}</div>
							<div class="mt-0.5 text-[14px]">{v}</div>
						</div>
					{/each}
					<div class="u-caps w-full font-mono text-[10px] tracking-[0.06em] text-copper">
						{picked.fromSpotify ? 'Auto-filled from Spotify' : 'From the index'}
						{#if editingId}
							· editing existing rating{/if}
					</div>
				</div>
			</div>

			{#if degraded}
				<div
					class="mt-2 flex items-start gap-2 rounded-sm border border-copper bg-copper-wash px-3 py-2"
				>
					<span class="font-mono text-[12px] text-copper">!</span>
					<p class="text-[13px] text-ink-muted">
						Spotify's tracklist endpoint is rate-limited right now, so the top-song pickers are
						empty and album length is unknown. The rating still saves — re-open this album later (or
						run <code class="font-mono text-[12px]">metadata:resolve</code>) to fill the tracks in.
					</p>
				</div>
			{/if}

			<form
				method="POST"
				action="?/saveRating"
				use:enhance={afterRating('save')}
				class="mt-4 space-y-4"
			>
				<input type="hidden" name="album_id" value={a.id} />
				{#if picked.fromSpotify}
					<input type="hidden" name="album_json" value={JSON.stringify(a)} />
				{/if}

				<div class="flex flex-wrap gap-x-6 gap-y-4">
					<label class="block flex-[0_0_220px]">
						<span
							class="u-caps mb-1.5 flex justify-between font-mono text-[9px] tracking-[0.14em] text-ink-faint"
						>
							<span>Rating / 10</span><span class="text-[13px] text-ink">{rate(rating)}</span>
						</span>
						<input
							type="range"
							name="rating"
							min="0"
							max="10"
							step="0.5"
							bind:value={rating}
							class="h-6 w-full accent-copper"
						/>
					</label>
					<label class="block flex-[0_0_170px]">
						<span class="u-caps mb-1.5 block font-mono text-[9px] tracking-[0.14em] text-ink-faint"
							>Date rated</span
						>
						<input
							type="date"
							name="date_rated"
							bind:value={dateRated}
							class="w-full rounded-sm border border-border-strong bg-field px-2.5 py-2 font-mono text-[13px] focus-visible:border-copper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper"
						/>
					</label>
				</div>

				<div class="flex flex-wrap gap-3">
					{#each [{ n: 'top1', get: () => top1, set: (v: string) => (top1 = v) }, { n: 'top2', get: () => top2, set: (v: string) => (top2 = v) }, { n: 'top3', get: () => top3, set: (v: string) => (top3 = v) }] as f, i (f.n)}
						<label class="block flex-1 basis-[200px]">
							<span
								class="u-caps mb-1.5 block font-mono text-[9px] tracking-[0.14em] text-ink-faint"
							>
								Top song {i + 1}
							</span>
							<select
								name={f.n}
								value={f.get()}
								onchange={(e) => f.set((e.target as HTMLSelectElement).value)}
								class="w-full rounded-sm border border-border-strong bg-field px-2.5 py-2 text-[13px] focus-visible:border-copper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper"
							>
								<option value="">— none —</option>
								{#each trackOptions as t (t.uri)}
									<option value={t.uri}>{t.name}</option>
								{/each}
							</select>
						</label>
					{/each}
				</div>

				<label class="block">
					<span
						class="u-caps mb-1.5 flex justify-between font-mono text-[9px] tracking-[0.14em] text-ink-faint"
					>
						<span>Review / notes</span><span>{notes.length} / 1000</span>
					</span>
					<textarea
						name="review_notes"
						bind:value={notes}
						rows="6"
						maxlength="1000"
						placeholder="What it sounded like, when, and why the score."
						class="w-full resize-y rounded-sm border border-border-strong bg-field px-3 py-2.5 text-sm leading-relaxed focus-visible:border-copper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper"
					></textarea>
				</label>

				<div class="flex flex-wrap items-center gap-3">
					<button
						class="u-caps rounded-sm bg-ink px-5 py-2.5 font-mono text-[11px] tracking-[0.14em] text-paper hover:bg-copper focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-copper"
					>
						{editingId ? 'Save changes' : 'File this card'}
					</button>
					<button
						type="button"
						onclick={clearForm}
						class="u-caps font-mono text-[10px] tracking-[0.1em] text-ink-faint hover:text-copper"
					>
						Clear
					</button>
					{#if msg('rating')?.saved}
						<span class="u-caps font-mono text-[10px] tracking-[0.1em] text-copper">Saved ✓</span>
					{:else if msg('rating')?.deleted}
						<span class="u-caps font-mono text-[10px] tracking-[0.1em] text-copper">Removed ✓</span>
					{:else if msg('rating')?.error}
						<span class="font-mono text-[10px] tracking-[0.1em] text-copper"
							>{msg('rating')?.error}</span
						>
					{/if}
				</div>
			</form>

			{#if editingId}
				<form
					method="POST"
					action="?/deleteRating"
					use:enhance={afterRating('delete')}
					class="mt-3 border-t border-rule pt-3"
				>
					<input type="hidden" name="album_id" value={a.id} />
					<button
						class="u-caps font-mono text-[10px] tracking-[0.1em] text-ink-faint hover:text-copper"
						onclick={(e) => {
							if (!confirm('Remove this rating from the index?')) e.preventDefault();
						}}
					>
						Delete this rating
					</button>
				</form>
			{/if}
		{/if}
	</div>

	{#if data.ratedAlbums.length}
		<details class="mt-3 rounded-[3px] border border-border bg-raised">
			<summary
				class="u-caps cursor-pointer px-4 py-3 font-mono text-[10px] tracking-[0.12em] text-ink-faint"
			>
				Or edit one of the {data.ratedAlbums.length} albums already rated
			</summary>
			<ul class="max-h-64 overflow-y-auto border-t border-rule">
				{#each albumOptions as a (a.id)}
					<li>
						<button
							type="button"
							onclick={() => editRated(a)}
							class="flex w-full items-center gap-3 border-b border-rule px-4 py-2 text-left last:border-0 hover:bg-rowhover"
						>
							<span class="h-8 w-8 shrink-0 overflow-hidden rounded-[2px]">
								{#if a.cover_url}
									<img
										src={a.cover_url}
										alt="{a.name} by {a.artist} — album cover"
										class="h-full w-full object-cover"
									/>
								{:else}
									<Sleeve album={a} />
								{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[13px]">{a.name}</span>
								<span class="block truncate text-[11px] text-ink-faint">{a.artist}</span>
							</span>
							<span class="font-mono text-[12px] text-ink-muted">{rate(a.rating)}</span>
						</button>
					</li>
				{/each}
			</ul>
		</details>
	{/if}

	<!-- ══ top five wheel ══════════════════════════════════════════════ -->
	<h2
		class="u-caps mt-10 font-display text-[26px] font-bold"
		style="font-variation-settings:'wdth' 116"
	>
		Top five wheel
	</h2>
	<p class="u-caps font-mono text-[10px] tracking-[0.1em] text-ink-faint">
		Position 1 sits at the front of the library carousel
	</p>

	<form
		method="POST"
		action="?/saveWheel"
		use:enhance={keepValues}
		class="mt-4 rounded-[3px] border border-border bg-raised px-5 py-2.5"
	>
		{#each slots as slot, i (i)}
			{@const al = slot ? ratedById.get(slot) : null}
			<div class="flex flex-wrap items-center gap-3 border-b border-rule py-3 last:border-0">
				<span class="w-5 font-mono text-[14px] text-copper">{i + 1}</span>
				<span class="h-9 w-9 shrink-0 overflow-hidden rounded-[2px]">
					{#if al?.cover_url}
						<img
							src={al.cover_url}
							alt="{al.name} by {al.artist} — album cover"
							class="h-full w-full object-cover"
						/>
					{:else if al}
						<Sleeve album={al} />
					{:else}
						<span class="block h-full w-full bg-sunken"></span>
					{/if}
				</span>
				<select
					name="slot{i}"
					bind:value={slots[i]}
					aria-label="Wheel position {i + 1}"
					class="flex-1 basis-[240px] rounded-sm border border-border-strong bg-field px-2.5 py-2 text-[13px] focus-visible:border-copper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper"
				>
					<option value="">— empty —</option>
					{#each albumOptions as a (a.id)}
						<option value={a.id}>{a.name} — {a.artist}</option>
					{/each}
				</select>
				<span class="w-9 text-right font-mono text-[13px] text-ink-muted"
					>{al ? rate(al.rating) : ''}</span
				>
				<div class="flex gap-1.5">
					<button
						type="button"
						onclick={() => moveSlot(i, -1)}
						disabled={i === 0}
						aria-label="Move up"
						class="grid size-8 place-items-center rounded-sm border border-border-strong hover:border-copper hover:text-copper disabled:opacity-40 disabled:hover:border-border-strong disabled:hover:text-inherit"
						>↑</button
					>
					<button
						type="button"
						onclick={() => moveSlot(i, 1)}
						disabled={i === slots.length - 1}
						aria-label="Move down"
						class="grid size-8 place-items-center rounded-sm border border-border-strong hover:border-copper hover:text-copper disabled:opacity-40 disabled:hover:border-border-strong disabled:hover:text-inherit"
						>↓</button
					>
				</div>
			</div>
		{/each}
		<div class="flex flex-wrap items-center justify-between gap-3 py-3">
			<span class="u-caps font-mono text-[10px] tracking-[0.1em] text-ink-faint"
				>Front of wheel: {frontName}</span
			>
			<div class="flex items-center gap-3">
				{#if msg('wheel')?.saved}
					<span class="u-caps font-mono text-[10px] tracking-[0.1em] text-copper">Saved ✓</span>
				{:else if msg('wheel')?.error}
					<span class="font-mono text-[10px] tracking-[0.1em] text-copper"
						>{msg('wheel')?.error}</span
					>
				{/if}
				<button
					type="button"
					onclick={() => (slots = wheelFromData())}
					class="u-caps rounded-sm border border-border-strong px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] hover:border-copper hover:text-copper"
				>
					Reset
				</button>
				<button
					class="u-caps rounded-sm bg-ink px-4 py-2 font-mono text-[10px] tracking-[0.12em] text-paper hover:bg-copper"
				>
					Save order
				</button>
			</div>
		</div>
	</form>

	<!-- ══ yearly playlist links ══════════════════════════════════════ -->
	<h2
		class="u-caps mt-10 font-display text-[26px] font-bold"
		style="font-variation-settings:'wdth' 116"
	>
		Yearly playlist links
	</h2>
	<p class="u-caps font-mono text-[10px] tracking-[0.1em] text-ink-faint">
		Empty field = Stats page shows the "no playlist linked" state
	</p>

	<form
		method="POST"
		action="?/savePlaylists"
		use:enhance={keepValues}
		class="mt-4 rounded-[3px] border border-border bg-raised px-5 py-2.5"
	>
		{#each links as link (link.year)}
			<div class="flex flex-wrap items-center gap-3 border-b border-rule py-3 last:border-0">
				<span class="w-12 font-mono text-[14px]">{link.year}</span>
				<input
					type="text"
					name="url_{link.year}"
					bind:value={link.url}
					placeholder="https://open.spotify.com/playlist/…"
					class="flex-1 basis-[260px] rounded-sm border border-border-strong bg-field px-2.5 py-2 font-mono text-[12px] focus-visible:border-copper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper"
				/>
				<span
					class="u-caps font-mono text-[9px] tracking-[0.12em] {link.url.trim()
						? 'text-copper'
						: 'text-ink-faintest'}"
				>
					{link.url.trim() ? 'Linked' : 'No playlist'}
				</span>
				<button
					type="button"
					onclick={() => (link.url = '')}
					class="u-caps rounded-sm border border-border-strong px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] hover:border-copper hover:text-copper"
				>
					Clear
				</button>
			</div>
		{/each}
		{#if msg('playlists')?.warnings?.length}
			<ul class="py-2 font-mono text-[10px] text-copper">
				{#each msg('playlists')?.warnings ?? [] as w (w)}<li>· {w}</li>{/each}
			</ul>
		{/if}
		<div class="flex items-center justify-end gap-3 py-3">
			{#if msg('playlists')?.saved}
				<span class="u-caps font-mono text-[10px] tracking-[0.1em] text-copper">
					Saved ✓{#if !msg('playlists')?.warnings?.length}
						· tracklists pulled from Spotify{/if}
				</span>
			{:else if msg('playlists')?.error}
				<span class="font-mono text-[10px] tracking-[0.1em] text-copper"
					>{msg('playlists')?.error}</span
				>
			{/if}
			<button
				class="u-caps rounded-sm bg-ink px-4 py-2 font-mono text-[10px] tracking-[0.12em] text-paper hover:bg-copper"
			>
				Save links
			</button>
		</div>
	</form>

	<!-- ══ spotify profile ═══════════════════════════════════════════ -->
	<h2
		class="u-caps mt-10 font-display text-[26px] font-bold"
		style="font-variation-settings:'wdth' 116"
	>
		Spotify profile
	</h2>
	<p class="u-caps font-mono text-[10px] tracking-[0.1em] text-ink-faint">
		Shown as the "open profile" link on the Stats page
	</p>

	<form
		method="POST"
		action="?/saveProfile"
		use:enhance={keepValues}
		class="mt-4 flex flex-wrap items-end gap-3 rounded-[3px] border border-border bg-raised p-5"
	>
		<label class="block flex-1 basis-[320px]">
			<span class="u-caps mb-1.5 block font-mono text-[9px] tracking-[0.14em] text-ink-faint"
				>Profile URL</span
			>
			<input
				type="text"
				name="spotify_profile_url"
				bind:value={profileUrl}
				placeholder="https://open.spotify.com/user/…"
				class="w-full rounded-sm border border-border-strong bg-field px-3 py-2.5 font-mono text-[12px] focus-visible:border-copper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper"
			/>
		</label>
		<button
			class="u-caps rounded-sm bg-ink px-4 py-2.5 font-mono text-[10px] tracking-[0.12em] text-paper hover:bg-copper"
		>
			Save
		</button>
		{#if msg('profile')?.saved}
			<span class="u-caps font-mono text-[10px] tracking-[0.1em] text-copper">Saved ✓</span>
		{:else if msg('profile')?.error}
			<span class="font-mono text-[10px] tracking-[0.1em] text-copper">{msg('profile')?.error}</span
			>
		{/if}
	</form>

	<p class="mt-6 text-[13px] text-ink-muted">
		<a class="text-copper underline underline-offset-4" href="/music">← Back to the catalogue</a>
	</p>
</div>
