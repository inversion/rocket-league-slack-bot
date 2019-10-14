import { BaseModel } from './BaseModel';
import { Model } from 'objection';
import { PlayerModel } from './PlayerModel';
import { FixturesToPlayersModel } from './FixturesToPlayersModel';
import { TEAM_ID } from '../data/TeamId';

export interface FixturePlayerModel extends PlayerModel {
	team: TEAM_ID;
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
}
