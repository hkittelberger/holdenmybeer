<script lang="ts">
	import Sleeve from './Sleeve.svelte';
	import { mmss } from './tokens';
	import type { PlaylistTrack, SongRow } from '../../routes/music/stats/+page.server';

	let {
		year,
		songs,
		playlistTracks = [],
		playlistName = null,
		url = null,
		show = 20
	}: {
		year: number;
		songs: SongRow[];
		playlistTracks?: PlaylistTrack[];
		playlistName?: string | null;
		url?: string | null;
		show?: number;
	} = $props();

	// When the linked playlist has been snapshotted, show its real tracks;
	// otherwise fall back to my top-50 plays of the year.
	const fromPlaylist = $derived(playlistTracks.length > 0);

	type Row = {
		key: string;
		name: string;
		artist: string | null;
		duration_ms: number | null;
		cover_url: string | null;
		accent_1: string | null;
		accent_2: string | null;
	};
	const allRows = $derived<Row[]>(
		fromPlaylist
			? playlistTracks.map((t) => ({
					key: `p${t.position}`,
					name: t.track_name,
					artist: t.artist_name,
					duration_ms: t.duration_ms,
					cover_url: t.cover_url,
					accent_1: null,
					accent_2: null
				}))
			: songs.map((s) => ({
					key: s.uri,
					name: s.name,
					artist: s.artist,
					duration_ms: s.duration_ms,
					cover_url: s.cover_url,
					accent_1: s.accent_1,
					accent_2: s.accent_2
				}))
	);
	const rows = $derived(allRows.slice(0, show));
	const heading = $derived(playlistName ?? `Top ${Math.min(allRows.length, 50)} songs of ${year}`);
	const kicker = $derived(
		fromPlaylist
			? 'Public playlist'
			: playlistName
				? `My top ${Math.min(allRows.length, 50)} of ${year}`
				: 'My most-played'
	);
</script>

<div class="noscroll flex h-full flex-col overflow-hidden rounded-[3px] bg-ink text-[#d8ded1]">
	<div class="flex items-start justify-between border-b border-white/12 px-5 pt-4 pb-3">
		<div class="min-w-0">
			<p class="u-caps font-mono text-[10px] tracking-[0.16em] text-white/40">{kicker}</p>
			<h3 class="u-caps mt-0.5 truncate font-display text-[15px] font-bold tracking-[0.06em]">
				{heading}
			</h3>
		</div>
		{#if url}
			<a
				href={url}
				target="_blank"
				rel="noopener noreferrer"
				class="u-caps shrink-0 font-mono text-[10px] tracking-[0.12em] text-copper-light underline decoration-copper-light/40 underline-offset-4 hover:decoration-copper-light"
			>
				Open in Spotify ↗
			</a>
		{:else}
			<span class="u-caps shrink-0 font-mono text-[10px] tracking-[0.12em] text-white/25 italic">
				no playlist linked
			</span>
		{/if}
	</div>

	<div class="max-h-[420px] flex-1 overflow-y-auto">
		<div
			class="u-caps grid grid-cols-[1.75rem_2rem_1fr_auto] gap-3 px-5 py-2 font-mono text-[9px] tracking-[0.14em] text-white/35"
		>
			<span>#</span><span></span><span>Title</span><span>Time</span>
		</div>
		<ul>
			{#each rows as s, i (s.key)}
				<li
					class="grid grid-cols-[1.75rem_2rem_1fr_auto] items-center gap-3 border-t border-white/8 px-5 py-2"
				>
					<span class="font-mono text-[11px] text-white/35">{String(i + 1).padStart(2, '0')}</span>
					<span class="h-8 w-8 overflow-hidden rounded-[2px]">
						{#if s.cover_url}
							<img
								src={s.cover_url}
								alt="{s.name}{s.artist ? ` by ${s.artist}` : ''} — cover art"
								class="h-full w-full object-cover"
								loading="lazy"
							/>
						{:else}
							<Sleeve album={{ id: s.key, accent_1: s.accent_1, accent_2: s.accent_2 }} />
						{/if}
					</span>
					<span class="min-w-0">
						<span class="block truncate text-[14px] text-[#e6ebe2]">{s.name}</span>
						{#if s.artist}<span class="block truncate font-mono text-[11px] text-white/45"
								>{s.artist}</span
							>{/if}
					</span>
					<span class="font-mono text-[11px] text-white/45"
						>{s.duration_ms ? mmss(s.duration_ms) : '—'}</span
					>
				</li>
			{/each}
		</ul>
	</div>

	{#if allRows.length > show}
		<p
			class="u-caps border-t border-white/12 px-5 py-2.5 font-mono text-[9px] tracking-[0.12em] text-white/30"
		>
			Showing {show} of {allRows.length}{fromPlaylist && url ? ' — full list on Spotify' : ''}
		</p>
	{/if}
</div>
