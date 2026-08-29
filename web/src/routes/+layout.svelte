<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { SITE_URL, SITE_NAME, SITE_TAGLINE, AUTHOR_NAME } from '$lib/seo';
	import Mark from '$lib/components/Mark.svelte';

	let { children } = $props();

	// Site-wide structured data. WebSite + Person (the two schema.org types
	// that describe a personal site with no other content type yet).
	const structuredData = JSON.stringify([
		{
			'@context': 'https://schema.org',
			'@type': 'WebSite',
			name: SITE_NAME,
			url: SITE_URL,
			description: SITE_TAGLINE,
			inLanguage: 'en-US'
		},
		{
			'@context': 'https://schema.org',
			'@type': 'Person',
			name: AUTHOR_NAME,
			url: SITE_URL,
			alternateName: SITE_NAME
		}
	]);

	const sections = [
		{ href: '/', label: 'Home' },
		{ href: '/courses', label: 'Courses' },
		{ href: '/design', label: 'Design' },
		{ href: '/music', label: 'Music', menu: true },
		{ href: '/photos', label: 'Photos' },
		{ href: '/music/admin', label: 'Admin' }
	];
	const music = [
		{ href: '/music', label: 'Ranking', desc: 'Rated album catalogue' },
		{ href: '/music/stats', label: 'Stats', desc: 'The listening record' }
	];

	let menuOpen = $state(false);
	let navOpen = $state(false);
	const inMusic = $derived(
		page.url.pathname.startsWith('/music') && !page.url.pathname.startsWith('/music/admin')
	);
	const isActive = (href: string) =>
		href === '/'
			? page.url.pathname === '/'
			: page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	const isExact = (href: string) => page.url.pathname === href;

	// close everything on navigation
	$effect(() => {
		void page.url.pathname;
		menuOpen = false;
		navOpen = false;
	});

	function onEscape(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			menuOpen = false;
			navOpen = false;
		}
	}
</script>

<svelte:window onkeydown={onEscape} />

<svelte:head>
	<meta name="theme-color" content="#e4e8df" />
	<meta name="author" content={AUTHOR_NAME} />
	{@html `<script type="application/ld+json">${structuredData}</` + `script>`}
</svelte:head>

<svelte:body
	onclick={() => {
		menuOpen = false;
		navOpen = false;
	}}
/>

<div class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-30 border-b-2 border-ink bg-paper/95 backdrop-blur-sm">
		<nav class="mx-auto flex max-w-[1180px] items-center justify-between px-[22px] py-4">
			<a
				href="/"
				class="u-caps flex items-center gap-2.5 font-mono text-[16px] font-semibold tracking-[0.2em] text-ink"
			>
				<Mark size={22} />
				HoldenMyBeer
			</a>

			<!-- desktop nav -->
			<ul class="u-caps hidden items-center gap-6 font-mono text-[13px] tracking-[0.13em] md:flex">
				{#each sections as s (s.href)}
					<li class="relative">
						{#if s.menu}
							<button
								type="button"
								onclick={(e) => {
									e.stopPropagation();
									menuOpen = !menuOpen;
								}}
								aria-expanded={menuOpen}
								aria-haspopup="true"
								aria-controls="music-menu"
								class="relative flex items-center gap-1 py-1 {inMusic
									? 'text-copper'
									: 'text-ink-faint hover:text-copper'}"
							>
								{s.label}<span aria-hidden="true" class="text-[8px]">▾</span>
								{#if inMusic}<span class="absolute -bottom-[6px] left-0 h-[2px] w-full bg-copper"
									></span>{/if}
							</button>
							{#if menuOpen}
								<div
									id="music-menu"
									class="absolute top-[calc(100%+10px)] right-0 w-[200px] border border-border bg-raised shadow-[0_14px_30px_rgba(24,32,26,.2)]"
								>
									{#each music as m (m.href)}
										<a
											href={m.href}
											aria-current={isExact(m.href) ? 'page' : undefined}
											class="block border-b border-rule px-4 py-3 last:border-0 hover:bg-zebra {isExact(
												m.href
											)
												? 'bg-zebra'
												: ''}"
										>
											<span
												class="block text-[11px] tracking-[0.12em] {isExact(m.href)
													? 'text-copper'
													: 'text-ink'}">{m.label}</span
											>
											<span
												class="mt-0.5 block font-sans text-[11px] tracking-normal text-ink-faint normal-case"
											>
												{m.desc}
											</span>
										</a>
									{/each}
								</div>
							{/if}
						{:else}
							<a
								href={s.href}
								aria-current={isActive(s.href) ? 'page' : undefined}
								class="relative py-1 {isActive(s.href)
									? 'text-copper'
									: 'text-ink-faint hover:text-copper'}"
							>
								{s.label}
								{#if isActive(s.href)}<span
										class="absolute -bottom-[6px] left-0 h-[2px] w-full bg-copper"
									></span>{/if}
							</a>
						{/if}
					</li>
				{/each}
			</ul>

			<!-- mobile hamburger -->
			<button
				type="button"
				class="-mr-2 grid size-11 place-items-center md:hidden"
				aria-label={navOpen ? 'Close menu' : 'Open menu'}
				aria-expanded={navOpen}
				aria-controls="mobile-nav"
				onclick={(e) => {
					e.stopPropagation();
					navOpen = !navOpen;
				}}
			>
				<span class="space-y-[5px]">
					<span class="block h-[2px] w-5 bg-ink"></span>
					<span class="block h-[2px] w-5 bg-ink"></span>
					<span class="block h-[2px] w-5 bg-ink"></span>
				</span>
			</button>
		</nav>

		{#if navOpen}
			<nav
				id="mobile-nav"
				aria-label="Site"
				class="u-caps border-t border-rule bg-paper px-[22px] py-2 font-mono text-[13px] tracking-[0.12em] md:hidden"
			>
				<ul>
					{#each sections as s (s.href)}
						{#if s.menu}
							<li class="border-b border-rule py-2 last:border-0">
								<a
									href={s.href}
									aria-current={isExact(s.href) ? 'page' : undefined}
									class="flex min-h-[44px] items-center {isExact(s.href)
										? 'text-copper'
										: 'text-ink-muted'}">{s.label}</a
								>
								<ul class="mb-1 ml-3 border-l-2 border-rule pl-4">
									{#each music as m (m.href)}
										<li>
											<a
												href={m.href}
												aria-current={isExact(m.href) ? 'page' : undefined}
												class="flex min-h-[44px] items-center text-[12px] {isExact(m.href)
													? 'text-copper'
													: 'text-ink-faint'}"
											>
												{m.label}
											</a>
										</li>
									{/each}
								</ul>
							</li>
						{:else}
							<li class="border-b border-rule last:border-0">
								<a
									href={s.href}
									aria-current={isActive(s.href) ? 'page' : undefined}
									class="flex min-h-[44px] items-center {isActive(s.href)
										? 'text-copper'
										: 'text-ink-muted'}"
								>
									{s.label}
								</a>
							</li>
						{/if}
					{/each}
				</ul>
			</nav>
		{/if}
	</header>

	<main class="flex-1">
		{@render children()}
	</main>

	<footer
		class="mt-[78px] flex flex-col items-center gap-3 border-t-2 border-ink bg-ink px-[22px] py-10 text-center"
	>
		<Mark size={26} color="#8a948b" />
		<p class="u-caps font-mono text-[10px] tracking-[0.16em] text-[#8a948b]">
			HoldenMyBeer · personal site · {new Date().getFullYear()}
		</p>
	</footer>
</div>
