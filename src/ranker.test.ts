import { calculatePlayerRanks, marginOfVictoryMultiplier } from './ranker';
import { Fixture, parseFixturesFromString } from './Fixture';
import { Player } from './Player';
import { Database } from './database';
import { addDays } from 'date-fns';

function summariseTable(players: Player[]) {
	console.table(
		players.map(player => ({
			name: player.name,
			played: player.getPlayed(),
			won: player.getWins(),
			lost: player.getLosses(),
			score: Math.round(player.getScore()),
		})),
	);
}

describe(calculatePlayerRanks.name, function() {
	it('generates ranks with an Elo-based algorithm', async function() {
		const input = `Andrew Ross 5 1 Mike Hugh
Andrew Ross 3 2 Mike Hugh`;

		const fixtures = parseFixturesFromString(input);

		fixtures[0].date = addDays(new Date(), -28);

		summariseTable(calculatePlayerRanks(fixtures, {}).table);
	});
});

it(marginOfVictoryMultiplier.name, function() {
	const cases = [
		[1200, 1200, 1],
		[1200, 1200, 5],
		[1200, 1200, 10],
		[1200, 1000, 1],
		[1200, 1000, 5],
		[1200, 1000, 10],
		[1000, 1200, 1],
		[1000, 1200, 5],
		[1000, 1200, 10],
	];

	const results: any[] = [];

	for (const [winningScore, losingScore, goalDifference] of cases) {
		results.push({
			winningScore,
			losingScore,
			goalDifference,
			movm: marginOfVictoryMultiplier(
				winningScore,
				losingScore,
				goalDifference,
			),
		});
	}

	console.table(results);
});
