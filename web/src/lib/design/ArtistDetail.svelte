<script lang="ts">
	import Monogram from './Monogram.svelte';
	import Sleeve from './Sleeve.svelte';
	import BarChart from './BarChart.svelte';
	import YearPills from './YearPills.svelte';
	import { rate, fmt, dateLong, noOrphan } from './tokens';
	import type { ArtistDetail } from '../../routes/music/stats/artist/[id]/+server';

	let {
		id,
		years,
		year,
		onclose
	}: { id: string; years: number[]; year: number; onclose: () => void } = $props();

	// svelte-ignore state_referenced_locally -- intentional: seed the picker once
	let chartYear = $state(year);
	let data = $state<ArtistDetail | null>(null);
	let loading = $state(true);

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
	const H = 158;
	const PADL = 34;
	const PADR = 30;
	const PADT = 10;
	const PADB = 16;
	const maxMin = $derived(
		Math.max(1, ...(data?.monthly.map((m) => Math.ceil(m.minutes / 10) * 10) ?? [1]))
	);
	const px = (i: number) => PADL + (i / 11) * (W - PADL - PADR);
	const pyMin = (v: number) => H - PADB - (v / maxMin) * (H - PADT - PADB);
	const pyPct = (v: number) => H - PADB - (v / 100) * (H - PADT - PADB);
	const linePath = (fn: (m: { minutes: number; pctOfMonth: number }) => number) =>
		(data?.monthly ?? []).map((m, i) => `${i ? 'L' : 'M'}${px(i)},${fn(m)}`).join(' ');

	let chartTip = $state<{ x: number; y: number; text: string } | null>(null);

	function keydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={keydown} />

<div class="fixed inset-0 z-50">
	<button
		aria-label="Close"
		class="absolute inset-0 bg-ink/45 backdrop-blur-[1px]"
		onclick={onclose}
	></button>

	<div
		role="dialog"
		aria-modal="true"
		aria-label="Artist detail"
		class="noscroll absolute inset-y-0 right-0 w-full max-w-[640px] overflow-x-hidden overflow-y-auto bg-[#151a22] text-[#e6ebe2] shadow-[-24px_0_60px_rgba(16,22,18,.4)]"
		style="background-image:radial-gradient(120% 55% at 100% 0%, rgba(158,92,52,.28), transparent 55%); animation:hm-slide-in 300ms cubic-bezier(.22,.7,.2,1)"
	>
		<div class="p-7">
			<div class="flex items-start justify-between">
				<p class="u-caps font-mono text-[11px] tracking-[0.18em] text-white/45">Artist detail</p>
				<button
					aria-label="Close"
					onclick={onclose}
					class="grid size-9 place-items-center rounded-full border border-white/25 text-white/80 hover:border-copper-light hover:text-copper-light"
				>
					✕
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
					{#each [['Lifetime minutes', fmt(data.lifetimeMinutes)], ['First listened', dateLong(data.firstListened)], [`Minutes in ${chartYear}`, fmt(data.yearMinutes)]] as [k, v] (k)}
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
					<YearPills {years} selected={chartYear} onselect={(y) => (chartYear = y)} />
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

				<svg viewBox="0 0 {W} {H}" class="mt-2 w-full overflow-visible" class:opacity-40={loading}>
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
					<path
						d={linePath((m) => pyPct(m.pctOfMonth))}
						fill="none"
						stroke="rgba(255,255,255,.38)"
						stroke-width="1.5"
						stroke-dasharray="3 3"
					/>
					<path
						d={linePath((m) => pyMin(m.minutes))}
						fill="none"
						stroke="var(--color-copper-light)"
						stroke-width="2"
					/>
					{#each data.monthly as m, i (m.month)}
						<circle cx={px(i)} cy={pyPct(m.pctOfMonth)} r="2" fill="rgba(255,255,255,.4)" />
						<circle cx={px(i)} cy={pyMin(m.minutes)} r="3" fill="var(--color-copper-light)" />
						<circle
							cx={px(i)}
							cy={pyMin(m.minutes)}
							r="10"
							fill="transparent"
							style="cursor:pointer"
							onmouseenter={(e) =>
								(chartTip = {
									x: e.clientX,
									y: e.clientY,
									text: `${MONTHS[i]} · ${fmt(m.minutes)} min · ${m.pctOfMonth.toFixed(1)}%`
								})}
							onmousemove={(e) =>
								chartTip && (chartTip = { ...chartTip, x: e.clientX, y: e.clientY })}
							onmouseleave={() => (chartTip = null)}
							role="img"
							aria-label={`${MONTHS[i]}: ${m.minutes} minutes, ${m.pctOfMonth.toFixed(1)}%`}
						/>
					{/each}
				</svg>
				<div
					class="flex justify-between font-mono text-[8px] text-white/30"
					style="padding-left:{PADL}px; padding-right:{PADR}px"
				>
					{#each MONTHS as mo, i (i)}<span>{mo[0]}</span>{/each}
				</div>
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
						selected={chartYear}
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
					<div class="mt-7 bg-white p-5 text-ink">
						<p class="u-caps mb-2 font-mono text-[10px] tracking-[0.14em] text-ink-faint">
							Rated in my library
						</p>
						<ul class="space-y-2">
							{#each data.ratedAlbums as al (al.id)}
								<li class="flex items-center gap-3">
									<span class="h-9 w-9 shrink-0 overflow-hidden rounded-[2px]">
										<Sleeve album={{ id: al.id, accent_1: al.accent_1, accent_2: al.accent_2 }} />
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
									<span
										class="font-mono text-lg"
										style="border-bottom:2px solid var(--color-copper)"
									>
										{rate(al.rating)}
									</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
