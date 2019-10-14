import { calculatePlayerRanks, marginOfVictoryMultiplier } from './ranker';
import { Fixture, parseFixturesFromString } from './Fixture';
import { Player } from './Player';
import { Database } from './database';

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
Andrew Ross 3 2 David niall
Ross David 4 3 Hugh mike
David Mike 3 2 Andrew niall
Andrew niall 3 1 Mike david
Andrew Mike 1 6 niall david
Ross Owen 1 3 Hugh David
Andrew Mike 4 3 Ross david
Ross Hugh 3 2 David Owen
David Jack 4 0 Ross Owen
Andrew Ross 5 3 Niall Hugh
Jack Hugh 6 1 Niall Ross
Andrew Niall 4 3 Jack Ross
Andrew Owen 4 3 Hugh mike
Jed Niall 3 1 Hugh Mike
Andrew Jed 6 1 Niall Owen
Jed Hugh 4 3 Andrew Mike`;

		const fixtures = parseFixturesFromString(input);

		// console.log('Without MoVM');

		// summariseTable(calculatePlayerRanks(fixtures, { useMovm: false }));

		console.log('With MoVM');

		summariseTable(calculatePlayerRanks(fixtures));
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
