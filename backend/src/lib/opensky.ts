import { config } from "../config"

/**
 * OpenSky OAuth2 client-credentials auth.
 *
 * OpenSky API clients (OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET) must send a
 * bearer token. Basic auth is silently ignored and the request is treated as
 * anonymous (400 credits/day instead of 4000), so the token is required.
 */

let cachedToken: { value: string; expiresAt: number } | null = null

async function fetchAccessToken(): Promise<string | null> {
  if (!config.opensky.clientId || !config.opensky.clientSecret) return null

  // Reuse the token until 60 seconds before it expires
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value
  }

  try {
    const response = await fetch(config.opensky.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.opensky.clientId,
        client_secret: config.opensky.clientSecret,
      }),
      signal: AbortSignal.timeout(config.opensky.timeout),
    })

    if (!response.ok) {
      console.error(`OpenSky token request failed: HTTP ${response.status}`)
      return null
    }

    const data = (await response.json()) as { access_token: string; expires_in: number }
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }
    return cachedToken.value
  } catch (error) {
    console.error("OpenSky token request failed:", error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Fetch an OpenSky API URL, authenticated when credentials are configured.
 * Falls back to anonymous access if the token cannot be obtained.
 */
export async function openSkyFetch(url: string): Promise<Response> {
  const token = await fetchAccessToken()

  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(config.opensky.timeout),
  })
}
