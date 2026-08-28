<script lang="ts">
	import { SITE_URL } from '$lib/seo';

	/** Ordered trail, root first. The last item is the current page (no link). */
	let { items }: { items: { label: string; href: string }[] } = $props();

	const jsonLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: items.map((it, i) => ({
				'@type': 'ListItem',
				position: i + 1,
				name: it.label,
				item: SITE_URL + it.href
			}))
		})
	);
</script>

<svelte:head>
	{@html `<script type="application/ld+json">${jsonLd}</` + `script>`}
</svelte:head>

<nav aria-label="Breadcrumb" class="mx-auto max-w-[1180px] px-[22px] pt-6">
	<ol
		class="u-caps flex flex-wrap items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-ink-faint"
	>
		{#each items as it, i (it.href)}
			<li class="flex items-center gap-1.5">
				{#if i < items.length - 1}
					<a href={it.href} class="hover:text-copper">{it.label}</a>
					<span aria-hidden="true" class="text-ink-faintest">/</span>
				{:else}
					<span aria-current="page" class="text-ink-muted">{it.label}</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
