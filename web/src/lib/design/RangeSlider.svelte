<script lang="ts">
	// Dual-thumb range. Drag either thumb, click the track to move the
	// nearest, arrow keys to step. Handoff §4 "RangeSlider".
	let {
		min,
		max,
		step = 1,
		lo = $bindable(min),
		hi = $bindable(max),
		format = (n: number) => String(n),
		label
	}: {
		min: number;
		max: number;
		step?: number;
		lo?: number;
		hi?: number;
		format?: (n: number) => string;
		label: string;
	} = $props();

	let track = $state<HTMLDivElement>();
	let drag = $state<'lo' | 'hi' | null>(null);

	const pct = (v: number) => ((v - min) / (max - min)) * 100;
	const clampStep = (v: number) => {
		const s = Math.round((v - min) / step) * step + min;
		return Math.max(min, Math.min(max, s));
	};

	function valueAt(clientX: number): number {
		if (!track) return min;
		const r = track.getBoundingClientRect();
		return clampStep(min + ((clientX - r.left) / r.width) * (max - min));
	}

	function pointerDown(which: 'lo' | 'hi', e: PointerEvent) {
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		drag = which;
	}
	function pointerMove(e: PointerEvent) {
		if (!drag) return;
		const v = valueAt(e.clientX);
		if (drag === 'lo') lo = Math.min(v, hi);
		else hi = Math.max(v, lo);
	}
	function trackDown(e: PointerEvent) {
		const v = valueAt(e.clientX);
		if (Math.abs(v - lo) <= Math.abs(v - hi)) lo = Math.min(v, hi);
		else hi = Math.max(v, lo);
	}
	function key(which: 'lo' | 'hi', e: KeyboardEvent) {
		const d =
			e.key === 'ArrowLeft' || e.key === 'ArrowDown'
				? -step
				: e.key === 'ArrowRight' || e.key === 'ArrowUp'
					? step
					: e.key === 'Home'
						? -Infinity
						: e.key === 'End'
							? Infinity
							: 0;
		if (!d) return;
		e.preventDefault();
		if (which === 'lo') lo = Math.max(min, Math.min(clampStep(lo + d), hi));
		else hi = Math.min(max, Math.max(clampStep(hi + d), lo));
	}
</script>

<svelte:window onpointermove={pointerMove} onpointerup={() => (drag = null)} />

<div>
	<div class="flex items-baseline justify-between">
		<span class="u-caps font-mono text-[10px] tracking-[0.14em] text-ink-faint">{label}</span>
		<span class="font-mono text-[11px] text-ink-muted">
			{lo === hi ? format(lo) : `${format(lo)} – ${format(hi)}`}
		</span>
	</div>
	<div
		bind:this={track}
		onpointerdown={trackDown}
		role="presentation"
		class="relative mt-2 h-1 cursor-pointer rounded-full bg-border-disabled"
	>
		<div
			class="absolute h-full rounded-full bg-copper"
			style="left:{pct(lo)}%;right:{100 - pct(hi)}%"
		></div>
		{#each [{ w: 'lo', v: lo } as const, { w: 'hi', v: hi } as const] as thumb (thumb.w)}
			<button
				type="button"
				aria-label={`${label} ${thumb.w === 'lo' ? 'minimum' : 'maximum'}`}
				aria-valuenow={thumb.v}
				aria-valuemin={min}
				aria-valuemax={max}
				role="slider"
				onpointerdown={(e) => pointerDown(thumb.w, e)}
				onkeydown={(e) => key(thumb.w, e)}
				class="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-copper-deep bg-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper"
				style="left:{pct(thumb.v)}%"
			></button>
		{/each}
	</div>
</div>
