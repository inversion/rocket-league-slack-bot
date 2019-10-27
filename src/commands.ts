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

function keyByPlayerName(players: Player[]): Players {
	return players.reduce<Players>((acc, player) => {
		acc[player.name] = player;

		return acc;
	}, {});
}

function formatChange(change: number) {
	if (change === 0) {
		return '';
	} else if (change > 0) {
		return `(+${change})`;
	} else {
		return `(${change})`;
	}
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

	async stats() {
		const { results, fixtures } = await this.getTable(undefined, {
			useDecay: false,
		});

		if (!fixtures.length) {
			return 'No stats yet - record some games!';
		}

		const formatFixtureWithDate = (fixture: Fixture) =>
			`${format(fixture.date, 'do MMM yyyy')} ${fixture.toString()}`;

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
		`;

		return stats;
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
