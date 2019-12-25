import { BaseModel } from './BaseModel';
import { format } from 'date-fns';

export class SeasonModel extends BaseModel {
	static readonly tableName = 'seasons';

	static readonly idColumn = 'id';

	id!: number;
	start_date!: Date;

	description() {
		return `Season ${this.id} (started ${format(
			this.start_date,
			'do MMM yyyy',
		)})`;
	}
}
