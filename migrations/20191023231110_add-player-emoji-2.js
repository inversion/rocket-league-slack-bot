exports.up = function(knex) {
	return knex.raw(`
	ALTER TABLE players ADD COLUMN lose_emoji TEXT;
	`);
};

exports.down = function(knex) {
	return knex.raw(`
	ALTER TABLE players DROP COLUMN lose_emoji;
	`);
};
