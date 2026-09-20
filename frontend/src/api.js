export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const api = {
  async search(query) {
    const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Search failed');
    return res.json();
  },
  
  async getTracked() {
    const res = await fetch(`${API_URL}/tracked`);
    if (!res.ok) throw new Error('Failed to fetch tracked products');
    return res.json();
  },
  
  async trackProduct(product) {
    const res = await fetch(`${API_URL}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: product.id,
        slug: product.slug,
        name: product.name,
        brand: product.brand,
        category: product.category,
        sku: product.sku,
        description: product.description
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to track product');
    }
    return res.json();
  },
  
  async untrackProduct(productId) {
    const res = await fetch(`${API_URL}/tracked/${productId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to untrack product');
    return res.json();
  },
  
  async getHistory(productId) {
    const res = await fetch(`${API_URL}/history/${productId}`);
    if (!res.ok) throw new Error('Failed to fetch price history');
    return res.json();
  },
  
  async getLogs(productId) {
    const res = await fetch(`${API_URL}/logs/${productId}`);
    if (!res.ok) throw new Error('Failed to fetch scrape logs');
    return res.json();
  },

  async triggerScrape() {
    const res = await fetch(`${API_URL}/scrape?secret=change-me-to-a-random-string`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to trigger scrape');
    }
    return res.json();
  }
};
