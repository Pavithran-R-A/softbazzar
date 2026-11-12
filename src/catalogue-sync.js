function sameProduct(previous, next) {
  return previous
    && previous.name === next.name
    && previous.description === next.description
    && previous.cost_usdt === next.costUsdt
    && previous.stock === (next.stock ?? null)
    && Boolean(previous.is_unlimited) === next.unlimited
    && previous.duration === next.duration
    && Boolean(previous.requires_email) === next.requiresEmail
    && previous.type === next.type
    && JSON.stringify(JSON.parse(previous.variants_json||'[]')) === JSON.stringify(next.variants||[]);
}

export function reconcileCatalogue(existingRows, products) {
  if (!Array.isArray(existingRows) || !Array.isArray(products)) {
    throw new TypeError('Catalogue rows must be arrays');
  }

  const existing = new Map(existingRows.map((row) => [row.supplier_id, row]));
  const incomingIds = new Set(products.map(({ id }) => id));
  const changed = products.filter((product) => {
    const previous = existing.get(product.id);
    return !sameProduct(previous, product) || !previous.active;
  });
  const removed = existingRows
    .filter((row) => row.active && !incomingIds.has(row.supplier_id))
    .map((row) => row.supplier_id);
  const imported = products.filter(({ id }) => !existing.has(id)).length;

  const presentationChanged = products.filter((product) => {
    const previous = existing.get(product.id);
    return !previous || previous.category !== product.type || (previous.image_url ?? null) !== (product.imageUrl ?? null);
  });
  const stockChanged = products.filter((product) => {
    const previous = existing.get(product.id);
    return !previous || previous.stock !== (product.stock ?? null) || Boolean(previous.is_unlimited) !== product.unlimited || !previous.active;
  });

  return Object.freeze({
    presentationChanged: Object.freeze(presentationChanged),
    stockChanged: Object.freeze(stockChanged),
    changed: Object.freeze(changed),
    removed: Object.freeze(removed),
    imported,
    updated: changed.length - imported,
  });
}
