import { products } from './data.js';
import { calculateCartTotal, readStoredCart, resolveCartItems } from './cart-model.js';

const TELEGRAM_BASE = 'https://t.me/softbazzar';
const DELIVERY_WINDOW = '10 mins - 16 hours';

const productByPath = () => {
  const match = window.location.pathname.match(/^\/product\/([^/]+)$/);
  if (!match) return null;
  return products.find((product) => product.id === decodeURIComponent(match[1])) || null;
};

function openTelegram(message) {
  window.open(`${TELEGRAM_BASE}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

function cartMessage() {
  const cart = readStoredCart();
  const items = resolveCartItems(cart);
  if (!items.length) return null;

  const lines = items.map((item) => {
    const variant = item.variantName ? ` (${item.variantName})` : '';
    return `• ${item.productName}${variant} ×${item.qty || 1} — ₹${item.lineTotal.toLocaleString('en-IN')}`;
  });

  return [
    '🛒 SoftBazzar Order',
    '━━━━━━━━━━━━━━━━━━━━',
    ...lines,
    '━━━━━━━━━━━━━━━━━━━━',
    `Total: ₹${calculateCartTotal(cart).toLocaleString('en-IN')}`,
    '',
    'Please send the payment details for this order.',
    'After I pay, I will reply here with my payment screenshot.',
    `Delivery: within ${DELIVERY_WINDOW} after payment confirmation.`,
  ].join('\n');
}

function singleProductMessage(product) {
  return [
    '🛒 SoftBazzar Order',
    '━━━━━━━━━━━━━━━━━━━━',
    `• ${product.name} — ${product.price}`,
    '━━━━━━━━━━━━━━━━━━━━',
    `Total: ${product.price}`,
    '',
    'Please send the payment details for this order.',
    'After I pay, I will reply here with my payment screenshot.',
    `Delivery: within ${DELIVERY_WINDOW} after payment confirmation.`,
  ].join('\n');
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element && element.textContent !== value) element.textContent = value;
}

function applyStorefrontCopy() {
  const heroSubtitle = document.querySelector('.hero-subtitle');
  if (heroSubtitle) {
    const desired = 'Premium tools, subscriptions & digital software at much lower prices.';
    if (heroSubtitle.textContent.trim() !== desired) heroSubtitle.textContent = desired;
  }

  const search = document.getElementById('searchInput');
  if (search) {
    search.placeholder = 'Search ChatGPT, Gemini, CapCut, Envato, Replit...';
    search.setAttribute('aria-label', 'Search SoftBazzar products');
  }

  const steps = document.querySelectorAll('#how-it-works .step-card');
  if (steps.length >= 3) {
    const content = [
      ['Choose your product', 'Pick the premium tool, subscription, or software plan you want.'],
      ['Continue on Telegram', 'Send your order details to @softbazzar and receive the payment instructions there.'],
      ['Send payment screenshot', `After paying, send the payment screenshot in Telegram. Delivery is within ${DELIVERY_WINDOW} after payment confirmation.`],
    ];
    steps.forEach((step, index) => {
      if (!content[index]) return;
      const title = step.querySelector('.step-title');
      const desc = step.querySelector('.step-desc');
      if (title) title.textContent = content[index][0];
      if (desc) desc.textContent = content[index][1];
    });
  }

  const statItems = document.querySelectorAll('#stats .stat-item');
  const stats = [
    [`${products.length}`, 'Current Offers'],
    ['10m–16h', 'Delivery Window'],
    ['Telegram', 'Order Support'],
    ['MRP + Sale', 'Clear Pricing'],
  ];
  statItems.forEach((item, index) => {
    if (!stats[index]) return;
    const number = item.querySelector('.stat-number');
    const label = item.querySelector('.stat-label');
    if (number) number.textContent = stats[index][0];
    if (label) label.textContent = stats[index][1];
  });

  setText('.cta-subtitle', 'Choose a product, review the price, and continue your order on Telegram.');

  const footerDescription = document.querySelector('.footer-brand > p');
  if (footerDescription) {
    footerDescription.textContent = `Premium tools and digital subscriptions at lower prices. Orders continue on Telegram, with delivery within ${DELIVERY_WINDOW} after payment confirmation.`;
  }

  const cartNote = document.querySelector('.cart-telegram-note');
  if (cartNote) cartNote.textContent = 'Order and payment confirmation continue on Telegram.';

  const popularLinks = document.querySelectorAll('.footer-col:nth-of-type(3) a[data-route]');
  const popular = [
    ['/product/chatgpt-plus', 'ChatGPT Plus'],
    ['/product/gemini-pro', 'Gemini Pro'],
    ['/product/canva-pro', 'Canva Pro'],
    ['/product/envato-elements', 'Envato Elements'],
    ['/product/replit-core-1y', 'Replit Core'],
  ];
  popularLinks.forEach((link, index) => {
    if (!popular[index]) return;
    link.setAttribute('href', popular[index][0]);
    link.textContent = popular[index][1];
  });

  const checkoutSteps = document.querySelectorAll('.co-steps .co-step');
  if (checkoutSteps.length >= 3) {
    const checkoutCopy = [
      ['Review Order', 'Verify your product details and total.'],
      ['Open Telegram', 'Send the pre-filled order details to @softbazzar and receive payment instructions.'],
      ['Send Payment Screenshot', `After paying, send your payment screenshot in the same Telegram chat. Delivery is within ${DELIVERY_WINDOW} after payment confirmation.`],
    ];
    checkoutSteps.forEach((step, index) => {
      const strong = step.querySelector('strong');
      const paragraph = step.querySelector('p');
      if (strong) strong.textContent = checkoutCopy[index][0];
      if (paragraph) paragraph.textContent = checkoutCopy[index][1];
    });
  }

  const sendButton = document.querySelector('#coSendOrder span');
  if (sendButton) sendButton.textContent = 'Send Order to Telegram';

  document.querySelectorAll('.product-discount, .detail-save').forEach((badge) => {
    const value = badge.textContent.trim();
    if (!value || value === 'OFF' || value === 'undefined OFF') badge.style.display = 'none';
  });

  const drawer = document.getElementById('cartDrawer');
  if (drawer) {
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', 'Shopping cart');
  }
  document.getElementById('cartClose')?.setAttribute('aria-label', 'Close cart');
  const cartToggle = document.getElementById('cartToggle');
  if (cartToggle) {
    cartToggle.setAttribute('aria-haspopup', 'dialog');
    cartToggle.setAttribute('aria-controls', 'cartDrawer');
  }

  document.querySelectorAll('.product-card').forEach((card) => {
    card.setAttribute('role', 'link');
    card.setAttribute('tabindex', '0');
  });

  document.querySelectorAll('a[target="_blank"]').forEach((link) => {
    link.setAttribute('rel', 'noopener noreferrer');
  });

  const toast = document.getElementById('toast');
  if (toast) {
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
  }
}

function rewriteSalesTicker() {
  const ticker = document.querySelector('.sales-ticker');
  if (!ticker) return;
  const action = ticker.querySelector('.ticker-action');
  if (!action || !/just purchased/i.test(action.textContent)) return;

  const productName = action.querySelector('span')?.textContent?.trim() || 'SoftBazzar deal';
  const labels = ['Featured now', 'Catalogue highlight', 'Deal spotlight', 'Worth a look'];
  const label = labels[Math.floor(Math.random() * labels.length)];

  ticker.innerHTML = `
    <div class="ticker-avatar">★</div>
    <div class="ticker-content">
      <div class="ticker-user">${label}</div>
      <div class="ticker-action"><span>${productName}</span> · current offer</div>
    </div>
  `;
}

document.addEventListener('click', (event) => {
  const checkoutButton = event.target.closest('#coSendOrder');
  if (checkoutButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const message = cartMessage();
    if (message) openTelegram(message);
    return;
  }

  const buyNow = event.target.closest('a.detail-buy-btn[href*="t.me/softbazzar"]');
  if (buyNow) {
    const product = productByPath();
    if (!product) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openTelegram(singleProductMessage(product));
  }
}, true);

document.addEventListener('keydown', (event) => {
  const card = event.target.closest?.('.product-card');
  if (!card || event.target.closest('button, a, input')) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    card.click();
  }
});

const app = document.getElementById('app');
if (app) {
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyStorefrontCopy();
    });
  }).observe(app, { childList: true });
}

new MutationObserver(() => rewriteSalesTicker()).observe(document.body, { childList: true, subtree: true });

applyStorefrontCopy();
rewriteSalesTicker();
