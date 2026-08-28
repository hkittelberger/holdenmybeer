<script lang="ts">
	import Sleeve from './Sleeve.svelte';
	import { rate, fmt, dateLong, mmss, accents, noOrphan } from './tokens';
	import type { CatalogueAlbum } from '../../routes/music/+page.server';

	let { album, onclose }: { album: CatalogueAlbum; onclose: () => void } = $props();

	const [c1, c2] = $derived(accents(album));
	const maxPct = $derived(Math.max(1, ...album.tracks.map((t) => t.pct)));
	const topThree = $derived(
		album.top_songs
			.map((uri) => album.tracks.find((t) => t.uri === uri))
			.filter((t): t is NonNullable<typeof t> => !!t)
			.slice(0, 3)
	);

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
		aria-label={`${album.name} detail`}
		class="noscroll absolute inset-y-0 right-0 w-full max-w-[640px] overflow-x-hidden overflow-y-auto text-[#e6ebe2] shadow-[-24px_0_60px_rgba(16,22,18,.4)]"
		style="
			background:
				radial-gradient(120% 60% at 100% 0%, color-mix(in oklab, {c2} 60%, transparent) 0%, transparent 55%),
				linear-gradient(180deg, color-mix(in oklab, {c1} 82%, #0c0f0d) 0%, #12160f 60%);
			animation: hm-slide-in 300ms cubic-bezier(.22,.7,.2,1);
		"
	>
		<div class="p-7">
			<div class="flex items-start justify-between">
				<p class="u-caps font-mono text-[11px] tracking-[0.18em] text-white/45">Card detail</p>
				<button
					aria-label="Close"
					onclick={onclose}
					class="grid size-9 place-items-center rounded-full border border-white/25 text-white/80 hover:border-copper-light hover:text-copper-light"
				>
					✕
				</button>
			</div>

			<div class="mt-6 flex gap-4 sm:gap-6">
				<div
					class="h-[104px] w-[104px] shrink-0 overflow-hidden shadow-[0_12px_30px_rgba(10,14,11,.35)] sm:h-[152px] sm:w-[152px]"
				>
					<Sleeve
						{album}
						cover={album.cover_url}
						alt="{album.name} by {album.artist} — album cover"
					/>
				</div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm text-white/55">{album.artist}</p>
					<h2
						class="u-caps mt-1 font-display text-[clamp(20px,4.4vw,28px)] leading-[1.02] font-bold text-balance break-words"
						style="font-variation-settings:'wdth' 108"
					>
						{noOrphan(album.name)}
					</h2>
					<div class="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
						<span class="font-mono text-[clamp(28px,8vw,40px)] leading-none font-medium">
							{rate(album.rating)}
						</span>
						<span
							class="u-caps pb-1 font-mono text-[10px] leading-tight tracking-[0.12em] text-white/50"
						>
							Out of 10 · Rated {dateLong(album.date_rated)}
						</span>
					</div>
				</div>
			</div>

			{#if album.badges.length}
				<div class="mt-5 flex flex-wrap gap-2">
					{#each album.badges as b, i (b)}
						<span
							class="u-caps rounded-full border px-3 py-1 font-mono text-[10px] tracking-[0.1em] {i ===
								0 && b.startsWith('All-time')
								? 'border-copper-light/50 bg-copper-light/12 text-copper-light'
								: 'border-white/20 text-white/70'}"
						>
							{b.startsWith('All-time') ? '★' : '◆'}
							{b}
						</span>
					{/each}
				</div>
			{/if}

			{#snippet fact(k: string, v: string)}
				<div class="bg-[#12160f]/60 p-3">
					<p class="u-caps font-mono text-[9px] tracking-[0.14em] text-white/40">{k}</p>
					<p class="mt-1 font-mono">{v}</p>
				</div>
			{/snippet}
			<div class="mt-6 space-y-px overflow-hidden rounded-[3px] bg-white/10 text-sm">
				<div class="grid grid-cols-3 gap-px">
					{@render fact('Released', dateLong(album.release_date))}
					{@render fact('First listened', dateLong(album.first_listened))}
					{@render fact('Length', (album.length_estimated ? '≈ ' : '') + mmss(album.length_ms))}
				</div>
				<div class="grid grid-cols-2 gap-px">
					{@render fact('Lifetime minutes', fmt(album.lifetime_minutes))}
					{@render fact('Full plays ≈', fmt(album.plays))}
				</div>
			</div>

			{#if topThree.length}
				<p class="u-caps mt-7 font-mono text-[10px] tracking-[0.14em] text-white/40">
					My top three from this record
				</p>
				<ol class="mt-2">
					{#each topThree as t, i (t.uri)}
						<li class="flex items-center gap-3 border-b border-white/10 py-2.5 last:border-0">
							<span class="font-mono text-[11px] text-white/35"
								>{String(i + 1).padStart(2, '0')}</span
							>
							<span class="flex-1">{t.name}</span>
							<span class="font-mono text-[11px] text-white/45">{mmss(t.duration_ms)}</span>
						</li>
					{/each}
				</ol>
			{/if}

			{#if album.tracks.length <= 1}
				<p class="u-caps mt-7 font-mono text-[10px] tracking-[0.1em] text-white/30">
					Per-track breakdown fills in once the catalogue metadata finishes resolving.
				</p>
			{/if}

			{#if album.tracks.length > 1}
				<div class="mt-7 flex items-baseline justify-between">
					<p class="u-caps font-mono text-[10px] tracking-[0.14em] text-white/40">
						Share of my plays on this record
					</p>
					<p class="u-caps font-mono text-[9px] tracking-[0.12em] text-white/30">Track order ↓</p>
				</div>
				<ul class="mt-2 space-y-1.5">
					{#each album.tracks as t, i (t.uri)}
						<li class="flex items-center gap-3">
							<span class="w-5 font-mono text-[11px] text-white/30"
								>{String(i + 1).padStart(2, '0')}</span
							>
							<span class="w-[34%] shrink-0 truncate text-[13px]">{t.name}</span>
							<span class="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10">
								<span
									class="absolute inset-y-0 left-0 rounded-full"
									style="width:{Math.max(
										2,
										(t.pct / maxPct) * 100
									)}%;background:linear-gradient(90deg,{c2},var(--color-copper-light))"
								></span>
							</span>
							<span
								class="w-11 text-right font-mono text-[11px] {t.pct === maxPct
									? 'text-copper-light'
									: 'text-white/45'}"
							>
								{t.pct.toFixed(1)}%
							</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if album.review_notes}
				<div
					class="mt-7 bg-white text-[15px] text-ink"
					style="border-left:4px double var(--color-copper); padding:14px 22px 20px"
				>
					<p class="u-caps mb-2 font-mono text-[10px] tracking-[0.14em] text-ink-faint">
						Liner note
					</p>
					<p
						class="leading-[28px]"
						style="background-image:repeating-linear-gradient(to bottom, transparent 0 27px, #e0dccf 27px 28px); background-position:0 6px"
					>
						{album.review_notes}
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>
