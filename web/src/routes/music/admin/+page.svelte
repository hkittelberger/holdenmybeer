<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<div class="mx-auto max-w-[920px] px-[22px] py-16">
	<section class="mx-auto max-w-sm rounded-[3px] border border-border bg-raised p-6">
		<h1 class="font-mono text-[11px] tracking-[0.16em] text-ink-faint u-caps">Admin</h1>
		<p class="mt-1 text-sm text-ink-muted">Enter the shared password.</p>
		<form method="POST" action="?/login" use:enhance class="mt-4 space-y-3">
			<input
				name="password"
				type="password"
				autocomplete="current-password"
				required
				class="w-full rounded-sm border border-border-strong bg-field px-3 py-2.5 text-sm focus-visible:border-copper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper"
			/>
			{#if form?.error}
				<p class="font-mono text-[10px] tracking-[0.1em] text-copper u-caps">{form.error}</p>
			{/if}
			<button
				class="w-full rounded-sm bg-ink px-3 py-2.5 font-mono text-[11px] tracking-[0.14em] text-paper u-caps hover:bg-copper focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-copper"
			>
				Unlock
			</button>
		</form>
	</section>
</div>
