<script lang="ts">
	// Year selector on the light Stats page. Real links (?year=N, or ?year=all)
	// so SvelteKit preloads the next view's data on hover/tap; `pending` shows
	// the tapped entry lit while its data loads. Wraps to rows on narrow
	// screens; becomes a connected segmented control from `sm` up.
	type Value = number | 'all';
	let {
		years,
		selected,
		pending = null,
		href,
		label = 'Year',
		showAllTime = false
	}: {
		years: number[];
		selected: Value;
		pending?: Value | null;
		href: (y: Value) => string;
		label?: string;
		showAllTime?: boolean;
	} = $props();

	const entries = $derived<{ value: Value; text: string }[]>([
		...(showAllTime ? [{ value: 'all' as const, text: 'All time' }] : []),
		...years.map((y) => ({ value: y, text: String(y) }))
	]);
</script>

<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
	{#if label}
		<span class="u-caps font-mono text-[10px] tracking-[0.14em] text-ink-faint">{label}</span>
	{/if}
	<div
		class="flex flex-wrap gap-1 sm:inline-flex sm:gap-0 sm:overflow-hidden sm:rounded-sm sm:border sm:border-border-strong"
		role="group"
		aria-label="Filter by year"
	>
		{#each entries as e, i (e.value)}
			{@const active = e.value === (pending ?? selected)}
			<a
				href={href(e.value)}
				data-sveltekit-noscroll
				data-sveltekit-keepfocus
				aria-current={e.value === selected ? 'true' : undefined}
				class="flex h-8 min-w-[3.25rem] items-center justify-center rounded-sm border border-border-strong px-2 font-mono text-[11px] leading-none tracking-[0.04em] whitespace-nowrap transition-colors sm:h-[26px] sm:min-w-0 sm:rounded-none sm:border-0 sm:px-2.5 {i >
				0
					? 'sm:border-l sm:border-border-strong'
					: ''} {active
					? 'bg-copper text-copper-text'
					: 'bg-field text-ink-muted hover:bg-zebra hover:text-copper'} {pending === e.value
					? 'animate-pulse'
					: ''}"
			>
				{e.text}
			</a>
		{/each}
	</div>
</div>
