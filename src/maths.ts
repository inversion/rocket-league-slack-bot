import assert from 'assert';
export function factorial(n: number): number {
	if (n < 0) {
		throw new Error('The factorial is not defined for negative numbers');
	}

	if (n % 1 !== 0) {
		throw new Error('The factorial is only defined for integers');
	}

	if (n === 0) {
		return 1;
	}

	return n * factorial(n - 1);
}

export function choose(n: number, r: number) {
	return factorial(n) / (factorial(r) * factorial(n - r));
}

/**
 * Adapted approach from combinations.js
 */
export function combinations<T>(input: T[], r: number) {
	assert(r >= 0 && r <= input.length);

	if (r === input.length) {
		return [input];
	}

	if (r === 1) {
		return input.map(item => [item]);
	}

	const results: T[][] = [];

	for (let i = 0; i < input.length - r + 1; i++) {
		const head = [input[i]];

		const tail = combinations(input.slice(i + 1), r - 1);

		results.push(...tail.map(other => head.concat(other)));
	}

	return results;
}
