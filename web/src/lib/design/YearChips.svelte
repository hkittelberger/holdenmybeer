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

<div class="flex flex-wrap items-center gap-2">
	{#if label}
		<span class="mr-1 font-mono text-[10px] tracking-[0.14em] text-ink-faint u-caps">{label}</span>
	{/if}
	{#each years as y (y)}
		<button
			onclick={() => onselect(y)}
			aria-pressed={y === selected}
			class="rounded-sm border px-2.5 py-1 font-mono text-[11px] tracking-[0.06em] {y === selected
				? 'border-copper bg-copper text-copper-text'
				: 'border-border-strong text-ink-muted hover:border-copper hover:text-copper'}"
		>
			{y}
		</button>
	{/each}
</div>
