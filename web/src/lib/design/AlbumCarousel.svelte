<script lang="ts">
	import Sleeve from './Sleeve.svelte';
	import { rate, hmmss } from './tokens';
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

	// horizontal drag on the whole band
	let downX = 0;
	let dragging = false;
	function pointerDown(e: PointerEvent) {
		downX = e.clientX;
		dragging = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function pointerUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		const dx = e.clientX - downX;
		if (Math.abs(dx) > 45) move(dx < 0 ? 1 : -1);
	}

	// offset in [-2..2] relative to hero, wrapping
	function rel(i: number): number {
		let d = i - hero;
		if (d > n / 2) d -= n;
		if (d < -n / 2) d += n;
		return d;
	}
	// dx is a fraction of the hero sleeve's own width (see CSS var --hw)
	const layout = (d: number) => {
		const a = Math.abs(d);
		if (a === 0) return { dx: 0, s: 1, r: 0, f: 'none', z: 30, o: 1 };
		if (a === 1)
			return { dx: d * 30, s: 0.72, r: d * 7, f: 'saturate(.72) brightness(.82)', z: 20, o: 1 };
		if (a === 2) return { dx: d * 60, s: 0.5, r: d * 13, f: 'brightness(.66)', z: 10, o: 1 };
		return { dx: d * 90, s: 0.4, r: d * 16, f: 'brightness(.5)', z: 0, o: 0 };
	};

	function yearOf(a: CatalogueAlbum) {
		return a.release_date ? a.release_date.slice(0, 4) : '';
	}
</script>

<div class="select-none">
	<div
		class="relative mx-auto"
		style="--hw:clamp(200px, 46vw, 306px); height:calc(var(--hw) + 40px); max-width:min(820px, 94vw)"
		onpointerdown={pointerDown}
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
					transform: translate(-50%,-50%) translateX(calc({L.dx / 100} * var(--hw))) scale({L.s}) rotate({L.r}deg);
					filter:{L.f}; z-index:{L.z}; opacity:{L.o};
					transition-timing-function: cubic-bezier(.22,.7,.2,1);
					pointer-events:{L.o === 0 ? 'none' : 'auto'};
				"
				aria-hidden={L.o === 0}
				aria-label={d === 0 ? `Open ${a.name}` : `Show ${a.name}`}
				onclick={() => (d === 0 ? onopen(a.id) : (hero = i))}
			>
				<div
					class="relative"
					style="box-shadow:{d === 0 ? '0 26px 52px rgba(24,32,26,.34)' : '0 12px 30px rgba(10,14,11,.3)'}"
				>
					<Sleeve album={a} year={yearOf(a)} />
					{#if d === 0}
						<span
							class="absolute -bottom-3 right-0 translate-x-3 bg-copper px-3 py-2 font-mono text-lg font-medium text-copper-text"
						>
							{rate(a.rating)}
						</span>
					{/if}
				</div>
			</button>
		{/each}
	</div>

	{#if heroAlbum}
		<div class="mt-8 flex items-center justify-center gap-8">
			<button
				aria-label="Previous"
				onclick={() => move(-1)}
				class="grid size-11 place-items-center rounded-full border border-ink-faint text-ink hover:border-copper hover:text-copper"
			>
				←
			</button>
			<div class="text-center">
				<p class="font-display text-[clamp(20px,2.6vw,28px)] font-bold text-ink u-caps" style="font-variation-settings:'wdth' 116">
					{heroAlbum.name}
				</p>
				<p class="mt-0.5 text-ink-muted">{heroAlbum.artist}</p>
				<p class="mt-2 font-mono text-[11px] tracking-[0.1em] text-ink-faint u-caps">
					{yearOf(heroAlbum)} · {hmmss(heroAlbum.length_ms)} · Rated {rate(heroAlbum.rating)}
				</p>
			</div>
			<button
				aria-label="Next"
				onclick={() => move(1)}
				class="grid size-11 place-items-center rounded-full border border-ink-faint text-ink hover:border-copper hover:text-copper"
			>
				→
			</button>
		</div>
		<div class="mt-4 flex justify-center gap-2">
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
