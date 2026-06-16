/**
 * Dispatch Server — Twilio webhook + order state API
 *
 * Receives "DONE" SMS replies from drivers via Twilio webhook,
 * marks orders delivered, and exposes a polling API for the frontend.
 *
 * Deploy to Railway: https://railway.app
 * Set env vars: TWILIO_AUTH_TOKEN, TWILIO_ACCOUNT_SID
 */

const express = require('express');
const cors = require('cors');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors()); // Allow the dispatch app (any origin) to poll
app.use(express.urlencoded({ extended: false })); // Twilio posts form-encoded
app.use(express.json());

// ── In-memory order state ─────────────────────────────────────
// Keyed by orderId → { status, driverPhone, driverName, address, updatedAt }
const orders = {};

// ── Helpers ───────────────────────────────────────────────────
function normalizePhone(phone) {
  // Strip all non-digits, then add +1 if needed
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return `+${digits}`;
}

// ── Routes ────────────────────────────────────────────────────

/**
 * POST /dispatch
 * Called by the frontend when a driver is dispatched.
 * Registers the order so we can match incoming SMS replies.
 *
 * Body: { orderId, driverPhone, driverName, address }
 */
app.post('/dispatch', (req, res) => {
  const { orderId, driverPhone, driverName, address } = req.body;
  if (!orderId || !driverPhone) {
    return res.status(400).json({ error: 'orderId and driverPhone required' });
  }
  orders[String(orderId)] = {
    orderId: String(orderId),
    driverPhone: normalizePhone(driverPhone),
    driverName: driverName || 'Driver',
    address: address || '',
    status: 'dispatched',
    dispatchedAt: new Date().toISOString(),
    deliveredAt: null,
  };
  console.log(`[dispatch] ORD-${orderId} → ${driverName} (${driverPhone})`);
  res.json({ ok: true, orderId });
});

/**
 * POST /webhook/sms
 * Twilio calls this when a driver sends an inbound SMS.
 * If body is "DONE" (case-insensitive), mark the matching order delivered.
 */
app.post('/webhook/sms', (req, res) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;

  // Validate the request is genuinely from Twilio
  if (authToken) {
    const signature = req.headers['x-twilio-signature'];
    const url = process.env.PUBLIC_URL
      ? `${process.env.PUBLIC_URL}/webhook/sms`
      : `${req.protocol}://${req.get('host')}/webhook/sms`;

    if (!twilio.validateRequest(authToken, signature, url, req.body)) {
      console.warn('[webhook] Invalid Twilio signature — rejected');
      return res.status(403).send('Forbidden');
    }
  }

  const fromPhone = normalizePhone(req.body.From || '');
  const body = (req.body.Body || '').trim().toUpperCase();

  console.log(`[sms] From ${fromPhone}: "${req.body.Body}"`);

  const MessagingResponse = twilio.twiml.MessagingResponse;
  const twiml = new MessagingResponse();

  if (body === 'DONE') {
    // Find the dispatched order assigned to this driver
    const match = Object.values(orders).find(
      o => o.driverPhone === fromPhone && o.status === 'dispatched'
    );

    if (match) {
      match.status = 'delivered';
      match.deliveredAt = new Date().toISOString();
      console.log(`[delivered] ORD-${match.orderId} confirmed by ${match.driverName}`);
      twiml.message(`✅ Got it ${match.driverName.split(' ')[0]}! ORD-${match.orderId} marked delivered. Thanks!`);
    } else {
      twiml.message(`No active delivery found for your number. Contact dispatch if this is an error.`);
    }
  } else {
    // Any other message — acknowledge it
    twiml.message(`Message received. Reply DONE when your delivery is complete.`);
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

/**
 * GET /orders
 * Frontend polls this every 10s to sync delivery statuses.
 * Returns all orders (or filter by ?status=delivered)
 */
app.get('/orders', (req, res) => {
  let result = Object.values(orders);
  if (req.query.status) {
    result = result.filter(o => o.status === req.query.status);
  }
  res.json(result);
});

/**
 * GET /orders/:orderId
 * Check a single order status.
 */
app.get('/orders/:orderId', (req, res) => {
  const order = orders[req.params.orderId];
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

/**
 * GET /health
 * Railway health check.
 */
app.get('/health', (req, res) => {
  res.json({ ok: true, orders: Object.keys(orders).length, uptime: process.uptime() });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Dispatch server running on port ${PORT}`);
  console.log(`Twilio webhook URL: <your-railway-url>/webhook/sms`);
});
