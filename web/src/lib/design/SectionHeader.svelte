<script lang="ts">
	let {
		kicker,
		title,
		aside = '',
		asideMono = false
	}: { kicker: string; title: string; aside?: string; asideMono?: boolean } = $props();
</script>

<div class="mb-8">
	<div class="flex items-end justify-between gap-6">
		<div>
			<p class="font-mono text-[11px] tracking-[0.16em] text-ink-faint u-caps">{kicker}</p>
			<h2
				class="font-display mt-2 text-[clamp(22px,3vw,34px)] leading-none font-bold text-ink u-caps"
				style="font-variation-settings:'wdth' 117"
			>
				{title}
			</h2>
		</div>
		{#if aside && !asideMono}
			<p
				class="hidden max-w-[280px] text-right font-mono text-[11px] leading-relaxed text-ink-muted sm:block"
			>
				{aside}
			</p>
		{/if}
	</div>
	<div class="mt-3 h-[2px] bg-ink"></div>
	{#if aside && asideMono}
		<p class="mt-2 text-right font-mono text-[10px] tracking-[0.12em] text-ink-faintest u-caps">
			{aside}
		</p>
	{/if}
</div>
