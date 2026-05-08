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

// ─── URL detection ────────────────────────────────────────────────────────────

// Dùng trong inlineWrapCodes để skip token URL (rộng, tránh wrap nhầm)
function isUrl(token) {
  if (/^https?:\/\//i.test(token)) return true;
  if (/^www\./i.test(token)) return true;
  if (/[\w\-]+\.(com|vn|net|org|io|co|app|top|shop|info|biz|me|link|page|site|store|click|ly|gl)(\/\S*)?$/i.test(token)) return true;
  if (/[\/:]/.test(token)) return true;
  return false;
}

// Dùng trong boldLine — chặt hơn, không nhầm "25/4", "0h:", "300k/0đ"
function isRealUrl(token) {
  if (/^https?:\/\//i.test(token)) return true;
  if (/^www\./i.test(token)) return true;
  if (/^[\w\-]+\.[\w\-]+\.(com|vn|net|org|io|co|app|top|shop|info|biz|me|link|page|site|store|click|ly|gl)(\/\S*)?$/i.test(token)) return true;
  if (/^[\w\-]+\.(com|vn|net|org|io|co|app|top|shop|info|biz|me|link|page|site|store|click|ly|gl)(\/\S*)?$/i.test(token)) return true;
  return false;
}

// ─── isCode ───────────────────────────────────────────────────────────────────

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

// ─── Bước 1: Xóa https:// / http:// ─────────────────────────────────────────

function stripHttps(text) {
  return text.replace(/https?:\/\//gi, '');
}

// ─── Bước 2: Wrap <code> cho mã ──────────────────────────────────────────────

function inlineWrapCodes(text) {
  return text.replace(/(\S+)/g, (token) => {
    if (isUrl(token)) return token;
    const match = token.match(/^([^A-Za-z0-9]*)([A-Za-z0-9][^\s]*)([^A-Za-z0-9]*)$/);
    if (!match) return token;
    const [, prefix, core, suffix] = match;
    if (isCode(core)) return `${prefix}<code>${core}</code>${suffix}`;
    return token;
  });
}

// ─── Bước 3: In đậm dòng trigger ─────────────────────────────────────────────

const BOLD_TRIGGER_EMOJIS = ['📌', '🔥', '⚡️', '⚡'];

function isBoldTriggerLine(line) {
  const trimmed = line.trimStart();
  if (/^\d+[.)]\s/.test(trimmed)) return true;
  for (const emoji of BOLD_TRIGGER_EMOJIS) {
    if (trimmed.startsWith(emoji)) return true;
  }
  return false;
}

function boldLine(line) {
  const tokens = line.split(/(\s+)/);
  let firstUrlIndex = -1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].trim();
    if (!t) continue;
    const stripped = t.replace(/<[^>]+>/g, '');
    if (isRealUrl(stripped)) { firstUrlIndex = i; break; }
  }
  if (firstUrlIndex === -1) return `<b>${line}</b>`;
  const beforeText = tokens.slice(0, firstUrlIndex).join('').trimEnd();
  const rest = line.slice(beforeText.length);
  if (!beforeText.trim()) return line;
  return `<b>${beforeText}</b>${rest}`;
}

function applyLineBolding(text) {
  return text.split('\n').map(line =>
    isBoldTriggerLine(line) ? boldLine(line) : line
  ).join('\n');
}

// ─── Pipeline với fallback khi quá dài ───────────────────────────────────────
//
//  Level 1 (full):     stripHttps → inlineWrapCodes → applyLineBolding
//  Level 2 (no code):  stripHttps → applyLineBolding          (bỏ <code>)
//  Level 3 (minimal):  stripHttps                              (bỏ cả bold)
//
// Lý do cần fallback: mỗi <code>token</code> thêm 13 ký tự,
// tin dài nhiều mã AFF có thể đẩy tổng vượt giới hạn 4096 của Telegram.

function buildFinal(text) {
  // Level 1
  let result = applyLineBolding(inlineWrapCodes(stripHttps(text)));
  if ((result + EDIT_MARKER).length <= 4096) return result;

  // Level 2 — bỏ <code>
  console.warn('Fallback level 2: bỏ <code>, giữ bold + strip https');
  result = applyLineBolding(stripHttps(text));
  if ((result + EDIT_MARKER).length <= 4096) return result;

  // Level 3 — chỉ strip https
  console.warn('Fallback level 3: chỉ strip https');
  result = stripHttps(text);
  if ((result + EDIT_MARKER).length <= 4096) return result;

  // Quá dài không thể xử lý
  return null;
}

// ─── API calls ────────────────────────────────────────────────────────────────

async function editMessageText(chatId, messageId, newText) {
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
  const data = await res.json();
  if (!data.ok) console.warn('editMessageText failed:', data.description);
  return data;
}

async function editMessageCaption(chatId, messageId, newCaption) {
  const res = await fetch(`${TELEGRAM_API}/editMessageCaption`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      caption: newCaption,
      parse_mode: 'HTML',
    }),
  });
  const data = await res.json();
  if (!data.ok) console.warn('editMessageCaption failed:', data.description);
  return data;
}

// ─── Xác định message có media không ─────────────────────────────────────────

function hasMedia(message) {
  return !!(
    message.photo || message.video || message.document ||
    message.animation || message.audio || message.voice || message.sticker
  );
}

// ─── Xử lý chính ─────────────────────────────────────────────────────────────

async function processMessage(message) {
  if (!message) return;
  if (!ALLOWED_IDS.has(message.chat.id)) return;

  const isMediaMessage = hasMedia(message);
  const text = message.text || message.caption || '';
  if (!text) return;
  if (text.includes(EDIT_MARKER)) return;

  const wrapped = buildFinal(text);

  if (wrapped === null) {
    console.warn('Tin quá dài kể cả sau fallback, bỏ qua:', text.length);
    return;
  }
  if (wrapped === text) return; // Không có gì thay đổi

  const final = wrapped + EDIT_MARKER;

  if (isMediaMessage) {
    await new Promise(r => setTimeout(r, 3500));
    await editMessageCaption(message.chat.id, message.message_id, final);
  } else {
    await editMessageText(message.chat.id, message.message_id, final);
  }
}

// ─── Handler chính ────────────────────────────────────────────────────────────

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
