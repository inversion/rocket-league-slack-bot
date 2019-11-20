export function formatChange(change: number) {
	if (change === 0) {
		return '';
	} else if (change > 0) {
		return `(+${change})`;
	} else {
		return `(${change})`;
	}
}
