import type { IAuthenticateGeneric, Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class Yandex360OAuth2Api implements ICredentialType {
	name = 'yandex360OAuth2Api';

	icon = 'file:yandex360.svg' as Icon;

	displayName = 'Yandex 360 OAuth2 API';

	documentationUrl = 'https://yandex.com/dev/id/doc/en/';

	properties: INodeProperties[] = [
		{
			displayName: 'OAuth Token',
			name: 'oauthToken',
			type: 'string',
			typeOptions: {
				password: true,
			},
			required: true,
			default: '',
			description: 'The OAuth token for accessing Yandex 360 API',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=OAuth {{$credentials.oauthToken}}',
			},
		},
	};
}
