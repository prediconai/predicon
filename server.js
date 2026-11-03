'use strict';

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const path = require('path');
const crypto = require('crypto');

const P = process.env;
const PORT = Number(P.PORT || 3000);

// ─── Supabase server client (service role — server-side only) ─────────────
// Created lazily so the server starts even without credentials (for local dev).
let _supabaseAdmin = null;
function getSupabaseAdmin() {
  if (_supabaseAdmin) return _supabaseAdmin;
  if (!P.SUPABASE_URL || !P.SUPABASE_SERVICE_ROLE_KEY) return null;
  const { createClient } = require('@supabase/supabase-js');
  _supabaseAdmin = createClient(P.SUPABASE_URL, P.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return _supabaseAdmin;
}

const app = express();
app.disable('x-powered-by');

// ─── Per-request nonce for CSP ────────────────────────────────────────────
// Each request gets a unique nonce so inline scripts can execute without
// 'unsafe-inline'. The nonce is injected into the HTML template and the
// Content-Security-Policy header.
function generateNonce() {
  return crypto.randomBytes(16).toString('base64');
}

// ─── Security headers (nonce-based CSP, no unsafe-inline for scripts) ──────
app.use((req, res, next) => {
  const nonce = generateNonce();
  res.locals.nonce = nonce;
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", `'nonce-${nonce}'`],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", P.SUPABASE_URL || "'self'"].filter(Boolean),
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"]
      }
    },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' }
  })(req, res, next);
});
app.use(express.json({ limit: '16kb' }));

// ─── Health & Readiness ────────────────────────────────────────────────────
// /health: checks only that the process is alive and can respond.
// /ready: checks that required configuration is present. Does NOT make
// external connectivity checks on every request (too heavy for Railway
// health probes). Instead, checks env var presence as a proxy for "configured".
// If env vars are set but the service is down, the first real request will
// fail and the user will see an appropriate error.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', product: 'predicon-ai' });
});

app.get('/ready', (_req, res) => {
  const authConfigured = Boolean(P.SUPABASE_JWT_SECRET);
  const aiConfigured = Boolean(P.ANTHROPIC_API_KEY);
  const dbConfigured = Boolean(P.SUPABASE_URL && P.SUPABASE_SERVICE_ROLE_KEY);
  const allReady = authConfigured && aiConfigured && dbConfigured;
  res.status(allReady ? 200 : 503).json({
    status: allReady ? 'ready' : 'not_ready',
    product: 'predicon-ai',
    checks: {
      aiConfigured,
      authConfigured,
      dbConfigured,
      supabaseUrl: Boolean(P.SUPABASE_URL),
      supabaseAnonKey: Boolean(P.SUPABASE_ANON_KEY)
    }
  });
});

// ─── Auth middleware ───────────────────────────────────────────────────────
// Verifies Supabase-issued JWT with full validation:
// - signature (using SUPABASE_JWT_SECRET)
// - algorithm (HS256 only — Supabase default; RS256 blocked)
// - expiry (jwt.verify rejects expired tokens automatically)
// - issuer (MANDATORY when auth active — SUPABASE_JWT_ISSUER)
// - audience (MANDATORY when auth active — SUPABASE_JWT_AUDIENCE)
// - sub (user identity — required)
// Tier is read from app_metadata (set server-side via webhook or admin —
// never trustable from the client).
const tier = user => (user.app_metadata && user.app_metadata.tier) || 'free';
const LIMITS = { free: 10, pro: 100, business: 400 };

// ─── JWT configuration validation (fail fast) ───────────────────────────
// When authentication is active (SUPABASE_JWT_SECRET set), the issuer and
// audience claims are MANDATORY. We never silently skip these checks — a
// misconfigured server must fail to start rather than accept weakly-claimed
// tokens. This blocks algorithm-confusion and claim-spoofing attacks.
if (P.SUPABASE_JWT_SECRET) {
  const missing = [];
  if (!P.SUPABASE_JWT_ISSUER) missing.push('SUPABASE_JWT_ISSUER');
  if (!P.SUPABASE_JWT_AUDIENCE) missing.push('SUPABASE_JWT_AUDIENCE');
  if (missing.length) {
    console.error(
      '[PREDICON AI][FATAL] Authentication is enabled (SUPABASE_JWT_SECRET set) ' +
      'but required JWT claims are not configured: ' + missing.join(', ') + '. ' +
      'Set these env vars to the values from your Supabase project ' +
      '(issuer = "https://<project-ref>.supabase.co/auth/v1", audience = "authenticated"). ' +
      'Refusing to start with incomplete JWT verification.'
    );
    process.exit(1);
  }
}

// Build JWT verify options once at startup.
const jwtVerifyOptions = {
  algorithms: ['HS256'],
  issuer: P.SUPABASE_JWT_ISSUER,
  audience: P.SUPABASE_JWT_AUDIENCE
};

const auth = (req, res, next) => {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ') || !P.SUPABASE_JWT_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    req.user = jwt.verify(header.slice(7), P.SUPABASE_JWT_SECRET, jwtVerifyOptions);
    if (!req.user.sub) return res.status(401).json({ error: 'unauthorized' });
    return next();
  } catch (_err) {
    // jwt.verify throws for: invalid signature, expired token, malformed
    // token, wrong issuer, wrong audience. We return a generic 401 without
    // disclosing which check failed.
    return res.status(401).json({ error: 'unauthorized' });
  }
};

// ─── Rate limiting ────────────────────────────────────────────────────────
// Two layers:
// 1. Daily limit: per-user daily message quota based on tier.
// 2. Burst limit: per-IP short window to prevent rapid-fire abuse.
//
// NOTE: These limiters use in-memory stores. In a multi-instance deployment
// (e.g., Railway with multiple replicas), each instance has its own counter.
// For true global rate limiting, use a Redis-backed store
// (rate-limit-redis). This is documented as a known limitation.
const dailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: req => LIMITS[tier(req.user)] || LIMITS.free,
  keyGenerator: req => req.user.sub,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded' }
});

const burstLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute window
  limit: 10,            // max 10 requests per minute per IP
  keyGenerator: req => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' }
});

const SYSTEM_PROMPT = 'Kamu asisten intelijen PREDICON AI untuk founder dan UKM Indonesia/ASEAN. Jawab ringkas dalam Bahasa Indonesia. Data bersifat simulasi/ilustratif; berikan konteks risiko, bukan rekomendasi beli/jual.';

// ─── Logout endpoint (server-side token revocation) ───────────────────────
// Calls Supabase Auth logout endpoint to revoke the token server-side.
// Even if the Supabase call fails, we tell the client to clear local state.
app.post('/api/auth/logout', auth, async (req, res) => {
  const token = req.get('authorization').slice(7);
  try {
    const sbUrl = P.SUPABASE_URL;
    const anonKey = P.SUPABASE_ANON_KEY;
    if (sbUrl && anonKey) {
      // Best-effort: call Supabase logout. If it fails, client still clears local.
      await fetch(`${sbUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': anonKey
        },
        signal: AbortSignal.timeout(5000)
      });
    }
  } catch (_err) {
    // Log but don't fail — client clears local state regardless
    console.error('[PREDICON AI] Logout call failed (non-critical):', String(_err.message || _err));
  }
  return res.json({ status: 'logged_out' });
});

// ─── AI Chat endpoint ──────────────────────────────────────────────────────
app.post('/api/ai/chat', auth, burstLimiter, dailyLimiter, async (req, res) => {
  // Validate input BEFORE checking API key — bad input is always 400.
  const messages = req.body && req.body.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 12 ||
      messages.some(m => !m || !['user', 'assistant'].includes(m.role) ||
        typeof m.content !== 'string' || m.content.length > 2000)) {
    return res.status(400).json({ error: 'bad_request' });
  }

  // Determine conversation_id (optional — client may send one to group messages)
  const conversationId = req.body.conversation_id || null;

  const sb = getSupabaseAdmin();
  const userId = req.user.sub;
  const userMsg = messages.filter(m => m.role === 'user').pop();
  const userContent = userMsg ? userMsg.content : '';

  // ─── Step 1: Save user message to DB BEFORE calling AI ───────────────
  // This ensures that even if the AI call fails, the user's message is
  // persisted. We track the save status explicitly.
  let userMsgSaved = false;
  let activeConversationId = conversationId;

  if (sb) {
    try {
      let conversationVerified = false;

      if (activeConversationId) {
        // SECURITY: verify the conversation belongs to the authenticated user
        // before inserting anything into it. A client must not be able to
        // append messages to another user's conversation.
        const { data: convData, error: convErr } = await sb
          .from('conversations')
          .select('id')
          .eq('id', activeConversationId)
          .eq('user_id', userId)
          .single();
        if (convErr || !convData) {
          // Not owned by this user — reject the request outright.
          return res.status(403).json({
            error: 'forbidden',
            message: 'Conversation does not belong to the authenticated user',
            persisted: false
          });
        }
        conversationVerified = true;
      } else {
        // No conversation_id provided — create a new conversation owned by this user.
        const { data: convData, error: convError } = await sb
          .from('conversations')
          .insert({ user_id: userId })
          .select('id')
          .single();
        if (!convError && convData) {
          activeConversationId = convData.id;
          conversationVerified = true;
        }
      }

      if (conversationVerified && activeConversationId) {
        const { error: insertUserError } = await sb.from('messages').insert({
          conversation_id: activeConversationId,
          user_id: userId,
          role: 'user',
          content: userContent
        });
        if (!insertUserError) {
          userMsgSaved = true;
        } else {
          console.error('[PREDICON AI] Failed to save user message:', insertUserError.message);
        }
      }
    } catch (dbErr) {
      console.error('[PREDICON AI] DB exception saving user message:', String(dbErr));
    }
  } else {
    // No DB configured — do not echo client-supplied conversation_id back.
    activeConversationId = null;
  }

  // ─── Step 2: Check AI configuration ──────────────────────────────────
  if (!P.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'ai_not_configured',
      persisted: userMsgSaved,
      conversation_id: activeConversationId
    });
  }

  // ─── Step 3: Call AI with retry ──────────────────────────────────────
  let aiResponseText = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': P.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: P.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
          max_tokens: 600,
          system: SYSTEM_PROMPT,
          messages
        }),
        signal: AbortSignal.timeout(20000)
      });
      if (response.ok) {
        const data = await response.json();
        aiResponseText = data.content.map(block => block.text || '').join('');
        break;
      }
      if (response.status !== 429 && response.status < 500) break;
    } catch (_err) {
      // Retry transient network/time-out failures; never log provider internals.
    }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
  }

  // ─── Step 4: Handle AI failure ───────────────────────────────────────
  if (aiResponseText === null) {
    // AI failed. User message was saved (if DB available). No fake assistant
    // message is stored. The response explicitly states AI failed.
    return res.status(502).json({
      error: 'ai_unavailable',
      persisted: userMsgSaved,
      conversation_id: activeConversationId
    });
  }

  // ─── Step 5: Save assistant response to DB ───────────────────────────
  let assistantMsgSaved = false;
  if (sb && activeConversationId) {
    try {
      const { error: insertAssistantError } = await sb.from('messages').insert({
        conversation_id: activeConversationId,
        user_id: userId,
        role: 'assistant',
        content: aiResponseText
      });
      if (!insertAssistantError) {
        assistantMsgSaved = true;
      } else {
        console.error('[PREDICON AI] Failed to save assistant message:', insertAssistantError.message);
      }
    } catch (dbErr) {
      console.error('[PREDICON AI] DB exception saving assistant message:', String(dbErr));
    }
  }

  const persisted = userMsgSaved && assistantMsgSaved;

  return res.json({
    text: aiResponseText,
    persisted,
    conversation_id: activeConversationId
  });
});

// ─── Conversation list endpoint (with pagination) ─────────────────────────
// GET /api/conversations?page=1&limit=20
// Returns a paginated list of the user's conversations.
app.get('/api/conversations', auth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const sb = getSupabaseAdmin();
  if (!sb) {
    return res.json({ conversations: [], page, limit, total: 0 });
  }
  try {
    const offset = (page - 1) * limit;

    const { data, error, count } = await sb
      .from('conversations')
      .select('id, created_at, updated_at', { count: 'exact' })
      .eq('user_id', req.user.sub)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: 'db_error' });
    }
    return res.json({
      conversations: data || [],
      page,
      limit,
      total: count || 0
    });
  } catch (_err) {
    return res.status(500).json({ error: 'db_error' });
  }
});

// ─── Conversation messages endpoint (with pagination) ─────────────────────
// GET /api/conversations/:id?page=1&limit=50
// Returns messages from a specific conversation. Server-side ownership check
// via RLS policy AND explicit user_id filter (defense in depth).
app.get('/api/conversations/:id', auth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const sb = getSupabaseAdmin();
  if (!sb) {
    return res.json({ messages: [], page, limit, total: 0 });
  }
  try {
    const convId = req.params.id;
    const offset = (page - 1) * limit;

    // First verify ownership of the conversation
    const { data: convData, error: convError } = await sb
      .from('conversations')
      .select('id, user_id')
      .eq('id', convId)
      .eq('user_id', req.user.sub)
      .single();

    if (convError || !convData) {
      return res.status(404).json({ error: 'not_found' });
    }

    const { data, error, count } = await sb
      .from('messages')
      .select('role, content, created_at', { count: 'exact' })
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: 'db_error' });
    }
    return res.json({
      messages: data || [],
      page,
      limit,
      total: count || 0,
      conversation_id: convId
    });
  } catch (_err) {
    return res.status(500).json({ error: 'db_error' });
  }
});

// ─── Legacy flat history endpoint (backward compatibility) ────────────────
// GET /api/history?page=1&limit=50
// Returns all messages across all conversations for the user, ordered by time.
app.get('/api/history', auth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const sb = getSupabaseAdmin();
  if (!sb) {
    return res.json({ messages: [], conversation_id: null, page, limit, total: 0 });
  }
  try {
    const offset = (page - 1) * limit;

    const { data, error, count } = await sb
      .from('messages')
      .select('role, content, created_at, conversation_id', { count: 'exact' })
      .eq('user_id', req.user.sub)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: 'db_error' });
    }
    const rows = data || [];
    // The most recent message (rows ordered ascending) identifies the active
    // conversation. Additive field — lets the frontend fallback resume the
    // correct conversation instead of starting a new one.
    const lastConvId = rows.length ? (rows[rows.length - 1].conversation_id || null) : null;
    return res.json({
      messages: rows.map(m => ({ role: m.role, content: m.content, created_at: m.created_at })),
      conversation_id: lastConvId,
      page,
      limit,
      total: count || 0
    });
  } catch (_err) {
    return res.status(500).json({ error: 'db_error' });
  }
});

// ─── Static files + SPA fallback (with nonce + env injection) ─────────────
// Serve static assets (CSS, JS, images, fonts) from public/ directory.
// For HTML routes (SPA paths), inject nonce and window.__ENV into the template.
const fs = require('fs');
let indexHtmlTemplate = '';
try {
  indexHtmlTemplate = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
} catch (_e) {
  indexHtmlTemplate = '<!DOCTYPE html><html><body><h1>PREDICON AI</h1><p>Frontend not found.</p></body></html>';
}

// Serve non-HTML static files (CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname, 'public'), {
  index: false  // Don't serve index.html automatically — we handle it below
}));

// SPA fallback: serve index.html with nonce + env injection for all non-API GET routes
app.use((req, res, next) => {
  if (req.method === 'GET' && !path.extname(req.path) && !req.path.startsWith('/api/')) {
    const nonce = res.locals.nonce || '';
    // Inject window.__ENV with safe public vars only
    const envScript = `<script nonce="${nonce}">window.__ENV=${JSON.stringify({
      SUPABASE_URL: P.SUPABASE_URL || '',
      SUPABASE_ANON_KEY: P.SUPABASE_ANON_KEY || ''
    })};</script>`;
    let html = indexHtmlTemplate;
    // Replace all inline <script> tags with nonce-protected versions
    // and inject env script before the first script
    const firstScriptIdx = html.indexOf('<script>');
    if (firstScriptIdx !== -1) {
      html = html.slice(0, firstScriptIdx) + envScript + '\n' + html.slice(firstScriptIdx);
    } else {
      html = html.replace('</body>', envScript + '\n</body>');
    }
    // Add nonce attribute to all <script> tags (both inline and with content)
    html = html.replace(/<script>/g, `<script nonce="${nonce}">`);
    return res.send(html);
  }
  return next();
});

// ─── Centralized error handler (never leaks internals) ────────────────────
app.use((err, _req, res, _next) => {
  console.error('[PREDICON AI] Unhandled error:', String(err.message || err));
  res.status(500).json({ error: 'internal_error' });
});

// ─── Graceful shutdown ─────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[PREDICON AI] Server running on port ${PORT}`);
});

const shutdown = () => {
  console.log('[PREDICON AI] Shutting down gracefully...');
  server.close(() => {
    console.log('[PREDICON AI] Server closed.');
    process.exit(0);
  });
  // Force-exit if drain hangs after 10 seconds
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
