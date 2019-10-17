import lolex, { NodeClock, InstalledClock } from 'lolex';
import { parseFixturesFromString } from './Fixture';

describe(parseFixturesFromString.name, function() {
	let clock: InstalledClock<NodeClock>;

	beforeAll(function() {
		clock = lolex.install<NodeClock>();
	});

	afterAll(function() {
		clock.uninstall();
	});

	it('with 1v1, slack tags and multiple spaces', function() {
		expect(parseFixturesFromString('@andrew  3    1  @ross')).toEqual([
			{
				blue: {
					team: ['@andrew'],
					goals: 3,
				},
				orange: {
					team: ['@ross'],
					goals: 1,
				},
				date: new Date(0),
			},
		]);
	});

	it('with slack tags', function() {
		expect(parseFixturesFromString('@andrew @jack 5 1 @ross @mike')).toEqual([
			{
				blue: {
					team: ['@andrew', '@jack'],
					goals: 5,
				},
				orange: {
					team: ['@ross', '@mike'],
					goals: 1,
				},
				date: new Date(0),
			},
		]);
	});

	it('with a mixture of tags', function() {
		expect(parseFixturesFromString('@andrew @jack 5 1 @ross moke')).toEqual([
			{
				blue: {
					team: ['@andrew', '@jack'],
					goals: 5,
				},
				orange: {
					team: ['@ross', 'moke'],
					goals: 1,
				},
				date: new Date(0),
			},
		]);
	});
});
