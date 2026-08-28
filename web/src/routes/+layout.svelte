<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';

	let { children } = $props();

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

	// close everything on navigation
	$effect(() => {
		void page.url.pathname;
		menuOpen = false;
		navOpen = false;
	});
</script>

<svelte:body
	onclick={() => {
		menuOpen = false;
	}}
/>

<div class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-30 border-b-2 border-ink bg-paper/95 backdrop-blur-sm">
		<nav class="mx-auto flex max-w-[1180px] items-center justify-between px-[22px] py-4">
			<a href="/" class="font-mono text-[16px] font-semibold tracking-[0.2em] text-ink u-caps">
				HoldenMyBeer
			</a>

			<!-- desktop nav -->
			<ul
				class="hidden items-center gap-6 font-mono text-[13px] tracking-[0.13em] u-caps md:flex"
			>
				{#each sections as s (s.href)}
					<li class="relative">
						{#if s.menu}
							<button
								onclick={(e) => {
									e.stopPropagation();
									menuOpen = !menuOpen;
								}}
								aria-expanded={menuOpen}
								class="relative flex items-center gap-1 py-1 {inMusic
									? 'text-copper'
									: 'text-ink-faint hover:text-copper'}"
							>
								{s.label}<span class="text-[8px]">▾</span>
								{#if inMusic}<span class="absolute -bottom-[6px] left-0 h-[2px] w-full bg-copper"
									></span>{/if}
							</button>
							{#if menuOpen}
								<div
									class="absolute right-0 top-[calc(100%+10px)] w-[200px] border border-border bg-raised shadow-[0_14px_30px_rgba(24,32,26,.2)]"
								>
									{#each music as m (m.href)}
										<a
											href={m.href}
											class="block border-b border-rule px-4 py-3 last:border-0 hover:bg-zebra"
										>
											<span class="block text-[11px] tracking-[0.12em] text-ink">{m.label}</span>
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
								{#if isActive(s.href)}<span class="absolute -bottom-[6px] left-0 h-[2px] w-full bg-copper"
									></span>{/if}
							</a>
						{/if}
					</li>
				{/each}
			</ul>

			<!-- mobile hamburger -->
			<button
				class="grid size-8 place-items-center md:hidden"
				aria-label="Menu"
				aria-expanded={navOpen}
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
			<ul class="border-t border-rule bg-paper px-[22px] py-3 font-mono text-[13px] tracking-[0.12em] u-caps md:hidden">
				{#each sections as s (s.href)}
					<li>
						<a
							href={s.href}
							class="block py-2.5 {isActive(s.href) ? 'text-copper' : 'text-ink-muted'}"
						>
							{s.label}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</header>

	<main class="flex-1">
		{@render children()}
	</main>

	<footer class="mt-[78px] border-t-2 border-ink bg-ink px-[22px] py-10 text-center">
		<p class="font-mono text-[10px] tracking-[0.16em] text-[#8a948b] u-caps">
			HoldenMyBeer · personal site · {new Date().getFullYear()}
		</p>
	</footer>
</div>
