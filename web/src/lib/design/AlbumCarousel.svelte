<script lang="ts">
	import Sleeve from './Sleeve.svelte';
	import { rate, hmmss, noOrphan } from './tokens';
	import type { CatalogueAlbum } from '../../routes/music/+page.server';

	let {
		albums,
		hero = $bindable(0),
		onopen
	}: { albums: CatalogueAlbum[]; hero?: number; onopen: (id: string) => void } = $props();

	const n = $derived(albums.length);
	const heroAlbum = $derived(albums[hero]);

	function move(d: number) {
		hero = (hero + d + n) % n;
	}

	// Horizontal drag on the band. We DON'T capture the pointer (that would
	// swallow the child buttons' click events on desktop); we just watch the
	// delta and, if it's a real drag, step the wheel and suppress the click.
	let downX = 0;
	let dragged = false;
	function pointerDown(e: PointerEvent) {
		downX = e.clientX;
		dragged = false;
	}
	function pointerMove(e: PointerEvent) {
		if (e.buttons !== 1) return;
		if (Math.abs(e.clientX - downX) > 8) dragged = true;
	}
	function pointerUp(e: PointerEvent) {
		if (!dragged) return;
		const dx = e.clientX - downX;
		if (Math.abs(dx) > 40) move(dx < 0 ? 1 : -1);
	}

	// offset in [-2..2] relative to hero, wrapping
	function rel(i: number): number {
		let d = i - hero;
		if (d > n / 2) d -= n;
		if (d < -n / 2) d += n;
		return d;
	}
	// dx / rot are per-level *magnitudes*; the sign comes from the offset.
	// dx is a fraction (×100) of the hero sleeve's own width (--hw). Tuned so
	// each sleeve clears the previous one — paper shows between them.
	const DX = [0, 90, 158, 196];
	const ROT = [0, 7, 15, 19];
	const layout = (d: number) => {
		const a = Math.min(3, Math.abs(d));
		const sign = Math.sign(d);
		if (a === 0) return { dx: 0, s: 1, r: 0, f: 'none', z: 30, o: 1 };
		if (a === 1)
			return {
				dx: sign * DX[1],
				s: 0.72,
				r: sign * ROT[1],
				f: 'saturate(.72) brightness(.84)',
				z: 20,
				o: 1
			};
		if (a === 2)
			return { dx: sign * DX[2], s: 0.52, r: sign * ROT[2], f: 'brightness(.66)', z: 10, o: 1 };
		return { dx: sign * DX[3], s: 0.42, r: sign * ROT[3], f: 'brightness(.5)', z: 0, o: 0 };
	};

	function clickSleeve(d: number, id: string, i: number) {
		if (dragged) return;
		if (d === 0) onopen(id);
		else move(d > 0 ? 1 : -1);
	}

	const yearOf = (a: CatalogueAlbum) => (a.release_date ? a.release_date.slice(0, 4) : '');
</script>

<div class="select-none">
	<div
		class="relative mx-auto"
		style="--hw:clamp(160px, 26vw, 312px); height:calc(var(--hw) + 12px); max-width:min(1040px, 98vw)"
		onpointerdown={pointerDown}
		onpointermove={pointerMove}
		onpointerup={pointerUp}
		role="group"
		aria-roledescription="carousel"
	>
		{#each albums as a, i (a.id)}
			{@const d = rel(i)}
			{@const L = layout(d)}
			<button
				class="absolute top-1/2 left-1/2 cursor-pointer transition-transform duration-[420ms] focus-visible:outline-[3px] focus-visible:outline-offset-[5px] focus-visible:outline-copper"
				style="
					width: var(--hw);
					transform: translate(-50%,-50%) translateX(calc({L.dx /
					100} * var(--hw))) scale({L.s}) rotate({L.r}deg);
					filter:{L.f}; z-index:{L.z}; opacity:{L.o};
					transition-timing-function: cubic-bezier(.22,.7,.2,1);
					pointer-events:{L.o === 0 ? 'none' : 'auto'};
				"
				aria-hidden={L.o === 0}
				aria-label={d === 0 ? `Open ${a.name}` : d < 0 ? 'Previous record' : 'Next record'}
				onclick={() => clickSleeve(d, a.id, i)}
			>
				<div
					class="relative"
					style="box-shadow:{d === 0
						? '0 26px 52px rgba(24,32,26,.34)'
						: '0 12px 30px rgba(10,14,11,.3)'}"
				>
					<Sleeve
						album={a}
						cover={a.cover_url}
						alt="{a.name} by {a.artist} — album cover"
						year={yearOf(a)}
					/>
					{#if d === 0}
						<span
							class="absolute right-0 -bottom-3 translate-x-3 bg-copper px-3 py-2 font-mono text-lg font-medium text-copper-text"
						>
							{rate(a.rating)}
						</span>
					{/if}
				</div>
			</button>
		{/each}
	</div>

	{#if heroAlbum}
		<!-- arrows anchor to the TOP of this block (a fixed distance below the
		     carousel); the title grows downward without moving them. -->
		<div class="mx-auto mt-7 grid max-w-[600px] grid-cols-[44px_1fr_44px] items-start gap-9">
			<button
				aria-label="Previous"
				onclick={() => move(-1)}
				class="mt-1 grid size-11 place-items-center justify-self-start rounded-full border border-ink-faint text-ink hover:border-copper hover:text-copper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper"
			>
				←
			</button>
			<div class="min-w-0 text-center">
				<p
					class="u-caps font-display text-[clamp(20px,2.8vw,30px)] leading-tight font-bold text-balance break-words text-ink"
					style="font-variation-settings:'wdth' 115"
				>
					{noOrphan(heroAlbum.name)}
				</p>
				<p class="mt-0.5 truncate text-ink-muted">{heroAlbum.artist}</p>
				<p class="u-caps mt-1.5 font-mono text-[11px] tracking-[0.1em] text-ink-faint">
					{yearOf(heroAlbum)} · {hmmss(heroAlbum.length_ms)} · Rated {rate(heroAlbum.rating)}
				</p>
			</div>
			<button
				aria-label="Next"
				onclick={() => move(1)}
				class="mt-1 grid size-11 place-items-center justify-self-end rounded-full border border-ink-faint text-ink hover:border-copper hover:text-copper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper"
			>
				→
			</button>
		</div>
		<div class="mt-3 flex justify-center gap-2">
			{#each albums as a, i (a.id)}
				<button
					aria-label={`Go to ${a.name}`}
					onclick={() => (hero = i)}
					class="h-2 rounded-full transition-all {i === hero
						? 'w-6 bg-copper'
						: 'w-2 border border-ink-faintest'}"
				></button>
			{/each}
		</div>
	{/if}
</div>
