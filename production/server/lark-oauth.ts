import { defaultHttpInstance } from "@larksuiteoapi/node-sdk";
import { callbackUrl } from "./config";

// Pair the browser authorize endpoint with its documented Open API token endpoint.
// SDK accessToken.retrieveByAuthorizationCode uses /oauth/v3/token instead.
export const LARK_WEB_TOKEN_URL =
  "https://open.larksuite.com/open-apis/authen/v2/oauth/token";
export async function exchangeLarkCode(input: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier))
    throw { code: "INVALID_CODE_VERIFIER" };
  if (input.redirectUri !== callbackUrl())
    throw { code: "INVALID_REDIRECT_URI" };
  // The SDK HTTP adapter retains JSON response parsing but does not acquire an
  // app token, retry the single-use code or follow a credential-bearing redirect.
  const response = (await defaultHttpInstance.request({
    method: "POST",
    url: LARK_WEB_TOKEN_URL,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    timeout: 15000,
    maxRedirects: 0,
    data: {
      grant_type: "authorization_code",
      client_id: process.env.LARK_APP_ID,
      client_secret: process.env.LARK_APP_SECRET,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    },
  })) as { code?: number | string; error?: string; access_token?: string };
  if (
    !response ||
    ![undefined, 0, "0"].includes(response.code) ||
    response.error
  )
    throw { statusCode: 200, code: response?.code, error: response?.error };
  if (typeof response.access_token !== "string" || !response.access_token)
    throw { code: "MISSING_ACCESS_TOKEN" };
  return { accessToken: response.access_token };
}
