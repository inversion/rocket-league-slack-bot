import { BaseModel } from './BaseModel';

export class PlayerModel extends BaseModel {
	static readonly tableName = 'players';

	static readonly idColumn = 'id';

	id!: number;
	name!: string;
	hidden!: boolean;
}
