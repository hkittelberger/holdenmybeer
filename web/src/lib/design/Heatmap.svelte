<script lang="ts">
	import { fmt } from './tokens';

	let {
		year,
		days,
		quantiles
	}: {
		year: number;
		days: { day: string; minutes: number }[];
		quantiles: number[]; // 4 cut points
	} = $props();

	const HEAT = ['#e9dfd2', '#dcbfa2', '#c7936c', '#a96a3e', '#874c23'];
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

	const byDay = $derived(new Map(days.map((d) => [d.day, d.minutes])));
	const todayIso = new Date().toISOString().slice(0, 10);

	function bucket(min: number): number {
		if (min <= 0) return 0;
		let b = 1;
		for (const q of quantiles) if (min > q) b++;
		return Math.min(5, b);
	}

	// build a Mon-first grid: columns = weeks, rows = weekday
	interface Cell {
		iso: string;
		minutes: number;
		future: boolean;
		col: number;
		row: number;
	}
	const cells = $derived.by(() => {
		const out: Cell[] = [];
		const start = new Date(Date.UTC(year, 0, 1));
		const end = new Date(Date.UTC(year, 11, 31));
		// Monday=0 … Sunday=6
		const wd = (d: Date) => (d.getUTCDay() + 6) % 7;
		let col = 0;
		for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
			const iso = d.toISOString().slice(0, 10);
			const row = wd(d);
			if (iso !== start.toISOString().slice(0, 10) && row === 0) col++;
			out.push({
				iso,
				minutes: byDay.get(iso) ?? 0,
				future: iso > todayIso,
				col,
				row
			});
		}
		return out;
	});
	const weeks = $derived(Math.max(...cells.map((c) => c.col)) + 1);

	// month label positions: first column that contains day 1 of each month
	const monthCols = $derived(
		MONTHS.map((_, m) => {
			const first = cells.find((c) => c.iso.slice(5, 7) === String(m + 1).padStart(2, '0'));
			return first ? first.col : -1;
		})
	);

	let tip = $state<{ x: number; y: number; text: string } | null>(null);
	function show(e: MouseEvent, c: Cell) {
		if (c.future) return;
		const dt = new Date(c.iso + 'T00:00:00').toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
		tip = { x: e.clientX, y: e.clientY, text: `${dt} · ${fmt(c.minutes)} min` };
	}
</script>

<div class="overflow-x-auto">
	<div class="inline-block min-w-full" style="--cell:12px; --gap:3px">
		<!-- month row -->
		<div
			class="relative mb-1 ml-8 h-4 font-mono text-[10px] text-ink-faintest"
			style="width:calc({weeks} * (var(--cell) + var(--gap)))"
		>
			{#each MONTHS as mo, i (mo)}
				{#if monthCols[i] >= 0}
					<span
						class="u-caps absolute"
						style="left:calc({monthCols[i]} * (var(--cell) + var(--gap)))">{mo}</span
					>
				{/if}
			{/each}
		</div>

		<div class="flex gap-2">
			<div
				class="grid shrink-0 gap-[var(--gap)] font-mono text-[9px] text-ink-faintest"
				style="grid-template-rows:repeat(7, var(--cell))"
			>
				{#each ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'] as d, i (i)}
					<span class="flex items-center">{d}</span>
				{/each}
			</div>

			<div
				class="grid gap-[var(--gap)]"
				style="grid-template-columns:repeat({weeks}, var(--cell)); grid-template-rows:repeat(7, var(--cell)); grid-auto-flow:column"
			>
				{#each cells as c (c.iso)}
					{@const b = bucket(c.minutes)}
					<div
						role="img"
						aria-label={c.future ? '' : `${c.iso}: ${c.minutes} min`}
						onmouseenter={(e) => show(e, c)}
						onmousemove={(e) => tip && show(e, c)}
						onmouseleave={() => (tip = null)}
						class="rounded-[1px] transition-transform hover:scale-[1.35] hover:ring-1 hover:ring-ink"
						style="
							grid-column:{c.col + 1}; grid-row:{c.row + 1};
							background:{c.future ? 'transparent' : b === 0 ? 'transparent' : HEAT[b - 1]};
							box-shadow:{c.future || b > 0 ? 'none' : 'inset 0 0 0 1px var(--color-rowactive)'};
						"
					></div>
				{/each}
			</div>
		</div>
	</div>
</div>

{#if tip}
	<div
		class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-sm bg-ink px-2 py-1 font-mono text-[10px] whitespace-nowrap text-paper"
		style="left:{tip.x}px; top:{tip.y}px"
	>
		{tip.text}
	</div>
{/if}
