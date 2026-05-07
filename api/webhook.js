// api/webhook.js — Telegram Code Detector Bot
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const EDIT_MARKER = '\u200b'; // Zero-width space — dấu hiệu bài đã được bot sửa

const ALLOWED_IDS = new Set([
  1400175163,
  -1001578007378,
  -1002109878033,
]);

const EXCLUDED_WORDS = new Set([
  'SHOPEE', 'LAZADA', 'TIKI', 'SENDO', 'GRAB', 'GOJEK', 'GOVIET',
  'MOMO', 'ZALOPAY', 'VNPAY', 'VNPT', 'VIETTEL', 'MOBIFONE',
  'CHUÂN', 'BỊ', 'SĂN', 'CÁC', 'BỘ', 'SỐ', 'NHÀ',
  'VOUCHER', 'FLASH', 'SALE', 'DEAL', 'FREE', 'SHIP', 'HOT', 'NEW',
  'VIP', 'APP', 'BOT', 'API', 'URL', 'SMS', 'OTP', 'PIN', 'ATM',
  'SIM', 'TOP', 'UY', 'TÍN', 'GIÁ', 'TỐT', 'MÃ', 'CODE',
  'GOM', 'ORDER', 'NOTE', 'LIVE', 'POST', 'LINK', 'PAGE',
  'GROUP', 'ADMIN', 'MOD', 'JOIN', 'CHAT', 'NEWS', 'OPEN',
  'FORM', 'USER', 'PASS', 'BUY', 'PAY', 'FAST',
  'MAX', 'MIN', 'GET', 'SET', 'ADD', 'YES', 'NO',
  'NOW', 'OFF', 'TAG', 'VND', 'USD', 'EUR',
  'KHO', 'HANG', 'MOI', 'CU', 'LIKE', 'SUB', 'VIEW',
  'TET', 'BLACK', 'FRIDAY', 'MEGA', 'SUPER', 'PLUS',
  'LIST', 'BACK',
]);

function isUrl(token) {
  if (/^https?:\/\//i.test(token)) return true;
  if (/^www\./i.test(token)) return true;
  if (/[\w\-]+\.(com|vn|net|org|io|co|app|top|shop|info|biz|me|link|page|site|store|click|ly|gl)(\/\S*)?$/i.test(token)) return true;
  if (/[\/:]/.test(token)) return true;
  return false;
}

function isCode(word) {
  const cleaned = word.replace(/^[^A-Z0-9a-z]+|[^A-Z0-9a-z]+$/gi, '');
  if (!cleaned) return false;
  if (/[./\\]/.test(cleaned)) return false;
  if (!/[A-Z]{2}/.test(cleaned)) return false;
  if (!/^[A-Z0-9]+$/.test(cleaned)) return false;
  if (cleaned.length < 3 || cleaned.length > 20) return false;
  if (EXCLUDED_WORDS.has(cleaned)) return false;
  if (/^\d+$/.test(cleaned)) return false;
  return true;
}

// ─── Thay thế mã inline, giữ nguyên phần còn lại ────────────────────────────
function inlineWrapCodes(text) {
  // Tách theo khoảng trắng nhưng giữ lại delimiter để ghép lại đúng
  return text.replace(/(\S+)/g, (token) => {
    if (isUrl(token)) return token;

    // Tách phần prefix/suffix không phải chữ số
    const match = token.match(/^([^A-Za-z0-9]*)([A-Za-z0-9][^\s]*)([^A-Za-z0-9]*)$/);
    if (!match) return token;

    const [, prefix, core, suffix] = match;

    if (isCode(core)) {
      return `${prefix}<code>${core}</code>${suffix}`;
    }
    return token;
  });
}

async function editMessage(chatId, messageId, newText) {
  const res = await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: newText,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  return res.json();
}

async function processMessage(message) {
  if (!message) return;
  if (!ALLOWED_IDS.has(message.chat.id)) return;

  const text = message.text || message.caption || '';
  if (!text) return;

  // Nếu đã có EDIT_MARKER → bài đã sửa rồi, bỏ qua
  if (text.includes(EDIT_MARKER)) return;

  const wrapped = inlineWrapCodes(text);

  // Không có gì thay đổi → không cần edit
  if (wrapped === text) return;

  // Thêm EDIT_MARKER vô hình vào cuối để đánh dấu
  const final = wrapped + EDIT_MARKER;

  if (final.length > 4096) {
    console.warn('Too long:', final.length);
    return;
  }

  await editMessage(message.chat.id, message.message_id, final);
}

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
    if (message) await processMessage(message);
    // Không xử lý edited_message để tránh vòng lặp
  } catch (err) {
    console.error('Bot error:', err);
  }

  res.status(200).json({ ok: true });
};
