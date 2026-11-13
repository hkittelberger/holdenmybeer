<script lang="ts">
	import Monogram from './Monogram.svelte';
	import Sleeve from './Sleeve.svelte';
	import BarChart from './BarChart.svelte';
	import YearPills from './YearPills.svelte';
	import { focusTrap } from '$lib/actions/focusTrap';
	import { imageAccents } from './imageAccents';
	import { rate, fmt, dateLong, noOrphan, hashInt } from './tokens';
	import type { ArtistDetail } from '../../routes/music/stats/artist/[id]/+server';

	type Period = number | 'all';

	let {
		id,
		years: yearsProp,
		year = 'all',
		onclose,
		onalbum
	}: {
		id: string;
		/** years offered in the picker; defaults to the artist's own span */
		years?: number[];
		year?: Period;
		onclose: () => void;
		/** open a rated album's detail (the popup swaps to it) */
		onalbum?: (albumId: string) => void;
	} = $props();

	// svelte-ignore state_referenced_locally -- intentional: seed the picker once
	let chartYear = $state<Period>(year);
	let data = $state<ArtistDetail | null>(null);
	let loading = $state(true);

	const years = $derived.by(() => {
		if (yearsProp?.length) return yearsProp;
		const ys = data?.byYear.map((r) => r.year) ?? [];
		if (!ys.length) return [];
		const lo = Math.min(...ys);
		const hi = Math.max(...ys, new Date().getFullYear());
		return Array.from({ length: hi - lo + 1 }, (_, i) => hi - i);
	});

	const byYearBars = $derived(
		years
			.slice()
			.sort((a, b) => a - b)
			.map((y) => ({ year: y, minutes: data?.byYear.find((r) => r.year === y)?.minutes ?? 0 }))
	);

	$effect(() => {
		const artistId = id;
		const y = chartYear;
		loading = true;
		fetch(`/music/stats/artist/${artistId}?year=${y}`)
			.then((r) => (r.ok ? r.json() : Promise.reject()))
			.then((d: ArtistDetail) => {
				data = d;
				loading = false;
			})
			.catch(() => (loading = false));
	});

	// Background tint from the artist photo — the counterpart of the album
	// popup's cover-driven gradient. Falls back to the monogram's hues.
	let photoAccents = $state<[string, string] | null>(null);
	$effect(() => {
		const src = data?.image_url;
		photoAccents = null;
		if (!src) return;
		let live = true;
		imageAccents(src).then((pair) => {
			if (live) photoAccents = pair;
		});
		return () => (live = false);
	});
	const [c1, c2] = $derived.by((): [string, string] => {
		if (photoAccents) return photoAccents;
		const hue = hashInt(data?.name ?? id) % 360;
		return [`hsl(${hue} 22% 26%)`, `hsl(${(hue + 40) % 360} 26% 44%)`];
	});

	const MONTHS = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];
	const W = 520;
	const H = 170;
	const PADL = 34;
	const PADR = 30;
	const PADT = 10;
	const PADB = 22;
	const months = $derived(data?.monthly ?? []);
	const isAll = $derived(data ? data.year === null : chartYear === 'all');
	const maxMin = $derived(Math.max(1, ...months.map((m) => Math.ceil(m.minutes / 10) * 10)));
	const step = $derived(months.length > 1 ? (W - PADL - PADR) / (months.length - 1) : 0);
	const px = (i: number) => (months.length > 1 ? PADL + i * step : (PADL + W - PADR) / 2);
	const pyMin = (v: number) => H - PADB - (v / maxMin) * (H - PADT - PADB);
	const pyPct = (v: number) => H - PADB - (v / 100) * (H - PADT - PADB);
	const linePath = (fn: (m: { minutes: number; pctOfMonth: number }) => number) =>
		months.map((m, i) => `${i ? 'L' : 'M'}${px(i)},${fn(m)}`).join(' ');
	// x labels: month initials for a single year; the year at each January
	// (and the first month) for all time
	const xLabels = $derived(
		isAll
			? months
					.map((m, i) => ({ i, m }))
					.filter(({ m, i }) => m.month === 1 || (i === 0 && m.month <= 9))
					.map(({ i, m }) => ({ i, text: String(m.year), anchor: i === 0 ? 'start' : 'middle' }))
			: months.map((m, i) => ({ i, text: MONTHS[m.month - 1][0], anchor: 'middle' }))
	);
	const peak = $derived(
		months.reduce<(typeof months)[number] | null>(
			(best, m) => (!best || m.minutes > best.minutes ? m : best),
			null
		)
	);

	let hoverIdx = $state<number | null>(null);
	let chartTip = $state<{ x: number; y: number; text: string } | null>(null);
	const tipText = (m: (typeof months)[number]) =>
		`${MONTHS[m.month - 1]} ${m.year} · ${fmt(m.minutes)} min · ${m.pctOfMonth.toFixed(1)}%`;

	function keydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={keydown} />

{#snippet ratedRow(al: ArtistDetail['ratedAlbums'][number])}
	<span
		class="h-10 w-10 shrink-0 overflow-hidden rounded-[2px] shadow-[0_2px_8px_rgba(24,32,26,.14)]"
	>
		<Sleeve
			album={{ id: al.id, accent_1: al.accent_1, accent_2: al.accent_2 }}
			cover={al.cover_url}
			alt="{al.name} — album cover"
		/>
	</span>
	<span class="min-w-0 flex-1">
		<span class="block truncate text-[14px]">{al.name}</span>
		<span class="u-caps font-mono text-[10px] text-ink-faint">
			{al.release_date?.slice(0, 4) ?? '—'} · Rated {al.date_rated
				? new Date(al.date_rated + 'T00:00:00').toLocaleDateString('en-US', {
						month: 'short',
						year: 'numeric'
					})
				: '—'}
		</span>
	</span>
	<span class="font-mono text-lg" style="border-bottom:2px solid var(--color-copper)">
		{rate(al.rating)}
	</span>
{/snippet}

<div class="fixed inset-0 z-50">
	<button
		aria-label="Close artist detail"
		class="absolute inset-0 bg-ink/45 backdrop-blur-[1px]"
		onclick={onclose}
	></button>

	<div
		use:focusTrap
		role="dialog"
		aria-modal="true"
		aria-label="{data?.name ?? 'Artist'} detail"
		tabindex="-1"
		data-surface="dark"
		class="noscroll absolute inset-y-0 right-0 w-full max-w-[640px] overflow-x-hidden overflow-y-auto bg-[#12160f] text-[#e6ebe2] shadow-[-24px_0_60px_rgba(16,22,18,.4)] outline-none"
		style="
			background:
				radial-gradient(135% 42% at 50% 0%, color-mix(in oklab, {c2} 58%, transparent) 0%, transparent 68%),
				radial-gradient(100% 55% at 0% 100%, color-mix(in oklab, {c1} 26%, transparent) 0%, transparent 55%),
				linear-gradient(178deg,
					color-mix(in oklab, {c1} 74%, #0b0e0c) 0%,
					color-mix(in oklab, {c1} 32%, #0f120d) 42%,
					color-mix(in oklab, {c1} 16%, #0d0f0b) 100%);
			animation: hm-slide-in 300ms cubic-bezier(.22,.7,.2,1);
		"
	>
		<div class="p-7">
			<div class="flex items-start justify-between">
				<p class="u-caps font-mono text-[11px] tracking-[0.18em] text-white/45">Artist detail</p>
				<button
					type="button"
					aria-label="Close artist detail"
					onclick={onclose}
					class="grid size-10 place-items-center rounded-full border border-white/25 text-white/80 transition-colors duration-150 hover:border-copper-light hover:text-copper-light"
				>
					<span aria-hidden="true">✕</span>
				</button>
			</div>

			<div class="mt-6 flex items-center gap-5">
				<Monogram name={data?.name ?? '…'} src={data?.image_url} size={84} />
				<div class="min-w-0">
					<p class="u-caps font-mono text-[10px] tracking-[0.12em] text-white/45">
						{data
							? `${data.ratedCount} rated record${data.ratedCount === 1 ? '' : 's'} in the index`
							: ' '}
					</p>
					<h2
						class="u-caps mt-1 font-display text-[clamp(24px,4.6vw,34px)] leading-[1.02] font-bold break-words"
						style="font-variation-settings:'wdth' 110"
					>
						{data ? noOrphan(data.name) : 'Loading…'}
					</h2>
				</div>
			</div>

			{#if loading && !data}
				<div class="mt-8 h-40 animate-pulse rounded bg-white/5"></div>
			{:else if data}
				<div class="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-[3px] bg-white/10 text-sm">
					{#each [['Lifetime minutes', fmt(data.lifetimeMinutes)], ['First listened', dateLong(data.firstListened)], data.year === null ? ['Peak month', peak && peak.minutes > 0 ? `${MONTHS[peak.month - 1]} ${peak.year} · ${fmt(peak.minutes)}` : '—'] : [`Minutes in ${data.year}`, fmt(data.yearMinutes)]] as [k, v] (k)}
						<div class="bg-[#12160f]/50 p-3">
							<p class="u-caps font-mono text-[9px] tracking-[0.14em] text-white/40">{k}</p>
							<p class="mt-1 font-mono">{v}</p>
						</div>
					{/each}
				</div>

				<div class="mt-7 flex flex-wrap items-center justify-between gap-3">
					<p class="u-caps font-mono text-[10px] tracking-[0.14em] text-white/40">
						Minutes by month
					</p>
					<YearPills {years} selected={chartYear} onselect={(y) => (chartYear = y)} showAllTime />
				</div>
				<div class="u-caps mt-2 flex gap-4 font-mono text-[9px] tracking-[0.1em] text-white/45">
					<span class="flex items-center gap-1.5"
						><span class="h-[2px] w-4 bg-copper-light"></span>Minutes (left)</span
					>
					<span class="flex items-center gap-1.5"
						><span class="h-0 w-4 border-t border-dashed border-white/40"></span>% of all listening
						(right)</span
					>
				</div>

				<svg
					viewBox="0 0 {W} {H}"
					class="mt-2 w-full overflow-visible"
					class:opacity-40={loading}
					role="img"
					aria-label="Minutes by month{isAll ? ', all time' : ` in ${data.year}`}"
					onmouseleave={() => {
						hoverIdx = null;
						chartTip = null;
					}}
				>
					<!-- gridlines + left (minutes) / right (%) axis ticks -->
					{#each [0, 0.5, 1] as g (g)}
						{@const y = H - PADB - g * (H - PADT - PADB)}
						<line x1={PADL} x2={W - PADR} y1={y} y2={y} stroke="rgba(255,255,255,.09)" />
						<text
							x={PADL - 5}
							{y}
							dy="3"
							text-anchor="end"
							font-size="8"
							fill="rgba(255,255,255,.4)"
							font-family="monospace"
						>
							{Math.round(g * maxMin)}
						</text>
						<text
							x={W - PADR + 5}
							{y}
							dy="3"
							text-anchor="start"
							font-size="8"
							fill="rgba(255,255,255,.3)"
							font-family="monospace"
						>
							{Math.round(g * 100)}%
						</text>
					{/each}
					{#each xLabels as l (l.i)}
						<text
							x={px(l.i)}
							y={H - 6}
							text-anchor={l.anchor}
							font-size="8"
							fill="rgba(255,255,255,.32)"
							font-family="monospace">{l.text}</text
						>
						{#if isAll}
							<line
								x1={px(l.i)}
								x2={px(l.i)}
								y1={H - PADB}
								y2={H - PADB + 3}
								stroke="rgba(255,255,255,.2)"
							/>
						{/if}
					{/each}
					{#if hoverIdx !== null && months[hoverIdx]}
						<line
							x1={px(hoverIdx)}
							x2={px(hoverIdx)}
							y1={PADT}
							y2={H - PADB}
							stroke="rgba(255,255,255,.18)"
						/>
					{/if}
					<path
						d={linePath((m) => pyPct(m.pctOfMonth))}
						fill="none"
						stroke="rgba(255,255,255,.38)"
						stroke-width={isAll ? 1 : 1.5}
						stroke-dasharray="3 3"
					/>
					<path
						d={linePath((m) => pyMin(m.minutes))}
						fill="none"
						stroke="var(--color-copper-light)"
						stroke-width={isAll ? 1.5 : 2}
						stroke-linejoin="round"
					/>
					{#each months as m, i (`${m.year}-${m.month}`)}
						{#if !isAll || hoverIdx === i}
							<circle cx={px(i)} cy={pyPct(m.pctOfMonth)} r="2" fill="rgba(255,255,255,.4)" />
							<circle
								cx={px(i)}
								cy={pyMin(m.minutes)}
								r={hoverIdx === i ? 4 : 3}
								fill="var(--color-copper-light)"
							/>
						{/if}
						<!-- full-height hit band per month -->
						<rect
							x={px(i) - Math.max(step, 8) / 2}
							y={PADT}
							width={Math.max(step, 8)}
							height={H - PADT - PADB}
							fill="transparent"
							role="presentation"
							onmouseenter={(e) => {
								hoverIdx = i;
								chartTip = { x: e.clientX, y: e.clientY, text: tipText(m) };
							}}
							onmousemove={(e) =>
								chartTip && (chartTip = { ...chartTip, x: e.clientX, y: e.clientY })}
						/>
					{/each}
				</svg>
				{#if chartTip}
					<div
						class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-sm bg-ink px-2 py-1 font-mono text-[10px] whitespace-nowrap text-paper"
						style="left:{chartTip.x}px; top:{chartTip.y}px"
					>
						{chartTip.text}
					</div>
				{/if}

				<p class="u-caps mt-7 font-mono text-[10px] tracking-[0.14em] text-white/40">
					Minutes by year
				</p>
				<div class="mt-2">
					<BarChart
						data={byYearBars}
						selected={chartYear === 'all' ? null : chartYear}
						onselect={(y) => (chartYear = y)}
						height={110}
					/>
				</div>

				{#if data.topSongs.length}
					<div class="mt-7 flex items-baseline justify-between">
						<p class="u-caps font-mono text-[10px] tracking-[0.14em] text-white/40">Top songs</p>
						<p class="u-caps font-mono text-[9px] tracking-[0.12em] text-white/30">Times played</p>
					</div>
					<ul class="mt-2">
						{#each data.topSongs as s, i (s.uri)}
							<li
								class="grid grid-cols-[1.5rem_2rem_1fr_auto] items-center gap-3 border-b border-white/8 py-2 last:border-0"
							>
								<span class="font-mono text-[11px] text-white/30"
									>{String(i + 1).padStart(2, '0')}</span
								>
								<span class="h-8 w-8 overflow-hidden rounded-[2px]">
									{#if s.cover_url}<img
											src={s.cover_url}
											alt="{s.album ?? s.name} — cover art"
											class="h-full w-full object-cover"
										/>{/if}
								</span>
								<span class="min-w-0">
									<span class="block truncate text-[13px]">{s.name}</span>
									{#if s.album}<span class="block truncate font-mono text-[10px] text-white/40"
											>{s.album}</span
										>{/if}
								</span>
								<span class="font-mono text-[13px] text-copper-light">{fmt(s.plays)}</span>
							</li>
						{/each}
					</ul>
				{/if}

				{#if data.ratedAlbums.length}
					<div class="mt-7 overflow-hidden rounded-[3px] bg-white px-3 pt-4 pb-3 text-ink">
						<p class="u-caps mb-2 px-2 font-mono text-[10px] tracking-[0.14em] text-ink-faint">
							Rated in my library
						</p>
						<ul class="space-y-0.5">
							{#each data.ratedAlbums as al (al.id)}
								<li>
									{#if onalbum}
										<button
											type="button"
											onclick={() => onalbum(al.id)}
											aria-label="Open {al.name}"
											class="flex w-full items-center gap-3 rounded-[2px] px-2 py-1.5 text-left transition-colors duration-150 hover:bg-rowhover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-copper"
										>
											{@render ratedRow(al)}
										</button>
									{:else}
										<div class="flex items-center gap-3 px-2 py-1.5">{@render ratedRow(al)}</div>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
