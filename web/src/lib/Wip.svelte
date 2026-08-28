<script lang="ts">
	let { title, note = '' }: { title: string; note?: string } = $props();
</script>

<section class="rounded border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
	<p class="font-mono text-[11px] tracking-[0.18em] text-stone-400 uppercase">Work in progress</p>
	<h1 class="mt-3 text-2xl font-bold tracking-wide uppercase">{title}</h1>
	{#if note}<p class="mx-auto mt-3 max-w-md text-sm text-stone-500">{note}</p>{/if}
</section>
