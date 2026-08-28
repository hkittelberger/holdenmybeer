<script lang="ts">
	import { fmt } from './tokens';
	import type { DiscoveryMonth } from '../../routes/music/stats/+page.server';

	let { months, mode }: { months: DiscoveryMonth[]; mode: 'artists' | 'tracks' } = $props();

	const MONTHS = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];

	const rows = $derived(
		months.map((m) => ({
			month: m.month,
			nw: mode === 'artists' ? m.artist_new : m.track_new,
			rp: mode === 'artists' ? m.artist_repeat : m.track_repeat
		}))
	);
	const max = $derived(Math.max(1, ...rows.map((r) => r.nw + r.rp)));

	type Seg = 'nw' | 'rp';
	let tip = $state<{ x: number; y: number; text: string } | null>(null);
	let hover = $state<{ month: number; seg: Seg } | null>(null);

	function enter(e: MouseEvent, month: number, seg: Seg, n: number) {
		hover = { month, seg };
		const kind = seg === 'nw' ? 'New' : 'Repeat';
		tip = {
			x: e.clientX,
			y: e.clientY,
			text: `${kind} ${mode} in ${MONTHS[month - 1]}: ${fmt(n)}`
		};
	}
	function move(e: MouseEvent) {
		if (tip) tip = { ...tip, x: e.clientX, y: e.clientY };
	}
	function leave() {
		tip = null;
		hover = null;
	}
	const isHot = (month: number, seg: Seg) => hover?.month === month && hover.seg === seg;
	const dimmed = (month: number, seg: Seg) => hover !== null && !isHot(month, seg);
</script>

<div class="flex gap-1.5" style="height:210px">
	{#each rows as r (r.month)}
		{@const total = r.nw + r.rp}
		<div class="flex flex-1 flex-col items-center">
			<span
				class="mb-1 font-mono text-[9px] transition-colors {hover?.month === r.month
					? 'text-copper'
					: 'text-ink-faint'}">{total > 0 ? fmt(total) : ''}</span
			>
			<div class="flex w-full flex-1 items-end">
				<div class="flex w-full flex-col" style="height:max(2px, {(total / max) * 100}%)">
					{#if r.nw > 0}
						<button
							class="w-full bg-copper transition-[filter,opacity] duration-150"
							style="flex:{r.nw}; {isHot(r.month, 'nw')
								? 'filter:brightness(1.12); box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.6)'
								: ''} {dimmed(r.month, 'nw') ? 'opacity:.45' : ''}"
							aria-label={`${MONTHS[r.month - 1]}: ${r.nw} new`}
							onmouseenter={(e) => enter(e, r.month, 'nw', r.nw)}
							onmousemove={move}
							onmouseleave={leave}
						></button>
					{/if}
					{#if r.rp > 0}
						<button
							class="w-full bg-bar-inactive transition-[filter,opacity] duration-150"
							style="flex:{r.rp}; {isHot(r.month, 'rp')
								? 'filter:brightness(1.08); box-shadow:inset 0 0 0 1.5px rgba(24,32,26,.4)'
								: ''} {dimmed(r.month, 'rp') ? 'opacity:.45' : ''}"
							aria-label={`${MONTHS[r.month - 1]}: ${r.rp} repeat`}
							onmouseenter={(e) => enter(e, r.month, 'rp', r.rp)}
							onmousemove={move}
							onmouseleave={leave}
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
