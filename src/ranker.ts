import { formatChange } from './formatChange';
import { Fixture, Side } from './Fixture';
import { Player } from './Player';
import { defaults } from 'lodash';
import { DEBUG_NAME } from './debugName';

const debug = require('debug')(DEBUG_NAME);

export type Players = Record<string, Player>;
export interface RankerOptions {
	useMovm: boolean;
	useDecay: boolean;
	currentDate: Date;
}

interface Result {
	fixture: Fixture;
	scoreRatio: number;
	kFactor: number;
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
	players: Players = {},
	rankingOptionsInput?: Partial<RankerOptions>,
) {
	const rankingOptions = defaults(rankingOptionsInput || {}, {
		useMovm: true,
		useDecay: true,
		currentDate: new Date(),
	});

	const results: Result[] = [];

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
		const kFactor = determineKFactor(minPlayed);

		if (debug.enabled) {
			debug(`Game summary:
${date.toISOString()}
${blue.team.join(' ')} ${blue.goals} - ${orange.goals} ${orange.team.join(' ')}

		`);
		}

		const { scoreRatio } = updateTeamScores(
			fixture,
			date,
			blue,
			orange,
			scoreBlue,
			scoreOrange,
			kFactor,
			bluePlayers,
			rankingOptions,
		);
		updateTeamScores(
			fixture,
			date,
			orange,
			blue,
			scoreOrange,
			scoreBlue,
			kFactor,
			orangePlayers,
			rankingOptions,
		);

		results.push({ kFactor, fixture, scoreRatio });

		if (debug.enabled) {
			debug(getSummary(Object.values(players)));
		}
	}

	return {
		results,
		table: Object.values(players)
			.sort((a, b) => b.getScore() - a.getScore())
			.filter(player => player.isActive()),
	};
}

export function formatRank(rank: number) {
	let suffix = 'th';

	if (rank === 1) {
		suffix = 'st';
	} else if (rank === 2) {
		suffix = 'nd';
	} else if (rank === 3) {
		suffix = 'rd';
	}

	return `${rank}${suffix}`;
}

export function getSummary(table: Player[]) {
	const headings = [
		'Rank',
		'Name',
		'Score',
		'Played',
		'Won',
		'Lost',
		'Win Ratio',
		'GF',
		'GA',
		'GD',
		'GF/GA',
		'Idle Days',
	];

	const pad = (str: string) => str.padEnd(10, ' ');

	return [
		headings.map(pad).join(''),
		...table
			.filter(player => player.isActive())
			.map((player, i) => {
				const played = player.getPlayed();
				const wins = player.getWins();
				const losses = player.getLosses();
				const gf = player.getGoalsFor();
				const ga = player.getGoalsAgainst();
				return [
					formatRank(i + 1),
					player.name.substr(0, 7),
					`${Math.round(player.score)}`,
					`${played}`,
					`${wins}`,
					`${losses}`,
					`${played === 0 ? 0 : (wins / played).toFixed(2)}`,
					`${gf}`,
					`${ga}`,
					`${formatChange(gf - ga)}`,
					`${ga === 0 ? 0 : (gf / ga).toFixed(2)}`,
					`${player.idleDays()}`,
				]
					.map(pad)
					.join('');
			})
			.filter(line => !!line),
	].join('\n');
}

/**
 * Fixtures have less of an impact on score the further in the past they are.
 *
 * After 6 weeks, fixtures will have no impact.
 */
const DAILY_DECAY = 1 / 42;
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

	const movm = Math.log(goalDifference + 1) * Q;

	return movm;
}

function clamp(min: number, max: number) {
	return (num: number) => Math.min(Math.max(min, num), max);
}

function updateTeamScores(
	fixture: Fixture,
	date: Date,
	ourSide: Side,
	theirSide: Side,
	ourScore: number,
	theirScore: number,
	K: number,
	teamPlayers: Player[],
	rankingOptions: RankerOptions,
) {
	const weWon = ourSide.goals > theirSide.goals;
	const S = weWon ? 1 : 0;
	const E = expectedScore(ourScore, theirScore);

	const movm = rankingOptions.useMovm
		? Math.max(
				marginOfVictoryMultiplier(
					weWon ? ourScore : theirScore,
					weWon ? theirScore : ourScore,
					Math.abs(ourSide.goals - theirSide.goals),
				),
				1,
		  )
		: 1;

	const decayFactor = rankingOptions.useDecay
		? clamp(
				0,
				1,
		  )(
				((rankingOptions.currentDate.getTime() - date.getTime()) / DAY_MS) *
					DAILY_DECAY,
		  )
		: 0;

	const ourNewScore = ourScore + K * (S - E) * movm;
	const baseScoreRatio = ourNewScore / ourScore;

	// Apply the decay to the difference from 1 in the ratio rather than to the overall ratio
	const scoreRatio =
		baseScoreRatio > 1
			? 1 + (baseScoreRatio - 1) * (1 - decayFactor)
			: 1 - (1 - baseScoreRatio) * (1 - decayFactor);

	if (debug.enabled) {
		debug(
			`won=${weWon} movm=${movm.toFixed(2)} E=${E.toFixed(
				2,
			)} decayFactor=${decayFactor.toFixed(2)} ourScore=${ourScore.toFixed(
				2,
			)} ourNewScore=${ourNewScore.toFixed(
				2,
			)} baseScoreRatio=${baseScoreRatio.toFixed(
				2,
			)} scoreRatio=${scoreRatio.toFixed(2)}`,
		);
	}

	// Update each player's score by multiplying it by the ratio of the new and old scores
	teamPlayers.forEach(player => {
		const playerOldScore = player.getScore();
		const playerNewScore = playerOldScore * scoreRatio;
		if (debug.enabled) {
			debug(
				`${player.name} oldScore=${playerOldScore.toFixed(
					2,
				)} newScore=${playerNewScore.toFixed(2)} delta=${(
					playerNewScore - playerOldScore
				).toFixed(2)}`,
			);
		}
		player.setScore(playerNewScore);
		player.trackFixture(fixture);
	});

	return { scoreRatio };
}

export const enum K_FACTOR {
	NORMAL = 30,
	NEW = 60,
}

/**
 * Use a larger K factor when fewer games have been played so that the rankings adjust more quickly.
 *
 * @param played
 */
function determineKFactor(played: number) {
	if (played < 5) {
		return K_FACTOR.NEW;
	} else {
		return K_FACTOR.NORMAL;
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
