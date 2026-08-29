import { products } from './data.js';

export const CART_STORAGE_KEY = 'sb_cart_v2';

function cleanQuantity(value) {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, 99) : 1;
}

export function resolveSelection(id, variantName = null) {
  const product = products.find((entry) => entry.id === id && entry.inStock !== false);
  if (!product) return null;

  const availableVariants = Array.isArray(product.variants)
    ? product.variants.filter((variant) => !variant.disabled)
    : [];

  let variant = null;
  if (availableVariants.length > 0) {
    if (variantName) variant = availableVariants.find((entry) => entry.name === variantName) ?? null;
    if (!variant) variant = availableVariants[0];
  }

  const priceNum = Number(variant?.priceNum ?? product.priceNum);
  if (!Number.isFinite(priceNum) || priceNum < 0) return null;

  return {
    id: product.id,
    variantName: variant?.name ?? null,
    displayName: variant?.name ?? product.name,
    productName: product.name,
    price: variant?.price ?? product.price,
    priceNum,
    icon: product.icon,
    cat: product.cat,
    color: product.color,
  };
}

export function normalizeStoredCart(value) {
  if (!Array.isArray(value)) return [];
  const normalized = [];

  for (const row of value) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string') continue;
    const product = products.find((entry) => entry.id === row.id);
    if (!product) continue;

    const legacyName = typeof row.vName === 'string' ? row.vName : null;
    const requestedVariant = typeof row.variantName === 'string'
      ? row.variantName
      : (legacyName && legacyName !== product.name ? legacyName : null);
    const selection = resolveSelection(row.id, requestedVariant);
    if (!selection) continue;

    const item = { id: selection.id, variantName: selection.variantName, qty: cleanQuantity(row.qty) };
    const existing = normalized.find((entry) => entry.id === item.id && entry.variantName === item.variantName);
    if (existing) existing.qty = Math.min(99, existing.qty + item.qty);
    else normalized.push(item);
  }

  return normalized;
}

export function resolveCartItems(items) {
  return normalizeStoredCart(items).flatMap((item) => {
    const selection = resolveSelection(item.id, item.variantName);
    if (!selection) return [];
    return [{ ...selection, qty: item.qty, lineTotal: selection.priceNum * item.qty }];
  });
}

export function calculateCartTotal(items) {
  return resolveCartItems(items).reduce((sum, item) => sum + item.lineTotal, 0);
}

export function readStoredCart(storage = globalThis.localStorage) {
  if (!storage) return [];
  try {
    return normalizeStoredCart(JSON.parse(storage.getItem(CART_STORAGE_KEY) || '[]'));
  } catch {
    return [];
  }
}

export function writeStoredCart(items, storage = globalThis.localStorage) {
  if (!storage) return;
  storage.setItem(CART_STORAGE_KEY, JSON.stringify(normalizeStoredCart(items)));
}
