exports.up = function(knex) {
	return knex.raw(
		`ALTER TABLE players ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT false;`,
	);
};

exports.down = function(knex) {
	return knex.raw(`ALTER TABLE players DROP COLUMN hidden;`);
};
