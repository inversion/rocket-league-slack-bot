export interface Side {
	team: string[];
	goals: number;
}

export class Fixture {
	constructor(
		public date: Date,
		public readonly blue: Side,
		public readonly orange: Side,
	) {
		if (
			![blue.goals, orange.goals].every(score => score >= 0 && score % 1 === 0)
		) {
			throw new Error(`Goals must be integers >= 0`);
		}

		if (blue.goals === orange.goals) {
			throw new Error(`Draws are not possible in Rocket League`);
		}
	}

	toString() {
		return `${this.blue.team.join(' ')} *${this.blue.goals}* - *${
			this.orange.goals
		}* ${this.orange.team.join(' ')}`;
	}

	goalDifference() {
		return Math.abs(this.blue.goals - this.orange.goals);
	}
}

const playerNames = (str: string) => str.split(/\s+/).filter(s => s.length);
const goals = (str: string) => parseInt(str, 10);

export function parseFixturesFromString(str: string) {
	return str
		.split(/\r?\n/)
		.map(line => line.trim().toLowerCase())
		.filter(line => line.length)
		.map(line => {
			const match = line.match(
				/^((?:[@a-z]+\s*)+)\s+(\d+)\s+(\d+)\s+((?:[@a-z]\s*)+)$/,
			);

			if (!match) {
				throw new Error('No match');
			}

			const [
				,
				bluePlayers,
				blueGoalsStr,
				orangeGoalsStr,
				orangePlayers,
			] = match;

			return new Fixture(
				new Date(),
				{
					team: playerNames(bluePlayers),
					goals: goals(blueGoalsStr),
				},
				{
					team: playerNames(orangePlayers),
					goals: goals(orangeGoalsStr),
				},
			);
		});
}
