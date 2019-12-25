import Knex from 'knex';
// @ts-ignore
import knexfile from '../knexfile';
import { Fixture } from './Fixture';
import { FixtureModel, FixturePlayerModel } from './models/FixtureModel';
import { PlayerModel } from './models/PlayerModel';
import { SeasonModel } from './models/SeasonModel';
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
		let insertedFixture!: FixtureModel;
		await this.knex.transaction(async trx => {
			insertedFixture = await FixtureModel.query(trx).insertAndFetch({
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

		if (!insertedFixture) {
			throw new Error('Fixture was not inserted');
		}

		return insertedFixture;
	}

	async deleteFixture(fixtureId: number) {
		// Unfortunately I did not add an ON DELETE CASCADE to this table and sqlite doesn't support ALTER TABLE to ADD CONSTRAINT
		// so just manually delete the player records
		await this.knex.transaction(async trx => {
			await FixturesToPlayersModel.query(trx)
				.where({
					fixture_id: fixtureId,
				})
				.delete();
			await FixtureModel.query(trx).deleteById(fixtureId);
			await trx.commit();
		});
	}

	public async getPlayerModels(): Promise<PlayerModel[]> {
		return PlayerModel.query(this.knex);
	}

	public async getPlayers(): Promise<Player[]> {
		const playerModels = await this.getPlayerModels();

		return playerModels.map(({ name, hidden }) => new Player(name, hidden));
	}

	public async getFixtureById(id: number): Promise<FixtureModel | undefined> {
		return FixtureModel.query(this.knex)
			.eager('players')
			.findOne({
				id,
			});
	}

	public async getFixtures(maxDate?: Date): Promise<Fixture[]> {
		const fixtureModels = await FixtureModel.query(this.knex).eager('players');

		return fixtureModels
			.map(model => model.toFixture())
			.filter(fixture => !maxDate || fixture.date <= maxDate);
	}

	public async getSeasons(): Promise<SeasonModel[]> {
		return SeasonModel.query(this.knex);
	}

	public async getCurrentSeason(): Promise<SeasonModel | undefined> {
		const seasons = await this.getSeasons();

		return seasons
			.filter(season => season.start_date <= new Date())
			.sort((a, b) => a.start_date.getTime() - b.start_date.getTime())
			.slice(-1)[0];
	}
}
