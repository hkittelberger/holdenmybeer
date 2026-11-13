<script lang="ts">
	// Individual outlined pills — the dark-panel variant used in the detail
	// modals (matches the hi-fi artist popup). Distinct from YearChips, which
	// is the connected segmented control on the light Stats page.
	type Value = number | 'all';
	let {
		years,
		selected,
		onselect,
		showAllTime = false,
		label = 'Show a different year'
	}: {
		years: number[];
		selected: Value;
		onselect: (y: Value) => void;
		showAllTime?: boolean;
		label?: string;
	} = $props();

	const entries = $derived<{ value: Value; text: string }[]>([
		...(showAllTime ? [{ value: 'all' as const, text: 'All time' }] : []),
		...years.map((y) => ({ value: y, text: String(y) }))
	]);
</script>

<div class="flex flex-wrap gap-1.5" role="group" aria-label={label}>
	{#each entries as e (e.value)}
		<button
			type="button"
			onclick={() => onselect(e.value)}
			aria-pressed={e.value === selected}
			aria-label="{e.text}{e.value === selected ? ' (showing)' : ''}"
			class="rounded-[2px] border px-2.5 py-1 font-mono text-[11px] tracking-[0.04em] transition-colors duration-150 {e.value ===
			selected
				? 'border-copper-light bg-copper-light/12 text-copper-light'
				: 'border-white/20 text-white/45 hover:border-copper-light/60 hover:text-copper-light'}"
		>
			{e.text}
		</button>
	{/each}
</div>
