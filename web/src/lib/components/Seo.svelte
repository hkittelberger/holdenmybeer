<script lang="ts">
	import { page } from '$app/state';
	import { SITE_NAME, SITE_URL, DEFAULT_OG_IMAGE, LOCALE, canonical } from '$lib/seo';

	let {
		title,
		description,
		/** override the canonical/OG path; defaults to the current pathname */
		path,
		image = DEFAULT_OG_IMAGE,
		/** 'website' | 'profile' | 'article' */
		type = 'website',
		noindex = false
	}: {
		title: string;
		description: string;
		path?: string;
		image?: string;
		type?: string;
		noindex?: boolean;
	} = $props();

	const fullTitle = $derived(title === SITE_NAME ? title : `${title} · ${SITE_NAME}`);
	const url = $derived(canonical(path ?? page.url.pathname));
	const img = $derived(image.startsWith('http') ? image : SITE_URL + image);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	{#if noindex}
		<meta name="robots" content="noindex, nofollow" />
	{:else}
		<meta name="robots" content="index, follow" />
	{/if}

	<meta property="og:type" content={type} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:locale" content={LOCALE} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={url} />
	<meta property="og:image" content={img} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={fullTitle} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={fullTitle} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={img} />
</svelte:head>
