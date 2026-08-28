<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import SectionHeader from '$lib/design/SectionHeader.svelte';
	import StatTile from '$lib/design/StatTile.svelte';
	import YearChips from '$lib/design/YearChips.svelte';
	import BarChart from '$lib/design/BarChart.svelte';
	import RankBoard from '$lib/design/RankBoard.svelte';
	import MetricToggle from '$lib/design/MetricToggle.svelte';
	import Heatmap from '$lib/design/Heatmap.svelte';
	import DiscoveryChart from '$lib/design/DiscoveryChart.svelte';
	import PlaylistPanel from '$lib/design/PlaylistPanel.svelte';
	import ArtistDetail from '$lib/design/ArtistDetail.svelte';
	import AlbumDetailById from '$lib/design/AlbumDetailById.svelte';
	import { fmt, mmss } from '$lib/design/tokens';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	function setYear(y: number) {
		const u = new URL(page.url);
		u.searchParams.set('year', String(y));
		goto(u, { keepFocus: true, noScroll: true });
	}

	let songMetric = $state<'plays' | 'minutes'>('plays');
	let discoveryMode = $state<'artists' | 'tracks'>('tracks');
	let openArtist = $state<string | null>(null);
	let openAlbum = $state<string | null>(null);

	const artistItems = $derived(
		data.artists.map((a) => ({
			key: a.id,
			primary: a.name,
			image_url: a.image_url,
			value: a.minutes
		}))
	);
	const albumItems = $derived(
		data.albums.map((a) => ({
			key: a.id,
			primary: a.name,
			secondary: a.artist,
			cover_url: a.cover_url,
			accent_1: a.accent_1,
			accent_2: a.accent_2,
			value: a.minutes
		}))
	);
	const songItems = $derived(
		data.songs
			.map((s) => ({
				key: s.uri,
				primary: s.name,
				secondary: [s.artist, s.duration_ms ? mmss(s.duration_ms) : null]
					.filter(Boolean)
					.join(' · '),
				cover_url: s.cover_url,
				accent_1: s.accent_1,
				accent_2: s.accent_2,
				value: songMetric === 'plays' ? s.plays : s.minutes
			}))
			.sort((a, b) => b.value - a.value)
	);

	const disc = $derived(
		data.discovery.reduce(
			(acc, m) => {
				acc.nw += discoveryMode === 'artists' ? m.artist_new : m.track_new;
				acc.rp += discoveryMode === 'artists' ? m.artist_repeat : m.track_repeat;
				return acc;
			},
			{ nw: 0, rp: 0 }
		)
	);

	const busiestLabel = $derived(
		data.calendarMeta.busiestDay
			? new Date(data.calendarMeta.busiestDay + 'T00:00:00').toLocaleDateString('en-US', {
					month: 'short',
					year: 'numeric'
				})
			: '—'
	);

	const panel = 'rounded-[3px] border border-border bg-raised p-5';
</script>

<div class="mx-auto max-w-[1180px] px-[22px] py-12">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0 flex-1">
			<SectionHeader kicker="Section C — Listening Record" title="The year in minutes" />
		</div>
		{#if data.spotifyProfileUrl}
			<a
				href={data.spotifyProfileUrl}
				target="_blank"
				rel="noopener"
				class="shrink-0 rounded-sm border border-copper px-3 py-2 font-mono text-[11px] tracking-[0.1em] text-copper u-caps hover:bg-copper hover:text-copper-text"
			>
				Spotify profile ↗
			</a>
		{/if}
	</div>

	<div class="-mt-2">
		<YearChips years={data.years} selected={data.year} onselect={setYear} />
	</div>

	<!-- stat tiles -->
	<div class="mt-8 grid gap-6 sm:grid-cols-3">
		<StatTile
			label="Minutes in {data.year}"
			value={fmt(data.totals.minutes)}
			note="{fmt(data.totals.hours)} hours of listening"
		/>
		<StatTile
			label="Albums rated {data.year}"
			value={fmt(data.totals.albumsRated)}
			note="cards filed this year"
		/>
		<StatTile label="Mean score" value={data.totals.meanScore} note="across the whole index" />
	</div>

	<!-- minutes per year -->
	<div class="{panel} mt-6">
		<div class="mb-3 flex items-baseline justify-between">
			<h3 class="font-display text-[15px] font-bold tracking-[0.06em] text-ink u-caps">
				Minutes listened per year
			</h3>
			<span class="font-mono text-[10px] tracking-[0.1em] text-ink-faintest u-caps">
				Click a bar to switch year
			</span>
		</div>
		<BarChart data={data.perYear} selected={data.year} onselect={setYear} />
	</div>

	<!-- artist / album boards -->
	<div class="mt-6 grid gap-6 lg:grid-cols-2">
		<RankBoard
			title="By artist — {data.year}"
			items={artistItems}
			visual="monogram"
			showBar
			valueSuffix="min"
			onselect={(it) => (openArtist = it.key)}
			emptyNote="Artist minutes fill in as the catalogue metadata resolves."
		/>
		<RankBoard
			title="By album — {data.year}"
			items={albumItems}
			visual="cover"
			valueSuffix="min"
			onselect={(it) => (openAlbum = it.key)}
			emptyNote="Album minutes fill in as the catalogue metadata resolves."
		/>
	</div>

	<!-- top songs / playlist -->
	<div class="mt-6 grid gap-6 lg:grid-cols-2">
		<RankBoard
			title="Top songs of {data.year}"
			items={songItems}
			visual="cover"
			valueSuffix={songMetric}
		>
			{#snippet headerExtra()}
				<MetricToggle options={['plays', 'minutes']} bind:value={songMetric} label="Metric" />
			{/snippet}
		</RankBoard>
		<PlaylistPanel
			year={data.year}
			songs={data.songs}
			playlistTracks={data.playlistTracks}
			playlistName={data.yearPlaylistName}
			url={data.yearPlaylistUrl}
		/>
	</div>

	<!-- listening calendar -->
	<div class="{panel} mt-6">
		<div class="mb-1 flex flex-wrap items-baseline justify-between gap-2">
			<h3 class="font-display text-[15px] font-bold tracking-[0.06em] text-ink u-caps">
				Listening calendar — {data.year}
			</h3>
			<div class="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.1em] text-ink-faintest u-caps">
				Quiet
				{#each ['#e9dfd2', '#dcbfa2', '#c7936c', '#a96a3e', '#874c23'] as c (c)}
					<span class="h-3 w-3 rounded-[1px]" style="background:{c}"></span>
				{/each}
				Heavy
			</div>
		</div>
		<p class="mb-3 font-mono text-[10px] tracking-[0.08em] text-ink-faint u-caps">
			{fmt(data.calendarMeta.daysWithListening)} days with listening · busiest {busiestLabel} ·
			{fmt(data.calendarMeta.busiestMinutes)} min · shades are your own quantiles
		</p>
		<Heatmap year={data.year} days={data.calendar} quantiles={data.calendarMeta.quantiles} />
	</div>

	<!-- discovery -->
	<div class="{panel} mt-6">
		<div class="mb-1 flex flex-wrap items-baseline justify-between gap-2">
			<h3 class="font-display text-[15px] font-bold tracking-[0.06em] text-ink u-caps">
				Discovery rate — {data.year}
			</h3>
			<div class="flex items-center gap-4">
				<span class="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.1em] text-ink-faint u-caps">
					<span class="h-3 w-3 rounded-[1px] bg-copper"></span>New
					<span class="ml-2 h-3 w-3 rounded-[1px] bg-bar-inactive"></span>Repeat
				</span>
				<MetricToggle options={['artists', 'tracks']} bind:value={discoveryMode} />
			</div>
		</div>
		<p class="mb-3 font-mono text-[10px] tracking-[0.08em] text-ink-faint u-caps">
			{fmt(disc.nw)} new · {fmt(disc.rp)} repeat {discoveryMode} this year
		</p>
		<DiscoveryChart months={data.discovery} mode={discoveryMode} />
	</div>
</div>

{#if openArtist}
	<ArtistDetail
		id={openArtist}
		years={data.years}
		year={data.year}
		onclose={() => (openArtist = null)}
	/>
{/if}
{#if openAlbum}
	<AlbumDetailById id={openAlbum} onclose={() => (openAlbum = null)} />
{/if}
