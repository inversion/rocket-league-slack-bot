exports.up = function(knex) {
	return knex.raw(`
	ALTER TABLE players ADD COLUMN win_emoji TEXT;
	`);
};

exports.down = function(knex) {
	return knex.raw(`
	ALTER TABLE players DROP COLUMN win_emoji;
	`);
};
