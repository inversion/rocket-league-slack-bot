import { INITIAL_SCORE } from './ranker';
import { Fixture } from './Fixture';
import { differenceInDays } from 'date-fns';

/**
 * Players will be hidden from the table if they have not played for this many days.
 */
const TABLE_DISPLAY_CUTOFF_DAYS = 7;

export class Player {
	private wins = 0;

	private losses = 0;

	private goalsFor = 0;

	private goalsAgainst = 0;

	private fixtures: Fixture[] = [];

	/**
	 * Their score
	 */
	public score = INITIAL_SCORE;

	constructor(public readonly name: string, public readonly hidden = false) {}

	toString() {
		return `Player[${this.name}]`;
	}

	public trackFixture(fixture: Fixture) {
		this.fixtures.push(fixture);

		const ourSideName = fixture.blue.team.includes(this.name)
			? 'blue'
			: 'orange';
		const theirSideName = ourSideName === 'blue' ? 'orange' : 'blue';

		const ourGoals = fixture[ourSideName].goals;
		const theirGoals = fixture[theirSideName].goals;

		this.goalsFor += ourGoals;
		this.goalsAgainst += theirGoals;

		const weWon = ourGoals > theirGoals;

		if (weWon) {
			this.wins++;
		} else {
			this.losses++;
		}
	}

	public getWins() {
		return this.wins;
	}

	public getLosses() {
		return this.losses;
	}

	public getPlayed() {
		return this.fixtures.length;
	}

	public setScore(newScore: number) {
		this.score = newScore;
	}

	public getScore() {
		return this.score;
	}

	public getLastFixtureDate() {
		return this.fixtures.sort((a, b) => b.date.getTime() - a.date.getTime())[0]
			.date;
	}

	public idleDays() {
		return differenceInDays(new Date(), this.getLastFixtureDate());
	}

	public isActive() {
		return (
			!this.hidden &&
			this.getPlayed() > 0 &&
			this.idleDays() <= TABLE_DISPLAY_CUTOFF_DAYS
		);
	}

	public getGoalsAgainst(): number {
		return this.goalsAgainst;
	}

	public getGoalsFor(): number {
		return this.goalsFor;
	}
}
