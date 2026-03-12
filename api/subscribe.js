import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const count = await kv.get('wl:count') || 0;
      return res.json({ count: Number(count) });
    } catch {
      return res.json({ count: 0 });
    }
  }

  if (req.method === 'POST') {
    try {
      const { email } = req.body || {};
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email' });
      }
      // sadd returns 1 if new email, 0 if duplicate
      const added = await kv.sadd('wl:emails', email.toLowerCase().trim());
      if (added) await kv.incr('wl:count');
      const count = await kv.get('wl:count') || 0;
      return res.json({ success: true, count: Number(count) });
    } catch {
      return res.json({ success: true, count: 0 });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
