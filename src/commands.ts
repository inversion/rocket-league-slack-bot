import { Database } from './database';
import { parseFixturesFromString } from './Fixture';
import { calculatePlayerRanks } from './ranker';

export class CommandHandler {
	constructor(private readonly database: Database) {}

	async handleCommand(body: any) {
		const command = body.command;

		if (command === '/rocket-record') {
			return this.record(body);
		} else if (command === '/rocket-table') {
			return this.table(body);
		} else {
			throw new Error(`Unknown command ${command}`);
		}
	}

	public async record(body: any) {
		const fixtures = parseFixturesFromString(body.text);

		await Promise.all(
			fixtures.map(fixture => this.database.saveFixture(fixture)),
		);

		return {
			response_type: 'in_channel',
			text: `${body.user_id} saved ${
				fixtures.length
			} new fixture(s):\n${fixtures
				.map(fixture => fixture.toString())
				.join('\n')}`,
		};
	}

	public async table(body: any) {
		const fixtures = await this.database.getFixtures();

		const table = calculatePlayerRanks(fixtures);

		const headings = ['Name', 'Score', 'Played', 'Won', 'Lost'];

		const pad = (str: string) => str.padEnd(15, ' ');

		return {
			response_type: 'in_channel',
			text:
				'```' +
				[
					headings.map(pad).join(''),
					...table.map(player =>
						[
							player.name,
							`${Math.round(player.score)}`,
							`${player.getPlayed()}`,
							`${player.getWins()}`,
							`${player.getLosses()}`,
						]
							.map(pad)
							.join(''),
					),
				].join('\n') +
				'```',
		};
	}
}
