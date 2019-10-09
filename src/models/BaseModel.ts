import { Model } from 'objection';

const isDateColumn = (colName: string) => colName.endsWith('date');

export class BaseModel extends Model {
	$parseDatabaseJson(json: Record<string, any>) {
		json = super.$parseDatabaseJson(json);

		for (const key of Object.keys(json)) {
			if (isDateColumn(key)) {
				json[key] = new Date(json[key]);
			}
		}

		return json;
	}

	$formatDatabaseJson(json: Record<string, any>) {
		json = super.$formatDatabaseJson(json);

		for (const key of Object.keys(json)) {
			if (isDateColumn(key)) {
				json[key] = json[key].toISOString();
			}
		}

		return json;
	}
}
