import crypto from "crypto";
import axios from "axios";
import ReactionError from "@reactioncommerce/reaction-error";

const DEFAULT_SANDBOX_BASE_URL = "https://gateway-service-sandbox.easypaisa.com.pk";
const DEFAULT_PROD_BASE_URL = "https://gateway-service.easypaisa.com.pk";

/** Refresh JWT ~5 minutes before the documented 20-minute expiry. */
const JWT_REFRESH_BUFFER_MS = 5 * 60 * 1000;

let cachedJwt = null;
let cachedJwtExpiresAt = 0;
let cachedRefreshJwt = null;
let jwtInflight = null;

/**
 * @returns {string} EasyPaisa gateway base URL (no trailing slash)
 */
export function getEasyPaisaBaseUrl() {
  if (process.env.EASYPAISABASEURL) {
    return process.env.EASYPAISABASEURL.replace(/\/$/, "");
  }
  const env = (process.env.ENVIRONMENT || process.env.NODE_ENV || "").toLowerCase();
  if (env === "production") {
    return DEFAULT_PROD_BASE_URL;
  }
  return DEFAULT_SANDBOX_BASE_URL;
}

/**
 * Build MD5 signature per API Integration Guide V1.5:
 * MD5(UPPERCASE(compact JSON of request payload + apisecret))
 * @param {Object} requestPayload Business payload (without signature)
 * @param {string} apiSecret Shared API secret
 * @returns {string} MD5 hex digest
 */
export function createEasyPaisaSignature(requestPayload, apiSecret) {
  if (!apiSecret) {
    throw new ReactionError(
      "invalid-configuration",
      "EASYPAISAAPISECRET is required for EasyPaisa signature"
    );
  }

  const payloadWithSecret = {
    ...requestPayload,
    apisecret: apiSecret
  };

  const compactJson = JSON.stringify(payloadWithSecret).replace(/\s+/g, "");
  const upper = compactJson.toUpperCase();
  return crypto.createHash("md5").update(upper, "utf8").digest("hex");
}

/**
 * Normalize MSISDN toward the 92XXXXXXXXXX form used in V1.5 samples.
 * @param {string} msisdn Raw mobile number
 * @returns {string}
 */
export function normalizeEasyPaisaMsisdn(msisdn) {
  const digits = String(msisdn || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("92") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `92${digits.slice(1)}`;
  if (digits.length === 10) return `92${digits}`;
  return digits;
}

/**
 * @param {Object} requestPayload
 * @returns {{request: Object, signature: string}}
 */
export function buildSignedEasyPaisaBody(requestPayload) {
  const apiSecret = process.env.EASYPAISAAPISECRET;
  const signature = createEasyPaisaSignature(requestPayload, apiSecret);
  return {
    request: requestPayload,
    signature
  };
}

async function requestNewJwt() {
  const username = process.env.EASYPAISAUSERNAME;
  const password = process.env.EASYPAISAPASSWORD;
  if (!username || !password) {
    throw new ReactionError(
      "invalid-configuration",
      "EASYPAISAUSERNAME and EASYPAISAPASSWORD are required to generate JWT"
    );
  }

  const url = `${getEasyPaisaBaseUrl()}/auth/generateJWT`;
  const { data } = await axios.post(url, null, {
    headers: {
      Username: username,
      Password: password
    },
    timeout: 15000
  });

  if (!data?.jwt) {
    throw new ReactionError(
      "easypaisa-auth-failed",
      data?.responseMessage || "Failed to generate EasyPaisa JWT"
    );
  }

  return data;
}

async function refreshJwtToken(refreshToken) {
  const url = `${getEasyPaisaBaseUrl()}/auth/refreshJWT`;
  const body = buildSignedEasyPaisaBody({ refreshToken });
  const { data } = await axios.post(url, body, {
    headers: {
      "Content-Type": "application/json"
    },
    timeout: 15000
  });

  if (!data?.jwt) {
    throw new ReactionError(
      "easypaisa-auth-failed",
      data?.responseMessage || "Failed to refresh EasyPaisa JWT"
    );
  }

  return data;
}

function cacheTokenResponse(data) {
  cachedJwt = data.jwt;
  cachedRefreshJwt = data.refreshJwt || data.refreshToken || cachedRefreshJwt || null;

  const expirySeconds = Number(data.expiry || data.expirationTime);
  if (Number.isFinite(expirySeconds) && expirySeconds > 1e12) {
    // Already milliseconds
    cachedJwtExpiresAt = expirySeconds;
  } else if (Number.isFinite(expirySeconds) && expirySeconds > 1e9) {
    // Unix seconds
    cachedJwtExpiresAt = expirySeconds * 1000;
  } else {
    // Fallback: 15 minutes from now (refresh before 20-min expiry)
    cachedJwtExpiresAt = Date.now() + 15 * 60 * 1000;
  }
}

/**
 * Get a valid EasyPaisa JWT, generating or refreshing as needed.
 * @returns {Promise<string>}
 */
export async function getEasyPaisaJwt() {
  const now = Date.now();
  if (cachedJwt && now < cachedJwtExpiresAt - JWT_REFRESH_BUFFER_MS) {
    return cachedJwt;
  }

  if (jwtInflight) {
    return jwtInflight;
  }

  jwtInflight = (async () => {
    try {
      let data;
      if (cachedRefreshJwt && cachedJwt) {
        try {
          data = await refreshJwtToken(cachedRefreshJwt);
        } catch (refreshError) {
          console.warn("EasyPaisa JWT refresh failed, generating a new token:", refreshError.message);
          data = await requestNewJwt();
        }
      } else {
        data = await requestNewJwt();
      }
      cacheTokenResponse(data);
      return cachedJwt;
    } finally {
      jwtInflight = null;
    }
  })();

  return jwtInflight;
}

/**
 * Common headers for EasyPaisa OPS MA APIs (V1.5).
 * @param {string} jwt
 * @param {string} [clientIp]
 * @returns {Object}
 */
export function getEasyPaisaMaHeaders(jwt, clientIp) {
  return {
    Authorization: `Bearer ${jwt}`,
    "X-Forwarded-For": clientIp || process.env.EASYPAISACLIENTIP || "127.0.0.1",
    Operation: "ma",
    "Content-Type": "application/json"
  };
}

/**
 * POST a signed EasyPaisa MA API request.
 * @param {string} path Path beginning with /
 * @param {Object} requestPayload
 * @param {Object} [options]
 * @returns {Promise<Object>} response data
 */
export async function postEasyPaisaMaRequest(path, requestPayload, options = {}) {
  const jwt = await getEasyPaisaJwt();
  const body = buildSignedEasyPaisaBody(requestPayload);
  const url = `${getEasyPaisaBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const { data } = await axios.post(url, body, {
    headers: getEasyPaisaMaHeaders(jwt, options.clientIp),
    timeout: options.timeout || 60000,
    maxBodyLength: Infinity
  });

  return data;
}
