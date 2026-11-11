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

test('out of stock offer cannot be added', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /ChatGPT/ }).first().click();
  await page.getByRole('link', { name: 'View offer' }).click();
  await expect(page.getByRole('button', { name: /Unavailable/ })).toBeDisabled();
});

test('full catalogue defaults to editorial family priority', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByLabel('Sort')).toHaveValue('featured');
  const names = await page.locator('.product-name').allTextContents();
  expect(names.slice(0, 3)).toEqual([
    'ChatGPT Business Monthly',
    'ChatGPT Premium Annual',
    'Canva Pro Plan',
  ]);
  await page.getByLabel('Sort').selectOption('name');
  const alphabetical = await page.locator('.product-name').allTextContents();
  expect(alphabetical[0]).toBe('Canva Pro Plan');
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
  for (const width of [320, 375, 390, 480, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
    expect(dimensions.document, `document overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  for (const zoom of ['125%', '200%']) {
    await page.evaluate((value) => { document.documentElement.style.zoom = value; }, zoom);
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
    expect(dimensions.document, `document overflow at ${zoom} zoom`).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
});
