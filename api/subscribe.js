export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const REDIS_URL   = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const RESEND_KEY  = process.env.RESEND_API_KEY;

  // Helper: call Upstash REST API
  async function redis(...args) {
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
  }

  // GET — return current count
  if (req.method === 'GET') {
    try {
      const count = await redis('SCARD', 'wl:emails');
      return res.json({ count: count || 0 });
    } catch (e) {
      console.error('[GET] Redis error:', e);
      return res.json({ count: 0 });
    }
  }

  // POST — save email, notify
  if (req.method === 'POST') {
    const { email } = req.body || {};

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const trimmed = email.toLowerCase().trim();
    console.log('[POST] New signup attempt:', trimmed);

    try {
      const added = await redis('SADD', 'wl:emails', trimmed);
      const count = await redis('SCARD', 'wl:emails');
      console.log('[Redis] added:', added, '| total count:', count);

      // Send Resend notification
      if (RESEND_KEY) {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'onboarding@resend.dev',
            to: ['boragonulus@gmail.com'],
            subject: `New waitlist signup: ${trimmed}`,
            html: `<h2>New Signup</h2><p><b>Email:</b> ${trimmed}</p><p><b>Total:</b> ${count}</p>`,
          }),
        });
        const emailJson = await emailRes.json();
        console.log('[Resend] status:', emailRes.status, '| response:', JSON.stringify(emailJson));
      } else {
        console.error('[Resend] RESEND_API_KEY is not set!');
      }

      return res.json({ success: true, count: count || 0 });
    } catch (e) {
      console.error('[POST] Error:', e);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
