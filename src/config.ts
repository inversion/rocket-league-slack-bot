export interface Config {
	slackSigningSecret: string;
}

export function getConfigFromEnv(): Config {
	const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;

	if (!slackSigningSecret) {
		throw new Error('No SLACK_SIGNING_SECRET');
	}

	return { slackSigningSecret };
}
