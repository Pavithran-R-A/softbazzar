import './index.css';
import logoUrl from './assets/logo.png';
import { brandIcons, products, categories } from './data.js';
import { privacyPage, termsPage, TELEGRAM } from './pages.js';

const sanitizeHTML = (str) => typeof str === 'string' ? str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])) : str;

// === ADMIN OVERRIDES ===
try {
  const adminData = JSON.parse(localStorage.getItem('sb_admin_data') || '{}');
  products.forEach(p => {
    if (adminData[p.id]) {
      if (adminData[p.id].inStock !== undefined) p.inStock = adminData[p.id].inStock;
      if (adminData[p.id].price) p.price = adminData[p.id].price;
      if (adminData[p.id].priceNum) p.priceNum = adminData[p.id].priceNum;
      if (adminData[p.id].variantPrices && p.variants) {
        p.variants.forEach(v => {
          if (adminData[p.id].variantPrices[v.name]) {
            v.price = adminData[p.id].variantPrices[v.name].price;
            v.priceNum = adminData[p.id].variantPrices[v.name].priceNum;
          }
        });
      }
      if (adminData[p.id].disabledVariants && p.variants) {
        p.variants.forEach(v => {
          if (adminData[p.id].disabledVariants.includes(v.name)) v.disabled = true;
        });
      }
    }
  });
} catch(e) {}


const chevronSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>`;
const cartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>`;
const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clip-rule="evenodd"/></svg>`;
const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd"/></svg>`;
const telegramSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`;
const closeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
const trashSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
const VIDEO_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4';

// === CART STATE ===
let cart = [];
try { cart = JSON.parse(localStorage.getItem('sb_cart_v2') || '[]'); } catch(e){}
function saveCart() { localStorage.setItem('sb_cart_v2', JSON.stringify(cart)); }
function addToCart(id, vName = null, vPrice = null, vPriceNum = null) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const name = vName || p.name;
  const pr = vPrice || p.price;
  const prn = vPriceNum || p.priceNum;
  
  const existing = cart.find(x => x.id === id && x.vName === name);
  if (existing) {
    existing.qty = (existing.qty || 1) + 1;
    showToast('Increased quantity!');
  } else {
    cart.push({ id, vName: name, vPrice: pr, vPriceNum: prn, icon: p.icon, cat: p.cat, color: p.color, qty: 1 });
    showToast('Added to cart!');
  }
  saveCart();
  updateCartBadge();
  if (document.querySelector('.cart-drawer.open')) renderCartItems();
}
function removeFromCart(id, vName) {
  cart = cart.filter(x => !(x.id === id && x.vName === vName));
  saveCart();
  updateCartBadge();
  renderCartItems();
}
function updateQuantity(id, vName, delta) {
  const item = cart.find(x => x.id === id && x.vName === vName);
  if (!item) return;
  item.qty = (item.qty || 1) + delta;
  if (item.qty <= 0) {
    removeFromCart(id, vName);
    return;
  }
  saveCart();
  updateCartBadge();
  renderCartItems();
  if (location.hash === '#checkout') render();
}
function getCartTotal() {
  return cart.reduce((t, item) => t + (item.vPriceNum * (item.qty || 1)), 0);
}
function updateCartBadge() {
  document.querySelectorAll('.cart-badge').forEach(b => {
    b.textContent = cart.length || '';
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
  document.querySelector('.cart-overlay')?.classList.toggle('open', open);
  document.querySelector('.cart-drawer')?.classList.toggle('open', open);
  if (open) renderCartItems();
}
function renderCartItems() {
  const el = document.querySelector('.cart-items');
  const ft = document.querySelector('.cart-footer');
  if (!el) return;
  if (cart.length === 0) {
    el.innerHTML = `<div class="cart-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg><p>Your cart is empty</p></div>`;
    if (ft) ft.style.display = 'none';
    return;
  }
  if (ft) ft.style.display = '';
  el.innerHTML = cart.map((item, i) => {
    return `<div class="cart-item" style="animation-delay:${i*0.05}s"><div class="cart-item-icon" style="background:${item.color}15">${brandIcons[item.icon]||''}</div><div class="cart-item-info"><div class="cart-item-name">${item.vName}</div><div class="cart-item-cat">${item.cat}</div></div>
    <div class="cart-qty-ctrl"><button class="cart-qty-btn ripple-btn" data-qty-sub="${item.id}" data-qty-name="${item.vName}">-</button><span class="cart-qty-val">${item.qty||1}</span><button class="cart-qty-btn ripple-btn" data-qty-add="${item.id}" data-qty-name="${item.vName}">+</button></div>
    <div class="cart-item-price">₹${(item.vPriceNum * (item.qty||1)).toLocaleString('en-IN')}</div><button class="cart-remove ripple-btn" data-remove-id="${item.id}" data-remove-name="${item.vName}">${trashSvg}</button></div>`;
  }).join('');
  const totalEl = document.querySelector('.cart-total-amount');
  const countEl = document.querySelector('.cart-header .cart-count');
  if (totalEl) totalEl.textContent = `₹${getCartTotal().toLocaleString('en-IN')}`;
  if (countEl) countEl.textContent = `(${cart.reduce((sum, item) => sum + (item.qty || 1), 0)})`;
}

const marqueeKeys = ['chatgpt','perplexity','gemini','envato','windsurf','microsoft'];
const marqueeNames = ['ChatGPT','Perplexity','Gemini','Envato','Windsurf','Microsoft'];
function getIcon(k) { return brandIcons[k] || ''; }
function marqueeItems() {
  const items = marqueeKeys.map((k,i) => `<div class="marquee-item"><div class="marquee-icon liquid-glass">${getIcon(k)}</div><span class="marquee-name">${marqueeNames[i]}</span></div>`);
  return [...items,...items].join('');
}
function productCards(filter, searchQuery = '') {
  let list = filter === 'All' ? products : products.filter(p => p.cat === filter);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q) || (p.desc && p.desc.toLowerCase().includes(q)) || p.cat.toLowerCase().includes(q));
  }
  
  if (list.length === 0) {
    return `<div style="grid-column:1/-1;text-align:center;padding:40px;color:hsla(var(--foreground)/.5);">No products found matching your search.</div>`;
  }

  return list.map((p,i) => {
    const activeVariants = p.variants ? p.variants.filter(v => !v.disabled) : null;
    const defaultPrice = activeVariants && activeVariants.length > 0 ? activeVariants[0].price : p.price;
    const hasVariants = activeVariants && activeVariants.length > 0;
    return `<div class="product-card fade-up fade-up-delay-${i%4+1}" data-id="${p.id}">
    <div class="product-img" style="background:linear-gradient(135deg,${p.color}15,${p.color}08)"><div class="brand-svg">${getIcon(p.icon)}</div>${p.tag?`<span class="product-tag">${p.tag}</span>`:''}</div>
    <div class="product-body"><div class="product-name">${p.name}</div><div class="product-cat">${p.cat}</div>
    <div class="product-pricing"><span class="product-price">${defaultPrice}</span>${p.mrp ? `<span class="product-mrp">${p.mrp}</span><span class="product-discount">${p.discount} OFF</span>` : ''}</div>
    <button class="btn-buy ripple-btn" data-add="${p.id}">${cartSvg} ${hasVariants?'Select Options':'Add to Cart'}</button></div></div>`;
  }).join('');
}
function chipHTML() { return categories.map(c => `<button class="chip ripple-btn ${c==='All'?'active':''}" data-cat="${c}">${c}</button>`).join(''); }

function navbar() {
  return `<nav class="navbar" id="navbar">
    <a href="#" class="nav-logo" data-home><img src="${logoUrl}" alt="SoftBazzar"/></a>
    <div class="nav-center">
      <button class="nav-item" data-scroll="products">Products ${chevronSvg}</button>
      <button class="nav-item" data-scroll="how-it-works">How It Works</button>
      <button class="nav-item" data-scroll="stats">Why Us</button>
      <a class="nav-item" href="${TELEGRAM}" target="_blank">Contact</a>
    </div>
    <div class="nav-right" style="display:flex;gap:10px;align-items:center;">
      <button class="btn-signup cart-btn ripple-btn" id="cartToggle">${cartSvg} Cart <span class="cart-badge">${cart.length||''}</span></button>
      <a class="btn-signup ripple-btn" href="${TELEGRAM}" target="_blank">${telegramSvg} Support</a>
    </div>
  </nav><div class="nav-divider"></div>`;
}

function cartDrawer() {
  return `<div class="cart-overlay" id="cartOverlay"></div>
  <div class="cart-drawer" id="cartDrawer">
    <div class="cart-header"><h2>Your Cart <span class="cart-count">(${cart.length})</span></h2><button class="cart-close ripple-btn" id="cartClose">${closeSvg}</button></div>
    <div class="cart-items"></div>
    <div class="cart-footer"><div class="cart-total"><span class="cart-total-label">Total</span><span class="cart-total-amount">₹${getCartTotal()}</span></div>
    <a href="#checkout" class="cart-checkout ripple-btn">${telegramSvg} Proceed to Checkout</a>
    <p class="cart-telegram-note">Secure payment via UPI or Crypto</p></div>
  </div>`;
}

function footer() {
  return `<footer class="footer"><div class="footer-inner">
    <div class="footer-brand"><img src="${logoUrl}" alt="SoftBazzar" style="height:28px;"/><p>Your one-stop shop for premium software licenses, OTT subscriptions, and digital tools at the most affordable prices. Instant delivery guaranteed.</p>
    <div class="footer-contact">
      <a href="${TELEGRAM}" target="_blank"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg> t.me/softbazzar</a>
      <a href="mailto:support@softbazzar.com"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4l-10 8L2 4"/></svg> support@softbazzar.com</a>
    </div></div>
    <div class="footer-col"><h4>Categories</h4><ul>
      <li><a href="#" data-filter="AI Tools">AI Tools</a></li><li><a href="#" data-filter="Developer Tools">Developer Tools</a></li>
      <li><a href="#" data-filter="Design Resources">Design Resources</a></li><li><a href="#" data-filter="Social Media Growth">Social Media Growth</a></li>
    </ul></div>
    <div class="footer-col"><h4>Popular</h4><ul>
      <li><a href="#product/chatgpt-plus">ChatGPT Plus</a></li><li><a href="#product/perplexity-pro">Perplexity Pro</a></li>
      <li><a href="#product/canva-pro">Canva Pro</a></li><li><a href="#product/envato">Envato Elements</a></li>
      <li><a href="#product/reels-views">1M Reels Views</a></li>
    </ul></div>
    <div class="footer-col"><h4>Legal</h4><ul>
      <li><a href="#privacy">Privacy Policy</a></li><li><a href="#terms">Terms & Conditions</a></li>
      <li><a href="${TELEGRAM}" target="_blank">Refund Policy</a></li><li><a href="${TELEGRAM}" target="_blank">Report an Issue</a></li>
    </ul></div>
    <div class="footer-col"><h4>Support</h4><ul>
      <li><a href="${TELEGRAM}" target="_blank">💬 Live Chat (Telegram)</a></li><li><a href="${TELEGRAM}" target="_blank">📞 24/7 Support</a></li>
      <li><a href="#" data-scroll="how-it-works">❓ How It Works</a></li><li><a href="#" data-scroll="products">🛒 Browse Products</a></li>
    </ul></div>
  </div>
  <div class="footer-bottom"><p>&copy; 2026 SoftBazzar. All rights reserved.</p>
    <div class="footer-payment"><span>We accept</span><div class="pay-icon">UPI</div><div class="pay-icon">VISA</div><div class="pay-icon">MC</div><div class="pay-icon">GPay</div></div>
    <div class="footer-socials">
      <a href="${TELEGRAM}" target="_blank" aria-label="Telegram">${telegramSvg}</a>
      <a href="#" aria-label="Instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg></a>
      <a href="#" aria-label="Twitter"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg></a>
    </div>
  </div></footer>`;
}

function homePage() {
  return `<div class="hero-wrapper">
    <video class="bg-video" id="bgVideo" src="${VIDEO_URL}" muted playsinline></video><div class="blur-overlay"></div>
    <div class="content-layer">${navbar()}
      <div class="hero-content"><div class="hero-inner">
        <h1 class="hero-headline">Soft<span class="gradient-text">Bazzar</span></h1>
        <p class="hero-subtitle">Premium software, OTT subscriptions &amp; digital tools<br/>at unbeatable prices. Instant delivery.</p>
        <button class="btn-cta ripple-btn magnetic-btn" data-scroll="products"><span>Browse Products</span></button>
      </div></div>
      <div class="marquee-section"><div class="marquee-container"><div class="marquee-label">Trusted brands<br/>we deliver</div><div class="marquee-track-wrapper"><div class="marquee-track">${marqueeItems()}</div></div></div></div>
    </div></div>
  <section class="section" id="products"><div class="section-inner">
    <div class="section-badge fade-up"><span class="dot"></span> Products</div>
    <h2 class="section-title fade-up">Browse our collection</h2>
    <p class="section-subtitle fade-up" style="margin-bottom: 24px;">Curated subscriptions &amp; productivity plans at prices you won't find anywhere else.</p>
    
    <div class="search-container fade-up">
      <input type="text" id="searchInput" class="search-input" placeholder="Search for AI tools, Netflix, Instagram followers..." autocomplete="off"/>
    </div>

    <div class="category-chips fade-up" id="categoryChips">${chipHTML()}</div>
    <div class="products-grid" id="productsGrid">${productCards('All')}</div>
  </div></section>
  <section class="section" id="how-it-works"><div class="section-inner" style="text-align:center;">
    <div class="section-badge fade-up" style="margin:0 auto 24px;"><span class="dot"></span> How It Works</div>
    <h2 class="section-title fade-up">Get started in 3 steps</h2>
    <div class="steps-row">
      <div class="step-card fade-up"><h3 class="step-title">Choose your product</h3><p class="step-desc">Browse our catalog of premium software and subscriptions. Pick what you need.</p></div>
      <div class="step-card fade-up fade-up-delay-1"><h3 class="step-title">Make payment</h3><p class="step-desc">Pay securely via UPI, card, or wallet. All transactions are encrypted and safe.</p></div>
      <div class="step-card fade-up fade-up-delay-2"><h3 class="step-title">Instant delivery</h3><p class="step-desc">Receive your credentials or activation link instantly via email. Start using right away.</p></div>
    </div></div></section>
  <section class="section" id="stats"><div class="section-inner" style="text-align:center;">
    <div class="section-badge fade-up" style="margin:0 auto 24px;"><span class="dot"></span> Trusted</div>
    <h2 class="section-title fade-up">Why customers love us</h2>
    <div class="stats-row">
      <div class="stat-item fade-up float-anim"><div class="stat-number">50K+</div><div class="stat-label">Happy Customers</div></div>
      <div class="stat-item fade-up float-anim" style="animation-delay:.5s"><div class="stat-number">200+</div><div class="stat-label">Products Available</div></div>
      <div class="stat-item fade-up float-anim" style="animation-delay:1s"><div class="stat-number">99%</div><div class="stat-label">Uptime Guarantee</div></div>
      <div class="stat-item fade-up float-anim" style="animation-delay:1.5s"><div class="stat-number">24/7</div><div class="stat-label">Customer Support</div></div>
    </div></div></section>
  <section class="cta-section"><div class="blur-bg"></div>
    <h2 class="cta-title fade-up">Ready to save big<br/>on premium software?</h2>
    <p class="cta-subtitle fade-up">Join 50,000+ customers already saving on their favorite subscriptions.</p>
    <button class="btn-cta ripple-btn fade-up" style="position:relative;z-index:1;" data-scroll="products"><span>Browse Products</span></button>
  </section>${footer()}${cartDrawer()}`;
}

function detailPage(id) {
  const p = products.find(x => x.id === id);
  if (!p) return `${navbar()}<div class="detail-page page-transition" style="padding:200px 32px;text-align:center;"><h2>Product not found</h2><br/><button class="btn-cta ripple-btn" data-home><span>Back to Home</span></button></div>${footer()}${cartDrawer()}`;
  
  const activeVariants = p.variants ? p.variants.filter(v => !v.disabled) : null;
  let variantHtml = '';
  if (activeVariants && activeVariants.length > 0) {
    variantHtml = `<div class="product-variants fade-up fade-up-delay-2" id="variantSelector">` + 
      activeVariants.map((v, i) => `<button class="variant-chip ripple-btn ${i===0?'active':''}" data-vprice="${v.price}" data-vpricenum="${v.priceNum}" data-vname="${v.name}">${v.name}</button>`).join('') + 
    `</div>`;
  }

  const defaultPrice = activeVariants && activeVariants.length > 0 ? activeVariants[0].price : p.price;
  const defaultPriceNum = activeVariants && activeVariants.length > 0 ? activeVariants[0].priceNum : p.priceNum;
  const defaultName = activeVariants && activeVariants.length > 0 ? activeVariants[0].name : p.name;
  
  return `${navbar()}
  <div class="detail-page page-transition"><div class="section-inner" style="max-width:1100px;margin:0 auto;padding:0 32px 80px;">
    <button class="detail-back ripple-btn" data-home>${backSvg} Back to products</button>
    <div class="detail-grid">
      <div class="detail-img-wrap" style="background:linear-gradient(135deg,${p.color}12,${p.color}05)">
        <div class="detail-glow" style="background:${p.color};top:50%;left:50%;"></div>
        <div class="brand-svg">${getIcon(p.icon)}</div></div>
      <div class="detail-info">
        <h1 class="fade-up">${p.name}</h1><div class="detail-category fade-up fade-up-delay-1">${p.cat}</div>
        ${variantHtml}
        <div class="detail-price-row fade-up fade-up-delay-2">
          <span class="detail-current" id="detailCurrentPrice">${defaultPrice}</span>
          ${p.mrp ? `<span class="detail-original">${p.mrp}</span><span class="detail-save">${p.discount} OFF</span>` : ''}
        </div>
        <p class="detail-desc fade-up fade-up-delay-3">${p.desc}</p>
        <div class="detail-features fade-up fade-up-delay-4"><h3>What's included</h3><ul>${p.features.map(f=>`<li>${checkSvg} ${f}</li>`).join('')}</ul></div>
        <button class="detail-buy-btn ripple-btn fade-up fade-up-delay-4" data-detail-add="${p.id}" data-vname="${defaultName}" data-vprice="${defaultPrice}" data-vpricenum="${defaultPriceNum}" id="detailBuyBtn"><span>${cartSvg} Add to Cart — ${defaultPrice}</span></button>
        <a href="${TELEGRAM}" target="_blank" class="detail-buy-btn ripple-btn fade-up fade-up-delay-4" style="margin-top:12px;background:linear-gradient(135deg,#229ED9,#1b75bc);text-decoration:none"><span>${telegramSvg} Buy Now on Telegram</span></a>
        <p class="detail-contact fade-up fade-up-delay-4">Need help? Chat with us on <a href="${TELEGRAM}" target="_blank">Telegram @softbazzar</a></p>
      </div></div></div></div>${footer()}${cartDrawer()}`;
}

function checkoutPage() {
  if (cart.length === 0) {
    return `<div class="checkout-page page-transition"><div class="section-inner" style="max-width:700px;margin:0 auto;padding:100px 32px;text-align:center;">
      <h2 style="font-family:var(--font-headline);font-size:32px;margin-bottom:16px;">Your cart is empty</h2>
      <p style="color:hsl(var(--hero-sub));margin-bottom:32px;">Add some products before checking out.</p>
      <button class="btn-cta ripple-btn" data-home><span>Browse Products</span></button>
    </div></div>`;
  }
  const itemsHtml = cart.map(item => {
    const p = products.find(x => x.id === item.id);
    return `<div class="co-item"><div class="co-item-icon" style="background:${item.color}15">${brandIcons[item.icon]||''}</div>
      <div class="co-item-info"><span class="co-item-name">${p ? p.name : item.vName}</span><span class="co-item-variant">${item.vName}</span><span class="co-item-qty">Qty: ${item.qty||1}</span></div>
      <span class="co-item-price">₹${(item.vPriceNum * (item.qty||1)).toLocaleString('en-IN')}</span></div>`;
  }).join('');

  const orderLines = cart.map(item => {
    const p = products.find(x => x.id === item.id);
    return `- ${p ? p.name : item.vName} (${item.vName}) x${item.qty||1} — ₹${(item.vPriceNum * (item.qty||1)).toLocaleString('en-IN')}`;
  }).join('%0A');

  const hasCert = cart.some(item => item.id === 'infosys' || item.id === 'jpmorgan');
  let certHtml = '';
  if (hasCert) {
    certHtml = `<div class="co-card" style="margin-top:20px;"><h3>🎓 Certificate Details</h3>
      <p class="co-hint">Please provide details for your certification.</p>
      <input type="text" id="coCertName" class="co-input" placeholder="Full Name" style="margin-bottom:12px;" required />
      <div style="display:flex;gap:12px;margin-bottom:12px;">
        <input type="text" id="coCertGender" class="co-input" placeholder="Gender" required />
        <input type="number" id="coCertAge" class="co-input" placeholder="Age" required />
      </div>
      <input type="text" id="coCertAddress" class="co-input" placeholder="Address" required />
    </div>`;
  }

  return `<div class="checkout-page page-transition"><div class="section-inner" style="max-width:900px;margin:0 auto;padding:100px 32px 80px;">
    <button class="detail-back ripple-btn" data-home>${backSvg} Back to products</button>
    <h1 class="co-title">Checkout</h1>
    <div class="co-grid">
      <div class="co-left">
        <div class="co-card"><h3>📦 Order Summary</h3><div class="co-items">${itemsHtml}</div>
          <div class="co-total-row"><span>Total</span><span class="co-total">₹${getCartTotal().toLocaleString('en-IN')}</span></div></div>

        ${certHtml}
      </div>
      <div class="co-right">
        <div class="co-card co-steps"><h3>📋 How to Complete Your Order</h3>
          <div class="co-step"><span class="co-step-num">1</span><div><strong>Review Order</strong><p>Verify your cart items.</p></div></div>
          <div class="co-step"><span class="co-step-num">2</span><div><strong>Send to Telegram</strong><p>Click the button below to send your order details securely.</p></div></div>
          <div class="co-step"><span class="co-step-num">3</span><div><strong>Complete Payment</strong><p>Our agent will provide payment details and deliver your product within 10 mins - 16 hours.</p></div></div>
        </div>
        <button class="detail-buy-btn ripple-btn co-send-btn" id="coSendOrder"><span>${telegramSvg} Send Order on Telegram</span></button>
      </div>
    </div>
  </div></div>`;
}

function adminPage() {
  const adminData = JSON.parse(localStorage.getItem('sb_admin_data') || '{}');
  const orders = JSON.parse(localStorage.getItem('sb_admin_orders') || '[]');
  
  const productRows = products.map(p => {
    const isStock = p.inStock !== false;
    const defaultPrice = p.price || (p.variants ? p.variants[0].price : 'N/A');
    
    let variantToggles = '';
    if (p.variants && p.variants.length > 0) {
      variantToggles = `<div style="margin-top:12px;padding-top:12px;border-top:1px dashed rgba(255,255,255,0.1);display:flex;flex-direction:column;gap:8px;">` + 
        p.variants.map(v => {
          const isVStock = !v.disabled;
          return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:hsla(var(--foreground)/.7);padding-left:12px;">
            <span>${v.name}</span>
            <div style="display:flex;align-items:center;gap:12px;">
              <input type="text" class="admin-input" placeholder="Price" value="${v.price}" data-edit-variant-price="${p.id}" data-vname="${v.name}" style="width:80px;padding:4px 8px;" />
              <div class="toggle-switch ${isVStock ? 'active' : ''}" data-toggle-variant="${p.id}" data-vname="${v.name}" style="transform:scale(0.8);transform-origin:right center;"></div>
            </div>
          </div>`;
        }).join('') + `</div>`;
    }

    return `<div class="admin-row" style="display:block;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div class="admin-col-info"><div class="admin-col-icon" style="width:40px;height:40px;background:rgba(255,255,255,.05);border-radius:8px;display:flex;align-items:center;justify-content:center;">${getIcon(p.icon)}</div>
        <div><div style="font-family:var(--font-headline);font-weight:600;font-size:14px;">${p.name}</div><div style="font-size:12px;color:hsla(var(--foreground)/.5);">${p.cat}</div></div></div>
        <div class="admin-col-actions">
          <input type="text" class="admin-input" placeholder="Price" value="${defaultPrice}" data-edit-price="${p.id}" />
          <div class="toggle-switch ${isStock ? 'active' : ''}" data-toggle-stock="${p.id}"></div>
        </div>
      </div>
      ${variantToggles}
    </div>`;
  }).join('');

  const ordersHtml = orders.length === 0 ? `<div style="text-align:center;color:hsla(var(--foreground)/.5);padding:40px;">No orders yet.</div>` : orders.map(o => {
    return `<div class="admin-order-item">
      <div class="admin-order-header"><span>Order #${o.id.substring(0,8)}</span><span>${new Date(o.date).toLocaleString()}</span></div>
      <div class="admin-order-items">${o.items}</div>
      <div style="margin-bottom:8px;">Total: <strong style="color:var(--purple);">₹${o.total}</strong></div>
      <div class="admin-order-contact">Email: ${o.email} | Phone: ${o.phone}</div>
    </div>`;
  }).join('');

  return `<div class="admin-page page-transition">
    <div class="admin-header"><h1>Dashboard</h1><button class="btn-signup ripple-btn" data-home>${backSvg} Back to Store</button></div>
    <div class="admin-tabs"><button class="admin-tab active" data-atab="products">Products & Stock</button><button class="admin-tab" data-atab="orders">Orders</button></div>
    <div class="admin-content" id="acProducts"><div class="admin-card">${productRows}</div></div>
    <div class="admin-content" id="acOrders" style="display:none;">${ordersHtml}</div>
  </div>`;
}

// === ROUTER ===
function render() {
  const hash = window.location.hash.slice(1);
  const app = document.querySelector('#app');
  if (hash.startsWith('product/')) { app.innerHTML = detailPage(hash.replace('product/','')); }
  else if (hash === 'checkout') { app.innerHTML = `${navbar()}${checkoutPage()}${footer()}${cartDrawer()}`; }
  else if (hash === 'admin') { 
    if (sessionStorage.getItem('sb_admin_auth') !== 'true') {
      const p = prompt('Enter Admin Password:');
      if (btoa(p) === 'c2JhZG1pbjIwMjY=') {
        sessionStorage.setItem('sb_admin_auth', 'true');
        app.innerHTML = adminPage();
      } else {
        alert('Access Denied');
        window.location.hash = '';
      }
    } else {
      app.innerHTML = adminPage();
    }
  }
  else if (hash === 'privacy') { app.innerHTML = `${navbar()}<div class="section-inner" style="padding-top:100px;"><button class="detail-back ripple-btn" data-home style="margin-bottom:20px;">${backSvg} Back to Store</button>${privacyPage()}</div>${footer()}${cartDrawer()}`; }
  else if (hash === 'terms') { app.innerHTML = `${navbar()}<div class="section-inner" style="padding-top:100px;"><button class="detail-back ripple-btn" data-home style="margin-bottom:20px;">${backSvg} Back to Store</button>${termsPage()}</div>${footer()}${cartDrawer()}`; }
  else { app.innerHTML = homePage(); }
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

  const updateGrid = () => {
    if (!gridEl) return;
    const activeChip = chipsEl ? chipsEl.querySelector('.chip.active') : null;
    const filter = activeChip ? activeChip.dataset.cat : 'All';
    const query = searchInput ? searchInput.value : '';
    gridEl.style.opacity='0'; gridEl.style.transform='translateY(16px)';
    setTimeout(() => {
      gridEl.innerHTML = productCards(filter, query);
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

  // Cart drawer
  document.getElementById('cartToggle')?.addEventListener('click', () => toggleCart(true));
  document.getElementById('cartClose')?.addEventListener('click', () => toggleCart(false));
  document.getElementById('cartOverlay')?.addEventListener('click', () => toggleCart(false));

  // Sticky nav
  const nav = document.querySelector('.navbar');
  if (nav) window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 50), { passive: true });

  renderCartItems();
}

// Global click handler
document.addEventListener('click', e => {
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
    variantBtn.classList.add('active');
    
    const { vprice, vpricenum, vname } = variantBtn.dataset;
    const priceEl = parent.querySelector('#detailCurrentPrice');
    if (priceEl) priceEl.textContent = vprice;
    
    const addBtn = parent.querySelector('#detailBuyBtn');
    if (addBtn) {
      addBtn.dataset.vname = vname;
      addBtn.dataset.vprice = vprice;
      addBtn.dataset.vpricenum = vpricenum;
      addBtn.innerHTML = `<span>${cartSvg} Add to Cart — ${vprice}</span>`;
    }
    return;
  }

  // Add to cart (from detail page)
  const detailAddBtn = e.target.closest('[data-detail-add]');
  if (detailAddBtn) {
    e.preventDefault(); e.stopPropagation();
    const { detailAdd, vname, vprice, vpricenum } = detailAddBtn.dataset;
    addToCart(detailAdd, vname, vprice, Number(vpricenum));
    return;
  }

  // Add to cart (from grid)
  const addBtn = e.target.closest('[data-add]');
  if (addBtn) {
    e.preventDefault(); e.stopPropagation();
    const p = products.find(x => x.id === addBtn.dataset.add);
    if (p && p.variants) {
      // If product has variants, just redirect to detail page
      window.location.hash = `product/${p.id}`;
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
  if (card && !e.target.closest('[data-add]')) { window.location.hash = `product/${card.dataset.id}`; return; }
  
  // Home
  const homeBtn = e.target.closest('[data-home]');
  if (homeBtn) { e.preventDefault(); window.location.hash = ''; return; }
  
  // Scroll
  const scrollBtn = e.target.closest('[data-scroll]');
  if (scrollBtn) { e.preventDefault(); const t = document.getElementById(scrollBtn.dataset.scroll); if (t) t.scrollIntoView({behavior:'smooth'}); return; }
  
  // Footer category filter
  const filterLink = e.target.closest('[data-filter]');
  if (filterLink) {
    e.preventDefault(); window.location.hash = '';
    setTimeout(() => { document.getElementById('products')?.scrollIntoView({behavior:'smooth'});
      setTimeout(() => { document.querySelector(`.chip[data-cat="${filterLink.dataset.filter}"]`)?.click(); }, 500);
    }, 100);
  }

  // Checkout: payment tab switching
  const payTab = e.target.closest('.co-tab');
  if (payTab) {
    document.querySelectorAll('.co-tab').forEach(t => t.classList.remove('active'));
    payTab.classList.add('active');
    document.getElementById('payUpi').style.display = payTab.dataset.pay === 'upi' ? '' : 'none';
    document.getElementById('payCrypto').style.display = payTab.dataset.pay === 'crypto' ? '' : 'none';
    return;
  }

  // Checkout: copy crypto address
  const copyBtn = e.target.closest('[data-copy]');
  if (copyBtn) {
    const el = document.getElementById(copyBtn.dataset.copy);
    if (el) { navigator.clipboard.writeText(el.textContent).then(() => showToast('Address copied!')); }
    return;
  }

  // Checkout: send order to Telegram
  const sendBtn = e.target.closest('#coSendOrder');
  if (sendBtn) {

    const hasCert = cart.some(item => item.id === 'infosys' || item.id === 'jpmorgan');
    let certData = '';
    if (hasCert) {
      const cName = document.getElementById('coCertName')?.value?.trim();
      const cGender = document.getElementById('coCertGender')?.value?.trim();
      const cAge = document.getElementById('coCertAge')?.value?.trim();
      const cAddr = document.getElementById('coCertAddress')?.value?.trim();
      if (!cName || !cGender || !cAge || !cAddr) {
        showToast('Please fill all Certificate Details!'); return;
      }
      certData = `\n🎓 Certificate Details:\nName: ${sanitizeHTML(cName)}\nGender: ${sanitizeHTML(cGender)}\nAge: ${sanitizeHTML(cAge)}\nAddress: ${sanitizeHTML(cAddr)}`;
    }

    const lines = cart.map(item => {
      const p = products.find(x => x.id === item.id);
      return `- ${p ? p.name : item.vName} (${item.vName}) x${item.qty||1} — ₹${(item.vPriceNum * (item.qty||1)).toLocaleString('en-IN')}`;
    });
    
    // Save order to admin
    const adminOrders = JSON.parse(localStorage.getItem('sb_admin_orders') || '[]');
    adminOrders.unshift({
      id: Math.random().toString(36).substr(2, 9).toUpperCase(),
      date: new Date().toISOString(),
      items: lines.join('<br/>') + (certData ? `<br/><br/><i>${sanitizeHTML(certData.replace('\n🎓 ','').trim())}</i>` : ''),
      total: getCartTotal().toLocaleString('en-IN')
    });
    localStorage.setItem('sb_admin_orders', JSON.stringify(adminOrders));

    const msg = `🛒 NEW ORDER — SoftBazzar\n━━━━━━━━━━━━━━━━━━━━\n📦 Items:\n${lines.join('\n')}\n━━━━━━━━━━━━━━━━━━━━\n💰 Total: ₹${getCartTotal().toLocaleString('en-IN')}${certData}\n\n━━━━━━━━━━━━━━━━━━━━\n📌 PLEASE PROVIDE PAYMENT DETAILS.`;
    
    if (confirm("Order details saved. We will now redirect you to Telegram where our agent will assist you with payment and delivery. Proceed?")) {
      window.open(`https://t.me/softbazzar?text=${encodeURIComponent(msg)}`, '_blank');
      cart = []; saveCart(); updateCartBadge();
      window.location.hash = '';
      showToast('Order sent!');
    }
    return;
  }

  // Admin: Tabs
  const atab = e.target.closest('.admin-tab');
  if (atab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    atab.classList.add('active');
    document.getElementById('acProducts').style.display = atab.dataset.atab === 'products' ? '' : 'none';
    document.getElementById('acOrders').style.display = atab.dataset.atab === 'orders' ? '' : 'none';
    return;
  }

  // Admin: Toggle Stock
  const tStock = e.target.closest('[data-toggle-stock]');
  if (tStock) {
    tStock.classList.toggle('active');
    const id = tStock.dataset.toggleStock;
    const adminData = JSON.parse(localStorage.getItem('sb_admin_data') || '{}');
    if (!adminData[id]) adminData[id] = {};
    adminData[id].inStock = tStock.classList.contains('active');
    localStorage.setItem('sb_admin_data', JSON.stringify(adminData));
    showToast('Stock status updated');
    return;
  }

  // Admin: Toggle Variant
  const tVar = e.target.closest('[data-toggle-variant]');
  if (tVar) {
    tVar.classList.toggle('active');
    const id = tVar.dataset.toggleVariant;
    const vname = tVar.dataset.vname;
    const adminData = JSON.parse(localStorage.getItem('sb_admin_data') || '{}');
    if (!adminData[id]) adminData[id] = {};
    if (!adminData[id].disabledVariants) adminData[id].disabledVariants = [];
    
    if (tVar.classList.contains('active')) {
      adminData[id].disabledVariants = adminData[id].disabledVariants.filter(v => v !== vname);
    } else {
      if (!adminData[id].disabledVariants.includes(vname)) {
        adminData[id].disabledVariants.push(vname);
      }
    }
    localStorage.setItem('sb_admin_data', JSON.stringify(adminData));
    showToast('Variant stock updated');
    return;
  }
});

document.addEventListener('change', e => {
  if (e.target.matches('[data-edit-price]')) {
    const id = e.target.dataset.editPrice;
    const adminData = JSON.parse(localStorage.getItem('sb_admin_data') || '{}');
    if (!adminData[id]) adminData[id] = {};
    adminData[id].price = e.target.value;
    adminData[id].priceNum = parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0;
    localStorage.setItem('sb_admin_data', JSON.stringify(adminData));
    showToast('Price updated! Refresh to see changes.');
  }

  if (e.target.matches('[data-edit-variant-price]')) {
    const id = e.target.dataset.editVariantPrice;
    const vname = e.target.dataset.vname;
    const adminData = JSON.parse(localStorage.getItem('sb_admin_data') || '{}');
    if (!adminData[id]) adminData[id] = {};
    if (!adminData[id].variantPrices) adminData[id].variantPrices = {};
    
    adminData[id].variantPrices[vname] = {
      price: e.target.value,
      priceNum: parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0
    };
    localStorage.setItem('sb_admin_data', JSON.stringify(adminData));
    showToast('Variant Price updated! Refresh to see changes.');
  }
});

window.addEventListener('hashchange', render);
render();

// Spotlight and Magnetic Effect via Event Delegation
document.body.insertAdjacentHTML('beforeend', '<div class="cursor-dot"></div><div class="cursor-ring"></div>');
const cursorDot = document.querySelector('.cursor-dot');
const cursorRing = document.querySelector('.cursor-ring');
let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;

document.addEventListener('mousemove', e => {
  mouseX = e.clientX; mouseY = e.clientY;
  if(cursorDot) cursorDot.style.transform = `translate(calc(${mouseX}px - 50%), calc(${mouseY}px - 50%))`;

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

const animateCursor = () => {
  ringX += (mouseX - ringX) * 0.15;
  ringY += (mouseY - ringY) * 0.15;
  if(cursorRing) cursorRing.style.transform = `translate(calc(${ringX}px - 50%), calc(${ringY}px - 50%))`;
  requestAnimationFrame(animateCursor);
};
animateCursor();

// SALES TICKER FEATURE
function initSalesTicker() {
  const ticker = document.createElement('div');
  ticker.className = 'sales-ticker';
  document.body.appendChild(ticker);

  const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Ahmedabad', 'Surat', 'Lucknow'];
  const users = ['Pavithran', 'Rahul', 'Sneha', 'Anjali', 'Arjun', 'Priya', 'Kiran', 'Amit', 'Sonia', 'Deepak'];
  const sampleProducts = products.filter(p => !p.disabled).slice(0, 8);

  const showNext = () => {
    const user = users[Math.floor(Math.random() * users.length)];
    const city = cities[Math.floor(Math.random() * cities.length)];
    const product = sampleProducts[Math.floor(Math.random() * sampleProducts.length)];
    
    ticker.innerHTML = `
      <div class="ticker-avatar">${user[0]}</div>
      <div class="ticker-content">
        <div class="ticker-user">${user} from ${city}</div>
        <div class="ticker-action">just purchased <span>${product.name}</span></div>
      </div>
    `;
    
    ticker.classList.add('visible');
    setTimeout(() => ticker.classList.remove('visible'), 5000);
    setTimeout(showNext, 30000 + Math.random() * 30000);
  };

  setTimeout(showNext, 10000);
}

initSalesTicker();
