import { Database } from './database';
import { parseFixturesFromString } from './Fixture';
import { calculatePlayerRanks, getSummary, Players } from './ranker';
import request from 'request-promise-native';
import { format } from 'date-fns';

export class CommandHandler {
	constructor(private readonly database: Database) {}

	async handleCommand(body: any) {
		const command = body.command;

		const commandPrefix =
			process.env.NODE_ENV === 'production' ? '/rocket-' : '/';

		if (command === `${commandPrefix}record`) {
			return this.record(body);
		} else if (command === `${commandPrefix}table`) {
			return this.table();
		} else {
			throw new Error(`Unknown command ${command}`);
		}
	}

	public async record(body: any) {
		const fixtures = parseFixturesFromString(body.text);

		const fixtureModels = await Promise.all(
			fixtures.map(fixture => this.database.saveFixture(fixture)),
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
						} on ${format(date, 'Mo MMM')} at ${format(date, 'HH:mm')}`,
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
			],
		};
	}

	public async table() {
		const fixtures = await this.database.getFixtures();
		const players = await this.database.getPlayers();

		const table = calculatePlayerRanks(
			fixtures,
			players.reduce<Players>((acc, player) => {
				acc[player.name] = player;

				return acc;
			}, {}),
		);

		const summary = getSummary(table);

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
