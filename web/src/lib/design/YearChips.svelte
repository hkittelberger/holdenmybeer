<script lang="ts">
	// Connected segmented control on the light Stats page. Renders real links
	// (?year=N) so SvelteKit preloads the next year's data on hover/tap and
	// the switch is near-instant; `pending` shows the tapped year lit while
	// its data loads on a cold tap.
	let {
		years,
		selected,
		pending = null,
		href,
		label = 'Year'
	}: {
		years: number[];
		selected: number;
		pending?: number | null;
		href: (y: number) => string;
		label?: string;
	} = $props();
</script>

<div class="flex flex-wrap items-center gap-3">
	{#if label}
		<span class="u-caps font-mono text-[10px] tracking-[0.14em] text-ink-faint">{label}</span>
	{/if}
	<div
		class="inline-flex overflow-hidden rounded-sm border border-border-strong"
		role="group"
		aria-label="Filter by year"
	>
		{#each years as y, i (y)}
			{@const active = y === (pending ?? selected)}
			<a
				href={href(y)}
				data-sveltekit-noscroll
				data-sveltekit-keepfocus
				aria-current={y === selected ? 'true' : undefined}
				class="min-h-[32px] px-2.5 py-1 font-mono text-[11px] tracking-[0.04em] transition-colors {i >
				0
					? 'border-l border-border-strong'
					: ''} {active
					? 'bg-copper text-copper-text'
					: 'bg-field text-ink-muted hover:bg-zebra hover:text-copper'} {pending === y
					? 'animate-pulse'
					: ''}"
			>
				{y}
			</a>
		{/each}
	</div>
</div>
