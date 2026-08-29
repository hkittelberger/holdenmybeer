<script lang="ts">
	// The HK identity mark (from the Claude Design brand set). One flat path,
	// letters knocked out of a disc via fill-rule. Colour comes from
	// `currentColor` unless `color` is passed; brand green is #1F4A34.
	let {
		size = 24,
		color = '#1F4A34',
		class: klass = ''
	}: { size?: number; color?: string; class?: string } = $props();
</script>

<svg
	viewBox="0 0 64 64"
	width={size}
	height={size}
	role="img"
	aria-label="HK"
	class={klass}
	style="color:{color}"
>
	<path
		fill="currentColor"
		fill-rule="evenodd"
		d="M4 32a28 28 0 1 0 56 0a28 28 0 1 0-56 0z M14 19h4v26h-4z M26 19h4v26h-4z M18 30h8v4h-8z M34 19h4v26h-4z M38 32 46 19h5l-8 13 8 13h-5z"
	/>
</svg>
