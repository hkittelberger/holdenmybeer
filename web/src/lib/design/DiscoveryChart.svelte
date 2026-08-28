<script lang="ts">
	import { fmt } from './tokens';
	import type { DiscoveryMonth } from '../../routes/music/stats/+page.server';

	let { months, mode }: { months: DiscoveryMonth[]; mode: 'artists' | 'tracks' } = $props();

	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	const rows = $derived(
		months.map((m) => ({
			month: m.month,
			nw: mode === 'artists' ? m.artist_new : m.track_new,
			rp: mode === 'artists' ? m.artist_repeat : m.track_repeat
		}))
	);
	const max = $derived(Math.max(1, ...rows.map((r) => r.nw + r.rp)));

	let tip = $state<{ x: number; y: number; text: string } | null>(null);
	function show(e: MouseEvent, label: string, n: number) {
		tip = { x: e.clientX, y: e.clientY, text: `${label}: ${fmt(n)}` };
	}
</script>

<div class="flex gap-1.5" style="height:210px">
	{#each rows as r (r.month)}
		{@const total = r.nw + r.rp}
		<div class="flex flex-1 flex-col items-center">
			<span class="mb-1 font-mono text-[9px] text-ink-faint">{total > 0 ? fmt(total) : ''}</span>
			<div class="flex w-full flex-1 items-end">
				<div class="flex w-full flex-col" style="height:max(2px, {(total / max) * 100}%)">
					{#if r.nw > 0}
						<button
							class="w-full bg-copper"
							style="flex:{r.nw}"
							aria-label={`${MONTHS[r.month - 1]}: ${r.nw} new`}
							onmouseenter={(e) => show(e, `New ${mode} in ${MONTHS[r.month - 1]}`, r.nw)}
							onmousemove={(e) => tip && show(e, `New ${mode} in ${MONTHS[r.month - 1]}`, r.nw)}
							onmouseleave={() => (tip = null)}
						></button>
					{/if}
					{#if r.rp > 0}
						<button
							class="w-full bg-bar-inactive"
							style="flex:{r.rp}"
							aria-label={`${MONTHS[r.month - 1]}: ${r.rp} repeat`}
							onmouseenter={(e) => show(e, `Repeat ${mode} in ${MONTHS[r.month - 1]}`, r.rp)}
							onmousemove={(e) => tip && show(e, `Repeat ${mode} in ${MONTHS[r.month - 1]}`, r.rp)}
							onmouseleave={() => (tip = null)}
						></button>
					{/if}
				</div>
			</div>
			<span class="mt-1.5 font-mono text-[9px] text-ink-faintest">{MONTHS[r.month - 1][0]}</span>
		</div>
	{/each}
</div>

{#if tip}
	<div
		class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-sm bg-ink px-2 py-1 font-mono text-[10px] whitespace-nowrap text-paper"
		style="left:{tip.x}px; top:{tip.y}px"
	>
		{tip.text}
	</div>
{/if}
