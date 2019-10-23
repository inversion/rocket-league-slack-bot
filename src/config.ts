export interface Config {
	slackSigningSecret: string;
	slackClientId: string;
	slackClientSecret: string;
	slackRedirectHost: string;
	slackHomeChannel?: string;
}

export function getConfigFromEnv(): Config {
	const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;

	if (!slackSigningSecret) {
		throw new Error('No SLACK_SIGNING_SECRET');
	}

	const slackClientId = process.env.SLACK_CLIENT_ID;

	if (!slackClientId) {
		throw new Error('No SLACK_CLIENT_ID');
	}

	const slackClientSecret = process.env.SLACK_CLIENT_SECRET;

	if (!slackClientSecret) {
		throw new Error('No SLACK_CLIENT_SECRET');
	}

	const slackRedirectHost = process.env.SLACK_REDIRECT_HOST;

	if (!slackRedirectHost) {
		throw new Error('No SLACK_REDIRECT_HOST');
	}

	const slackHomeChannel = process.env.SLACK_HOME_CHANNEL;

	return {
		slackSigningSecret,
		slackClientId,
		slackClientSecret,
		slackRedirectHost,
		slackHomeChannel,
	};
}
