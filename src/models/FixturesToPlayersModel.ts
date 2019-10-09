import { BaseModel } from './BaseModel';
import { TEAM_ID } from '../data/TeamId';

export class FixturesToPlayersModel extends BaseModel {
	static readonly tableName = 'fixtures_to_players';

	static readonly idColumn = ['fixture_id', 'player_id'];

	fixture_id!: number;
	player_id!: number;
	team!: TEAM_ID;
}
