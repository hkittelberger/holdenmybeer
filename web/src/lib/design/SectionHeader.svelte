<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		kicker,
		title,
		aside = '',
		asideMono = false,
		action
	}: {
		kicker: string;
		title: string;
		aside?: string;
		asideMono?: boolean;
		/** optional control rendered top-right, above the full-width rule */
		action?: Snippet;
	} = $props();
</script>

<div class="mb-8">
	<div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
		<div class="min-w-0">
			<p class="u-caps font-mono text-[12px] tracking-[0.16em] text-ink-faint">{kicker}</p>
			<h2
				class="u-caps mt-2 max-w-[15ch] font-display text-[clamp(30px,4.6vw,48px)] leading-[0.98] font-bold text-balance text-ink"
				style="font-variation-settings:'wdth' 118"
			>
				{title}
			</h2>
		</div>
		{#if action}
			<div class="shrink-0">{@render action()}</div>
		{:else if aside && !asideMono}
			<p
				class="hidden max-w-[280px] text-right font-mono text-[11px] leading-relaxed text-ink-muted sm:block"
			>
				{aside}
			</p>
		{/if}
	</div>
	<div class="mt-3 h-[2px] bg-ink"></div>
	{#if aside && asideMono}
		<p class="u-caps mt-2 text-right font-mono text-[10px] tracking-[0.12em] text-ink-faintest">
			{aside}
		</p>
	{/if}
</div>
