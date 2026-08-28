<script lang="ts">
	import type { DiscoveryMonth } from '../../routes/music/stats/+page.server';

	let { months, mode }: { months: DiscoveryMonth[]; mode: 'artists' | 'tracks' } = $props();

	const MO = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

	const rows = $derived(
		months.map((m) => ({
			month: m.month,
			nw: mode === 'artists' ? m.artist_new : m.track_new,
			rp: mode === 'artists' ? m.artist_repeat : m.track_repeat
		}))
	);
	const max = $derived(Math.max(1, ...rows.map((r) => r.nw + r.rp)));
</script>

<div class="flex gap-1.5" style="height:200px">
	{#each rows as r (r.month)}
		{@const total = r.nw + r.rp}
		<div class="flex flex-1 flex-col items-center">
			<div class="flex w-full flex-1 items-end">
				<div class="flex w-full flex-col-reverse" style="height:max(2px, {(total / max) * 100}%)">
					{#if r.nw > 0}<div class="w-full bg-copper" style="flex:{r.nw}"></div>{/if}
					{#if r.rp > 0}<div class="w-full bg-bar-inactive" style="flex:{r.rp}"></div>{/if}
				</div>
			</div>
			<span class="mt-1.5 font-mono text-[9px] text-ink-faintest">{MO[r.month - 1]}</span>
		</div>
	{/each}
</div>
