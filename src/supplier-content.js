export const SUPPLIER_NOTES_WITHHELD = 'Supplier notes withheld pending merchant review.';

const UNSAFE_LINK_OR_MARKUP = /(?:https?:\/\/|javascript:|data:|ftp:|www\.|(?:^|\b)(?:[a-z0-9-]+\.)+(?:com|net|org|dev|io|app|co|in|live|me|gg|example)(?:\/[^\s]*)?\b|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|<\s*\/?[a-z!]|\[[^\]]*\]\s*\(|@[a-z0-9_]{2,})/i;
const WHOLESALE_OR_CRYPTO = /\b(?:usdt|usdc|wholesale|supplier\s+cost|your_cost)\b/i;
const PAYMENT_FLOW = /\bpay\b(?!\s+attention\b)|\bpayment\b[\s\S]{0,100}\b(?:method|bot|telegram|whatsapp|bank|upi|wallet|screenshot|proof|receipt)\b/i;
const EXTERNAL_ACTION = /\b(?:send|submit|upload|share|message|contact|dm)\b[\s\S]{0,100}\b(?:payment|screenshot|receipt|proof|bot|telegram|whatsapp|discord|seller|supplier|provider|support\s+id|wallet|crypto|bank|upi|password|otp|pin)\b|\b(?:bot|telegram|whatsapp|discord|wallet)\b[\s\S]{0,100}\b(?:pay|payment|send|screenshot|receipt|order)\b/i;
const PRICED_VARIANTS = /\b(?:available\s+plans?|choose\s+(?:your\s+)?(?:preferred\s+)?plan)\b[\s\S]{0,100}[$₹]\s*\d|[$₹]\s*\d[\s\S]{0,100}\b(?:plans?|variants?)\b/i;
const UNSUPPORTED_CLAIM = /\b(?:official|verified|guaranteed|genuine|authentic)\s+(?:partner|seller|account|service|product|access|bot)\b|\b(?:best\s*seller|#1\s*(?:seller|product)|verified\s+reviews)\b/i;

function needsMerchantReview(text) {
  return [UNSAFE_LINK_OR_MARKUP, WHOLESALE_OR_CRYPTO, PAYMENT_FLOW, EXTERNAL_ACTION, PRICED_VARIANTS, UNSUPPORTED_CLAIM]
    .some((pattern) => pattern.test(text));
}

export function sanitizeSupplierDescription(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value)
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (needsMerchantReview(text)) return SUPPLIER_NOTES_WITHHELD;
  return text.slice(0, 1200);
}
