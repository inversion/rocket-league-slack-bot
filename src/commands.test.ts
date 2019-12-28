import { parseParameters } from './commands';

describe(parseParameters.name, function() {
	it.each([
		['all s1', { seasonId: 1 }],
		['', { playersPerSide: 2 }],
		['1v1', { playersPerSide: 1 }],
		['s1 1v1', { playersPerSide: 1, seasonId: 1 }],
		['@all', { playersPerSide: 2 }],
		['@all idle', { playersPerSide: 2, includeIdle: true }],
	])('with "%s"', function(parameters, expected) {
		expect(parseParameters(parameters)).toEqual(
			Object.assign({ includeIdle: false }, expected),
		);
	});
});
