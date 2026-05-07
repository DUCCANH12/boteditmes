// api/webhook.js — Telegram Code Detector Bot
// Deploy on Vercel · Set env var: TELEGRAM_BOT_TOKEN

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ─── Marker để nhận biết bài đã được bot chỉnh sửa (tránh vòng lặp) ──────────
const CODES_MARKER = '👆 Nhấn vào mã để sao chép';

// ─── Danh sách ID được phép (chủ bot + các kênh) ─────────────────────────────
const ALLOWED_IDS = new Set([
  1400175163,       // Chủ bot
  -1001578007378,   // Kênh 1
  -1002109878033,   // Kênh 2
]);

// ─── Danh sách từ bị loại trừ ────────────────────────────────────────────────
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

// ─── Escape HTML để không bị lỗi parse_mode ──────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Chỉnh sửa tin nhắn gốc ──────────────────────────────────────────────────
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

// ─── Xử lý tin nhắn ──────────────────────────────────────────────────────────
async function processMessage(message) {
  if (!message) return;

  // Chỉ xử lý chat trong danh sách cho phép
  if (!isAllowed(message.chat.id)) return;

  const text = message.text || message.caption || '';
  if (!text) return;

  // Nếu bài đã có marker → bot đã sửa rồi, bỏ qua (tránh vòng lặp vô tận)
  if (text.includes(CODES_MARKER)) return;

  const codes = extractCodes(text);
  if (codes.length === 0) return;

  const codeList = codes.map(c => `<code>${c}</code>`).join('\n');

  // Ghép nội dung gốc (escape HTML) + phần mã phía dưới
  const newText =
    escapeHtml(text) +
    '\n\n━━━━━━━━━━━━━━\n' +
    `🏷️ <b>${codes.length > 1 ? 'Các mã' : 'Mã'} phát hiện:</b>\n\n` +
    codeList + '\n\n' +
    `<i>${CODES_MARKER}</i>`;

  // Telegram giới hạn 4096 ký tự / tin nhắn
  if (newText.length > 4096) {
    console.warn('Message too long to edit:', newText.length);
    return;
  }

  await editMessage(message.chat.id, message.message_id, newText);
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

    // Chỉ xử lý tin nhắn MỚI — không xử lý edited để tránh vòng lặp
    const message = update.message || update.channel_post;
    if (message) {
      await processMessage(message);
    }
  } catch (err) {
    console.error('Bot error:', err);
  }

  res.status(200).json({ ok: true });
};
