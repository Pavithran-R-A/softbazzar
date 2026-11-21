import { expect, test } from '@playwright/test';

const products = [
  { id: 'chatgpt-monthly', name: 'ChatGPT Business Monthly', category: 'AI', cat: 'AI', type: 'AI', duration: '1 month', description: 'Supplier listing', inStock: true, stock: 3, unlimited: false, priceInrPaise: 10500, priceUsd: 1, variants: [{ id: 'plan-basic', name: 'Basic plan', inStock: true, stock: 3, unlimited: false, priceInrPaise: 10500, priceUsd: 1 }] },
  { id: 'chatgpt-out', name: 'ChatGPT Premium Annual', category: 'AI', cat: 'AI', type: 'AI', duration: '1 year', description: 'Supplier listing', inStock: false, stock: 0, unlimited: false, priceInrPaise: 10000, priceUsd: 0.95, variants: [] },
  { id: 'canva-pro', name: 'Canva Pro Plan', category: 'Design', cat: 'Design', type: 'Design', duration: '1 month', description: 'Supplier listing', inStock: true, stock: 4, unlimited: false, priceInrPaise: 21000, priceUsd: 2, variants: [] },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/catalogue', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ products, count: products.length, lastSyncAt: new Date().toISOString(), pricing: { usdInr: '105' }, stale: false, purchasable: true }),
  }));
  await page.route('**/api/orders', (route) => route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ orderId: 'd9a8b11e-2110-41f7-a701-1d66da65d370', status: 'quoted', totalPaise: 10500, approxUsdTotalCents: 100, expiresAt: new Date(Date.now() + 300000).toISOString() }),
  }));
});

test('groups honest families and preserves offer-level quotes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /ChatGPT/ }).first()).toBeVisible();
  await expect(page.getByText(/curated, not popularity data/i)).toBeVisible();
  await page.getByRole('link', { name: /ChatGPT/ }).first().click();
  await page.getByRole('link', { name: 'Choose option' }).first().click();
  const addButton = page.getByRole('button', { name: /Select an option first/ });
  await expect(addButton).toBeDisabled();
  await page.getByRole('button', { name: /Basic plan/ }).click();
  await expect(page.getByRole('button', { name: /Add to Cart/ })).toBeEnabled();
  await page.getByRole('button', { name: /Add to Cart/ }).click();
  await expect(page.locator('.cart-badge')).toHaveText('1');
  await expect(page.getByRole('button', { name: 'Cart, 1 item' })).toBeVisible();
  await page.getByRole('button', { name: 'Cart, 1 item' }).click();
  await page.getByRole('link', { name: /Proceed to Checkout/ }).click();
  await expect(page.getByRole('heading', { name: 'Order summary' })).toBeVisible();
  await page.getByLabel(/Email for order updates/).fill('buyer@example.test');
  await page.getByRole('button', { name: 'Create order quote' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Quote created' })).toContainText('Quote created');
  await expect(page.locator('#quoteForm').getByText(/No payment is collected/i)).toBeVisible();
});

test('premium hero keeps its video, copy, fonts, and local marks', async ({ page }) => {
  const externalLogoRequests = [];
  const pageErrors = [];
  const consoleErrors = [];
  page.on('request', (request) => {
    if (request.url().includes('cdn.simpleicons.org')) externalLogoRequests.push(request.url());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'SoftBazzar' })).toBeVisible();
  await expect(page.getByText('Explore AI tools, creative software, and digital subscriptions, all in one place.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore Products' })).toBeVisible();
  await expect(page.getByText('Explore featured tools', { exact: true })).toBeVisible();
  const hero = page.locator('.hero-wrapper');
  const video = page.locator('#bgVideo');
  await page.locator('.nav-logo img').evaluate((image) => image.decode());
  await expect(video).toHaveAttribute('src', 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4');
  await expect(video).toHaveAttribute('muted', '');
  await expect(video).toHaveAttribute('playsinline', '');
  const visual = await page.evaluate(async () => {
    await document.fonts.ready;
    const heroRect = document.querySelector('.hero-wrapper').getBoundingClientRect();
    const videoStyle = getComputedStyle(document.querySelector('#bgVideo'));
    const blurStyle = getComputedStyle(document.querySelector('.blur-overlay'));
    const logo = document.querySelector('.nav-logo img');
    return {
      heroHeight: heroRect.height,
      viewportHeight: window.innerHeight,
      objectFit: videoStyle.objectFit,
      blurColor: blurStyle.backgroundColor,
      blurWidth: blurStyle.width,
      blurHeight: blurStyle.height,
      blurOpacity: blurStyle.opacity,
      blurFilter: blurStyle.filter,
      logoHeight: logo.getBoundingClientRect().height,
      logoRatio: logo.getBoundingClientRect().width / logo.getBoundingClientRect().height,
      naturalLogoRatio: logo.naturalWidth / logo.naturalHeight,
      geistLoaded: document.fonts.check('400 16px "Geist Sans"'),
      generalSansLoaded: [...document.fonts].some((font) => font.family.includes('General Sans') && font.status === 'loaded'),
      iconImages: document.querySelectorAll('.marquee-icon img').length,
      marqueeDuration: getComputedStyle(document.querySelector('.marquee-track')).animationDuration,
      cartOverflow: getComputedStyle(document.querySelector('.cart-btn')).overflow,
    };
  });
  expect(visual.heroHeight).toBeGreaterThanOrEqual(visual.viewportHeight);
  expect(visual.objectFit).toBe('cover');
  expect(visual.blurColor).toBe('rgb(3, 7, 18)');
  expect(visual.blurWidth).toBe('984px');
  expect(visual.blurHeight).toBe('527px');
  expect(visual.blurOpacity).toBe('0.9');
  expect(visual.blurFilter).toBe('blur(82px)');
  expect(visual.logoHeight).toBeCloseTo(32, 0);
  expect(visual.logoRatio).toBeCloseTo(visual.naturalLogoRatio, 2);
  expect(visual.geistLoaded).toBe(true);
  expect(visual.generalSansLoaded).toBe(true);
  expect(visual.iconImages).toBe(0);
  expect(visual.marqueeDuration).toBe('20s');
  expect(visual.cartOverflow).toBe('visible');
  expect(externalLogoRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await page.getByRole('button', { name: 'Explore Products' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#products')).toBeInViewport();
});

test('mobile navigation and reduced motion remain accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menuButton = page.getByRole('button', { name: 'Open navigation menu' });
  await menuButton.click();
  await expect(page.getByRole('button', { name: 'Close navigation menu' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('link', { name: 'Contact SoftBazzar support on Telegram' })).toHaveAttribute('href', 'https://t.me/softbazzar');
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await expect(page.locator('#products')).toBeInViewport();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const reduced = await page.evaluate(() => ({
    videoPaused: document.querySelector('#bgVideo').paused,
    marqueeAnimation: getComputedStyle(document.querySelector('.marquee-track')).animationName,
  }));
  expect(reduced.videoPaused).toBe(true);
  expect(reduced.marqueeAnimation).toBe('none');
});

test('out of stock offer cannot be added', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /ChatGPT/ }).first().click();
  await page.getByRole('link', { name: 'View offer' }).click();
  await expect(page.getByRole('button', { name: /Unavailable/ })).toBeDisabled();
});

test('full catalogue defaults to editorial family priority', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByLabel('Sort')).toHaveValue('featured');
  const names = await page.locator('#productsGrid .family-name').allTextContents();
  expect(names.slice(0, 2)).toEqual(['ChatGPT', 'Canva']);
  expect(names.filter((name) => name === 'ChatGPT')).toHaveLength(1);
  await page.getByLabel('Sort').selectOption('name');
  await expect(page.locator('#productsGrid .family-name').first()).toHaveText('Canva');
});

test('direct product and family routes refresh with valid assets', async ({ page }) => {
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/product/chatgpt-monthly');
  await expect(page.getByRole('heading', { name: 'ChatGPT Business Monthly' })).toBeVisible();
  const assets = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((url) => /\.(?:js|css)(?:\?|$)/.test(url)));
  expect(assets.length).toBeGreaterThanOrEqual(1);
  for (const url of assets) {
    const response = await page.request.get(url);
    expect(response.status()).toBe(200);
    const contentType = response.headers()['content-type'] || '';
    expect(contentType).toMatch(/(?:javascript|ecmascript|text\/css)/i);
  }

  await page.reload();
  await expect(page.getByRole('heading', { name: 'ChatGPT Business Monthly' })).toBeVisible();
  await page.goto('/collection/chatgpt');
  await expect(page.getByRole('heading', { name: 'ChatGPT', exact: true })).toBeVisible();
  await expect(page.getByText(/Browsing prices round up to whole rupees; checkout quotes show exact calculated prices/i)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Choose option' })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('mobile checkout remains usable and quote-only', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('link', { name: /Canva/ }).first().click();
  await page.getByRole('link', { name: 'View offer' }).click();
  await page.getByRole('button', { name: /Add to Cart/ }).click();
  await page.getByRole('button', { name: 'Cart, 1 item' }).click();
  await page.getByRole('link', { name: /Proceed to Checkout/ }).click();
  await expect(page.getByRole('heading', { name: 'Order summary' })).toBeVisible();
  const grid = await page.locator('.co-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(grid.trim().split(/\s+/)).toHaveLength(1);
  const widths = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  await page.getByRole('button', { name: 'Create order quote' }).click();
  await expect(page.locator('#quoteMessage')).toContainText('Quote created');
  await expect(page.locator('#quoteMessage')).toContainText('Payment remains disabled');
});

test('malformed encoded routes render safely', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    history.pushState({}, '', '/collection/%E0%A4%A');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Product family not found' })).toBeVisible();
  await page.evaluate(() => {
    history.pushState({}, '', '/product/%E0%A4%A');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Product not found' })).toBeVisible();
});

test('inactive quote replay preserves cart contents', async ({ page }) => {
  await page.route('**/api/orders', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ orderId: 'd9a8b11e-2110-41f7-a701-1d66da65d370', status: 'cancelled', totalPaise: 21000, expiresAt: new Date(Date.now() - 1000).toISOString() }),
  }));
  await page.goto('/');
  await page.getByRole('link', { name: /Canva/ }).first().click();
  await page.getByRole('link', { name: 'View offer' }).click();
  await page.getByRole('button', { name: /Add to Cart/ }).click();
  await page.getByRole('button', { name: 'Cart, 1 item' }).click();
  await page.getByRole('link', { name: /Proceed to Checkout/ }).click();
  await page.getByRole('button', { name: 'Create order quote' }).click();
  await expect(page.locator('#quoteMessage')).toContainText('This quote is no longer active');
  await expect(page.locator('.cart-badge')).toHaveText('1');
});

test('layout remains inside target responsive widths', async ({ page }) => {
  for (const width of [320, 360, 375, 390, 430, 480, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main-content')).toBeVisible();
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
    expect(dimensions.document, `document overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#main-content')).toBeVisible();
  for (const zoom of ['125%', '200%']) {
    await page.evaluate((value) => { document.documentElement.style.zoom = value; }, zoom);
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
    expect(dimensions.document, `document overflow at ${zoom} zoom`).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
});


test('stale supplier data remains browsable but checkout cannot be started', async ({ page }) => {
  await page.route('**/api/catalogue', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      products, count: products.length, lastSyncAt: '2026-11-13T06:02:34Z',
      pricing: { usdInr: '105' }, stale: true, purchasable: false,
    }),
  }));
  await page.goto('/');
  await expect(page.locator('.family-card')).toHaveCount(2);
  await expect(page.locator('.marquee-name').first()).toHaveText('ChatGPT');
  await page.getByRole('link', { name: 'View Canva plans' }).click();
  await expect(page.getByRole('heading', { name: 'Canva', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View offer' }).click();
  await expect(page.getByRole('button', { name: 'Checkout paused' })).toBeDisabled();
});
