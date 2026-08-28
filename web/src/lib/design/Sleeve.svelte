<script lang="ts">
	import { sleeveGradient, markFor, accents, type AlbumColors } from './tokens';

	let {
		album,
		cover = null,
		alt = '',
		year = null,
		class: klass = ''
	}: {
		album: AlbumColors;
		/** real cover art URL — shown instead of the generated mark when set */
		cover?: string | null;
		/** described-content alt for the real cover art; '' = decorative */
		alt?: string;
		year?: number | string | null;
		class?: string;
	} = $props();

	const mark = $derived(markFor(album));
	const c2 = $derived(accents(album)[1]);

	let broken = $state(false);
	const showArt = $derived(!!cover && !broken);
</script>

<div
	class="relative aspect-square w-full overflow-hidden {klass}"
	style="background:{sleeveGradient(album)}"
>
	{#if showArt}
		<img
			src={cover}
			{alt}
			class="absolute inset-0 h-full w-full object-cover"
			loading="lazy"
			onerror={() => (broken = true)}
		/>
	{:else if mark === 'circle'}
		<span
			class="absolute top-[44%] left-1/2 aspect-square w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full"
			style="background:{c2};box-shadow:0 0 0 1px rgba(255,255,255,.14)"
		></span>
	{:else if mark === 'band'}
		<span class="absolute inset-x-0 top-[52%] h-[16%]" style="background:{c2}"></span>
	{:else if mark === 'split'}
		<span class="absolute inset-y-0 right-0 w-[38%]" style="background:{c2}"></span>
	{:else}
		<span
			class="absolute right-[10%] bottom-[14%] aspect-square w-[34%] rotate-45"
			style="background:{c2}"
		></span>
	{/if}

	{#if year != null}
		<span
			class="absolute bottom-2 left-2 font-mono text-[10px] tracking-widest text-white/70"
			style="text-shadow:0 1px 3px rgba(0,0,0,.55)">{year}</span
		>
	{/if}
</div>
