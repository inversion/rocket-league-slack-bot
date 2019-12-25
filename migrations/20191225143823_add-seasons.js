exports.up = async function(knex) {
	await knex.raw(`CREATE TABLE seasons (
    id INTEGER PRIMARY KEY,
    start_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
};

exports.down = async function(knex) {
	await knex.raw(`DROP TABLE seasons;`);
};
