<script lang="ts">
	let {
		options,
		value = $bindable(),
		label = ''
	}: { options: [string, string]; value: string; label?: string } = $props();
</script>

<div class="flex items-center gap-2">
	{#if label}
		<span class="font-mono text-[10px] tracking-[0.14em] text-ink-faint u-caps">{label}</span>
	{/if}
	<div class="inline-flex rounded-sm border border-border-strong">
		{#each options as opt (opt)}
			<button
				onclick={() => (value = opt)}
				aria-pressed={value === opt}
				class="px-3 py-1 font-mono text-[11px] tracking-[0.06em] u-caps {value === opt
					? 'bg-ink text-paper'
					: 'text-ink-muted hover:text-copper'}"
			>
				{opt}
			</button>
		{/each}
	</div>
</div>
