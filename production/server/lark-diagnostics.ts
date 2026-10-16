const oauthErrors = new Set([
  "invalid_client",
  "invalid_grant",
  "invalid_request",
  "invalid_scope",
  "unauthorized_client",
  "unsupported_grant_type",
  "access_denied",
  "server_error",
  "temporarily_unavailable",
]);
const transportErrors = new Set([
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNABORTED",
  "ERR_NETWORK",
  "ERR_BAD_REQUEST",
  "ERR_BAD_RESPONSE",
  "MISSING_ACCESS_TOKEN",
  "INVALID_USER_INFO",
  "INVALID_CODE_VERIFIER",
  "INVALID_REDIRECT_URI",
]);

// Never spread a provider/Axios error or log its message, response body, headers,
// request config or tokens. Only bounded status/code fields may leave this module.
export function larkFailureDetails(
  error: unknown,
  stage: "token_exchange" | "user_info",
) {
  const e = error as any;
  const status = e?.statusCode ?? e?.response?.status;
  const rawCode = e?.response?.data?.code ?? e?.code;
  const code =
    typeof rawCode === "string" && /^\d{1,9}$/.test(rawCode)
      ? Number(rawCode)
      : rawCode;
  const oauthError = e?.error ?? e?.response?.data?.error;
  return {
    stage,
    httpStatus:
      Number.isInteger(status) && status >= 0 && status <= 599 ? status : null,
    providerCode:
      Number.isSafeInteger(code) && code >= 0 && code <= 1e9 ? code : null,
    oauthError: oauthErrors.has(oauthError) ? oauthError : null,
    transportCode: transportErrors.has(code) ? code : null,
  };
}
