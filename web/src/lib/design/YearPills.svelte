<script lang="ts">
	// Individual outlined pills — the dark-panel variant used in the detail
	// modals (matches the hi-fi artist popup). Distinct from YearChips, which
	// is the connected segmented control on the light Stats page.
	let {
		years,
		selected,
		onselect
	}: { years: number[]; selected: number; onselect: (y: number) => void } = $props();
</script>

<div class="flex flex-wrap gap-1.5">
	{#each years as y (y)}
		<button
			onclick={() => onselect(y)}
			aria-pressed={y === selected}
			class="rounded-[2px] border px-2.5 py-1 font-mono text-[11px] tracking-[0.04em] transition-colors {y ===
			selected
				? 'border-copper-light bg-copper-light/12 text-copper-light'
				: 'border-white/20 text-white/45 hover:border-white/40 hover:text-white/70'}"
		>
			{y}
		</button>
	{/each}
</div>
