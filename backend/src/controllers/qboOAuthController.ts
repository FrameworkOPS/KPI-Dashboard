import { Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { query } from '../config/database';

const INTUIT_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const INTUIT_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const INTUIT_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';

// In-memory CSRF state store: state => expiry timestamp
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getRedirectUri(): string {
  const appUrl = process.env.APP_URL || '';
  return `${appUrl}/api/integrations/qbo/callback`;
}

function buildCredentials(): string {
  const clientId = process.env.QBO_CLIENT_ID || '';
  const clientSecret = process.env.QBO_CLIENT_SECRET || '';
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

// Purge expired states to prevent unbounded map growth
function purgeExpiredStates(): void {
  const now = Date.now();
  for (const [key, expiry] of pendingStates.entries()) {
    if (now > expiry) {
      pendingStates.delete(key);
    }
  }
}

export async function connect(req: Request, res: Response): Promise<void> {
  const clientId = process.env.QBO_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: 'QBO_CLIENT_ID is not configured' });
    return;
  }

  purgeExpiredStates();

  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now() + STATE_TTL_MS);

  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    state,
  });

  res.redirect(`${INTUIT_AUTH_URL}?${params.toString()}`);
}

export async function callback(req: Request, res: Response): Promise<void> {
  const { code, state, realmId } = req.query as Record<string, string>;
  const appUrl = process.env.APP_URL || '';

  // Validate state
  const expiry = pendingStates.get(state);
  if (!expiry || Date.now() > expiry) {
    res.status(400).json({ error: 'Invalid or expired OAuth state parameter' });
    return;
  }
  pendingStates.delete(state);

  if (!code || !realmId) {
    res.status(400).json({ error: 'Missing code or realmId from Intuit callback' });
    return;
  }

  try {
    const redirectUri = getRedirectUri();
    const credentials = buildCredentials();

    const tokenResponse = await axios.post(
      INTUIT_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const tokenExpiry = new Date(Date.now() + expires_in * 1000);

    // Upsert into oauth_tokens
    await query(
      `INSERT INTO oauth_tokens (provider, realm_id, access_token, refresh_token, token_expiry, updated_at)
       VALUES ('qbo', $1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (provider) DO UPDATE SET
         realm_id = EXCLUDED.realm_id,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_expiry = EXCLUDED.token_expiry,
         updated_at = CURRENT_TIMESTAMP`,
      [realmId, access_token, refresh_token, tokenExpiry]
    );

    // Update runtime env vars
    process.env.QBO_ACCESS_TOKEN = access_token;
    process.env.QBO_REFRESH_TOKEN = refresh_token;
    process.env.QBO_REALM_ID = realmId;

    res.redirect(`${appUrl}/integrations?qbo=connected`);
  } catch (err) {
    console.error('QBO OAuth callback error:', err);
    res.status(500).json({ error: 'Failed to exchange authorization code for tokens' });
  }
}

export async function disconnect(req: Request, res: Response): Promise<void> {
  try {
    const result = await query(
      "SELECT access_token, refresh_token FROM oauth_tokens WHERE provider = 'qbo' LIMIT 1"
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No QBO connection found' });
      return;
    }

    const { access_token, refresh_token } = result.rows[0];

    // Revoke token with Intuit
    try {
      await axios.post(
        INTUIT_REVOKE_URL,
        { token: refresh_token },
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      );
    } catch (revokeErr) {
      // Log but don't fail — we still want to clean up locally
      console.warn('QBO token revocation failed (continuing with local cleanup):', revokeErr);
    }

    // Remove from DB
    await query("DELETE FROM oauth_tokens WHERE provider = 'qbo'");

    // Clear runtime env vars
    delete process.env.QBO_ACCESS_TOKEN;
    delete process.env.QBO_REFRESH_TOKEN;
    delete process.env.QBO_REALM_ID;

    res.json({ success: true });
  } catch (err) {
    console.error('QBO disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect QuickBooks Online' });
  }
}

export async function reconnect(req: Request, res: Response): Promise<void> {
  // Same flow as connect
  return connect(req, res);
}

export async function status(req: Request, res: Response): Promise<void> {
  try {
    const result = await query(
      "SELECT realm_id, token_expiry FROM oauth_tokens WHERE provider = 'qbo' AND token_expiry > NOW() LIMIT 1"
    );

    if (result.rows.length === 0) {
      res.json({ connected: false });
      return;
    }

    const row = result.rows[0];
    res.json({
      connected: true,
      realm_id: row.realm_id,
      token_expiry: row.token_expiry,
    });
  } catch (err) {
    console.error('QBO status error:', err);
    res.status(500).json({ error: 'Failed to check QuickBooks Online status' });
  }
}

export async function refreshQBOToken(): Promise<string> {
  const result = await query(
    "SELECT refresh_token FROM oauth_tokens WHERE provider = 'qbo' LIMIT 1"
  );

  if (result.rows.length === 0) {
    throw new Error('No QBO refresh token found in database');
  }

  const { refresh_token } = result.rows[0];
  const credentials = buildCredentials();

  const tokenResponse = await axios.post(
    INTUIT_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    }
  );

  const { access_token, refresh_token: new_refresh_token, expires_in } = tokenResponse.data;
  const tokenExpiry = new Date(Date.now() + expires_in * 1000);

  await query(
    `UPDATE oauth_tokens
     SET access_token = $1,
         refresh_token = $2,
         token_expiry = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE provider = 'qbo'`,
    [access_token, new_refresh_token, tokenExpiry]
  );

  process.env.QBO_ACCESS_TOKEN = access_token;
  process.env.QBO_REFRESH_TOKEN = new_refresh_token;

  return access_token;
}
