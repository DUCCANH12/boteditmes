// api/setup.js — Endpoint để đăng ký webhook với Telegram
// Gọi 1 lần sau khi deploy: GET https://your-app.vercel.app/api/setup?secret=YOUR_SECRET

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SETUP_SECRET = process.env.SETUP_SECRET || 'changeme';

module.exports = async function handler(req, res) {
  // Bảo vệ endpoint bằng secret key
  const { secret, action } = req.query;
  if (secret !== SETUP_SECRET) {
    return res.status(403).json({ ok: false, error: 'Forbidden — wrong secret' });
  }

  const host = req.headers.host;
  const webhookUrl = `https://${host}/api/webhook`;

  try {
    if (action === 'delete') {
      // Xoá webhook
      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);
      const data = await r.json();
      return res.status(200).json({ action: 'deleted', result: data });
    }

    if (action === 'info') {
      // Xem thông tin webhook hiện tại
      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
      const data = await r.json();
      return res.status(200).json(data);
    }

    // Mặc định: đăng ký webhook
    const r = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=true`
    );
    const data = await r.json();
    return res.status(200).json({
      action: 'set',
      webhookUrl,
      result: data,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
