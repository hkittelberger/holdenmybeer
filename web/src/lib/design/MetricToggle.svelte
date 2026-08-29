<script lang="ts">
	let {
		options,
		value = $bindable(),
		label = ''
	}: { options: [string, string]; value: string; label?: string } = $props();
</script>

<div class="flex items-center gap-2">
	{#if label}
		<span class="u-caps font-mono text-[10px] tracking-[0.14em] text-ink-faint">{label}</span>
	{/if}
	<div
		class="inline-flex rounded-sm border border-border-strong"
		role="group"
		aria-label={label || 'Toggle'}
	>
		{#each options as opt (opt)}
			<button
				type="button"
				onclick={() => (value = opt)}
				aria-pressed={value === opt}
				class="u-caps min-h-[32px] px-3 py-1 font-mono text-[11px] tracking-[0.06em] {value === opt
					? 'bg-ink text-paper'
					: 'text-ink-muted hover:text-copper'}"
			>
				{opt}
			</button>
		{/each}
	</div>
</div>
