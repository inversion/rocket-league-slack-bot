import { INITIAL_SCORE } from './ranker';

export class Player {
	/**
	 * Number of games they have played.
	 */
	private played = 0;

	private wins = 0;

	private losses = 0;

	/**
	 * Their score
	 */
	public score = INITIAL_SCORE;

	constructor(public readonly name: string) {}

	toString() {
		return `Player[${this.name}]`;
	}

	public incrementWins() {
		this.wins++;
	}

	public getWins() {
		return this.wins;
	}

	public incrementLosses() {
		this.losses++;
	}

	public getLosses() {
		return this.losses;
	}

	public incrementPlayed() {
		this.played++;
	}

	public getPlayed() {
		return this.played;
	}

	public setScore(newScore: number) {
		this.score = newScore;
	}

	public getScore() {
		return this.score;
	}
}
