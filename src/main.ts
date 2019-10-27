import { createServer } from './server';
import { getConfigFromEnv } from './config';
import { Database } from './database';
import { CommandHandler } from './commands';

if (require.main === module) {
	(async () => {
		try {
			const database = new Database();
			await database.setup();

			const config = getConfigFromEnv();

			const commandHandler = new CommandHandler(database, config);

			// For testing purposes
			if (process.argv[2] === '--viewDb') {
				console.log(await commandHandler.history());
				console.log(await commandHandler.stats());

				await database.teardown();

				process.exit();
			}

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
