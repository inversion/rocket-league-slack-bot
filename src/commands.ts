import { Database } from './database';
import { parseFixturesFromString, Fixture, Side } from './Fixture';
import {
	calculatePlayerRanks,
	getSummary,
	Players,
	INITIAL_SCORE,
	formatRank,
	RankerOptions,
	K_FACTOR,
	expectedScore,
} from './ranker';
import request from 'request-promise-native';
import { format, addDays } from 'date-fns';
import { Config } from './config';
import { Player } from './Player';
import { flatten, uniq, compact } from 'lodash';
import { PlayerModel } from './models/PlayerModel';
import { formatChange } from './formatChange';
import { combinations } from './maths';

export function parseParameters(parameters: string) {
	const playerCountMatch = parameters.match(/(\d+)v\1/);

	let playersPerSide: number | undefined;

	if (!/(?:[\s]|^)all\b/.test(parameters)) {
		if (playerCountMatch) {
			playersPerSide = parseInt(playerCountMatch[1], 10);
		} else {
			playersPerSide = 2;
		}
	}

	const seasonMatch = parameters.match(/s(\d+)/);

	return {
		seasonId: seasonMatch ? parseInt(seasonMatch[1], 10) : undefined,
		playersPerSide,
		includeIdle: /\bidle\b/.test(parameters),
	};
}

const formatFixtureWithDate = (fixture: Fixture) =>
	`${format(fixture.date, 'do MMM yyyy')} ${fixture.toString()}`;

function keyByPlayerName(players: Player[]): Players {
	return players.reduce<Players>((acc, player) => {
		acc[player.name] = player;

		return acc;
	}, {});
}

interface SlackCommandBody {
	text: string;
	command: string;
	channel_name: string;
	response_url: string;
	user_name: string;
}

export class CommandHandler {
	constructor(
		private readonly database: Database,
		private readonly config: Config,
	) {}

	async handleCommand(body: SlackCommandBody) {
		const { command, text } = body;

		const commandPrefix =
			process.env.NODE_ENV === 'production' ? '/rocket-' : '/';

		if (command === `${commandPrefix}record`) {
			return this.record(body);
		} else if (command === `${commandPrefix}table`) {
			return this.table(text);
		} else if (command === `${commandPrefix}odds`) {
			return this.odds(body);
		} else if (command === `${commandPrefix}matches`) {
			return this.matches(body);
		} else if (command === `${commandPrefix}changes`) {
			return this.changes(text);
		} else if (command === `${commandPrefix}stats`) {
			return this.stats();
		} else if (command === `${commandPrefix}history`) {
			return this.history();
		} else {
			throw new Error(`Unknown command ${command}`);
		}
	}

	public async matches(body: SlackCommandBody) {
		const { text, response_url } = body;

		const {
			filterDescription,
			isCurrentSeason,
			playersPerSide,
			fixtureFilter,
		} = await this.createFilters(text);

		if (playersPerSide === undefined) {
			this.throwError(
				response_url,
				'Cannot calculate matches if playersPerSide is undefined (did you specify "all"?)',
			);
			return;
		}

		if (!isCurrentSeason) {
			this.throwError(
				response_url,
				'Cannot calculate matches if this is not the current season',
			);
			return;
		}

		const { players } = await this.getTable({
			fixtureFilter,
		});

		const names = text.trim().split(/\s+/);

		const includedPlayers = players.filter(player =>
			names.includes(player.name),
		);

		const sumScores = (players: Player[]) =>
			players.reduce((sum, player) => sum + player.getScore(), 0);

		const teams = combinations(includedPlayers, playersPerSide);

		const possibilities = combinations(teams, 2)
			.filter(([blue, orange]) => {
				const getName = (player: Player) => player.name;
				const blueNames = blue.map(getName);
				const orangeNames = orange.map(getName);

				return (
					blueNames.filter(name => orangeNames.includes(name)).length === 0
				);
			})
			.map(sides => ({
				sides,
				scoreDelta: Math.abs(sumScores(sides[0]) - sumScores(sides[1])),
			}))
			.sort((a, b) => a.scoreDelta - b.scoreDelta);

		const describePossibility = ({
			sides,
			scoreDelta,
		}: typeof possibilities[0]) =>
			`${sides[0].map(player => player.name).join(' ')} vs. ${sides[1]
				.map(player => player.name)
				.join(' ')} (total score difference ${Math.round(scoreDelta)})`;

		const countToPick = 5;

		const fairest = possibilities.slice(0, countToPick);
		const mostUnfair = possibilities.slice(-countToPick);

		return {
			response_type: 'in_channel',
			blocks: [
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `Possible matches for ${names}`,
					},
				},
				{
					type: 'divider',
				},
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `*Fairest ${countToPick}*\n${fairest
							.map(describePossibility)
							.join('\n')}`,
					},
				},
				{
					type: 'divider',
				},
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `*Most Unfair ${countToPick}*\n${mostUnfair
							.reverse()
							.map(describePossibility)
							.join('\n')}`,
					},
				},
				{
					type: 'context',
					elements: [
						{
							type: 'mrkdwn',
							text: filterDescription,
						},
					],
				},
			],
		};
	}

	public async record(body: SlackCommandBody) {
		const homeChannel = this.config.slackHomeChannel;
		if (homeChannel && body.channel_name !== homeChannel) {
			await this.throwError(
				body.response_url,
				`Sorry, you can only record games in the #${homeChannel} channel.`,
			);

			return;
		}
		const fixtures = parseFixturesFromString(body.text);

		if (!fixtures.length) {
			return;
		}

		const playerModels = await this.database.getPlayerModels();

		const involvedPlayers = compact(
			uniq(
				flatten(
					fixtures.map(fixture => [
						...fixture.blue.team,
						...fixture.orange.team,
					]),
				),
			).map(name => playerModels.find(model => model.name === name)),
		);

		const playersPerSideList = Object.values(
			fixtures.reduce<Record<number, number>>((acc, fixture) => {
				const blueLength = fixture.blue.team.length;
				const orangeLength = fixture.orange.team.length;

				if (blueLength === orangeLength) {
					acc[blueLength] = blueLength;
				}

				return acc;
			}, {}),
		);

		const oldTables = Object.assign(
			{},
			...(await Promise.all(
				playersPerSideList.map(async playersPerSide => ({
					[playersPerSide]: await this.getTable({
						fixtureFilter: (
							await this.createFilters(`${playersPerSide}v${playersPerSide}`)
						).fixtureFilter,
						excludeIdleFromTable: true,
					}),
				})),
			)),
		);

		const fixtureModels = await Promise.all(
			fixtures.map(fixture => this.database.saveFixture(fixture)),
		);

		const tableDiffs = await Promise.all(
			playersPerSideList.map(async playersPerSide => {
				const fixtureFilter = (
					await this.createFilters(`${playersPerSide}v${playersPerSide}`)
				).fixtureFilter;
				const oldTable = oldTables[playersPerSide];

				const newTable = await this.getTable({
					fixtureFilter,
					excludeIdleFromTable: true,
				});

				const diff = await this.getTableDiff(
					oldTable.table,
					newTable.table,
					involvedPlayers,
				);

				return [
					{
						type: 'section',
						text: {
							type: 'mrkdwn',
							text: `${playersPerSide}v${playersPerSide} league changes:`,
						},
					},
					...diff,
				];
			}),
		);

		const date = new Date();

		return {
			response_type: 'in_channel',
			blocks: [
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `${body.user_name} saved ${fixtures.length} new fixture${
							fixtures.length === 1 ? '' : 's'
						} on ${format(date, 'do MMM')} at ${format(date, 'HH:mm')}`,
					},
				},
				{
					type: 'divider',
				},
				...fixtures.map((fixture, i) => ({
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `${fixture.toString()}`,
					},
					accessory: {
						type: 'button',
						text: {
							type: 'plain_text',
							text: `:x: Delete`,
							emoji: true,
						},
						value: `delete_fixture_${fixtureModels[i].id}`,
					},
				})),
				{
					type: 'divider',
				},
				...flatten(tableDiffs),
			],
		};
	}

	matchingHistory(players: Player[], fixtures: Fixture[]) {
		const activePlayers = players.filter(player => player.isActive());

		type Matches = Record<
			string,
			{
				matches: Record<string, number>;
				player: Player;
			}
		>;

		const matchesForPlayers = activePlayers.reduce<Matches>(
			(acc, player) =>
				Object.assign(acc, {
					[player.name]: {
						player,
						matches: activePlayers.reduce((acc, otherPlayer) => {
							if (player.name !== otherPlayer.name) {
								Object.assign(acc, { [otherPlayer.name]: 0 });
							}
							return acc;
						}, {}),
					},
				}),
			{},
		);

		for (const fixture of fixtures) {
			for (const { team } of [fixture.blue, fixture.orange]) {
				for (let i = 0; i < team.length; i++) {
					const name = team[i];
					const otherNames = team.slice();
					otherNames.splice(i, 1);

					for (const otherName of otherNames) {
						if (
							!matchesForPlayers[name] ||
							matchesForPlayers[name].matches[otherName] === undefined
						) {
							continue;
						}
						matchesForPlayers[name].matches[otherName]++;
					}
				}
			}
		}

		const formatMatch = ([name, times]: [string, number]) =>
			`${name} (${times} time${times === 1 ? '' : 's'})`;

		return Object.values(matchesForPlayers)
			.sort((a, b) => a.player.name.localeCompare(b.player.name))
			.map(({ player, matches }) => {
				const sortedMatches = Object.entries(matches).sort(
					(a, b) => a[1] - b[1],
				);

				const most = sortedMatches[sortedMatches.length - 1];

				return `${player.name} has played most with ${formatMatch(
					most,
				)} and least with ${sortedMatches
					.slice(0, 5)
					.map(least => formatMatch(least))
					.join(', ')}`;
			})
			.join('\n');
	}

	async history() {
		const { fixtures } = await this.getTable();

		return fixtures
			.sort((a, b) => a.date.getTime() - b.date.getTime())
			.map(formatFixtureWithDate)
			.join('\n');
	}

	async stats() {
		const { results, players, fixtures } = await this.getTable({
			rankerOptions: {
				useDecay: false,
			},
		});

		if (!fixtures.length) {
			return 'No stats yet - record some games!';
		}

		const NUM_TO_SHOW = 5;

		const biggestVictories = fixtures
			.slice()
			.sort((a, b) => b.goalDifference() - a.goalDifference())
			.slice(0, NUM_TO_SHOW);

		const biggestUpsets = results
			.slice()
			// Exclude new games
			.filter(result => result.kFactor < K_FACTOR.NEW)
			.sort((a, b) => b.scoreRatio - a.scoreRatio)
			.slice(0, NUM_TO_SHOW);

		const stats = `
Biggest Victories:
${biggestVictories
	.map(
		fixture =>
			`${formatFixtureWithDate(fixture)} (+${fixture.goalDifference()} GD)`,
	)
	.join('\n')}

Biggest Upsets (excludes games for new players):
${biggestUpsets.map(({ fixture }) => formatFixtureWithDate(fixture)).join('\n')}
		
${this.matchingHistory(players, fixtures)}
`;

		return {
			response_type: 'in_channel',
			text: stats,
		};
	}

	public async changes(parameters: string) {
		const { filterDescription, fixtureFilter } = await this.createFilters(
			parameters,
		);

		const oldTable = await this.getTable({
			maxDate: addDays(new Date(), -1),
			fixtureFilter,
		});

		const newTable = await this.getTable({ fixtureFilter });

		return {
			response_type: 'in_channel',
			blocks: [
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `Changes in the last 24 hours`,
					},
				},
				{
					type: 'divider',
				},
				...(await this.getTableDiff(oldTable.table, newTable.table)),
				{
					type: 'context',
					elements: [
						{
							type: 'mrkdwn',
							text: filterDescription,
						},
					],
				},
			],
		};
	}

	private async getTable({
		maxDate,
		fixtureFilter,
		isCurrentSeason,
		rankerOptions,
		excludeIdleFromTable,
	}: {
		maxDate?: Date;
		fixtureFilter?: (fixture: Fixture) => boolean;
		isCurrentSeason?: boolean;
		rankerOptions?: Partial<RankerOptions>;
		excludeIdleFromTable?: boolean;
	} = {}) {
		let fixtures = await this.database.getFixtures(maxDate);

		if (fixtureFilter) {
			fixtures = fixtures.filter(fixtureFilter);
		}

		const players = await this.database.getPlayers();

		const endDate = isCurrentSeason
			? new Date()
			: fixtures.sort((a, b) => b.date.getTime() - a.date.getTime())?.[0]?.date;

		const { results, table } = calculatePlayerRanks(
			fixtures,
			keyByPlayerName(players),
			Object.assign(
				{
					endDate,
					currentDate: isCurrentSeason ? new Date() : endDate,
				},
				rankerOptions,
			),
		);

		return {
			players,
			fixtures,
			results,
			table: excludeIdleFromTable
				? table.filter(player => player.isActive())
				: table,
		};
	}

	private async getTableDiff(
		oldTable: Player[],
		newTable: Player[],
		involvedPlayers?: PlayerModel[],
	) {
		const models = (involvedPlayers || (await this.database.getPlayerModels()))
			.filter(model => !model.hidden)
			.sort((a, b) => {
				const aPlayer = newTable.find(player => player.name === a.name);

				const bPlayer = newTable.find(player => player.name === b.name);

				if (!aPlayer || !bPlayer) {
					return 0;
				}

				return bPlayer.getScore() - aPlayer.getScore();
			});

		return compact(
			models.map(playerModel => {
				const oldRank = oldTable.findIndex(
					player => player.name === playerModel.name,
				);
				const oldRecord = oldRank !== -1 ? oldTable[oldRank] : undefined;

				const newRank = newTable.findIndex(
					player => player.name === playerModel.name,
				);
				const newRecord = newRank !== -1 ? newTable[newRank] : undefined;

				if (!oldRecord || !newRecord) {
					return;
				}

				const scoreChange = Math.round(
					newRecord.getScore() -
						(oldRecord ? oldRecord.getScore() : INITIAL_SCORE),
				);

				if (scoreChange === 0) {
					return;
				}

				const rankChange = oldRank ? oldRank - newRank : 0;

				const rankChangeEmoji =
					rankChange === 0
						? ''
						: rankChange > 0
						? ':arrow_up:'
						: ':arrow_down:';

				return {
					type: 'section',
					text: {
						verbatim: true,
						type: 'mrkdwn',
						text: `${
							scoreChange > 0
								? playerModel.getWinEmoji()
								: playerModel.getLoseEmoji()
						} ${playerModel.name} - Score: ${Math.round(
							newRecord.getScore(),
						)} ${formatChange(scoreChange)}. Rank: ${formatRank(
							newRank + 1,
						)} ${formatChange(rankChange)} ${rankChangeEmoji}`,
					},
				};
			}),
		);
	}

	private async createFilters(parameters: string) {
		const { playersPerSide, seasonId, includeIdle } = parseParameters(
			parameters,
		);

		const currentSeason = await this.database.getCurrentSeason();

		const allSeasons = await this.database.getSeasons();

		const season =
			(seasonId && allSeasons.find(season => season.id === seasonId)) ||
			currentSeason;
		const isCurrentSeason = currentSeason?.id === season?.id;

		const maxDate =
			isCurrentSeason || !season
				? undefined
				: allSeasons.find(s => s.id === season.id + 1)?.start_date;

		const fixtureFilter =
			playersPerSide !== undefined
				? this.createFixtureFilter(playersPerSide, season?.start_date, maxDate)
				: undefined;

		const seasonDescription = season?.description();

		return {
			includeIdle,
			fixtureFilter,
			playersPerSide,
			seasonDescription,
			isCurrentSeason,
			filterDescription: [
				playersPerSide !== undefined
					? `${playersPerSide}v${playersPerSide}`
					: 'Overall',
				'League',
				seasonDescription,
				!isCurrentSeason && '(End of Season Table)',
			]
				.filter(item => !!item)
				.join(' '),
		};
	}

	private async throwError(response_url: string, text: string) {
		await request.post({
			url: response_url,
			json: true,
			body: {
				response_type: 'ephemeral',
				replace_original: false,
				text,
			},
		});

		throw new Error(text);
	}

	public async odds(body: SlackCommandBody) {
		const inputFixtures = parseFixturesFromString(body.text);

		if (inputFixtures.length !== 1) {
			await this.throwError(
				body.response_url,
				`You must specify exactly one fixture to calculate odds for.`,
			);
		}

		const fixture = inputFixtures[0];

		const { blue, orange } = fixture;

		const { players, fixtures } = await this.getTable({
			fixtureFilter: this.createFixtureFilter(blue.team.length),
		});

		if (
			![...blue.team, ...orange.team].every(name =>
				players.find(player => player.name === name),
			)
		) {
			await this.throwError(
				body.response_url,
				`Cannot calculate odds unless all players involved are in the table already.`,
			);
		}

		const winningSide = blue.goals > orange.goals ? blue : orange;
		const losingSide = blue.goals > orange.goals ? orange : blue;

		const scoreForSide = (side: Side) =>
			side.team
				.map(name => players.find(player => player.name === name)?.getScore())
				.reduce<number>((sum, val) => (val ? sum + val : sum), 0);

		const E = expectedScore(
			scoreForSide(winningSide),
			scoreForSide(losingSide),
		);

		/**
		 * TODO. Things to incorporate to make this more accurate:
		 *
		 * - When those specific sides have met before
		 * - Recent performance of players involved
		 * - Recent performance of that side
		 * - The wagered goal difference (cliff for when it's impractical for there to be enough time to score e.g. 20 goals for one side)
		 */

		/**
		 * TODO. Would be nice to make this not need a score (and predict what the score might be!)
		 */

		return {
			response_type: 'in_channel',
			blocks: [
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `Odds for ${fixture.toString()}`,
					},
				},
				{
					type: 'divider',
				},
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `${winningSide.team.join(' ')} chance to win: *${Math.round(
							E * 100,
						)}%*`,
					},
				},
			],
		};
	}

	public async table(parameters: string) {
		const {
			filterDescription,
			fixtureFilter,
			isCurrentSeason,
			includeIdle,
		} = await this.createFilters(parameters);

		const summary = getSummary(
			(
				await this.getTable({
					fixtureFilter,
					isCurrentSeason,
				})
			).table,
			{ includeIdle: includeIdle || !isCurrentSeason },
		);

		return {
			response_type: 'in_channel',
			text: filterDescription + `\n` + '```' + summary + '```',
		};
	}

	private createFixtureFilter(
		playersPerSide: number,
		minDate?: Date,
		maxDate?: Date,
	) {
		return (fixture: Fixture) =>
			(minDate ? fixture.date >= minDate : true) &&
			(maxDate ? fixture.date < maxDate : true) &&
			fixture.blue.team.length === playersPerSide &&
			fixture.orange.team.length === playersPerSide;
	}

	async handleInteraction(payload: any) {
		for (const action of payload.actions) {
			const deleteFixtureMatch = action.value.match(/^delete_fixture_(\d+)/);

			if (deleteFixtureMatch) {
				const fixtureId = parseInt(deleteFixtureMatch[1], 10);
				const fixtureModel = await this.database.getFixtureById(fixtureId);

				if (!fixtureModel) {
					await this.throwError(
						payload.response_url,
						`Could not delete fixture with ID ${fixtureId} - has it already been deleted?`,
					);
					return;
				}

				await this.database.deleteFixture(fixtureId);

				await request.post({
					url: payload.response_url,
					json: true,
					body: {
						response_type: 'in_channel',
						replace_original: false,
						text: `Fixture ${fixtureModel
							.toFixture()
							.toString()} was deleted by ${payload.user.name}`,
					},
				});
			}
		}
	}
}
