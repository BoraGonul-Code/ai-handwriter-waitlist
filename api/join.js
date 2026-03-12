export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  // Helper: call Upstash REST API
  async function redis(...args) {
    if (!REDIS_URL || !REDIS_TOKEN) return null;
    try {
      const r = await fetch(REDIS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${REDIS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      });
      const j = await r.json();
      return j.result;
    } catch (e) {
      console.error('[Redis Error]', e);
      return null;
    }
  }

  // GET — return current count
  if (req.method === 'GET') {
    const count = await redis('SCARD', 'wl:emails');
    return res.json({ count: count || 0 });
  }

  // POST — save email, send welcome, notify admin
  if (req.method === 'POST') {
    const { email } = req.body || {};

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email!' });
    }

    const trimmed = email.toLowerCase().trim();

    try {
      // 1. Save to Redis (Deduplicated)
      const added = await redis('SADD', 'wl:emails', trimmed);
      const count = await redis('SCARD', 'wl:emails');

      // Only send emails if this is a NEW signup (added === 1)
      if (added === 1 && RESEND_API_KEY) {
        // 2. Welcome Email to User
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'InklyFlow AI <welcome@send.inklyflowai.me>',
            to: [trimmed],
            subject: 'You are on the list! ✍️',
            html: `<h1>Welcome to InklyFlow!</h1><p>Hey student! You've successfully joined the waitlist. We'll notify you soon.</p>`
          }),
        });

        // 3. Notification Email to Admin
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'System <notifications@send.inklyflowai.me>',
            to: ['boragonulus@gmail.com'],
            subject: '🚀 New Waitlist Signup!',
            html: `<p>A new student just joined: <b>${trimmed}</b></p><p>Total signups: ${count}</p>`
          }),
        });
      }

      return res.status(200).json({ success: true, count: count || 0 });
    } catch (error) {
      console.error('[API Error]', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
