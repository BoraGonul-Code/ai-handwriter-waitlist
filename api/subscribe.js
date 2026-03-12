export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const REDIS_URL   = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const RESEND_KEY  = process.env.RESEND_API_KEY;

  // Helper: call Upstash REST API
  async function redis(...args) {
    const r = await fetch(`${REDIS_URL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    const j = await r.json();
    return j.result;
  }

  // GET — return current count
  if (req.method === 'GET') {
    const count = await redis('SCARD', 'wl:emails');
    return res.json({ count: count || 0 });
  }

  // POST — save email, notify
  if (req.method === 'POST') {
    const { email } = req.body || {};

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const trimmed = email.toLowerCase().trim();

    // Add to Redis set (deduped automatically)
    const added = await redis('SADD', 'wl:emails', trimmed);
    const count = await redis('SCARD', 'wl:emails');

    // Send email notification via Resend (only for new signups)
    if (added === 1 && RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'AI Handwriter <onboarding@resend.dev>',
          to: ['boragonul@gmail.com'],
          subject: `🎉 New waitlist signup: ${trimmed}`,
          html: `
            <h2>New Waitlist Signup</h2>
            <p><strong>Email:</strong> ${trimmed}</p>
            <p><strong>Total signups:</strong> ${count}</p>
          `,
        }),
      });
    }

    return res.json({ success: true, count: count || 0 });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
