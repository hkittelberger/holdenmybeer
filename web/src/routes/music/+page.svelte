<script lang="ts">
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

	const PER_PAGE_DESKTOP = 8;
	const PER_PAGE_MOBILE = 6;

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

	const perPage = $derived(mobile ? PER_PAGE_MOBILE : PER_PAGE_DESKTOP);
	const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / perPage)));
	const pageRows = $derived(filtered.slice(pageNum * perPage, pageNum * perPage + perPage));

	// reset to page 1 on any query change
	$effect(() => {
		void [search, sortKey, sortDir, relLo, relHi, ratLo, ratHi, scoreLo, scoreHi];
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

	// open / close detail via ?open=<albumId>
	const openId = $derived(page.url.searchParams.get('open'));
	const openAlbum = $derived(data.albums.find((a) => a.id === openId) ?? null);
	function open(id: string) {
		const u = new URL(page.url);
		u.searchParams.set('open', id);
		replaceState(u, {});
	}
	function close() {
		const u = new URL(page.url);
		u.searchParams.delete('open');
		replaceState(u, {});
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
	<div class="mt-[78px]">
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
			<div class="mt-5">
				{#if !mobile}
					<div
						class="grid grid-cols-[3rem_3.5rem_1fr_7rem_7rem_7rem_5rem] items-center gap-4 border-b border-ink pb-2 font-mono text-[10px] tracking-[0.12em] text-ink-faint u-caps"
					>
						<span></span>
						<span></span>
						<span>Album / Artist</span>
						{#each sortCols as c (c.k)}
							<button
								onclick={() => setSort(c.k)}
								aria-pressed={sortKey === c.k}
								class="{c.k === 'rating' ? 'text-right' : 'text-left'} {sortKey === c.k
									? 'text-copper'
									: 'hover:text-copper'}"
							>
								{c.label}{arrow(c.k)}
							</button>
						{/each}
					</div>
				{/if}

				<ul>
					{#each pageRows as a, i (a.id)}
						{@const c1 = accents(a)[0]}
						<li class="odd:bg-transparent even:bg-zebra">
							<button
								onclick={() => open(a.id)}
								class="grid w-full items-center gap-4 py-3 pr-2 text-left transition-colors duration-150 hover:bg-rowhover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-copper {mobile
									? 'grid-cols-[2.5rem_3.5rem_1fr]'
									: 'grid-cols-[3rem_3.5rem_1fr_7rem_7rem_7rem_5rem]'}"
								style="box-shadow: inset 3px 0 0 {c1}"
							>
								<span class="pl-3 font-mono text-[11px] text-ink-faintest">
									{String(pageNum * perPage + i + 1).padStart(data.albums.length > 99 ? 3 : 2, '0')}
								</span>
								<span class="w-14 shrink-0 shadow-[0_4px_12px_rgba(24,32,26,.14)]">
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
										<span class="mt-0.5 block font-mono text-[10px] text-ink-faintest">
											{dateShort(a.release_date)} · {dateShort(a.date_rated)} · {fmt(a.lifetime_minutes)} min
										</span>
									{/if}
								</span>
								{#if !mobile}
									<span class="font-mono text-[12px] text-ink-muted">{dateShort(a.release_date)}</span>
									<span class="font-mono text-[12px] text-ink-muted">{dateShort(a.date_rated)}</span>
									<span class="font-mono text-[12px] text-ink-muted">{fmt(a.lifetime_minutes)}</span>
									<span class="justify-self-end">
										<span
											class="font-mono text-xl font-medium text-ink"
											style="border-bottom:2px solid var(--color-copper); padding-bottom:1px"
										>
											{rate(a.rating)}
										</span>
									</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>

				{#if pageCount > 1}
					<div class="mt-6 flex items-center justify-center gap-2 font-mono text-[11px]">
						<button
							onclick={() => (pageNum = Math.max(0, pageNum - 1))}
							disabled={pageNum === 0}
							class="grid size-9 place-items-center rounded-sm border border-border-strong text-ink-muted disabled:border-border-disabled disabled:text-border-strong"
							aria-label="Previous page">←</button
						>
						{#each Array(pageCount) as _, p (p)}
							<button
								onclick={() => (pageNum = p)}
								aria-current={p === pageNum ? 'page' : undefined}
								class="grid size-9 place-items-center rounded-sm border {p === pageNum
									? 'border-copper bg-copper text-copper-text'
									: 'border-border-strong text-ink-muted hover:border-copper'}"
							>
								{p + 1}
							</button>
						{/each}
						<button
							onclick={() => (pageNum = Math.min(pageCount - 1, pageNum + 1))}
							disabled={pageNum === pageCount - 1}
							class="grid size-9 place-items-center rounded-sm border border-border-strong text-ink-muted disabled:border-border-disabled disabled:text-border-strong"
							aria-label="Next page">→</button
						>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

{#if openAlbum}
	<AlbumDetail album={openAlbum} onclose={close} />
{/if}
