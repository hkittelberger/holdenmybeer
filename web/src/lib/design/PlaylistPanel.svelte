<script lang="ts">
	import Sleeve from './Sleeve.svelte';
	import { mmss } from './tokens';
	import type { SongRow } from '../../routes/music/stats/+page.server';

	let {
		year,
		songs,
		url = null,
		show = 20
	}: { year: number; songs: SongRow[]; url?: string | null; show?: number } = $props();

	const rows = $derived(songs.slice(0, show));
</script>

<div class="noscroll flex h-full flex-col overflow-hidden rounded-[3px] bg-ink text-[#d8ded1]">
	<div class="flex items-start justify-between border-b border-white/12 px-5 pt-4 pb-3">
		<div>
			<p class="font-mono text-[10px] tracking-[0.16em] text-white/40 u-caps">Public playlist</p>
			<h3 class="font-display mt-0.5 text-[15px] font-bold tracking-[0.06em] u-caps">
				Top {songs.length >= 50 ? 50 : songs.length} songs of {year}
			</h3>
		</div>
		{#if url}
			<a
				href={url}
				target="_blank"
				rel="noopener"
				class="font-mono text-[10px] tracking-[0.12em] text-copper-light underline decoration-copper-light/40 underline-offset-4 u-caps hover:decoration-copper-light"
			>
				Open in Spotify ↗
			</a>
		{:else}
			<span class="font-mono text-[10px] tracking-[0.12em] text-white/25 italic u-caps">
				no playlist linked
			</span>
		{/if}
	</div>

	<div class="max-h-[420px] flex-1 overflow-y-auto">
		<div class="grid grid-cols-[1.75rem_2rem_1fr_auto] gap-3 px-5 py-2 font-mono text-[9px] tracking-[0.14em] text-white/35 u-caps">
			<span>#</span><span></span><span>Title</span><span>Time</span>
		</div>
		<ul>
			{#each rows as s, i (s.uri)}
				<li
					class="grid grid-cols-[1.75rem_2rem_1fr_auto] items-center gap-3 border-t border-white/8 px-5 py-2"
				>
					<span class="font-mono text-[11px] text-white/35">{String(i + 1).padStart(2, '0')}</span>
					<span class="h-8 w-8 overflow-hidden rounded-[2px]">
						{#if s.cover_url}
							<img src={s.cover_url} alt="" class="h-full w-full object-cover" loading="lazy" />
						{:else}
							<Sleeve album={{ id: s.uri, accent_1: s.accent_1, accent_2: s.accent_2 }} />
						{/if}
					</span>
					<span class="min-w-0">
						<span class="block truncate text-[14px] text-[#e6ebe2]">{s.name}</span>
						{#if s.artist}<span class="block truncate font-mono text-[11px] text-white/45">{s.artist}</span>{/if}
					</span>
					<span class="font-mono text-[11px] text-white/45">{s.duration_ms ? mmss(s.duration_ms) : '—'}</span>
				</li>
			{/each}
		</ul>
	</div>

	{#if songs.length > show}
		<p class="border-t border-white/12 px-5 py-2.5 font-mono text-[9px] tracking-[0.12em] text-white/30 u-caps">
			Showing {show} of {songs.length >= 50 ? 50 : songs.length}{url ? ' — full list on Spotify' : ''}
		</p>
	{/if}
</div>
