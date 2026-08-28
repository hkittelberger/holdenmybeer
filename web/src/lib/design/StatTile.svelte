<script lang="ts">
	let {
		label,
		value,
		note = ''
	}: { label: string; value: string; note?: string } = $props();
</script>

<div class="border-l-[3px] border-copper pl-4">
	<p class="font-mono text-[10px] tracking-[0.14em] text-ink-faint u-caps">{label}</p>
	<p class="font-mono mt-1.5 text-[clamp(28px,3.8vw,38px)] leading-none font-medium text-ink">
		{value}
	</p>
	{#if note}<p class="mt-1.5 text-[13px] text-ink-muted">{note}</p>{/if}
</div>
