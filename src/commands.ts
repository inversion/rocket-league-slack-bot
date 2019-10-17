import { Database } from './database';
import { parseFixturesFromString } from './Fixture';
import { calculatePlayerRanks, getSummary } from './ranker';

export class CommandHandler {
	constructor(private readonly database: Database) {}

	async handleCommand(body: any) {
		const command = body.command;

		if (command === '/rocket-record') {
			return this.record(body);
		} else if (command === '/rocket-table') {
			return this.table();
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

	public async table() {
		const fixtures = await this.database.getFixtures();

		const table = calculatePlayerRanks(fixtures);

		const summary = getSummary(table);

		return {
			response_type: 'in_channel',
			text: '```' + summary + '```',
		};
	}
}
