import Knex from 'knex';
// @ts-ignore
import knexfile from '../knexfile';
import { Fixture } from './Fixture';
import { FixtureModel, FixturePlayerModel } from './models/FixtureModel';
import { PlayerModel } from './models/PlayerModel';
import { FixturesToPlayersModel } from './models/FixturesToPlayersModel';
import { TEAM_ID } from './data/TeamId';
import { Player } from './Player';

export class Database {
	private readonly knex: Knex;

	constructor() {
		this.knex = Knex(
			process.env.NODE_ENV === 'production'
				? knexfile.production
				: knexfile.development,
		);
	}

	async setup() {
		console.error('Database setup done');
	}

	async teardown() {
		await this.knex.destroy();
	}

	private async addPlayersForTeam(
		trx: Knex.Transaction<any>,
		fixture: FixtureModel,
		team: TEAM_ID,
		names: string[],
	) {
		await Promise.all(
			names.map(name =>
				trx.raw(
					`INSERT INTO ??(fixture_id, player_id, team) VALUES(?, (SELECT id FROM ?? WHERE name = ?), ?);`,
					[
						FixturesToPlayersModel.tableName,
						fixture.id,
						PlayerModel.tableName,
						name,
						team,
					],
				),
			),
		);
	}

	public async saveFixture(fixture: Fixture) {
		await this.knex.transaction(async trx => {
			const insertedFixture = await FixtureModel.query(trx).insertAndFetch({
				date: fixture.date,
				blue_goals: fixture.blue.goals,
				orange_goals: fixture.orange.goals,
			});

			const players = [...fixture.blue.team, ...fixture.orange.team];

			await Promise.all(
				players.map(name =>
					trx.raw(`INSERT INTO ??(name) VALUES(?) ON CONFLICT DO NOTHING;`, [
						PlayerModel.tableName,
						name,
					]),
				),
			);

			await this.addPlayersForTeam(
				trx,
				insertedFixture,
				TEAM_ID.BLUE,
				fixture.blue.team,
			);

			await this.addPlayersForTeam(
				trx,
				insertedFixture,
				TEAM_ID.ORANGE,
				fixture.orange.team,
			);

			await trx.commit();
		});
	}

	private playersOfTeam(
		players: FixturePlayerModel[],
		team: TEAM_ID,
	): string[] {
		return players
			.filter(player => player.team === team)
			.map(player => player.name);
	}

	public async getPlayers(): Promise<Player[]> {
		const playerModels = await PlayerModel.query(this.knex);

		return playerModels.map(({ name, hidden }) => new Player(name, hidden));
	}

	public async getFixtures(): Promise<Fixture[]> {
		const fixtureModels = await FixtureModel.query(this.knex).eager('players');

		return fixtureModels.map(({ date, blue_goals, orange_goals, players }) => {
			const fixture = new Fixture(
				date,
				{
					goals: blue_goals,
					team: players ? this.playersOfTeam(players, TEAM_ID.BLUE) : [],
				},
				{
					goals: orange_goals,
					team: players ? this.playersOfTeam(players, TEAM_ID.ORANGE) : [],
				},
			);

			return fixture;
		});
	}
}
