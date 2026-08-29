from pathlib import Path
import re

path = Path('src/main.js')
text = path.read_text(encoding='utf-8')


def sub_once(pattern, replacement, label, flags=re.S):
    global text
    text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected one replacement, got {count}')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one exact match, got {count}')
    text = text.replace(old, new, 1)


replace_once(
    "import { brandIcons, products, categories } from './data.js';\n",
    "import { brandIcons, products, categories } from './data.js';\nimport { calculateCartTotal, normalizeStoredCart, readStoredCart, resolveCartItems, resolveSelection, writeStoredCart } from './cart-model.js';\n",
    'cart model import',
)

sub_once(
    r"\n// === ADMIN OVERRIDES ===[\s\S]*?\n\n\nconst chevronSvg",
    "\nconst chevronSvg",
    'remove admin overrides',
)

cart_state = r'''// === CART STATE ===
let cart = readStoredCart();

function saveCart() {
  cart = normalizeStoredCart(cart);
  writeStoredCart(cart);
}

function addToCart(id, variantName = null) {
  const selection = resolveSelection(id, variantName || null);
  if (!selection) return;
  const existing = cart.find(item => item.id === selection.id && item.variantName === selection.variantName);
  if (existing) {
    existing.qty = Math.min(99, (existing.qty || 1) + 1);
    showToast('Increased quantity!');
  } else {
    cart.push({ id: selection.id, variantName: selection.variantName, qty: 1 });
    showToast('Added to cart!');
  }
  saveCart();
  updateCartBadge();
  if (document.querySelector('.cart-drawer.open')) renderCartItems();
}

function removeFromCart(id, variantName) {
  const normalizedVariant = variantName || null;
  cart = cart.filter(item => !(item.id === id && item.variantName === normalizedVariant));
  saveCart();
  updateCartBadge();
  renderCartItems();
}

function updateQuantity(id, variantName, delta) {
  const normalizedVariant = variantName || null;
  const item = cart.find(entry => entry.id === id && entry.variantName === normalizedVariant);
  if (!item) return;
  item.qty = (item.qty || 1) + delta;
  if (item.qty <= 0) {
    removeFromCart(id, normalizedVariant);
    return;
  }
  saveCart();
  updateCartBadge();
  renderCartItems();
  if (window.location.pathname === '/checkout') render();
}

function getCartTotal() {
  return calculateCartTotal(cart);
}

function updateCartBadge() {
  document.querySelectorAll('.cart-badge').forEach(b => {
    b.textContent = cart.length || '';
    b.classList.remove('bump');
    requestAnimationFrame(() => b.classList.add('bump'));
  });
}

// === TOAST ==='''
sub_once(r"// === CART STATE ===[\s\S]*?// === TOAST ===", cart_state, 'replace cart state')

render_cart = r'''function renderCartItems() {
  const el = document.querySelector('.cart-items');
  const ft = document.querySelector('.cart-footer');
  if (!el) return;
  const resolvedItems = resolveCartItems(cart);
  if (resolvedItems.length === 0) {
    el.innerHTML = `<div class="cart-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg><p>Your cart is empty</p></div>`;
    if (ft) ft.style.display = 'none';
    return;
  }
  if (ft) ft.style.display = '';
  el.innerHTML = resolvedItems.map((item, i) => {
    const variantKey = item.variantName || '';
    return `<div class="cart-item" style="animation-delay:${i*0.05}s"><div class="cart-item-icon" style="background:${item.color}15">${brandIcons[item.icon]||''}</div><div class="cart-item-info"><div class="cart-item-name">${item.displayName}</div><div class="cart-item-cat">${item.cat}</div></div>
    <div class="cart-qty-ctrl"><button class="cart-qty-btn ripple-btn" data-qty-sub="${item.id}" data-qty-name="${variantKey}">-</button><span class="cart-qty-val">${item.qty||1}</span><button class="cart-qty-btn ripple-btn" data-qty-add="${item.id}" data-qty-name="${variantKey}">+</button></div>
    <div class="cart-item-price">₹${item.lineTotal.toLocaleString('en-IN')}</div><button class="cart-remove ripple-btn" data-remove-id="${item.id}" data-remove-name="${variantKey}">${trashSvg}</button></div>`;
  }).join('');
  const totalEl = document.querySelector('.cart-total-amount');
  const countEl = document.querySelector('.cart-header .cart-count');
  if (totalEl) totalEl.textContent = `₹${getCartTotal().toLocaleString('en-IN')}`;
  if (countEl) countEl.textContent = `(${resolvedItems.reduce((sum, item) => sum + (item.qty || 1), 0)})`;
}

const marqueeKeys'''
sub_once(r"function renderCartItems\(\) \{[\s\S]*?\n\}\n\nconst marqueeKeys", render_cart, 'replace cart rendering')

text = text.replace('href="#checkout" class="cart-checkout ripple-btn"', 'href="/checkout" data-route class="cart-checkout ripple-btn"')
text = re.sub(r'href="#product/([^\"]+)"', r'href="/product/\1" data-route', text)
text = text.replace('href="#privacy"', 'href="/privacy" data-route')
text = text.replace('href="#terms"', 'href="/terms" data-route')
text = text.replace('href="#" class="nav-logo" data-home', 'href="/" class="nav-logo" data-home')

sub_once(r"\nfunction adminPage\(\) \{[\s\S]*?\n\}\n\n// === ROUTER ===", "\n// === ROUTER ===", 'remove admin page')

router = r'''// === ROUTER ===
function navigate(path, replace = false) {
  const target = path || '/';
  if (replace) history.replaceState({}, '', target);
  else if (window.location.pathname !== target) history.pushState({}, '', target);
  render();
}

function render() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const app = document.querySelector('#app');
  if (pathname.startsWith('/product/')) {
    const id = decodeURIComponent(pathname.slice('/product/'.length));
    app.innerHTML = detailPage(id);
  } else if (pathname === '/checkout') {
    app.innerHTML = `${navbar()}${checkoutPage()}${footer()}${cartDrawer()}`;
  } else if (pathname === '/privacy') {
    app.innerHTML = `${navbar()}<div class="section-inner" style="padding-top:100px;"><button class="detail-back ripple-btn" data-home style="margin-bottom:20px;">${backSvg} Back to Store</button>${privacyPage()}</div>${footer()}${cartDrawer()}`;
  } else if (pathname === '/terms') {
    app.innerHTML = `${navbar()}<div class="section-inner" style="padding-top:100px;"><button class="detail-back ripple-btn" data-home style="margin-bottom:20px;">${backSvg} Back to Store</button>${termsPage()}</div>${footer()}${cartDrawer()}`;
  } else if (pathname === '/') {
    app.innerHTML = homePage();
  } else {
    app.innerHTML = `${navbar()}<div class="section-inner" style="padding:120px 32px;text-align:center"><h1>Page not found</h1><p>The requested SoftBazzar page is not available.</p><a href="/" data-route>Back to store</a></div>${footer()}${cartDrawer()}`;
  }
  window.scrollTo(0, 0);
  initInteractions();
  updateCartBadge();
}

function initInteractions()'''
sub_once(r"// === ROUTER ===[\s\S]*?\nfunction initInteractions\(\)", router, 'replace router')

text = text.replace("window.addEventListener('hashchange', render);", "window.addEventListener('popstate', render);")
text = text.replace("window.location.hash = `product/${p.id}`;", "navigate(`/product/${encodeURIComponent(p.id)}`);")
text = text.replace("if (card && !e.target.closest('[data-add]')) { window.location.hash = `product/${card.dataset.id}`; return; }", "if (card && !e.target.closest('[data-add]')) { navigate(`/product/${encodeURIComponent(card.dataset.id)}`); return; }")
text = text.replace("if (homeBtn) { e.preventDefault(); window.location.hash = ''; return; }", "if (homeBtn) { e.preventDefault(); navigate('/'); return; }")
text = text.replace("e.preventDefault(); window.location.hash = '';\n    setTimeout", "e.preventDefault(); navigate('/');\n    setTimeout")
text = text.replace("window.location.hash = '';\n    showToast('Order sent!');", "navigate('/');\n    showToast('Order opened in Telegram. Keep this page until the message is sent.');")

replace_once(
    "    const { detailAdd, vname, vprice, vpricenum } = detailAddBtn.dataset;\n    addToCart(detailAdd, vname, vprice, Number(vpricenum));",
    "    const { detailAdd, vname } = detailAddBtn.dataset;\n    addToCart(detailAdd, vname || null);",
    'detail add trust boundary',
)

checkout_items = r'''const itemsHtml = resolveCartItems(cart).map(item => {
    return `<div class="co-item"><div class="co-item-icon" style="background:${item.color}15">${brandIcons[item.icon]||''}</div>
      <div class="co-item-info"><span class="co-item-name">${item.productName}</span><span class="co-item-variant">${item.displayName}</span><span class="co-item-qty">Qty: ${item.qty||1}</span></div>
      <span class="co-item-price">₹${item.lineTotal.toLocaleString('en-IN')}</span></div>`;
  }).join('');'''
sub_once(r"const itemsHtml = cart\.map\(item => \{[\s\S]*?\n  \}\)\.join\(''\);", checkout_items, 'checkout catalogue prices')

order_lines = r'''const lines = resolveCartItems(cart).map(item => {
      const variant = item.variantName ? ` (${item.variantName})` : '';
      return `- ${item.productName}${variant} x${item.qty||1} — ₹${item.lineTotal.toLocaleString('en-IN')}`;
    });'''
sub_once(r"const lines = cart\.map\(item => \{[\s\S]*?\n    \}\);", order_lines, 'order message catalogue prices')

sub_once(r"\n    // Save order to admin[\s\S]*?(?=\n\n    const msg =)", '', 'remove local admin order history')
sub_once(r"\n  // Admin: Tabs[\s\S]*?(?=\n\}\);\n\nwindow\.addEventListener\('popstate')", '', 'remove admin click handlers')

# Intercept only explicit internal route links; external Telegram links remain normal anchors.
click_marker = "document.addEventListener('click', e => {\n"
if click_marker not in text:
    raise SystemExit('global click handler marker missing')
text = text.replace(click_marker, click_marker + "  const routeLink = e.target.closest('a[data-route]');\n  if (routeLink) { e.preventDefault(); navigate(routeLink.getAttribute('href') || '/'); return; }\n\n", 1)

if 'location.hash' in text or 'window.location.hash' in text:
    raise SystemExit('hash routing residue remains')
if any(token in text for token in ['Enter Admin Password', 'sb_admin_auth', 'sb_admin_data', "btoa("]):
    raise SystemExit('browser admin residue remains')

path.write_text(text, encoding='utf-8')
print('SoftBazzar storefront source hardening applied')
