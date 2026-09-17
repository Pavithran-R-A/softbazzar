import { products } from './data.js';
import { calculateCartTotal, readStoredCart, resolveCartItems } from './cart-model.js';

const TELEGRAM_BASE = 'https://t.me/softbazzar';
const DELIVERY_WINDOW = '10 mins - 16 hours';

const productByPath = () => {
  const match = window.location.pathname.match(/^\/product\/([^/]+)$/);
  if (!match) return null;
  return products.find((product) => product.id === decodeURIComponent(match[1])) || null;
};

const activeOfferForProduct = (product) => {
  if (!product) return null;
  const variants = Array.isArray(product.variants) ? product.variants.filter((variant) => !variant.disabled) : [];
  if (!variants.length) return product;

  const activeName = document.querySelector('.variant-chip.active')?.dataset?.vname;
  return variants.find((variant) => variant.name === activeName) || variants[0];
};

function openTelegram(message) {
  window.open(`${TELEGRAM_BASE}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

function orderLinesFromCart() {
  const cart = readStoredCart();
  const items = resolveCartItems(cart);
  if (!items.length) return null;

  return {
    cart,
    lines: items.map((item) => {
      const variant = item.variantName ? ` (${item.variantName})` : '';
      return `• ${item.productName}${variant} ×${item.qty || 1} — ₹${item.lineTotal.toLocaleString('en-IN')}`;
    }),
  };
}

function cartMessage() {
  const order = orderLinesFromCart();
  if (!order) return null;

  return [
    '🛒 SoftBazzar Order',
    '━━━━━━━━━━━━━━━━━━━━',
    ...order.lines,
    '━━━━━━━━━━━━━━━━━━━━',
    `Total: ₹${calculateCartTotal(order.cart).toLocaleString('en-IN')}`,
    '',
    'Please send the payment details for this order.',
    'After I pay, I will send my payment screenshot in this Telegram chat.',
    `Delivery: within ${DELIVERY_WINDOW} after payment confirmation.`,
  ].join('\n');
}

function singleProductMessage(product) {
  const offer = activeOfferForProduct(product);
  if (!offer) return null;

  const variant = offer !== product && offer.name ? ` (${offer.name})` : '';
  const price = offer.price || product.price;

  return [
    '🛒 SoftBazzar Order',
    '━━━━━━━━━━━━━━━━━━━━',
    `• ${product.name}${variant} — ${price}`,
    '━━━━━━━━━━━━━━━━━━━━',
    `Total: ${price}`,
    '',
    'Please send the payment details for this order.',
    'After I pay, I will send my payment screenshot in this Telegram chat.',
    `Delivery: within ${DELIVERY_WINDOW} after payment confirmation.`,
  ].join('\n');
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element && element.textContent !== value) element.textContent = value;
}

function getFooterColumn(title) {
  return [...document.querySelectorAll('.footer-col')].find(
    (column) => column.querySelector('h4')?.textContent.trim() === title,
  );
}

function applyVariantPricing() {
  const product = productByPath();
  if (!product) return;

  const offer = activeOfferForProduct(product);
  if (!offer) return;

  const current = document.getElementById('detailCurrentPrice');
  if (current && offer.price) current.textContent = offer.price;

  const original = document.querySelector('.detail-original');
  if (original) {
    if (offer.mrp) {
      original.textContent = offer.mrp;
      original.style.display = '';
    } else {
      original.textContent = '';
      original.style.display = 'none';
    }
  }

  const save = document.querySelector('.detail-save');
  if (save) {
    if (offer.discount) {
      save.textContent = `${offer.discount} OFF`;
      save.style.display = '';
    } else {
      save.textContent = '';
      save.style.display = 'none';
    }
  }
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
  const offerCount = products.reduce(
    (sum, product) => sum + (Array.isArray(product.variants) && product.variants.length ? product.variants.length : 1),
    0,
  );
  const stats = [
    [`${products.length}`, 'Products'],
    [`${offerCount}`, 'Current Offers'],
    ['10m–16h', 'Delivery Window'],
    ['Telegram', 'Order Support'],
  ];
  statItems.forEach((item, index) => {
    if (!stats[index]) return;
    const number = item.querySelector('.stat-number');
    const label = item.querySelector('.stat-label');
    if (number) number.textContent = stats[index][0];
    if (label) label.textContent = stats[index][1];
  });

  setText('.cta-subtitle', 'Choose a product, review the sale price, and continue your order on Telegram.');

  const footerDescription = document.querySelector('.footer-brand > p');
  if (footerDescription) {
    footerDescription.textContent = `Premium tools and digital subscriptions at lower prices. Orders continue on Telegram, with delivery within ${DELIVERY_WINDOW} after payment confirmation.`;
  }

  const categoryColumn = getFooterColumn('Categories');
  const categoryLinks = categoryColumn?.querySelectorAll('a[data-filter]') || [];
  const categories = ['AI Tools', 'Developer Tools', 'Design & Creative', 'Productivity'];
  categoryLinks.forEach((link, index) => {
    if (!categories[index]) return;
    link.dataset.filter = categories[index];
    link.textContent = categories[index];
  });

  const popularColumn = getFooterColumn('Popular');
  const popularLinks = popularColumn?.querySelectorAll('a[data-route]') || [];
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

  const supportColumn = getFooterColumn('Support');
  const supportLinks = supportColumn?.querySelectorAll('a') || [];
  supportLinks.forEach((link) => {
    if (/24\/7 Support/i.test(link.textContent)) link.textContent = '📞 Telegram Support';
  });

  const footerPayment = document.querySelector('.footer-payment');
  if (footerPayment) footerPayment.innerHTML = '<span>Payment details are provided on Telegram</span>';

  document.querySelectorAll('.footer-socials a[href="#"]').forEach((link) => link.remove());

  const cartNote = document.querySelector('.cart-telegram-note');
  if (cartNote) cartNote.textContent = 'Order and payment confirmation continue on Telegram.';

  const checkoutSteps = document.querySelectorAll('.co-steps .co-step');
  if (checkoutSteps.length >= 3) {
    const checkoutCopy = [
      ['Review Order', 'Verify your selected product, plan, quantity, and total.'],
      ['Open Telegram', 'Send the pre-filled order details to @softbazzar and receive the payment instructions.'],
      ['Send Payment Screenshot', `After paying, send your payment screenshot in the same Telegram chat. Delivery is within ${DELIVERY_WINDOW} after payment confirmation.`],
    ];
    checkoutSteps.forEach((step, index) => {
      if (!checkoutCopy[index]) return;
      const strong = step.querySelector('strong');
      const paragraph = step.querySelector('p');
      if (strong) strong.textContent = checkoutCopy[index][0];
      if (paragraph) paragraph.textContent = checkoutCopy[index][1];
    });
  }

  const notice = document.querySelector('.co-right .co-card:not(.co-steps)');
  if (notice) {
    const heading = notice.querySelector('h3');
    const paragraph = notice.querySelector('p');
    if (heading) heading.textContent = '⚠️ ORDER NOTE';
    if (paragraph) paragraph.innerHTML = 'Product delivery type varies by listing (for example: account, key, subscription, or access). Review the exact product and plan before payment.';
  }

  const sendButton = document.querySelector('#coSendOrder span');
  if (sendButton) sendButton.textContent = 'Send Order to Telegram';

  document.querySelectorAll('.product-discount, .detail-save').forEach((badge) => {
    const value = badge.textContent.trim();
    if (!value || value === 'OFF' || value === 'undefined OFF') badge.style.display = 'none';
  });

  const resolved = resolveCartItems(readStoredCart());
  document.querySelectorAll('.cart-items .cart-item').forEach((row, index) => {
    const item = resolved[index];
    if (!item) return;
    const name = row.querySelector('.cart-item-name');
    const sub = row.querySelector('.cart-item-cat');
    if (name) name.textContent = item.productName;
    if (sub) sub.textContent = item.variantName ? `${item.variantName} · ${item.cat}` : item.cat;
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

  applyVariantPricing();
}

function rewriteSalesTicker() {
  const ticker = document.querySelector('.sales-ticker');
  if (!ticker) return;
  const action = ticker.querySelector('.ticker-action');
  if (!action || !/just purchased/i.test(action.textContent)) return;

  const productName = action.querySelector('span')?.textContent?.trim() || 'SoftBazzar deal';
  const labels = ['Featured now', 'Catalogue highlight', 'Deal spotlight', 'Popular pick', 'Worth a look'];
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
    const message = singleProductMessage(product);
    if (message) openTelegram(message);
  }
}, true);

document.addEventListener('click', (event) => {
  if (event.target.closest('.variant-chip')) {
    requestAnimationFrame(applyVariantPricing);
  }
});

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
  }).observe(app, { childList: true, subtree: true });
}

new MutationObserver(() => {
  rewriteSalesTicker();
  const toast = document.getElementById('toast');
  if (toast) {
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
  }
}).observe(document.body, { childList: true, subtree: true });

applyStorefrontCopy();
rewriteSalesTicker();
