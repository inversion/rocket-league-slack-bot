import { factorial, choose, combinations } from './maths';

describe(factorial.name, function() {
	it('calculates factorial', function() {
		expect(factorial(0)).toBe(1);
		expect(factorial(1)).toBe(1);
		expect(factorial(3)).toBe(6);
	});
	it('throws for negative numbers', function() {
		expect(() => factorial(-1)).toThrow();
	});
	it('throws for non-integers', function() {
		expect(() => factorial(1.2)).toThrow();
	});
});

describe(choose.name, function() {
	it('calculates combinations', function() {
		expect(choose(1, 1)).toBe(1);
		expect(choose(2, 1)).toBe(2);
		expect(choose(4, 2)).toBe(6);
	});
});

describe(combinations.name, function() {
	const input = ['andrew', 'bob', 'charlie', 'dave'];

	it('choosing 1', function() {
		expect(combinations(input, 1)).toEqual([
			['andrew'],
			['bob'],
			['charlie'],
			['dave'],
		]);
	});

	it('choosing 2', function() {
		expect(combinations(input, 2)).toEqual([
			['andrew', 'bob'],
			['andrew', 'charlie'],
			['andrew', 'dave'],
			['bob', 'charlie'],
			['bob', 'dave'],
			['charlie', 'dave'],
		]);
	});

	it('choosing 3', function() {
		expect(combinations(input, 3)).toEqual([
			['andrew', 'bob', 'charlie'],
			['andrew', 'bob', 'dave'],
			['andrew', 'charlie', 'dave'],
			['bob', 'charlie', 'dave'],
		]);
	});
});
