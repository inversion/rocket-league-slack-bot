import { BaseModel } from './BaseModel';

export class PlayerModel extends BaseModel {
	static readonly tableName = 'players';

	static readonly idColumn = 'id';

	id!: number;
	name!: string;
	hidden!: boolean;
	win_emoji?: string;
	lose_emoji?: string;

	getLoseEmoji() {
		return `:${this.lose_emoji || 'confounded'}:`;
	}

	getWinEmoji() {
		return `:${this.win_emoji || 'grinning'}:`;
	}
    
    $parseDatabaseJson(json: Record<string, any>) {
		json = super.$parseDatabaseJson(json);

        json.hidden = json.hidden !== 'false' && json.hidden !== 0;

		return json;
	}
}
