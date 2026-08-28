<script lang="ts">
	import { enhance } from '$app/forms';
	import Wip from '$lib/Wip.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

{#if !data.unlocked}
	<section class="mx-auto max-w-sm rounded border border-stone-200 bg-white p-6">
		<h1 class="font-mono text-[11px] tracking-[0.16em] text-stone-500 uppercase">Admin</h1>
		<p class="mt-1 text-sm text-stone-500">Enter the shared password.</p>
		<form method="POST" action="?/login" use:enhance class="mt-4 space-y-3">
			<input
				name="password"
				type="password"
				autocomplete="current-password"
				required
				class="w-full rounded-sm border border-stone-300 bg-stone-50 px-3 py-2 text-sm focus:border-orange-800 focus:outline-2 focus:outline-orange-800"
			/>
			{#if form?.error}<p class="font-mono text-[10px] text-orange-800">{form.error}</p>{/if}
			<button
				class="w-full rounded-sm bg-stone-900 px-3 py-2 text-sm text-stone-50 hover:bg-orange-800"
			>
				Unlock
			</button>
		</form>
	</section>
{:else}
	<div class="mb-4 flex justify-end">
		<form method="POST" action="?/logout" use:enhance>
			<button class="font-mono text-[10px] tracking-widest text-stone-400 uppercase hover:text-orange-800">
				Lock
			</button>
		</form>
	</div>
	<Wip
		title="Curator tools"
		note="Add / re-rate an album (Spotify search autofill), edit the top-five wheel, set per-year playlist links. Built in BP6."
	/>
	<p class="mt-6 text-center text-sm">
		<a class="text-orange-800 underline underline-offset-4" href="/music/admin/edit">Add / edit an album →</a>
	</p>
{/if}
