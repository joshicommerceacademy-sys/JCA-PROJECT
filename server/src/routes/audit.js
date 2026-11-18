const express = require('express');
const { pool } = require('../db/pool');
const { requireAdmin } = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Store interaction metadata only. Never store typed characters, passwords, or form values.
router.post('/events', async (req, res) => {
  try {
    const { eventType, page, target, keyAction, occurredAt } = req.body || {};
    const allowed = new Set(['click', 'key_action', 'form_submit', 'navigation']);
    if (!allowed.has(eventType)) return res.status(400).json({ status: 'error', message: 'Invalid audit event type.' });
    const safeText = (v, max = 180) => typeof v === 'string' ? v.replace(/[\r\n\t]/g, ' ').slice(0, max) : null;
    let actorRole = 'unknown';
    let actorId = null;
    const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
    if (token && process.env.JWT_SECRET) {
      try { const identity = jwt.verify(token, process.env.JWT_SECRET); if (identity.role === 'admin' || identity.role === 'student') { actorRole = identity.role; actorId = Number.isInteger(Number(identity.id)) ? Number(identity.id) : null; } } catch { /* unauthenticated/pre-login event stays unknown */ }
    }
    await pool.query(
      `INSERT INTO activity_audit_logs (event_type, page_path, target_label, key_action, actor_role, actor_id, ip_address, user_agent, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz, now()))`,
      [eventType, safeText(page, 500), safeText(target), safeText(keyAction, 40), actorRole, actorId, req.ip || null, safeText(req.get('user-agent'), 500), occurredAt || null]
    );
    res.status(201).json({ status: 'success' });
  } catch (error) {
    console.error('[AUDIT] Could not save event:', error.message);
    res.status(500).json({ status: 'error', message: 'Could not save activity event.' });
  }
});

router.get('/events', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 200, 1), 1000);
    const result = await pool.query(
      `SELECT l.id, l.event_type, l.page_path, l.target_label, l.key_action, l.actor_role, l.actor_id, l.ip_address, l.user_agent, l.occurred_at,
              CASE WHEN l.actor_role = 'admin' THEN a.full_name WHEN l.actor_role = 'student' THEN s.full_name ELSE NULL END AS actor_name,
              CASE WHEN l.actor_role = 'admin' THEN a.email WHEN l.actor_role = 'student' THEN s.roll_number ELSE NULL END AS actor_reference
       FROM activity_audit_logs l
       LEFT JOIN admin_users a ON l.actor_role = 'admin' AND l.actor_id = a.id
       LEFT JOIN students s ON l.actor_role = 'student' AND l.actor_id = s.id
       ORDER BY l.occurred_at DESC LIMIT $1`, [limit]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('[AUDIT] Could not list events:', error.message);
    res.status(500).json({ status: 'error', message: 'Could not load activity logs.' });
  }
});
module.exports = router;
