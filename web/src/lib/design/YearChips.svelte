<script lang="ts">
	let {
		years,
		selected,
		onselect,
		label = 'Year'
	}: {
		years: number[];
		selected: number;
		onselect: (y: number) => void;
		label?: string;
	} = $props();
</script>

<div class="flex flex-wrap items-center gap-3">
	{#if label}
		<span class="font-mono text-[10px] tracking-[0.14em] text-ink-faint u-caps">{label}</span>
	{/if}
	<div class="inline-flex overflow-hidden rounded-sm border border-border-strong">
		{#each years as y, i (y)}
			<button
				onclick={() => onselect(y)}
				aria-pressed={y === selected}
				class="px-2.5 py-1 font-mono text-[11px] tracking-[0.04em] {i > 0
					? 'border-l border-border-strong'
					: ''} {y === selected
					? 'bg-copper text-copper-text'
					: 'bg-field text-ink-muted hover:bg-zebra hover:text-copper'}"
			>
				{y}
			</button>
		{/each}
	</div>
</div>
