export interface Config {
	slackSigningSecret: string;
	slackClientId: string;
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

	return { slackSigningSecret, slackClientId };
}
