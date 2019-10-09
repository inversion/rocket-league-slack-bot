'use strict';

exports.up = async function(knex) {
	await knex.raw(`
    CREATE TABLE players (
        id INTEGER PRIMARY KEY, 
        name TEXT UNIQUE NOT NULL
    );`);

	await knex.raw(`
    CREATE TABLE fixtures (
        id INTEGER PRIMARY KEY,
        date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        blue_goals INTEGER NOT NULL,
        orange_goals INTEGER NOT NULL
    );`);

	await knex.raw(`
    CREATE TABLE fixtures_to_players (
        fixture_id INTEGER NOT NULL REFERENCES fixtures(id),
        player_id INTEGER NOT NULL REFERENCES players(id),
        team INTEGER NOT NULL,
        PRIMARY KEY(fixture_id, player_id)
    );
    `);
};
exports.down = async function(knex) {
	await knex.raw(`
    DROP TABLE fixtures_to_players;
    DROP TABLE fixtures;
    DROP TABLE players;
    `);
};
