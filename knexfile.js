module.exports = {
	development: {
		client: 'sqlite3',
		connection: {
			filename: './dev.sqlite3',
		},
		useNullAsDefault: true,
	},
	production: {
		client: 'sqlite3',
		connection: {
			filename: '/data/production.sqlite3',
		},
		useNullAsDefault: true,
	},
};
