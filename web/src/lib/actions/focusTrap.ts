/**
 * Keep keyboard focus inside an open dialog/sidebar, and hand it back to
 * whatever was focused when it opened once it closes. Tab / Shift+Tab wrap
 * at the ends; nothing else is trapped (Escape handling stays with the
 * component).
 */
export function focusTrap(node: HTMLElement) {
	const previouslyFocused = document.activeElement as HTMLElement | null;

	const focusable = () =>
		[
			...node.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		].filter((el) => el.offsetParent !== null || el === document.activeElement);

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Tab') return;
		const items = focusable();
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		const active = document.activeElement;

		if (e.shiftKey && (active === first || !node.contains(active))) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && active === last) {
			e.preventDefault();
			first.focus();
		}
	}

	// move focus in on the next frame (after the open animation starts)
	requestAnimationFrame(() => {
		if (node.contains(document.activeElement)) return;
		(focusable()[0] ?? node).focus();
	});

	node.addEventListener('keydown', onKeydown, true);

	return {
		destroy() {
			node.removeEventListener('keydown', onKeydown, true);
			previouslyFocused?.focus?.();
		}
	};
}
