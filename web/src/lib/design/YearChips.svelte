<script lang="ts">
	// Year selector on the light Stats page. Real links (?year=N) so SvelteKit
	// preloads the next year's data on hover/tap; `pending` shows the tapped
	// year lit while its data loads. Wraps to rows on narrow screens; becomes
	// a connected segmented control from `sm` up.
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

<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
	{#if label}
		<span class="u-caps font-mono text-[10px] tracking-[0.14em] text-ink-faint">{label}</span>
	{/if}
	<div
		class="flex flex-wrap gap-1 sm:inline-flex sm:gap-0 sm:overflow-hidden sm:rounded-sm sm:border sm:border-border-strong"
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
				class="flex h-8 min-w-[3.25rem] items-center justify-center rounded-sm border border-border-strong px-2 font-mono text-[11px] tracking-[0.04em] transition-colors sm:min-w-0 sm:rounded-none sm:border-0 sm:px-2.5 {i >
				0
					? 'sm:border-l sm:border-border-strong'
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
