import { BaseModel } from './BaseModel';
import { Model } from 'objection';
import { PlayerModel } from './PlayerModel';
import { FixturesToPlayersModel } from './FixturesToPlayersModel';
import { TEAM_ID } from '../data/TeamId';
import { Fixture } from '../Fixture';

export interface FixturePlayerModel extends PlayerModel {
	team: TEAM_ID;
}

function playersOfTeam(players: FixturePlayerModel[], team: TEAM_ID): string[] {
	return players
		.filter(player => player.team === team)
		.map(player => player.name);
}

export class FixtureModel extends BaseModel {
	static readonly tableName = 'fixtures';

	static readonly idColumn = 'id';

	id!: number;
	date!: Date;
	blue_goals!: number;
	orange_goals!: number;
	players?: FixturePlayerModel[];

	static readonly relationMappings = {
		players: {
			relation: Model.ManyToManyRelation,
			modelClass: PlayerModel,
			join: {
				from: 'fixtures.id',
				through: {
					modelClass: FixturesToPlayersModel,
					from: 'fixtures_to_players.fixture_id',
					to: 'fixtures_to_players.player_id',
					extra: ['team'],
				},
				to: 'players.id',
			},
		},
	};

	toFixture(): Fixture {
		const { date, blue_goals, orange_goals, players } = this;
		const fixture = new Fixture(
			date,
			{
				goals: blue_goals,
				team: players ? playersOfTeam(players, TEAM_ID.BLUE) : [],
			},
			{
				goals: orange_goals,
				team: players ? playersOfTeam(players, TEAM_ID.ORANGE) : [],
			},
		);

		return fixture;
	}
}
