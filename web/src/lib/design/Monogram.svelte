<script lang="ts">
	import { hashInt } from './tokens';

	let {
		name,
		src = null,
		size = 40,
		round = true
	}: { name: string; src?: string | null; size?: number; round?: boolean } = $props();

	const initials = $derived(
		name
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0] ?? '')
			.join('')
			.toUpperCase()
	);
	const hue = $derived(hashInt(name) % 360);
</script>

{#if src}
	<img
		{src}
		alt={name}
		width={size}
		height={size}
		class="shrink-0 object-cover {round ? 'rounded-full' : 'rounded-[2px]'}"
		style="width:{size}px;height:{size}px"
		loading="lazy"
	/>
{:else}
	<span
		class="grid shrink-0 place-items-center font-mono font-medium text-white/85 {round
			? 'rounded-full'
			: 'rounded-[2px]'}"
		style="width:{size}px;height:{size}px;font-size:{size * 0.34}px;
			background:linear-gradient(140deg, hsl({hue} 22% 30%), hsl({(hue + 40) % 360} 24% 22%))"
	>
		{initials}
	</span>
{/if}
