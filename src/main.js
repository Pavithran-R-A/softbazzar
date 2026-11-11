import './index.css';
import logoUrl from './assets/logo.png';
import { brandIcons, products, categories, setCatalogue } from './data.js';
import { calculateCartTotalPaise, normalizeStoredCart, readStoredCart, resolveCartItems, resolveSelection, writeStoredCart } from './cart-model.js';
import { privacyPage, termsPage, TELEGRAM } from './pages.js';
import { sanitizeHTML } from './text-security.js';
import { deriveProductFamilies, featuredProductFamilies, findProductFamily } from './product-families.js';

const formatInr = (value) => Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const chevronSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>`;
const cartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>`;
const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clip-rule="evenodd"/></svg>`;
const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd"/></svg>`;
const telegramSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`;
const closeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
const trashSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
const VIDEO_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4';
const savedCartSnapshot = (() => { try { return JSON.parse(localStorage.getItem('sb_cart_v2') || '[]'); } catch { return []; } })();

// === CART STATE ===
let cart = readStoredCart();
let adminToken = '';
let cataloguePurchasable=false;
let productFamilies=[];

function saveCart() {
  cart = normalizeStoredCart(cart);
  if (!writeStoredCart(cart)) showToast('Cart storage is unavailable in this browser.');
}

function addToCart(id, variantName = null) {
  const selection = resolveSelection(id, variantName || null);
  if (!selection) return;
  const exists = cart.some(item => item.id === selection.id && item.variantName === selection.variantName);
  const matching = cart.find(item => item.id === selection.id && item.variantName === selection.variantName);
  if (exists && matching.qty >= selection.maxQuantity) { showToast('Supplier stock limit reached.'); return; }
  cart = exists
    ? cart.map(item => item === matching ? { ...item, qty: Math.min(selection.maxQuantity, item.qty + 1) } : item)
    : [...cart, { id: selection.id, variantName: selection.variantName, qty: 1 }];
  showToast(exists ? 'Increased quantity!' : 'Added to cart!');
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
  const selection = resolveSelection(id, normalizedVariant);
  if (!selection) return;
  const nextQty = (item.qty || 1) + delta;
  if (nextQty <= 0) {
    removeFromCart(id, normalizedVariant);
    return;
  }
  if (nextQty > selection.maxQuantity) { showToast('Supplier stock limit reached.'); return; }
  cart = cart.map(entry => entry === item ? { ...entry, qty: nextQty } : entry);
  saveCart();
  updateCartBadge();
  renderCartItems();
  if (window.location.pathname === '/checkout') render();
}

function getCartTotal() {
  return calculateCartTotalPaise(cart)/100;
}

function getCartTotalUsdCents() {
  const items=resolveCartItems(cart);
  if(items.some((item)=>item.lineTotalUsdCents===null))return null;
  return items.reduce((sum,item)=>sum+item.lineTotalUsdCents,0);
}

function updateCartBadge() {
  const count = cart.reduce((total, item) => total + item.qty, 0);
  const label = count === 1 ? '1 item' : `${count} items`;
  document.querySelectorAll('.cart-btn').forEach((button) => button.setAttribute('aria-label', `Cart, ${label}`));
  document.querySelectorAll('.cart-badge').forEach(b => {
    b.textContent = count ? (count > 99 ? '99+' : String(count)) : '';
    b.setAttribute('aria-hidden', 'true');
    b.classList.remove('bump');
    requestAnimationFrame(() => b.classList.add('bump'));
  });
}

// === TOAST ===
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.innerHTML = `${checkSvg} ${msg}`;
  t.classList.remove('show');
  requestAnimationFrame(() => { t.classList.add('show'); });
  setTimeout(() => t.classList.remove('show'), 2000);
}

// === CART DRAWER ===
function toggleCart(open) {
  const drawer = document.querySelector('.cart-drawer');
  const overlay = document.querySelector('.cart-overlay');
  drawer?.classList.toggle('open', open); overlay?.classList.toggle('open', open);
  drawer?.setAttribute('aria-hidden', String(!open));
  drawer?.toggleAttribute('inert', !open);
  document.querySelectorAll('#app > *:not(.cart-drawer):not(.cart-overlay)').forEach((element) => element.toggleAttribute('inert', open));
  document.querySelector('#cartToggle')?.setAttribute('aria-expanded', String(open));
  if (open) { renderCartItems(); document.querySelector('#cartClose')?.focus(); }
  else document.querySelector('#cartToggle')?.focus();
}
function renderCartItems() {
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
    return `<div class="cart-item" style="animation-delay:${i*0.05}s"><div class="cart-item-icon">${brandIcons[item.icon]||''}</div><div class="cart-item-info"><div class="cart-item-name">${sanitizeHTML(item.displayName)}</div><div class="cart-item-cat">${sanitizeHTML(item.cat)}</div></div>
    <div class="cart-qty-ctrl"><button aria-label="Decrease ${sanitizeHTML(item.displayName)} quantity" class="cart-qty-btn ripple-btn" data-qty-sub="${sanitizeHTML(item.id)}" data-qty-name="${sanitizeHTML(variantKey)}">-</button><span class="cart-qty-val">${item.qty||1}</span><button aria-label="Increase ${sanitizeHTML(item.displayName)} quantity" class="cart-qty-btn ripple-btn" data-qty-add="${sanitizeHTML(item.id)}" data-qty-name="${sanitizeHTML(variantKey)}">+</button></div>
    <div class="cart-item-price"><span>₹${formatInr(item.lineTotalPaise/100)}</span>${item.lineTotalUsdCents===null?'':`<small>≈ $${(item.lineTotalUsdCents/100).toFixed(2)} USD</small>`}</div><button aria-label="Remove ${sanitizeHTML(item.displayName)}" class="cart-remove ripple-btn" data-remove-id="${sanitizeHTML(item.id)}" data-remove-name="${sanitizeHTML(variantKey)}">${trashSvg}</button></div>`;
  }).join('');
  const totalEl = document.querySelector('.cart-total-amount');
  const countEl = document.querySelector('.cart-header .cart-count');
  if (totalEl) totalEl.innerHTML = `₹${formatInr(getCartTotal())}${getCartTotalUsdCents()===null?'':`<small>≈ $${(getCartTotalUsdCents()/100).toFixed(2)} USD (approx.)</small>`}`;
  if (countEl) countEl.textContent = `(${resolvedItems.reduce((sum, item) => sum + (item.qty || 1), 0)})`;
}

function getIcon(k) { return brandIcons[k] || '<span class="brand-monogram" aria-hidden="true">SB</span>'; }
function marqueeItems() { const items = featuredProductFamilies(productFamilies, 18).slice(0, 6); return [...items, ...items].map((family) => `<div class="marquee-item"><div class="marquee-icon liquid-glass">${getIcon(family.icon)}</div><span class="marquee-name">${sanitizeHTML(family.name)}</span></div>`).join(''); }
function familyCards() {
  const families = featuredProductFamilies(productFamilies, 18);
  if (!families.length) return '<p>No featured supplier families are available.</p>';
  return families.map((family, index) => {
    const price = family.startingPricePaise === null ? 'Price unavailable' : `From ₹${formatInr(family.startingPricePaise / 100)}`;
    const stock = family.availableOffers ? `${family.availableOffers} available offer${family.availableOffers === 1 ? '' : 's'}` : 'Currently out of stock';
    return `<a class="family-card fade-up fade-up-delay-${index % 4 + 1}" href="/collection/${encodeURIComponent(family.slug)}" data-route><span class="family-icon">${getIcon(family.icon)}</span><span class="family-name">${sanitizeHTML(family.name)}</span><span class="family-meta">${sanitizeHTML(stock)}</span><span class="family-price">${sanitizeHTML(price)}</span></a>`;
  }).join('');
}
function familyPage(slug) {
  const family = findProductFamily(productFamilies, slug);
  if (!family) return `${navbar()}<main id="main-content"><section class="section-inner family-page"><h1>Product family not found</h1><a href="/products" data-route>Browse all supplier offers</a></section></main>${footer()}${cartDrawer()}`;
  const offers = family.products.map((product) => {
    const variants = Array.isArray(product.variants) ? product.variants.filter((variant) => !variant.disabled) : [];
    const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
    const pricePaise = variants.length ? Math.min(...variants.map((variant) => variant.priceInrPaise)) : product.priceInrPaise;
    const priceUsd = variants.length ? Math.min(...variants.map((variant) => variant.priceUsd)) : product.priceUsd;
    const stockText = hasVariants ? `${variants.length} available option${variants.length === 1 ? '' : 's'}` : product.unlimited ? 'Unlimited stock' : product.inStock ? `${product.stock} in stock` : 'Out of stock';
    return `<article class="family-offer"><div><h2>${sanitizeHTML(product.name)}</h2><p>${sanitizeHTML(product.cat)} · ${sanitizeHTML(stockText)}</p>${product.duration ? `<p>${sanitizeHTML(product.duration)}</p>` : ''}</div><div class="family-offer-price"><strong>${variants.length ? 'From ' : ''}₹${formatInr(pricePaise / 100)}</strong>${Number.isFinite(Number(priceUsd)) ? `<small>≈ $${Number(priceUsd).toFixed(2)} USD (approx.)</small>` : ''}</div><a class="btn-buy ripple-btn" href="/product/${encodeURIComponent(product.id)}" data-route>${hasVariants ? 'Choose option' : 'View offer'}</a></article>`;
  }).join('');
  return `${navbar()}<main id="main-content"><section class="section-inner family-page"><a class="detail-back" href="/products" data-route>${backSvg} All supplier offers</a><h1>${sanitizeHTML(family.name)}</h1><p>Supplier listings, prices, and stock.</p><div class="family-offers">${offers}</div></section></main>${footer()}${cartDrawer()}`;
}
function productsPage() {
  return `${navbar()}<main id="main-content"><section class="section products-page"><div class="section-inner"><a class="detail-back" href="/" data-route>${backSvg} Featured families</a><h1 class="section-title">All supplier offers</h1><p id="catalogueStatus" role="status" aria-live="polite">Loading supplier inventory…</p><div class="search-container"><input type="search" id="searchInput" class="search-input" aria-label="Search supplier offers" placeholder="Search supplier offers" autocomplete="off"/></div><div class="catalogue-controls" aria-label="Catalogue filters"><label>Availability <select id="availabilityFilter"><option value="all">All offers</option><option value="available">In stock</option></select></label><label>Sort <select id="sortFilter"><option value="name">Name</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label></div><div class="category-chips" id="categoryChips">${chipHTML()}</div><div class="products-grid" id="productsGrid">${productCards('All')}</div></div></section></main>${footer()}${cartDrawer()}`;
}
function productCards(filter, searchQuery = '', availability = 'all', sort = 'name', limit = Infinity) {
  let list = filter === 'All' ? products : products.filter(p => p.cat.toLocaleLowerCase() === filter.toLocaleLowerCase());
  if(availability==='available')list=list.filter((product)=>product.inStock);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q) || (p.desc && p.desc.toLowerCase().includes(q)) || p.cat.toLowerCase().includes(q));
  }
  if(sort==='price-low')list=[...list].sort((a,b)=>a.priceNum-b.priceNum);
  if(sort==='price-high')list=[...list].sort((a,b)=>b.priceNum-a.priceNum);
  list=list.slice(0,limit);
  
  if (list.length === 0) {
    return `<div style="grid-column:1/-1;text-align:center;padding:40px;color:hsla(var(--foreground)/.5);">${searchQuery ? 'No products match your search.' : 'No supplier products are currently available.'}</div>`;
  }

  return list.map((p,i) => {
    const activeVariants = p.variants ? p.variants.filter(v => !v.disabled) : null;
    const selectedVariant = activeVariants && activeVariants.length > 0 ? [...activeVariants].sort((a, b) => a.priceInrPaise - b.priceInrPaise)[0] : null;
    const defaultPrice = selectedVariant?.price ?? p.price;
    const defaultUsd = selectedVariant?.priceUsd ?? p.priceUsd;
    const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
    return `<div class="product-card fade-up fade-up-delay-${i%4+1}" data-id="${sanitizeHTML(p.id)}">
    <div class="product-img">${p.image?`<img class="product-photo" src="${sanitizeHTML(p.image)}" alt="${sanitizeHTML(p.name)}" loading="lazy" referrerpolicy="no-referrer"/>`:''}<div class="brand-svg">${getIcon(p.icon)}</div></div>
    <div class="product-body"><a class="product-name" href="/product/${encodeURIComponent(p.id)}" data-route>${sanitizeHTML(p.name)}</a><div class="product-cat">${sanitizeHTML(p.cat)}</div>
    <div class="product-pricing"><span class="product-price">${hasVariants ? 'From ' : ''}${sanitizeHTML(defaultPrice)} INR</span>${Number.isFinite(Number(defaultUsd)) ? `<span class="product-usd">≈ $${Number(defaultUsd).toFixed(2)} USD (approx.)</span>` : ''}</div>
    ${Array.isArray(p.variants)&&p.variants.length>0 ? `<div class="product-cat">${activeVariants.length?'Choose an available option':'No options currently available'}</div>` : p.unlimited ? '<div class="product-cat">Unlimited stock</div>' : Number.isInteger(p.stock) ? `<div class="product-cat">${p.stock === 0 ? 'Out of stock' : p.stock <= 3 ? `Only ${p.stock} available` : `${p.stock} available`}</div>` : ''}
    ${p.requiresEmail ? '<div class="product-cat">Email required for delivery</div>' : ''}
    <button class="btn-buy ripple-btn" data-add="${sanitizeHTML(p.id)}" ${!p.inStock ? 'disabled' : ''}>${cartSvg} ${hasVariants?'Select Options':'Add to Cart'}</button></div></div>`;
  }).join('');
}
function chipHTML() { return categories.map(c => `<button class="chip ripple-btn ${c==='All'?'active':''}" data-cat="${sanitizeHTML(c)}">${sanitizeHTML(c)}</button>`).join(''); }

function navbar() {
  return `<nav class="navbar" id="navbar">
    <a href="/" class="nav-logo" data-home><img src="${logoUrl}" alt="SoftBazzar"/></a>
    <button class="mobile-menu-toggle" type="button" aria-expanded="false" aria-controls="mobileNav" aria-label="Open navigation menu">☰</button>
    <div class="nav-center">
      <button class="nav-item" data-scroll="products">Products ${chevronSvg}</button>
      <button class="nav-item" data-scroll="how-it-works">How It Works</button>
      <button class="nav-item" data-scroll="stats">Why Us</button>
      <a class="nav-item" href="${TELEGRAM}" target="_blank" rel="noopener noreferrer">Contact</a>
    </div>
    <div class="mobile-nav" id="mobileNav" hidden><button data-scroll="products">Products</button><a href="/products" data-route>All offers</a><a href="${TELEGRAM}" target="_blank" rel="noopener noreferrer">Support @softbazzar</a><a href="/privacy" data-route>Privacy</a><a href="/terms" data-route>Terms</a></div>
    <div class="nav-right" style="display:flex;gap:10px;align-items:center;">
      <button class="btn-signup cart-btn ripple-btn" id="cartToggle" aria-controls="cartDrawer" aria-expanded="false">${cartSvg} Cart <span class="cart-badge">${cart.reduce((total,item)=>total+item.qty,0)||''}</span></button>
      <a class="btn-signup ripple-btn" href="${TELEGRAM}" target="_blank" rel="noopener noreferrer">${telegramSvg} Support</a>
    </div>
  </nav><div class="nav-divider"></div>`;
}

function cartDrawer() {
  return `<div class="cart-overlay" id="cartOverlay"></div>
  <div class="cart-drawer" id="cartDrawer" role="dialog" aria-modal="true" aria-label="Shopping cart" aria-hidden="true" inert>
    <div class="cart-header"><h2>Your Cart <span class="cart-count">(${cart.reduce((total,item)=>total+item.qty,0)})</span></h2><button aria-label="Close cart" class="cart-close ripple-btn" id="cartClose">${closeSvg}</button></div>
    <div class="cart-items"></div>
    <div class="cart-footer"><div class="cart-total"><span class="cart-total-label">Total</span><span class="cart-total-amount">₹${formatInr(getCartTotal())}${getCartTotalUsdCents()===null?'':`<small>≈ $${(getCartTotalUsdCents()/100).toFixed(2)} USD (approx.)</small>`}</span></div>
    <a href="/checkout" data-route class="cart-checkout ripple-btn">${telegramSvg} Proceed to Checkout</a>
    <p class="cart-telegram-note">Quote only. No payment is collected.</p></div>
  </div>`;
}

function footer() {
  return `<footer class="footer"><div class="footer-inner">
    <div class="footer-brand"><img src="${logoUrl}" alt="SoftBazzar" style="height:28px;"/><p>Browse supplier products and current availability.</p>
    <div class="footer-contact">
      <a href="${TELEGRAM}" target="_blank" rel="noopener noreferrer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg> t.me/softbazzar</a>
    </div></div>
    <div class="footer-col"><h4>Categories</h4><p>Browse categories from current inventory.</p></div>
    <div class="footer-col"><h4>Catalogue</h4><p>See current supplier listings above.</p></div>
    <div class="footer-col"><h4>Legal</h4><ul>
      <li><a href="/privacy" data-route>Privacy Policy</a></li><li><a href="/terms" data-route>Terms & Conditions</a></li>
      <li><a href="/terms" data-route>Refund Policy</a></li><li><a href="${TELEGRAM}" target="_blank" rel="noopener noreferrer">Report an Issue</a></li>
    </ul></div>
    <div class="footer-col"><h4>Support</h4><ul>
      <li><a href="${TELEGRAM}" target="_blank" rel="noopener noreferrer">💬 Contact support</a></li>
      <li><a href="#" data-scroll="how-it-works">❓ How It Works</a></li><li><a href="#" data-scroll="products">🛒 Browse Products</a></li>
    </ul></div>
  </div>
  <div class="footer-bottom"><p>&copy; 2026 SoftBazzar. All rights reserved.</p>
    <div class="footer-payment"><span>Checkout currently paused</span></div>
    <div class="footer-socials">
      <a href="${TELEGRAM}" target="_blank" rel="noopener noreferrer" aria-label="Telegram">${telegramSvg}</a>
    </div>
  </div></footer>`;
}

function homePage() {
  return `<main id="main-content"><div class="hero-wrapper">
    <video class="bg-video" id="bgVideo" src="${VIDEO_URL}" muted playsinline></video><div class="blur-overlay"></div>
    <div class="content-layer">${navbar()}
      <div class="hero-content"><div class="hero-inner">
        <h1 class="hero-headline">Soft<span class="gradient-text">Bazzar</span></h1>
        <p class="hero-subtitle">Browse digital products and current availability<br/>from our reseller catalogue.</p>
        <button class="btn-cta ripple-btn magnetic-btn" data-scroll="products"><span>Browse Products</span></button>
      </div></div>
      <div class="marquee-section"><div class="marquee-container"><div class="marquee-label">Featured<br/>families</div><div class="marquee-track-wrapper"><div class="marquee-track">${marqueeItems()}</div></div></div></div>
    </div></div>
  <section class="section" id="products"><div class="section-inner">
    <div class="section-badge fade-up"><span class="dot"></span> Products</div>
    <h2 class="section-title fade-up">Browse product families</h2>
    <p class="section-subtitle fade-up" style="margin-bottom: 24px;">Featured order is curated, not popularity data.</p>
    <p id="catalogueStatus" role="status" aria-live="polite">Loading supplier inventory…</p>
    <div class="family-grid" id="familyGrid">${familyCards()}</div>
    <a class="all-offers-link" href="/products" data-route>Browse all supplier offers</a>
  </div></section>
  <section class="section" id="how-it-works"><div class="section-inner" style="text-align:center;">
    <div class="section-badge fade-up" style="margin:0 auto 24px;"><span class="dot"></span> How It Works</div>
    <h2 class="section-title fade-up">Browse with current details</h2>
    <div class="steps-row">
      <div class="step-card fade-up"><h3 class="step-title">Browse supplier listings</h3><p class="step-desc">See product information and current supplier stock.</p></div>
      <div class="step-card fade-up fade-up-delay-1"><h3 class="step-title">Review current prices</h3><p class="step-desc">INR is primary. USD amounts are approximate.</p></div>
      <div class="step-card fade-up fade-up-delay-2"><h3 class="step-title">Checkout is paused</h3><p class="step-desc">Orders open after payment and delivery services pass review.</p></div>
    </div></div></section>
  <section class="section" id="stats"><div class="section-inner" style="text-align:center;">
    <div class="section-badge fade-up" style="margin:0 auto 24px;"><span class="dot"></span> Inventory</div>
    <h2 class="section-title fade-up">Clear product information</h2>
    <p class="section-subtitle fade-up">Prices, duration and stock come from validated supplier data.</p>
  </div></section>
  <section class="cta-section"><div class="blur-bg"></div>
    <h2 class="cta-title fade-up">Browse current<br/>supplier products</h2>
    <p class="cta-subtitle fade-up">See products and availability from supplier data.</p>
    <button class="btn-cta ripple-btn fade-up" style="position:relative;z-index:1;" data-scroll="products"><span>Browse Products</span></button>
  </section></main>${footer()}${cartDrawer()}`;
}

function adminPage() {
  return `${navbar()}<main id="main-content"><section class="admin-page"><div class="admin-header"><div><h1>Store operations</h1><p>Private staging diagnostics and controls.</p></div></div><div class="admin-content">
    <form id="adminLogin" class="admin-card"><label for="adminTokenInput">Admin token</label><div class="admin-auth-row"><input id="adminTokenInput" class="admin-input" type="password" autocomplete="current-password" required/><button class="btn-buy" type="submit">Connect securely</button></div><p id="adminMessage" role="status">Token stays in page memory.</p></form>
    <div id="adminDashboard" hidden><div class="admin-card"><h2>Staging health</h2><div id="adminOverview" aria-live="polite">Connect to load diagnostics.</div></div>
    <div class="admin-card"><h2>Merchant pricing policy</h2><p>1 USDT ≈ 1 USD. Selling prices add 25%, then convert at this rate.</p><form id="pricingForm" class="admin-auth-row"><label>INR per USD <input id="pricingUsdInr" class="admin-input" inputmode="decimal" required/></label><label>Reason for authorized change <input id="pricingReason" class="admin-input" maxlength="300" minlength="5" required/></label><button class="btn-buy" type="submit">Save pricing rate</button></form><div id="pricingAudit" aria-live="polite"></div></div>
    <div class="admin-card"><h2>Recent supplier syncs</h2><div id="adminSyncRuns"></div><button id="syncNow" class="btn-buy" type="button">Run read-only sync</button></div>
    <div class="admin-card"><h2>Recent orders</h2><div id="adminOrders"></div><p>Payment and purchasing remain disabled.</p></div></div>
  </div></section></main>${footer()}`;
}

function detailPage(id) {
  const p = products.find(x => x.id === id);
  if (!p) return `${navbar()}<main id="main-content"><div class="detail-page page-transition" style="padding:200px 32px;text-align:center;"><h2>Product not found</h2><br/><button class="btn-cta ripple-btn" data-home><span>Back to Home</span></button></div></main>${footer()}${cartDrawer()}`;
  
  const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
  const activeVariants = hasVariants ? p.variants.filter(v => !v.disabled) : null;
  let variantHtml = '';
  if (activeVariants && activeVariants.length > 0) {
    variantHtml = `<div class="product-variants fade-up fade-up-delay-2" id="variantSelector">` + 
      activeVariants.map((v) => `<button class="variant-chip ripple-btn" aria-pressed="false" data-vprice="${sanitizeHTML(v.price)}" data-vpricenum="${v.priceNum}" data-vusd="${v.priceUsd}" data-vname="${sanitizeHTML(v.name)}">${sanitizeHTML(v.name)} · ${sanitizeHTML(v.price)}</button>`).join('') +
    `</div>`;
  }

  const defaultPrice = hasVariants ? 'Choose an option' : p.price;
  const defaultPriceNum = hasVariants ? '' : p.priceNum;
  const defaultUsd = hasVariants ? null : p.priceUsd;
  const defaultName = hasVariants ? '' : p.name;
  const relatedProducts=products.filter((product)=>product.id!==p.id&&product.cat===p.cat&&product.inStock).slice(0,3);
  
  return `${navbar()}<main id="main-content">
  <div class="detail-page page-transition"><div class="section-inner" style="max-width:1100px;margin:0 auto;padding:0 32px 80px;">
    <button class="detail-back ripple-btn" data-home>${backSvg} Back to products</button>
    <div class="detail-grid">
      <div class="detail-img-wrap" style="background:linear-gradient(135deg,${p.color}12,${p.color}05)">
        <div class="detail-glow" style="background:${p.color};top:50%;left:50%;"></div>
        ${p.image?`<img class="detail-photo" src="${sanitizeHTML(p.image)}" alt="${sanitizeHTML(p.name)}" loading="lazy" referrerpolicy="no-referrer"/>`:''}<div class="brand-svg">${getIcon(p.icon)}</div></div>
      <div class="detail-info">
        <h1 class="fade-up">${sanitizeHTML(p.name)}</h1><div class="detail-category fade-up fade-up-delay-1">${sanitizeHTML(p.cat)}</div>
        ${variantHtml}
        <div class="detail-price-row fade-up fade-up-delay-2">
          <span class="detail-current" id="detailCurrentPrice">${sanitizeHTML(defaultPrice)}</span>
          <span class="detail-category" id="detailUsdPrice">${hasVariants ? 'Select an available option to view price' : `≈ $${Number(defaultUsd).toFixed(2)} USD (approx.)`}</span>
        </div>
        <p class="product-source-label">Supplier-provided description</p><p class="detail-desc fade-up fade-up-delay-3">${sanitizeHTML(p.desc)}</p>
        <div class="detail-features fade-up fade-up-delay-4"><h3>Product information</h3><ul>${p.features.map(f=>`<li>${checkSvg} ${sanitizeHTML(f)}</li>`).join('')}</ul></div>
        <button class="detail-buy-btn ripple-btn fade-up fade-up-delay-4" data-detail-add="${sanitizeHTML(p.id)}" data-vname="${sanitizeHTML(defaultName)}" data-vprice="${sanitizeHTML(defaultPrice)}" data-vpricenum="${defaultPriceNum}" id="detailBuyBtn" ${p.inStock && !hasVariants ? '' : 'disabled'}><span>${cartSvg} ${!p.inStock ? 'Unavailable' : hasVariants ? 'Select an option first' : `Add to Cart — ${sanitizeHTML(defaultPrice)}`}</span></button>
        <p class="detail-contact fade-up fade-up-delay-4">Need help? Chat with us on <a href="${TELEGRAM}" target="_blank" rel="noopener noreferrer">Telegram @softbazzar</a></p>
      </div></div></div></div>${relatedProducts.length?`<section class="section"><div class="section-inner"><h2 class="section-title">More in ${sanitizeHTML(p.cat)}</h2><div class="products-grid">${productCards(p.cat,'','available','name',3)}</div></div></section>`:''}</main>${footer()}${cartDrawer()}`;
}

function checkoutPage() {
  const items = resolveCartItems(cart);
  if (!items.length) return '<div class="checkout-page page-transition"><div class="section-inner" style="max-width:700px;margin:0 auto;padding:100px 32px;text-align:center;"><h2>Your cart is empty</h2><p>Add current supplier products first.</p><button class="btn-cta ripple-btn" data-home><span>Browse Products</span></button></div></div>';
  const rows = items.map((item) => '<div class="co-item"><div class="co-item-info"><span class="co-item-name">' + sanitizeHTML(item.productName) + '</span><span class="co-item-variant">' + sanitizeHTML(item.displayName) + '</span><span class="co-item-qty">Qty: ' + item.qty + '</span></div><span class="co-item-price">₹' + formatInr(item.lineTotalPaise/100) + (item.lineTotalUsdCents===null?'':'<small>≈ $' + (item.lineTotalUsdCents/100).toFixed(2) + ' USD</small>') + '</span></div>').join('');
  const action=cataloguePurchasable?'<form id="quoteForm"><label for="checkoutEmail">Email for order updates (optional)</label><input id="checkoutEmail" type="email" maxlength="254" autocomplete="email"/><button class="detail-buy-btn ripple-btn co-send-btn" type="submit">Create order quote</button><p>Quote only. No payment is collected.</p></form>':'<h3>Checkout paused</h3><p>Supplier inventory needs a fresh verified update.</p><button class="detail-buy-btn ripple-btn co-send-btn" disabled>Order quotes unavailable</button>';
  return '<div class="checkout-page page-transition"><div class="section-inner checkout-inner"><a class="detail-back ripple-btn" href="/products" data-route>' + backSvg + ' Back to products</a><h1 class="co-title">Review your quote</h1><div class="co-grid"><section class="co-left co-card" aria-labelledby="order-summary-title"><h2 id="order-summary-title">Order summary</h2><div class="co-items">' + rows + '</div><div class="co-total-row"><span>Estimated total</span><span class="co-total">₹' + formatInr(getCartTotal()) + (getCartTotalUsdCents()===null?'':'<small>≈ $' + (getCartTotalUsdCents()/100).toFixed(2) + ' USD (approx.)</small>') + '</span></div></section><section class="co-right co-card" aria-labelledby="order-details-title"><h2 id="order-details-title">Order details</h2><p class="co-hint">Supplier costs use a fixed merchant conversion policy.</p>' + action + '<p id="quoteMessage" role="status" aria-live="polite"></p></section></div></div></div>';
}

function orderStatusPage(){return `${navbar()}<main id="main-content"><section class="section-inner" style="max-width:760px;margin:140px auto 80px;padding:0 24px"><h1>Order status</h1><p id="orderStatusMessage" role="status">Loading order details…</p><div id="orderStatusDetails"></div><button class="btn-cta" data-home>Return to store</button></section></main>${footer()}`;}
// === ROUTER ===
function navigate(path, replace = false) {
  const target = path || '/';
  if (replace) history.replaceState({}, '', target);
  else if (window.location.pathname !== target) history.pushState({}, '', target);
  render();
}

function decodeRouteSegment(value) {
  try { return decodeURIComponent(value); }
  catch { return null; }
}

function render() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const app = document.querySelector('#app');
  if (pathname.startsWith('/product/')) {
    const id = decodeRouteSegment(pathname.slice('/product/'.length));
    app.innerHTML = detailPage(id);
  } else if (pathname === '/checkout') {
    app.innerHTML = `${navbar()}<main id="main-content">${checkoutPage()}</main>${footer()}${cartDrawer()}`;
  } else if (pathname === '/products') {
    app.innerHTML = productsPage();
  } else if (pathname.startsWith('/collection/')) {
    app.innerHTML = familyPage(decodeRouteSegment(pathname.slice('/collection/'.length)));
  } else if (pathname === '/privacy') {
    app.innerHTML = `${navbar()}<main id="main-content"><div class="section-inner" style="padding-top:100px;"><button class="detail-back ripple-btn" data-home style="margin-bottom:20px;">${backSvg} Back to Store</button>${privacyPage()}</div></main>${footer()}${cartDrawer()}`;
  } else if (pathname === '/terms') {
    app.innerHTML = `${navbar()}<main id="main-content"><div class="section-inner" style="padding-top:100px;"><button class="detail-back ripple-btn" data-home style="margin-bottom:20px;">${backSvg} Back to Store</button>${termsPage()}</div></main>${footer()}${cartDrawer()}`;
  } else if (pathname === '/') {
    app.innerHTML = homePage();
  } else if (pathname === '/admin') {
    app.innerHTML = adminPage();
  } else if (/^\/orders\/[0-9a-f-]{36}$/i.test(pathname)) {
    app.innerHTML = orderStatusPage();
  } else {
    app.innerHTML = `${navbar()}<main id="main-content"><div class="section-inner" style="padding:120px 32px;text-align:center"><h1>Page not found</h1><p>The requested SoftBazzar page is not available.</p><a href="/" data-route>Back to store</a></div></main>${footer()}${cartDrawer()}`;
  }
  window.scrollTo(0, 0);
  initInteractions();
  updateCartBadge();
}

function initInteractions() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

  // Video
  const video = document.getElementById('bgVideo');
  if (video) {
    let raf = null;
    const fade = (dir, cb) => { const t0 = performance.now(); (function step(ts) { const p = Math.min((ts-t0)/500,1); video.style.opacity = dir==='in'?p:1-p; if(p<1) raf=requestAnimationFrame(step); else if(cb) cb(); })(performance.now()); };
    video.addEventListener('loadeddata', () => { video.play().then(()=>fade('in')).catch(()=>{video.muted=true;video.play().then(()=>fade('in'));}); });
    video.addEventListener('timeupdate', () => { if(video.duration-video.currentTime<=0.5 && +video.style.opacity>0) fade('out'); });
    video.addEventListener('ended', () => { if(raf) cancelAnimationFrame(raf); video.style.opacity='0'; setTimeout(()=>{video.currentTime=0;video.play().then(()=>fade('in'));},100); });
    video.load();
  }

  // Category filter
  const chipsEl = document.getElementById('categoryChips');
  const gridEl = document.getElementById('productsGrid');
  const searchInput = document.getElementById('searchInput');
  const availabilityFilter=document.getElementById('availabilityFilter');
  const sortFilter=document.getElementById('sortFilter');

  const updateGrid = () => {
    if (!gridEl) return;
    const activeChip = chipsEl ? chipsEl.querySelector('.chip.active') : null;
    const filter = activeChip ? activeChip.dataset.cat : 'All';
    const query = searchInput ? searchInput.value : '';
    const availability=availabilityFilter?.value||'all';
    const sort=sortFilter?.value||'name';
    gridEl.style.opacity='0'; gridEl.style.transform='translateY(16px)';
    setTimeout(() => {
      gridEl.innerHTML = productCards(filter, query, availability, sort);
      requestAnimationFrame(() => { 
        gridEl.style.transition='opacity .4s,transform .4s'; gridEl.style.opacity='1'; gridEl.style.transform='translateY(0)';
        gridEl.querySelectorAll('.fade-up').forEach(el => observer.observe(el)); 
      });
    }, 250);
  };

  if (chipsEl) {
    chipsEl.addEventListener('click', e => {
      const chip = e.target.closest('.chip'); if (!chip) return;
      chipsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      updateGrid();
    });
  }

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updateGrid, 300);
    });
  }
  availabilityFilter?.addEventListener('change',updateGrid);
  sortFilter?.addEventListener('change',updateGrid);
  document.querySelector('.mobile-menu-toggle')?.addEventListener('click',(event)=>{const button=event.currentTarget;const menu=document.getElementById('mobileNav');const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Close navigation menu':'Open navigation menu');menu.hidden=!open;});
  document.getElementById('productsGrid')?.addEventListener('error',(event)=>{if(event.target.matches('.product-photo'))event.target.remove();},true);
  document.querySelector('.detail-img-wrap')?.addEventListener('error',(event)=>{if(event.target.matches('.detail-photo'))event.target.remove();},true);

  const adminLogin=document.getElementById('adminLogin');
  adminLogin?.addEventListener('submit',async(event)=>{event.preventDefault();const input=document.getElementById('adminTokenInput');adminToken=input.value.trim();input.value='';await loadAdminDashboard();});
  document.getElementById('pricingForm')?.addEventListener('submit',async(event)=>{event.preventDefault();if(!adminToken)return;const message=document.getElementById('adminMessage');try{const response=await fetch('/api/admin/pricing',{method:'PUT',headers:{Authorization:`Bearer ${adminToken}`,'Content-Type':'application/json'},body:JSON.stringify({usdInr:document.getElementById('pricingUsdInr').value,reason:document.getElementById('pricingReason').value})});const result=await response.json();if(!response.ok)throw new Error(result.error==='change_reason_required'?'Provide a reason of at least five characters.':'Pricing update rejected.');document.getElementById('pricingReason').value='';message.textContent=result.updated?'Pricing rate saved and audited.':'That pricing rate is already active.';await loadAdminDashboard();}catch(error){message.textContent=error.message;}});
  document.getElementById('syncNow')?.addEventListener('click',async()=>{try{await fetch('/api/admin/sync',{method:'POST',headers:{Authorization:`Bearer ${adminToken}`}});await loadAdminDashboard();}catch{document.getElementById('adminMessage').textContent='Sync request failed.';}});
  document.getElementById('quoteForm')?.addEventListener('submit',createOrderQuote);
  const orderMatch=window.location.pathname.match(/^\/orders\/([0-9a-f-]{36})$/i);if(orderMatch)loadOrderStatus(orderMatch[1]);

  // Cart drawer
  document.getElementById('cartToggle')?.addEventListener('click', () => toggleCart(true));
  document.getElementById('cartClose')?.addEventListener('click', () => toggleCart(false));
  document.getElementById('cartOverlay')?.addEventListener('click', () => toggleCart(false));

  // Sticky nav
  const nav = document.querySelector('.navbar');
  if (nav) window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 50), { passive: true });

  renderCartItems();
}

async function createOrderQuote(event){
  event.preventDefault();const message=document.getElementById('quoteMessage');
  const items=resolveCartItems(cart).map(item=>({productId:item.id,...(item.variantId?{variantId:item.variantId}:{}),quantity:item.qty}));
  try{const idempotencyKey=crypto.randomUUID().replaceAll('-','_');const response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({customerEmail:document.getElementById('checkoutEmail').value.trim(),items})});const result=await response.json();if(!response.ok)throw new Error(result.error==='customer_email_required'?'An email is required for this product.':result.error==='quote_rate_limited'?'Too many quote attempts. Try again shortly.':result.error==='quote_expired'?'This quote expired. Review your cart again.':result.error==='quote_not_active'?'This quote is no longer active. Your cart remains saved.':'A current quote could not be created.');if(result.status!=='quoted'||!Number.isFinite(Date.parse(result.expiresAt))||Date.parse(result.expiresAt)<=Date.now())throw new Error('This quote is no longer active. Your cart remains saved.');sessionStorage.setItem(`sb_order_access_${result.orderId}`,idempotencyKey);const usdText=Number.isSafeInteger(result.approxUsdTotalCents)&&result.approxUsdTotalCents>0?` · ≈ $${(result.approxUsdTotalCents/100).toFixed(2)} USD (approx.)`:'';message.innerHTML=`Quote created for ₹${formatInr(result.totalPaise/100)} INR${usdText}. <a href="/orders/${encodeURIComponent(result.orderId)}" data-route>View order status</a>. Payment remains disabled.`;cart=[];saveCart();updateCartBadge();}catch(error){message.textContent=error.message;}
}

async function loadOrderStatus(orderId){
  try{const statusToken=sessionStorage.getItem(`sb_order_access_${orderId}`)||'';const response=await fetch(`/api/orders/${encodeURIComponent(orderId)}`,{headers:{Authorization:`Bearer ${statusToken}`}});if(!response.ok)throw new Error('Order not found in this browser session.');const {order}=await response.json();document.getElementById('orderStatusMessage').textContent=`Status: ${order.status}. No payment was collected.`;const usdText=Number.isSafeInteger(order.approxUsdTotalCents)&&order.approxUsdTotalCents>0?`<p>≈ $${(order.approxUsdTotalCents/100).toFixed(2)} USD (approx., at ₹${sanitizeHTML(order.merchantUsdInr)} per USD)</p>`:'';document.getElementById('orderStatusDetails').innerHTML=`<p>Order ${sanitizeHTML(order.id)}</p><p>Total ₹${formatInr(order.totalPaise/100)} INR</p>${usdText}<ul>${order.items.map(item=>`<li>${sanitizeHTML(item.name)} · ${item.quantity} × ₹${formatInr(item.unitPricePaise/100)}${Number.isSafeInteger(item.approxUsdCents)&&item.approxUsdCents>0?` · ≈ $${(item.approxUsdCents/100).toFixed(2)} USD each`:''}</li>`).join('')}</ul>`;}catch(error){document.getElementById('orderStatusMessage').textContent=error.message;}
}

async function loadAdminDashboard(){
  const message=document.getElementById('adminMessage');
  try{
    const headers={Authorization:`Bearer ${adminToken}`};
    const [overviewResponse,ordersResponse,pricingResponse]=await Promise.all([fetch('/api/admin/overview',{headers}),fetch('/api/admin/orders',{headers}),fetch('/api/admin/pricing',{headers})]);
    if(!overviewResponse.ok||!ordersResponse.ok||!pricingResponse.ok)throw new Error('Admin authentication failed.');
    const [overview,orders,pricingData]=await Promise.all([overviewResponse.json(),ordersResponse.json(),pricingResponse.json()]);
    document.getElementById('adminDashboard').hidden=false;
    document.getElementById('adminOverview').innerHTML=`<div class="admin-row"><span>Supplier key configured</span><strong>${overview.supplierConfigured?'Yes':'No — imports skipped'}</strong></div><div class="admin-row"><span>Live payments / supplier purchases</span><strong>Disabled / Disabled</strong></div><div class="admin-row"><span>Catalogue products</span><strong>${overview.catalogue.active||0} active of ${overview.catalogue.count||0}</strong></div><div class="admin-row"><span>Fixed conversion policy</span><strong>1 USD = ₹${sanitizeHTML(overview.pricing?.usdInr||'105')} · 1 USDT ≈ 1 USD</strong></div>`;
    document.getElementById('adminSyncRuns').innerHTML=overview.syncRuns.map(run=>`<div class="admin-row"><span>${sanitizeHTML(run.status)} · ${sanitizeHTML(run.started_at)}</span><span>${sanitizeHTML(run.error_code||`${run.imported} imported, ${run.updated} updated`)}</span></div>`).join('')||'<p>No sync attempts recorded.</p>';
    document.getElementById('adminOrders').innerHTML=orders.orders.map(order=>`<div class="admin-row"><span>${sanitizeHTML(order.id)} · ${sanitizeHTML(order.status)}</span><span>${sanitizeHTML(order.customer_email||'No email')} · ₹${formatInr(order.total_paise/100)}</span></div>`).join('')||'<p>No orders recorded.</p>';
    document.getElementById('pricingUsdInr').value=pricingData.pricing?.usdInr||'105';
    document.getElementById('pricingAudit').innerHTML=pricingData.history.map(row=>`<div class="admin-row"><span>₹${sanitizeHTML(row.previousUsdInr||'—')} → ₹${sanitizeHTML(row.usdInr)} · ${sanitizeHTML(row.reason)}</span><span>${sanitizeHTML(row.changedAt)} · ${sanitizeHTML(row.changedBy)}</span></div>`).join('');
    message.textContent='Connected. Token remains in page memory.';
  }catch(error){adminToken='';document.getElementById('adminDashboard').hidden=true;message.textContent=error.message;}
}

// Global click handler
document.addEventListener('click', e => {
  const routeLink = e.target.closest('a[data-route]');
  if (routeLink) { e.preventDefault(); navigate(routeLink.getAttribute('href') || '/'); return; }

  // Ripple effect
  const rippleBtn = e.target.closest('.ripple-btn');
  if (rippleBtn) {
    const rect = rippleBtn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.left = `${e.clientX - rect.left}px`;
    ripple.style.top = `${e.clientY - rect.top}px`;
    rippleBtn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }

  // Variant selector
  const variantBtn = e.target.closest('.variant-chip');
  if (variantBtn) {
    const parent = variantBtn.closest('.detail-info');
    if (!parent) return;
    parent.querySelectorAll('.variant-chip').forEach(c => c.classList.remove('active'));
    parent.querySelectorAll('.variant-chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
    variantBtn.classList.add('active');
    variantBtn.setAttribute('aria-pressed', 'true');
    
    const { vprice, vpricenum, vusd, vname } = variantBtn.dataset;
    const priceEl = parent.querySelector('#detailCurrentPrice');
    if (priceEl) priceEl.textContent = vprice;
    const usdPriceEl=parent.querySelector('#detailUsdPrice');
    if(usdPriceEl)usdPriceEl.textContent=`≈ $${Number(vusd).toFixed(2)} USD (approx.)`;
    
    const addBtn = parent.querySelector('#detailBuyBtn');
    if (addBtn) {
      addBtn.dataset.vname = vname;
      addBtn.dataset.vprice = vprice;
      addBtn.dataset.vpricenum = vpricenum;
      addBtn.disabled = false;
      addBtn.innerHTML = `<span>${cartSvg} Add to Cart — ${vprice}</span>`;
    }
    return;
  }

  // Add to cart (from detail page)
  const detailAddBtn = e.target.closest('[data-detail-add]');
  if (detailAddBtn) {
    e.preventDefault(); e.stopPropagation();
    const { detailAdd, vname } = detailAddBtn.dataset;
    addToCart(detailAdd, vname || null);
    return;
  }

  // Add to cart (from grid)
  const addBtn = e.target.closest('[data-add]');
  if (addBtn) {
    e.preventDefault(); e.stopPropagation();
    const p = products.find(x => x.id === addBtn.dataset.add);
    if (p && p.variants) {
      // If product has variants, just redirect to detail page
      navigate(`/product/${encodeURIComponent(p.id)}`);
      return;
    }
    addToCart(addBtn.dataset.add);
    return;
  }

  // Remove from cart
  const rmBtn = e.target.closest('[data-remove-id]');
  if (rmBtn) { removeFromCart(rmBtn.dataset.removeId, rmBtn.dataset.removeName); return; }

  // Cart Qty
  const qtyAdd = e.target.closest('[data-qty-add]');
  if (qtyAdd) { updateQuantity(qtyAdd.dataset.qtyAdd, qtyAdd.dataset.qtyName, 1); return; }
  const qtySub = e.target.closest('[data-qty-sub]');
  if (qtySub) { updateQuantity(qtySub.dataset.qtySub, qtySub.dataset.qtyName, -1); return; }

  // Product card click
  const card = e.target.closest('.product-card');
  if (card && !e.target.closest('[data-add]')) { navigate(`/product/${encodeURIComponent(card.dataset.id)}`); return; }
  
  // Home
  const homeBtn = e.target.closest('[data-home]');
  if (homeBtn) { e.preventDefault(); navigate('/'); return; }
  
  // Scroll
  const scrollBtn = e.target.closest('[data-scroll]');
  if (scrollBtn) { e.preventDefault(); const t = document.getElementById(scrollBtn.dataset.scroll); if (t) t.scrollIntoView({behavior:'smooth'}); return; }
  
  // Footer category filter
  const filterLink = e.target.closest('[data-filter]');
  if (filterLink) {
    e.preventDefault(); navigate('/');
    setTimeout(() => { document.getElementById('products')?.scrollIntoView({behavior:'smooth'});
      setTimeout(() => { document.querySelector(`.chip[data-cat="${filterLink.dataset.filter}"]`)?.click(); }, 500);
    }, 100);
  }

});

document.addEventListener('keydown', (event) => {
  const drawer=document.querySelector('.cart-drawer.open');if(!drawer)return;
  if (event.key === 'Escape') { toggleCart(false); return; }
  if (event.key === 'Tab') {
    const focusable=[...drawer.querySelectorAll('button:not([disabled]),a[href],input:not([disabled])')];
    const first=focusable[0];const last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
});

window.addEventListener('popstate', render);
render();
fetch('/api/catalogue').then((response) => response.ok ? response.json() : Promise.reject(new Error('catalogue unavailable'))).then((catalogue) => {
  if (!Array.isArray(catalogue.products)) throw new Error('invalid catalogue');
  cataloguePurchasable=Boolean(catalogue.purchasable);
  setCatalogue(catalogue.products.map((product) => ({ ...product, variants:product.variants.map((variant)=>({...variant,priceNum:variant.priceInrPaise/100,price:`₹${(variant.priceInrPaise/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`,disabled:!variant.inStock})), priceNum: product.priceInrPaise / 100, icon: Object.keys(brandIcons).find((key) => key === product.name.toLowerCase().split(/[^a-z0-9]+/)[0]), color: '#7967ef', price: `₹${(product.priceInrPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, inStock: product.inStock && catalogue.purchasable, features: [product.duration, product.requiresEmail ? 'Email required for delivery' : null, product.type].filter(Boolean) })));
  productFamilies = deriveProductFamilies(products);
  const retainedCart = normalizeStoredCart(savedCartSnapshot);
  cart = retainedCart;
  saveCart();
  updateCartBadge();
  if (Array.isArray(savedCartSnapshot) && retainedCart.length < savedCartSnapshot.length) showToast('Some saved items left the supplier catalogue.');
  render();
  const status=document.querySelector('#catalogueStatus');
  if(status)status.textContent=catalogue.lastSyncAt?`${catalogue.stale?'Supplier update delayed. Last successful update: ':'Last supplier update: '}${new Date(catalogue.lastSyncAt).toLocaleString()}`:'Supplier inventory awaits validation.';
  if (catalogue.stale) showToast('Catalogue refresh is delayed. Checkout is paused.');
}).catch(() => showToast('Supplier catalogue is unavailable. Please try again later.'));

// Pointer highlights and magnetic hero button.
document.addEventListener('mousemove', e => {
  // Spotlight for cards (Event Delegation)
  const card = e.target.closest('.product-card');
  if (card) {
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  }

  // Magnetic Buttons (Event Delegation)
  const btn = e.target.closest('.magnetic-btn');
  if (btn) {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const tx = (x - rect.width / 2) * 0.3;
    const ty = (y - rect.height / 2) * 0.3;
    btn.style.transform = `translate(${tx}px, ${ty}px)`;
  }
});

// Reset magnetic button position when mouse leaves
document.addEventListener('mouseout', e => {
  const btn = e.target.closest('.magnetic-btn');
  if (btn) {
    btn.style.transform = '';
  }
});
