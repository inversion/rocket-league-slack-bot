import { Database } from './database';
import { parseFixturesFromString, Fixture } from './Fixture';
import {
	calculatePlayerRanks,
	getSummary,
	Players,
	INITIAL_SCORE,
	formatRank,
	RankerOptions,
} from './ranker';
import request from 'request-promise-native';
import { format, addDays } from 'date-fns';
import { Config } from './config';
import { Player } from './Player';
import { flatten, uniq, compact } from 'lodash';
import { PlayerModel } from './models/PlayerModel';
import { formatChange } from './formatChange';

const formatFixtureWithDate = (fixture: Fixture) =>
	`${format(fixture.date, 'do MMM yyyy')} ${fixture.toString()}`;

function keyByPlayerName(players: Player[]): Players {
	return players.reduce<Players>((acc, player) => {
		acc[player.name] = player;

		return acc;
	}, {});
}

export class CommandHandler {
	constructor(
		private readonly database: Database,
		private readonly config: Config,
	) {}

	async handleCommand(body: any) {
		const command = body.command;

		const commandPrefix =
			process.env.NODE_ENV === 'production' ? '/rocket-' : '/';

		if (command === `${commandPrefix}record`) {
			return this.record(body);
		} else if (command === `${commandPrefix}table`) {
			return this.table();
		} else if (command === `${commandPrefix}changes`) {
			return this.changes(body);
		} else if (command === `${commandPrefix}stats`) {
			return this.stats();
		} else if (command === `${commandPrefix}history`) {
			return this.history();
		} else {
			throw new Error(`Unknown command ${command}`);
		}
	}

	public async record(body: any) {
		const homeChannel = this.config.slackHomeChannel;
		if (homeChannel && body.channel_name !== homeChannel) {
			await request.post({
				url: body.response_url,
				json: true,
				body: {
					response_type: 'ephemeral',
					text: `Sorry, you can only record games in the #${homeChannel} channel.`,
				},
			});
			return;
		}
		const fixtures = parseFixturesFromString(body.text);

		const oldTable = await this.getTable();

		const fixtureModels = await Promise.all(
			fixtures.map(fixture => this.database.saveFixture(fixture)),
		);

		const newTable = await this.getTable();

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
				...(await this.getTableDiff(
					oldTable.table,
					newTable.table,
					involvedPlayers,
				)),
			],
		};
	}

	matches(players: Player[], fixtures: Fixture[]) {
		const activePlayers = players.filter(player => !player.hidden);

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
			`${name} (${times} times)`;

		return Object.values(matchesForPlayers)
			.sort((a, b) => a.player.name.localeCompare(b.player.name))
			.map(({ player, matches }) => {
				const sortedMatches = Object.entries(matches).sort(
					(a, b) => a[1] - b[1],
				);

				const most = sortedMatches[sortedMatches.length - 1];
				const least = sortedMatches[0];

				return `${player.name} has played most with ${formatMatch(
					most,
				)} and least with ${formatMatch(least)}`;
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
		const { results, players, fixtures } = await this.getTable(undefined, {
			useDecay: false,
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

Biggest Upsets:
${biggestUpsets.map(({ fixture }) => formatFixtureWithDate(fixture)).join('\n')}
		
${this.matches(players, fixtures)}
`;

		return {
			response_type: 'in_channel',
			text: stats,
		};
	}

	public async changes(body: any) {
		const oldTable = await this.getTable(addDays(new Date(), -1));

		const newTable = await this.getTable();

		return {
			response_type: 'in_channel',
			blocks: [
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `Changes in the table in the last 24 hours`,
					},
				},
				{
					type: 'divider',
				},
				...(await this.getTableDiff(oldTable.table, newTable.table)),
			],
		};
	}

	private async getTable(
		maxDate?: Date,
		rankerOptions?: Partial<RankerOptions>,
	) {
		const fixtures = await this.database.getFixtures(maxDate);
		const players = await this.database.getPlayers();

		return {
			players,
			fixtures,
			...calculatePlayerRanks(
				fixtures,
				keyByPlayerName(players),
				rankerOptions,
			),
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
				const aScore = newTable
					.find(player => player.name === a.name)!
					.getScore();
				const bScore = newTable
					.find(player => player.name === b.name)!
					.getScore();

				return bScore - aScore;
			});

		return models.map(playerModel => {
			const oldRank = oldTable.findIndex(
				player => player.name === playerModel.name,
			);
			const oldRecord = oldRank !== -1 ? oldTable[oldRank] : undefined;

			const newRank = newTable.findIndex(
				player => player.name === playerModel.name,
			);
			const newRecord = newTable[newRank];

			const scoreChange = Math.round(
				newRecord.getScore() -
					(oldRecord ? oldRecord.getScore() : INITIAL_SCORE),
			);

			const rankChange = oldRank ? oldRank - newRank : 0;

			const rankChangeEmoji =
				rankChange === 0 ? '' : rankChange > 0 ? ':arrow_up:' : ':arrow_down:';

			return {
				type: 'section',
				text: {
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
		});
	}

	public async table() {
		const summary = getSummary((await this.getTable()).table);

		return {
			response_type: 'in_channel',
			text: '```' + summary + '```',
		};
	}

	async handleInteraction(payload: any) {
		for (const action of payload.actions) {
			const deleteFixtureMatch = action.value.match(/^delete_fixture_(\d+)/);

			if (deleteFixtureMatch) {
				const fixtureId = parseInt(deleteFixtureMatch[1], 10);
				const fixtureModel = await this.database.getFixtureById(fixtureId);

				if (!fixtureModel) {
					const text = `Could not delete fixture with ID ${fixtureId} - has it already been deleted?`;
					await request.post({
						url: payload.response_url,
						json: true,
						body: {
							response_type: 'ephemeral',
							replace_original: false,
							text,
						},
					});

					throw new Error(text);
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
