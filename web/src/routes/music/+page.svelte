<script lang="ts">
	import { browser } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import SectionHeader from '$lib/design/SectionHeader.svelte';
	import AlbumCarousel from '$lib/design/AlbumCarousel.svelte';
	import AlbumDetail from '$lib/design/AlbumDetail.svelte';
	import Sleeve from '$lib/design/Sleeve.svelte';
	import RangeSlider from '$lib/design/RangeSlider.svelte';
	import { rate, fmt, dateShort, accents } from '$lib/design/tokens';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const PER_PAGE_OPTIONS = [8, 16, 24, 48];
	let perPageChoice = $state<number>(8);

	let innerWidth = $state(1280);
	const mobile = $derived(innerWidth < 780);

	const showcase = $derived(
		data.albums
			.filter((a) => a.showcase_rank && a.showcase_rank <= 5)
			.sort((a, b) => (a.showcase_rank ?? 9) - (b.showcase_rank ?? 9))
	);

	const yearsRelease = $derived(
		data.albums.map((a) => (a.release_date ? +a.release_date.slice(0, 4) : 0)).filter(Boolean)
	);
	const yearsRated = $derived(
		data.albums.map((a) => (a.date_rated ? +a.date_rated.slice(0, 4) : 0)).filter(Boolean)
	);
	const relMin = $derived(Math.min(...yearsRelease, 2000));
	const relMax = $derived(Math.max(...yearsRelease, 2026));
	const ratMin = $derived(Math.min(...yearsRated, 2019));
	const ratMax = $derived(Math.max(...yearsRated, 2026));

	let search = $state('');
	let sortKey = $state<'rating' | 'release' | 'rated' | 'minutes'>('rating');
	let sortDir = $state<'asc' | 'desc'>('desc');
	let pageNum = $state(0);
	let filtersOpen = $state(false);
	let heroIndex = $state(0);

	let relLo = $state(0);
	let relHi = $state(9999);
	let ratLo = $state(0);
	let ratHi = $state(9999);
	let scoreLo = $state(0);
	let scoreHi = $state(10);

	// initialise slider bounds once data is known
	$effect(() => {
		relLo = relMin;
		relHi = relMax;
		ratLo = ratMin;
		ratHi = ratMax;
	});

	const filtersActive = $derived(
		relLo > relMin || relHi < relMax || ratLo > ratMin || ratHi < ratMax || scoreLo > 0 || scoreHi < 10
	);

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		let out = data.albums.filter((a) => {
			if (q && !`${a.name} ${a.artist}`.toLowerCase().includes(q)) return false;
			const ry = a.release_date ? +a.release_date.slice(0, 4) : 0;
			const dy = a.date_rated ? +a.date_rated.slice(0, 4) : 0;
			if (ry && (ry < relLo || ry > relHi)) return false;
			if (dy && (dy < ratLo || dy > ratHi)) return false;
			if (a.rating < scoreLo || a.rating > scoreHi) return false;
			return true;
		});
		const dir = sortDir === 'asc' ? 1 : -1;
		out = [...out].sort((a, b) => {
			if (sortKey === 'rating') return (a.rating - b.rating) * dir;
			if (sortKey === 'minutes') return (a.lifetime_minutes - b.lifetime_minutes) * dir;
			const av = sortKey === 'release' ? a.release_date : a.date_rated;
			const bv = sortKey === 'release' ? b.release_date : b.date_rated;
			return ((av ?? '') < (bv ?? '') ? -1 : 1) * dir;
		});
		return out;
	});

	const perPage = $derived(mobile ? 6 : perPageChoice);
	const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / perPage)));
	const pageRows = $derived(filtered.slice(pageNum * perPage, pageNum * perPage + perPage));
	const rangeStart = $derived(filtered.length === 0 ? 0 : pageNum * perPage + 1);
	const rangeEnd = $derived(Math.min(filtered.length, (pageNum + 1) * perPage));

	// reset to page 1 on any query change
	$effect(() => {
		void [search, sortKey, sortDir, relLo, relHi, ratLo, ratHi, scoreLo, scoreHi, perPageChoice];
		pageNum = 0;
	});

	function setSort(k: typeof sortKey) {
		if (sortKey === k) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
		else {
			sortKey = k;
			sortDir = 'desc';
		}
	}
	function resetFilters() {
		relLo = relMin;
		relHi = relMax;
		ratLo = ratMin;
		ratHi = ratMax;
		scoreLo = 0;
		scoreHi = 10;
		search = '';
	}

	// open / close detail. State drives rendering; the URL is kept in sync
	// for deep-linking (?open=<albumId>) but is not the source of truth.
	let openId = $state<string | null>(page.url.searchParams.get('open'));
	const openAlbum = $derived(data.albums.find((a) => a.id === openId) ?? null);

	function syncUrl(id: string | null) {
		if (!browser) return;
		const u = new URL(window.location.href);
		if (id) u.searchParams.set('open', id);
		else u.searchParams.delete('open');
		try {
			replaceState(u, {});
		} catch {
			history.replaceState(history.state, '', u);
		}
	}
	function open(id: string) {
		openId = id;
		syncUrl(id);
	}
	function close() {
		openId = null;
		syncUrl(null);
	}

	const arrow = (k: typeof sortKey) => (sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '');
	const sortCols: { k: typeof sortKey; label: string }[] = [
		{ k: 'release', label: 'Released' },
		{ k: 'rated', label: 'Rated' },
		{ k: 'minutes', label: 'Minutes' },
		{ k: 'rating', label: 'Score' }
	];
</script>

<svelte:window bind:innerWidth />

<div class="mx-auto max-w-[1180px] px-[22px] py-12">
	<!-- ── Section A — showcase ──────────────────────────────────────── -->
	{#if showcase.length}
		<SectionHeader
			kicker="Section A — My Shelf"
			title="Five records above the rest"
			aside="Hand-picked, re-ordered rarely. Drag the band or use the arrows."
		/>
		<AlbumCarousel albums={showcase} bind:hero={heroIndex} onopen={open} />
	{/if}

	<!-- ── Section B — catalogue ─────────────────────────────────────── -->
	<div class="mt-8 sm:mt-10">
		<SectionHeader
			kicker="Section B — Full Catalogue"
			title="Everything rated"
			aside="{filtered.length} of {data.albums.length} cards shown"
			asideMono
		/>

		<div class="flex flex-wrap items-end gap-4">
			<label class="min-w-[240px] flex-1">
				<span class="font-mono text-[10px] tracking-[0.14em] text-ink-faint u-caps">Search</span>
				<input
					bind:value={search}
					placeholder="album or artist"
					class="mt-1.5 w-full rounded-sm border border-border-strong bg-field px-3 py-2.5 text-sm placeholder:text-ink-faintest focus-visible:border-copper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper"
				/>
			</label>
			<div>
				<span class="font-mono text-[10px] tracking-[0.14em] text-ink-faint u-caps">Refine</span>
				<button
					onclick={() => (filtersOpen = !filtersOpen)}
					aria-pressed={filtersOpen}
					class="mt-1.5 flex items-center gap-1.5 rounded-sm border px-3 py-2.5 font-mono text-[11px] tracking-[0.1em] u-caps {filtersOpen ||
					filtersActive
						? 'border-copper bg-copper text-copper-text'
						: 'border-border-strong text-ink-muted hover:border-copper hover:text-copper'}"
				>
					Filters ▾
				</button>
			</div>
		</div>

		{#if filtersOpen}
			<div class="mt-4 grid gap-6 rounded-[3px] border border-border bg-sunken p-5 sm:grid-cols-3">
				<RangeSlider label="Release year" min={relMin} max={relMax} bind:lo={relLo} bind:hi={relHi} />
				<RangeSlider label="Rated year" min={ratMin} max={ratMax} bind:lo={ratLo} bind:hi={ratHi} />
				<RangeSlider
					label="Score"
					min={0}
					max={10}
					step={0.5}
					bind:lo={scoreLo}
					bind:hi={scoreHi}
					format={(n) => n.toFixed(1)}
				/>
			</div>
		{/if}

		<!-- sort: chips <780, column headers >=780 -->
		{#if mobile}
			<div class="noscroll mt-5 -mx-[22px] flex gap-2 overflow-x-auto px-[22px]">
				{#each [{ k: 'rating', label: 'Rating' }, ...sortCols.filter((c) => c.k !== 'rating')] as c (c.k)}
					<button
						onclick={() => setSort(c.k as typeof sortKey)}
						aria-pressed={sortKey === c.k}
						class="shrink-0 rounded-sm border px-3 py-2 font-mono text-[11px] tracking-[0.08em] u-caps {sortKey ===
						c.k
							? 'border-copper bg-copper text-copper-text'
							: 'border-border-strong text-ink-muted'}"
					>
						{c.label}{arrow(c.k as typeof sortKey)}
					</button>
				{/each}
			</div>
		{/if}

		<!-- ── table ── -->
		{#if data.albums.length === 0}
			<div class="mt-6 rounded-[3px] border border-dashed border-border-strong px-6 py-16 text-center">
				<p class="font-mono text-[11px] tracking-[0.16em] text-ink-faint u-caps">No card in this drawer</p>
				<h3 class="font-display mt-2 text-2xl font-bold u-caps">Nothing rated yet</h3>
				<p class="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
					Rate an album from the admin page and it shows up here.
				</p>
			</div>
		{:else if filtered.length === 0}
			<div class="mt-6 rounded-[3px] border border-dashed border-border-strong px-6 py-16 text-center">
				<p class="font-mono text-[11px] tracking-[0.16em] text-ink-faint u-caps">No card in this drawer</p>
				<h3 class="font-display mt-2 text-2xl font-bold u-caps">Nothing matches</h3>
				<p class="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
					No album fits the current search and filters.
				</p>
				<button
					onclick={resetFilters}
					class="mt-4 rounded-sm bg-ink px-4 py-2 text-sm text-paper hover:bg-copper focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-copper"
				>
					Reset filters
				</button>
			</div>
		{:else}
			{@const rowGrid = mobile
				? 'grid-cols-[2rem_3rem_minmax(0,1fr)_auto]'
				: 'grid-cols-[2.5rem_3.25rem_minmax(0,1fr)_6.5rem_6.5rem_6.5rem_4.5rem]'}
			<div class="mt-5">
				{#if !mobile}
					<div
						class="grid {rowGrid} items-center gap-4 border-b border-ink pb-2 pr-3 font-mono text-[10px] tracking-[0.12em] text-ink-faint u-caps"
					>
						<span></span>
						<span></span>
						<span class="pl-1">Album / Artist</span>
						{#each sortCols as c (c.k)}
							<button
								onclick={() => setSort(c.k)}
								aria-pressed={sortKey === c.k}
								class="-my-1 rounded-sm py-1 {c.k === 'rating' ? 'justify-self-end -mr-1.5 pr-1.5 pl-1.5' : 'justify-self-start -ml-1.5 pr-1.5 pl-1.5'} {sortKey === c.k
									? 'bg-copper text-copper-text'
									: 'text-ink-faint hover:text-copper'}"
							>
								{c.label}{arrow(c.k)}
							</button>
						{/each}
					</div>
				{/if}

				<ul>
					{#each pageRows as a, i (a.id)}
						{@const tint = accents(a)[0]}
						<li class="odd:bg-transparent even:bg-zebra">
							<button
								onclick={() => open(a.id)}
								class="grid w-full {rowGrid} items-center gap-4 py-3 pr-3 text-left transition-colors duration-150 hover:bg-rowhover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-copper"
								style="box-shadow: inset 3px 0 0 color-mix(in srgb, {tint} 38%, transparent)"
							>
								<span class="pl-3 font-mono text-[11px] text-ink-faintest">
									{String(pageNum * perPage + i + 1).padStart(data.albums.length > 99 ? 3 : 2, '0')}
								</span>
								<span class="w-12 shrink-0 shadow-[0_4px_12px_rgba(24,32,26,.14)]">
									<Sleeve album={a} />
								</span>
								<span class="min-w-0">
									<span
										class="font-display block truncate text-[15px] font-semibold tracking-[0.02em] text-ink u-caps"
										style="font-variation-settings:'wdth' 112"
									>
										{a.name}
									</span>
									<span class="block truncate text-[13px] text-ink-muted">{a.artist}</span>
									{#if mobile}
										<span class="mt-0.5 block truncate font-mono text-[10px] text-ink-faintest">
											{dateShort(a.release_date)} · {dateShort(a.date_rated)} · {fmt(a.lifetime_minutes)}m
										</span>
									{/if}
								</span>
								{#if !mobile}
									<span class="font-mono text-[12px] text-ink-muted">{dateShort(a.release_date)}</span>
									<span class="font-mono text-[12px] text-ink-muted">{dateShort(a.date_rated)}</span>
									<span class="font-mono text-[12px] text-ink-muted">{fmt(a.lifetime_minutes)}</span>
								{/if}
								<span class="justify-self-end">
									<span
										class="font-mono {mobile ? 'text-base' : 'text-xl'} font-medium text-ink"
										style="border-bottom:2px solid var(--color-copper); padding-bottom:1px"
									>
										{rate(a.rating)}
									</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>

				<div
					class="mt-6 flex flex-col gap-3 border-t border-rule pt-4 font-mono text-[11px] text-ink-muted sm:flex-row sm:items-center sm:justify-between"
				>
					<div class="flex items-center gap-4">
						<span class="tracking-[0.06em] u-caps">
							{rangeStart}–{rangeEnd} of {filtered.length}
						</span>
						{#if !mobile}
							<label class="flex items-center gap-1.5">
								<span class="text-[10px] tracking-[0.12em] text-ink-faint u-caps">Per page</span>
								<select
									bind:value={perPageChoice}
									class="rounded-sm border border-border-strong bg-field px-2 py-1 text-[11px] focus-visible:border-copper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper"
								>
									{#each PER_PAGE_OPTIONS as n (n)}
										<option value={n}>{n}</option>
									{/each}
								</select>
							</label>
						{/if}
					</div>

					{#if pageCount > 1}
						<div class="flex items-center gap-1.5">
							<button
								onclick={() => (pageNum = Math.max(0, pageNum - 1))}
								disabled={pageNum === 0}
								class="grid size-8 place-items-center rounded-sm border border-border-strong hover:border-copper disabled:border-border-disabled disabled:text-border-strong disabled:hover:border-border-disabled"
								aria-label="Previous page">←</button
							>
							{#each Array(pageCount) as _, p (p)}
								<button
									onclick={() => (pageNum = p)}
									aria-current={p === pageNum ? 'page' : undefined}
									class="grid size-8 place-items-center rounded-sm border {p === pageNum
										? 'border-copper bg-copper text-copper-text'
										: 'border-border-strong hover:border-copper'}"
								>
									{p + 1}
								</button>
							{/each}
							<button
								onclick={() => (pageNum = Math.min(pageCount - 1, pageNum + 1))}
								disabled={pageNum === pageCount - 1}
								class="grid size-8 place-items-center rounded-sm border border-border-strong hover:border-copper disabled:border-border-disabled disabled:text-border-strong disabled:hover:border-border-disabled"
								aria-label="Next page">→</button
							>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

{#if openAlbum}
	<AlbumDetail album={openAlbum} onclose={close} />
{/if}
