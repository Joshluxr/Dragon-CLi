const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token";

export interface OpenAITokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<OpenAITokenResponse> {
  const payload = {
    client_id: OPENAI_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: "openid profile email",
  };
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI token refresh failed: ${text}`);
  }
  return response.json();
}
