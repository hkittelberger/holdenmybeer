<script lang="ts">
	import Monogram from './Monogram.svelte';
	import Sleeve from './Sleeve.svelte';
	import { fmt } from './tokens';

	export interface RankItem {
		key: string;
		primary: string;
		secondary?: string | null;
		image_url?: string | null;
		cover_url?: string | null;
		accent_1?: string | null;
		accent_2?: string | null;
		value: number;
	}

	let {
		title,
		items,
		visual = 'cover',
		showBar = false,
		valueSuffix = '',
		emptyNote = 'Nothing here yet.',
		onselect,
		headerExtra
	}: {
		title: string;
		items: RankItem[];
		visual?: 'monogram' | 'cover';
		showBar?: boolean;
		valueSuffix?: string;
		emptyNote?: string;
		onselect?: (item: RankItem) => void;
		headerExtra?: import('svelte').Snippet;
	} = $props();

	const max = $derived(Math.max(1, ...items.map((i) => i.value)));
	const noun = $derived(
		visual === 'monogram' ? 'artists' : title.toLowerCase().includes('song') ? 'songs' : 'albums'
	);
</script>

{#snippet rowInner(it: RankItem, i: number)}
	<span class="font-mono text-[12px] text-ink-faintest">{String(i + 1).padStart(2, '0')}</span>
	<span class="flex justify-center">
		{#if visual === 'monogram'}
			<Monogram name={it.primary} src={it.image_url} size={38} />
		{:else}
			<span class="h-10 w-10 overflow-hidden rounded-[2px] shadow-[0_2px_8px_rgba(24,32,26,.14)]">
				{#if it.cover_url}
					<img src={it.cover_url} alt="" class="h-full w-full object-cover" loading="lazy" />
				{:else}
					<Sleeve
						album={{ id: it.key, accent_1: it.accent_1 ?? null, accent_2: it.accent_2 ?? null }}
					/>
				{/if}
			</span>
		{/if}
	</span>
	<span class="min-w-0">
		<span class="block truncate text-[15px] text-ink">{it.primary}</span>
		{#if it.secondary}
			<span class="block truncate font-mono text-[12px] text-ink-faint">{it.secondary}</span>
		{/if}
	</span>
	<span class="flex items-center gap-3">
		{#if showBar}
			<span class="hidden h-[7px] w-24 overflow-hidden rounded-full bg-border-disabled sm:block">
				<span
					class="block h-full rounded-full bg-copper"
					style="width:{Math.max(4, (it.value / max) * 100)}%"
				></span>
			</span>
		{/if}
		<span class="flex w-14 flex-col items-end leading-none">
			<span class="font-mono text-[20px] font-medium text-ink">{fmt(it.value)}</span>
			{#if valueSuffix}
				<span class="mt-1 font-mono text-[9px] tracking-[0.1em] text-ink-faintest u-caps"
					>{valueSuffix}</span
				>
			{/if}
		</span>
	</span>
{/snippet}

<div class="flex h-full flex-col rounded-[3px] border border-border bg-raised">
	<div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-5 pt-4 pb-3">
		<h3 class="font-display text-[15px] font-bold tracking-[0.06em] text-ink u-caps">{title}</h3>
		<div class="flex items-baseline gap-3">
			{#if headerExtra}{@render headerExtra()}{/if}
			{#if items.length}
				<span class="font-mono text-[10px] tracking-[0.1em] text-ink-faintest u-caps">
					{items.length} {noun} · scroll
				</span>
			{/if}
		</div>
	</div>

	{#if items.length === 0}
		<p class="px-5 py-10 text-center text-[13px] text-ink-muted">{emptyNote}</p>
	{:else}
		<div class="noscroll relative max-h-[460px] flex-1 overflow-y-auto">
			<ul>
				{#each items as it, i (it.key)}
					<li>
						{#if onselect}
							<button
								onclick={() => onselect(it)}
								class="grid w-full grid-cols-[1.75rem_2.75rem_1fr_auto] items-center gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-rowhover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-copper"
							>
								{@render rowInner(it, i)}
							</button>
						{:else}
							<div
								class="grid w-full grid-cols-[1.75rem_2.75rem_1fr_auto] items-center gap-3.5 px-5 py-3.5"
							>
								{@render rowInner(it, i)}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			<div
				class="pointer-events-none sticky bottom-0 h-6 bg-gradient-to-t from-raised to-transparent"
			></div>
		</div>
	{/if}
</div>
