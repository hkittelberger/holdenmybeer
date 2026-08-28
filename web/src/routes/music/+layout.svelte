<script lang="ts">
	// No music sub-nav bar — the design uses the dropdown under "Music" in
	// the site header (handoff decision log: "A dropdown for Library/Stats,
	// not tabs", and "Rejected: a persistent sub-nav strip").
	let { children } = $props();
</script>

{@render children()}
