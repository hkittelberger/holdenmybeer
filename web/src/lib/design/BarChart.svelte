<script lang="ts">
	import { fmt } from './tokens';

	let {
		data,
		selected,
		onselect,
		height = 220
	}: {
		data: { year: number; minutes: number }[];
		selected: number;
		onselect?: (y: number) => void;
		height?: number;
	} = $props();

	const max = $derived(Math.max(1, ...data.map((d) => d.minutes)));
</script>

<div class="flex gap-2" style="height:{height}px">
	{#each data as d (d.year)}
		{@const h = (d.minutes / max) * 100}
		<div class="flex flex-1 flex-col items-center">
			<span class="mb-1 font-mono text-[10px] text-ink-faint">{fmt(d.minutes)}</span>
			<div class="flex w-full flex-1 items-end">
				{#if onselect}
					<button
						onclick={() => onselect(d.year)}
						aria-pressed={d.year === selected}
						aria-label={`${d.year}: ${d.minutes} minutes`}
						class="w-full rounded-[1px] {d.year === selected
							? 'bg-copper'
							: 'bg-bar-inactive hover:bg-ink-faintest'}"
						style="height:max(3px, {h}%)"
					></button>
				{:else}
					<div
						class="w-full rounded-[1px] {d.year === selected ? 'bg-copper' : 'bg-bar-inactive'}"
						style="height:max(3px, {h}%)"
					></div>
				{/if}
			</div>
			<span class="mt-1.5 font-mono text-[10px] text-ink-faintest">{String(d.year).slice(2)}</span>
		</div>
	{/each}
</div>
