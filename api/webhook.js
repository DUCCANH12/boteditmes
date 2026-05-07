// api/webhook.js — Telegram Code Detector Bot
// Deploy on Vercel · Set env var: TELEGRAM_BOT_TOKEN

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ─── Danh sách ID được phép (chủ bot + các kênh) ─────────────────────────────
const ALLOWED_IDS = new Set([
  1400175163,       // Chủ bot
  -1001578007378,   // Kênh 1
  -1002109878033,   // Kênh 2
]);

// ─── Danh sách từ bị loại trừ (viết HOA) ─────────────────────────────────────
const EXCLUDED_WORDS = new Set([
  'SHOPEE', 'LAZADA', 'TIKI', 'SENDO', 'GRAB', 'GOJEK', 'GOVIET',
  'MOMO', 'ZALOPAY', 'VNPAY', 'VNPT', 'VIETTEL', 'MOBIFONE',
  'CHUÂN', 'BỊ', 'SĂN', 'CÁC', 'BỘ', 'SỐ', 'NHÀ',
  'VOUCHER', 'FLASH', 'SALE', 'DEAL', 'FREE', 'SHIP', 'HOT', 'NEW',
  'VIP', 'APP', 'BOT', 'API', 'URL', 'SMS', 'OTP', 'PIN', 'ATM',
  'SIM', 'TOP', 'UY', 'TÍN', 'GIÁ', 'TỐT', 'MÃ', 'CODE',
  'GOM', 'ORDER', 'NOTE', 'LIVE', 'POST', 'LINK', 'PAGE',
  'GROUP', 'ADMIN', 'MOD', 'JOIN', 'CHAT', 'NEWS', 'OPEN',
  'FORM', 'USER', 'PASS', 'BUY', 'PAY', 'SHIP', 'FAST',
  'MAX', 'MIN', 'GET', 'SET', 'ADD', 'YES', 'NO',
  'HOT', 'NOW', 'OFF', 'TAG', 'VND', 'USD', 'EUR',
  'KHO', 'HANG', 'MOI', 'CU', 'LIKE', 'SUB', 'VIEW',
  'TET', 'BLACK', 'FRIDAY', 'MEGA', 'SUPER', 'PLUS',
]);

// ─── Phát hiện URL ────────────────────────────────────────────────────────────
function isUrl(token) {
  if (/^https?:\/\//i.test(token)) return true;
  if (/^www\./i.test(token)) return true;
  if (/[\w\-]+\.(com|vn|net|org|io|co|app|top|shop|info|biz|me|link|page|site|store|click|ly|gl)(\/\S*)?$/i.test(token)) return true;
  if (/[\/:]/.test(token)) return true;
  return false;
}

// ─── Kiểm tra quyền truy cập ─────────────────────────────────────────────────
function isAllowed(chatId) {
  return ALLOWED_IDS.has(chatId);
}

// ─── Trích xuất mã từ văn bản ─────────────────────────────────────────────────
function extractCodes(text) {
  if (!text) return [];

  const found = new Set();
  const tokens = text.split(/\s+/);

  for (let token of tokens) {
    if (isUrl(token)) continue;

    const cleaned = token.replace(/^[^A-Z0-9a-z]+|[^A-Z0-9a-z]+$/gi, '');
    if (!cleaned) continue;
    if (/[./\\]/.test(cleaned)) continue;
    if (!/[A-Z]{2}/.test(cleaned)) continue;
    if (!/^[A-Z0-9]+$/.test(cleaned)) continue;
    if (cleaned.length < 3 || cleaned.length > 20) continue;
    if (EXCLUDED_WORDS.has(cleaned)) continue;
    if (/^\d+$/.test(cleaned)) continue;

    found.add(cleaned);
  }

  return [...found];
}

// ─── Gửi tin nhắn Telegram ────────────────────────────────────────────────────
async function sendMessage(chatId, text, replyToId = null) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (replyToId) body.reply_to_message_id = replyToId;

  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── Xử lý tin nhắn ──────────────────────────────────────────────────────────
async function processMessage(message) {
  if (!message) return;

  // ✅ Chỉ xử lý nếu chat ID nằm trong danh sách cho phép
  if (!isAllowed(message.chat.id)) return;

  const text = message.text || message.caption || '';
  if (!text) return;

  const codes = extractCodes(text);
  if (codes.length === 0) return;

  const codeList = codes.map(c => `<code>${c}</code>`).join('\n');
  const reply =
    `🏷️ <b>${codes.length > 1 ? 'Các mã' : 'Mã'} phát hiện:</b>\n\n` +
    `${codeList}\n\n` +
    `<i>👆 Nhấn vào mã để sao chép</i>`;

  await sendMessage(message.chat.id, reply, message.message_id);
}

// ─── Vercel Serverless Handler ────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, status: 'Bot is running 🤖' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const update = req.body;

    const message = update.message || update.channel_post;
    if (message) {
      await processMessage(message);
    }

    const edited = update.edited_message || update.edited_channel_post;
    if (edited) {
      await processMessage(edited);
    }
  } catch (err) {
    console.error('Bot error:', err);
  }

  res.status(200).json({ ok: true });
};
