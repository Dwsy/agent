/**
 * Type definitions for web-fetch extension
 */

// iflow response type
export interface IlowWebFetchResponse {
	success: boolean;
	code: string;
	message: string;
	data?: {
		outputs?: {
			data?: {
				data?: Array<{
					title?: string;
					content?: string;
					url?: string;
					site?: string;
					publishTime?: string;
				}>;
			};
		};
	};
}

// Qwen OAuth credentials
export interface QwenCreds {
	access_token: string;
	token_type: string;
	refresh_token?: string;
	resource_url?: string;
	expiry_date?: number;
}

// Qwen web search response
export interface QwenSearchResult {
	success?: boolean;
	data?: {
		list?: Array<{
			title?: string;
			content?: string;
			url?: string;
			site?: string;
			date?: string;
			score?: number;
		}>;
		total?: number;
	};
	message?: string;
}

// CLI Proxy API credential
export interface CliProxyCred {
	type: string;
	access_token: string;
	expired?: string;
	email?: string;
	file: string;
}

// Provider info for status display
export interface ProviderInfo {
	type: string;
	email: string;
	expired?: string;
}
