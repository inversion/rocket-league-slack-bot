import { createServer } from './server';
import { getConfigFromEnv } from './config';
import { Database } from './database';
import { CommandHandler } from './commands';

if (require.main === module) {
	(async () => {
		try {
			const database = new Database();
			await database.setup();

			// For testing purposes
			if (process.argv[2] === '--viewDb') {
				const commandHandler = new CommandHandler(database, {} as any);
				console.log(await commandHandler.history());
				console.log(await commandHandler.stats());
				console.log(await commandHandler.table(''));
				console.log(await commandHandler.table('1v1'));
				console.log(await commandHandler.table('2v2'));
				console.log(await commandHandler.table('3v3'));
				console.log(await commandHandler.table('all'));
				console.log(
					JSON.stringify(
						await commandHandler.record({
							text: '@jack @owen 1 5 @hugh @andrew',
						}),
						null,
						2,
					),
				);

				await database.teardown();

				process.exit();
			}

			const config = getConfigFromEnv();

			const commandHandler = new CommandHandler(database, config);

			const server = await createServer(config, commandHandler);

			const gracefullyTerminate = async (code: any) => {
				console.error(`Caught ${code}. Stopping HTTP server...`);

				await new Promise((fulfil, reject) =>
					server.close(err => (err ? reject(err) : fulfil())),
				);
				await database.teardown();
				console.error('Gracefully terminating...');

				process.exit();
			};

			process.on('SIGINT', gracefullyTerminate);
			process.on('SIGTERM', gracefullyTerminate);
		} catch (err) {
			console.error(err);
			process.exit(1);
		}
	})();
}
