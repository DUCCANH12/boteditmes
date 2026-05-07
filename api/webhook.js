// api/webhook.js — Telegram Code Detector Bot (Fixed)
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const EDIT_MARKER = '\u200b';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Chức năng 1: Xóa https:// / http:// khỏi URL ────────────────────────────

function stripHttps(text) {
  return text.replace(/https?:\/\//gi, '');
}

// ─── Chức năng 2: In đậm dòng bắt đầu bằng số thứ tự hoặc emoji đặc biệt ────
// Gọi SAU khi đã stripHttps và SAU khi inlineWrapCodes (để detect URL đúng)

const BOLD_TRIGGER_EMOJIS = ['📌', '🔥', '⚡️', '⚡'];

function isBoldTriggerLine(line) {
  const trimmed = line.trimStart();
  // Kiểm tra số thứ tự: "1.", "2.", "1)", "2)" ở đầu dòng
  if (/^\d+[.)]\s/.test(trimmed)) return true;
  // Kiểm tra emoji đặc biệt ở đầu dòng
  for (const emoji of BOLD_TRIGGER_EMOJIS) {
    if (trimmed.startsWith(emoji)) return true;
  }
  return false;
}

// Tìm vị trí token đầu tiên là URL trong dòng (sau khi đã wrap <code>)
// Token URL là chuỗi không chứa khoảng trắng, match isUrl
function boldLine(line) {
  // Tách các token theo khoảng trắng, xử lý in đậm phần trước URL đầu tiên
  const tokens = line.split(/(\s+)/); // giữ lại whitespace
  let firstUrlIndex = -1;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].trim();
    if (!t) continue;
    // Bỏ qua HTML tag <code>...</code> khi check URL
    const stripped = t.replace(/<[^>]+>/g, '');
    if (isUrl(stripped)) {
      firstUrlIndex = i;
      break;
    }
  }

  if (firstUrlIndex === -1) {
    // Không có URL → in đậm cả dòng
    return `<b>${line}</b>`;
  }

  // Có URL → in đậm phần trước URL đầu tiên (bỏ trailing space/dấu câu)
  const beforeTokens = tokens.slice(0, firstUrlIndex);
  const fromUrlTokens = tokens.slice(firstUrlIndex);

  let beforeText = beforeTokens.join('').trimEnd();
  const rest = line.slice(beforeText.length); // phần còn lại kể từ URL (kể whitespace giữa)

  if (!beforeText.trim()) {
    // Không có gì trước URL → không in đậm gì
    return line;
  }

  return `<b>${beforeText}</b>${rest}`;
}

function applyLineBolding(text) {
  const lines = text.split('\n');
  const result = lines.map(line => {
    if (isBoldTriggerLine(line)) {
      return boldLine(line);
    }
    return line;
  });
  return result.join('\n');
}

// ─── Wrap code tokens (giữ nguyên logic cũ) ──────────────────────────────────

function inlineWrapCodes(text) {
  return text.replace(/(\S+)/g, (token) => {
    if (isUrl(token)) return token;

    const match = token.match(/^([^A-Za-z0-9]*)([A-Za-z0-9][^\s]*)([^A-Za-z0-9]*)$/);
    if (!match) return token;

    const [, prefix, core, suffix] = match;
    if (isCode(core)) {
      return `${prefix}<code>${core}</code>${suffix}`;
    }
    return token;
  });
}

// ─── Pipeline xử lý text tổng hợp ────────────────────────────────────────────

function processText(text) {
  let result = text;
  result = stripHttps(result);        // 1. Xóa https://
  result = inlineWrapCodes(result);   // 2. Wrap <code> cho mã
  result = applyLineBolding(result);  // 3. In đậm dòng trigger (sau khi biết URL)
  return result;
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
    message.photo ||
    message.video ||
    message.document ||
    message.animation ||
    message.audio ||
    message.voice ||
    message.sticker
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

  const wrapped = processText(text);

  if (wrapped === text) return;

  const final = wrapped + EDIT_MARKER;

  if (final.length > 4096) {
    console.warn('Content too long, skipping:', final.length);
    return;
  }

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
  } catch (err) {
    console.error('Bot error:', err);
  }

  res.status(200).json({ ok: true });
};
