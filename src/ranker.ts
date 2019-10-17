import { Fixture, Side } from './Fixture';
import { Player } from './Player';
import { defaults } from 'lodash';

type Players = Record<string, Player>;
interface Options {
	useMovm: boolean;
	useDecay: boolean;
	currentDate: Date;
}

/**
 * We use Elo with rankings calculated for each player against the players on the other team individually.
 * We don't use data on individual performances because we see Rocket League as a team game.
 * The 'score' in-game could be recorded if we were less lazy.
 *
 * Instead, we encourage players to choose 'auto' teams every time so that the scores should
 * balance out over the longer term as teams are continuously randomised.
 *
 * See https://blog.mackie.io/the-elo-algorithm and https://ryanmadden.net/posts/Adapting-Elo
 */
export function calculatePlayerRanks(
	fixtures: Fixture[],
	rankingOptionsInput?: Partial<Options>,
) {
	const rankingOptions = defaults(rankingOptionsInput || {}, {
		useMovm: true,
		useDecay: true,
		currentDate: new Date(),
	});

	const players: Players = {};

	for (const fixture of fixtures) {
		const { blue, orange, date } = fixture;

		if (rankingOptions.currentDate < date) {
			continue;
		}

		const bluePlayers = ensurePlayersExist(players, blue);

		const orangePlayers = ensurePlayersExist(players, orange);

		const scoreBlue = getTotalScore(bluePlayers);
		const scoreOrange = getTotalScore(orangePlayers);

		const minPlayed = [...bluePlayers, ...orangePlayers].reduce(
			(minPlayed, player) => Math.min(minPlayed, player.getPlayed()),
			Number.POSITIVE_INFINITY,
		);
		const K = kFactor(minPlayed);

		console.error(`Game summary:
${date.toISOString()}
${blue.team.join(' ')} ${blue.goals} - ${orange.goals} ${orange.team.join(' ')}

		`);

		updateTeamScores(
			date,
			blue,
			orange,
			scoreBlue,
			scoreOrange,
			K,
			bluePlayers,
			rankingOptions,
		);
		updateTeamScores(
			date,
			orange,
			blue,
			scoreOrange,
			scoreBlue,
			K,
			orangePlayers,
			rankingOptions,
		);
	}

	return Object.values(players).sort((a, b) => b.getScore() - a.getScore());
}

/**
 * Fixtures have less of an impact on score the further in the past they are.
 *
 * After a year, fixtures will have no impact.
 */
const DAILY_DECAY = 1 / 365;
const DAY_MS = 24 * 3600 * 1000;

/**
 * We are using a Logistic CDF (cumulative distribution function) as we consider upsets
 * to be highly likely in Rocket League (see https://blog.mackie.io/the-elo-algorithm#e-expected-outcome_3)
 *
 * This is how we scale the CDF. We are roughly saying that if a player has 400 more points than another,
 * they are 5x better (they should win 5/6 = 83% of the time).
 */
const SCALE = 400 / Math.log(5);

/**
 * This is entirely arbitrary because Elo ranks are only meaningfully comparable within their own system.
 */
export const INITIAL_SCORE = 1200;

export function marginOfVictoryMultiplier(
	winningScore: number,
	losingScore: number,
	goalDifference: number,
): number {
	const QFactor = 2.2;
	const Q = QFactor / ((winningScore - losingScore) * 0.005 + QFactor);

	const movm = Math.log(goalDifference + 2) * Q;

	return movm;
}

function updateTeamScores(
	date: Date,
	ourSide: Side,
	theirSide: Side,
	ourScore: number,
	theirScore: number,
	K: number,
	teamPlayers: Player[],
	rankingOptions: Options,
) {
	const weWon = ourSide.goals > theirSide.goals;
	const S = weWon ? 1 : 0;
	const E = expectedScore(ourScore, theirScore);

	const movm = rankingOptions.useMovm
		? marginOfVictoryMultiplier(
				weWon ? ourScore : theirScore,
				weWon ? theirScore : ourScore,
				Math.abs(ourSide.goals - theirSide.goals),
		  )
		: 1;

	const decayFactor = rankingOptions.useDecay
		? 1 -
		  Math.max(
				0,
				((rankingOptions.currentDate.getTime() - date.getTime()) / DAY_MS) *
					DAILY_DECAY,
		  )
		: 1;

	const ourNewScore = ourScore + K * (S - E) * movm;
	const scoreRatio = (ourNewScore / ourScore) * decayFactor;

	console.error(`won=${weWon} movm=${movm} E=${E} decayFactor=${decayFactor} ourScore=${ourScore} ourNewScore=${ourNewScore} scoreRatio=${scoreRatio}`);

	// Update each player's score by multiplying it by the ratio of the new and old scores
	teamPlayers.forEach(player => {
		const playerOldScore= player.getScore();
		const playerNewScore = playerOldScore * scoreRatio;
		console.error(`${player.name} oldScore=${playerOldScore} newScore=${playerNewScore} delta=${playerNewScore - playerOldScore}`);
		player.setScore(playerNewScore);
		player.incrementPlayed();

		if (weWon) {
			player.incrementWins();
		} else {
			player.incrementLosses();
		}
	});
}

/**
 * Use a larger K factor when fewer games have been played so that the rankings adjust more quickly.
 *
 * @param played
 */
function kFactor(played: number) {
	if (played < 5) {
		return 60;
	} else {
		return 30;
	}
}

function expectedScore(scoreA: number, scoreB: number) {
	const x = scoreA - scoreB;

	return 1 / (1 + Math.pow(Math.E, -x / SCALE));
}

function ensurePlayersExist(players: Players, side: Side) {
	const sidePlayers: Player[] = [];
	for (const name of side.team) {
		if (!players[name]) {
			players[name] = new Player(name);
		}

		sidePlayers.push(players[name]);
	}
	return sidePlayers;
}

function getTotalScore(players: Player[]) {
	return players.reduce((total, player) => total + player.getScore(), 0);
}
