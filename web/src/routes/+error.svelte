<script lang="ts">
	import { page } from '$app/state';
	import { SITE_NAME } from '$lib/seo';

	const is404 = $derived(page.status === 404);
	const heading = $derived(is404 ? 'Page not found' : 'Something went wrong');
	const detail = $derived(
		is404
			? "That page isn't here — it may have moved, or never existed."
			: (page.error?.message ?? 'An unexpected error occurred.')
	);
</script>

<svelte:head>
	<title>{page.status} · {SITE_NAME}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div
	class="mx-auto flex min-h-[60vh] max-w-[1180px] flex-col items-center justify-center px-[22px] py-16 text-center"
>
	<p class="font-mono text-[64px] leading-none font-bold text-copper">{page.status}</p>
	<h1 class="u-caps mt-4 font-display text-2xl font-bold tracking-wide text-ink">{heading}</h1>
	<p class="mt-3 max-w-md text-sm text-ink-muted">{detail}</p>

	<div
		class="u-caps mt-8 flex flex-wrap items-center justify-center gap-4 font-mono text-[12px] tracking-[0.1em]"
	>
		<a
			href="/"
			class="rounded-sm bg-ink px-4 py-2.5 text-paper hover:bg-copper focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-copper"
		>
			Home
		</a>
		<a href="/music" class="text-copper underline underline-offset-4 hover:text-copper-deep">
			Music →
		</a>
	</div>
</div>
