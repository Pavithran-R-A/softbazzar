export class MockInventoryAdapter {
  constructor(products = []) {
    this.products = structuredClone(products);
    this.failure = null;
    this.calls = 0;
  }

  setProducts(products) {
    this.products = structuredClone(products);
  }

  failWith(error = new Error('mock supplier outage')) {
    this.failure = error;
  }

  async listProducts() {
    this.calls += 1;
    if (this.failure) throw this.failure;
    return {
      success: true,
      count: this.products.length,
      products: structuredClone(this.products),
    };
  }
}
