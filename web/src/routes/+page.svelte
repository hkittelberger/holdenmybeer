<script lang="ts">
	import Wip from '$lib/Wip.svelte';
	import Seo from '$lib/components/Seo.svelte';
</script>

<Seo
	title="Holden Kittelberger"
	description="The personal site of Holden Kittelberger — a rated-album catalogue and a seven-year Spotify listening record, with more sections on the way."
	path="/"
	type="profile"
/>

<div class="mx-auto max-w-[1180px] px-[22px] py-12">
	<Wip
		title="Home"
		note="Landing page for the personal site. The Music section is the first thing being built."
	/>
	<p class="mt-6 text-center text-sm">
		<a class="text-copper underline underline-offset-4" href="/music">Go to Music →</a>
	</p>
</div>
