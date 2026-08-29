<script lang="ts">
	import AlbumDetail from './AlbumDetail.svelte';
	import type { CatalogueAlbum } from '../../routes/music/+page.server';

	let { id, onclose }: { id: string; onclose: () => void } = $props();

	let album = $state<CatalogueAlbum | null>(null);

	$effect(() => {
		const albumId = id;
		album = null;
		fetch(`/music/album/${albumId}`)
			.then((r) => (r.ok ? r.json() : Promise.reject()))
			.then((d: CatalogueAlbum) => (album = d))
			.catch(() => onclose());
	});

	function keydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={keydown} />

{#if album}
	<AlbumDetail {album} {onclose} />
{:else}
	<div class="fixed inset-0 z-50">
		<button aria-label="Close album detail" class="absolute inset-0 bg-ink/45" onclick={onclose}
		></button>
		<div
			role="dialog"
			aria-modal="true"
			aria-busy="true"
			aria-label="Loading album detail"
			class="absolute inset-y-0 right-0 w-full max-w-[640px] bg-[#12160f] p-7"
		>
			<div class="h-8 w-40 animate-pulse rounded bg-white/10"></div>
			<div class="mt-6 h-32 animate-pulse rounded bg-white/5"></div>
			<div class="mt-4 h-24 animate-pulse rounded bg-white/5"></div>
		</div>
	</div>
{/if}
