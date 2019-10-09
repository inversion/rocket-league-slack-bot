import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import Router from '@koa/router';
import { CommandHandler } from './commands';
import { Config } from './config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * See https://api.slack.com/docs/verifying-requests-from-slack
 */
function verifySlackRequest(
	config: Config,
	ctx: Koa.ParameterizedContext<any, Router.RouterParamContext<any, {}>>,
) {
	const timestampHeader = ctx.request.headers['x-slack-request-timestamp'];

	const timestamp = parseInt(timestampHeader, 10);
	if (
		isNaN(timestamp) ||
		Math.abs(timestamp * 1000 - Date.now()) > 5 * 60 * 1000
	) {
		throw new Error(`Timestamp must be within 5 minutes of now`);
	}

	const sigBase = `v0:${timestamp}:${ctx.request.rawBody}`;

	const hmac = createHmac('sha256', config.slackSigningSecret);

	hmac.update(`${sigBase}`);

	const digest = `v0=${hmac.digest('hex')}`;

	const actualDigest = ctx.request.headers['x-slack-signature'];

	if (!actualDigest) {
		throw new Error(`No X-Slack-Signature header present`);
	}

	const isEqual = timingSafeEqual(
		Buffer.from(digest),
		Buffer.from(actualDigest),
	);

	if (!isEqual) {
		throw new Error(`Hashes do not match`);
	}
}

export async function createServer(
	config: Config,
	commandHandler: CommandHandler,
) {
	const port = 8888;
	const app = new Koa();

	app.use(bodyParser());

	const router = new Router();

	router.post('/command', async ctx => {
		try {
			verifySlackRequest(config, ctx);
		} catch (err) {
			console.error(err);
			ctx.response.body = 'Could not verify request is from Slack';
			ctx.response.status = 400;
			return;
		}

		const response = await commandHandler.handleCommand(ctx.request.body);

		console.error(
			`Slack command ${ctx.request.body.command} - response ${response}`,
		);

		ctx.response.status = 200;
		ctx.response.body = response;
	});

	// TODO: Interactive features
	// router.post('/interactive', ctx => {
	// 	verifySlackRequest(config, ctx);

	// 	// ctx.router available
	// 	console.log(ctx.body);
	// });

	app.use(router.routes()).use(router.allowedMethods());

	const server = await app.listen(port);

	console.error(`HTTP server listening on ${port}`);

	return server;
}
