import React, { useState } from 'react';
import { api } from '../api';
import { Search, Plus, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function SearchProducts() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [trackingIds, setTrackingIds] = useState(new Set());
  
  const navigate = useNavigate();

  const handleSearch = async (e) => {
    e.preventDefault();
    if (query.length < 2) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await api.search(query);
      setResults(data.items || []);
      
      // Also fetch currently tracked so we can show "Already Tracked"
      const tracked = await api.getTracked();
      setTrackingIds(new Set(tracked.map(t => t.product_id)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTrack = async (product) => {
    try {
      await api.trackProduct(product);
      setTrackingIds(prev => new Set(prev).add(product.id));
    } catch (err) {
      alert(`Failed to track: ${err.message}`);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Find Products</h1>
          <p className="page-subtitle">Search the INE Mock Store to add products to your tracker</p>
        </div>
      </div>

      <div className="card mb-4">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="input-group">
            <Search className="input-icon" size={20} />
            <input 
              type="text" 
              className="input" 
              placeholder="Search by name, brand, or SKU..." 
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading || query.length < 2}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {error && <div className="card mb-4" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>{error}</div>}

      <div className="grid">
        {results.map(item => {
          const isTracked = trackingIds.has(item.id);
          
          return (
            <div key={`${item.id}-${item.sku || 'no-sku'}`} className="card product-card">
              <div className="product-brand">{item.brand}</div>
              <h3 className="product-name">{item.name}</h3>
              <div className="product-sku">SKU: {item.sku}</div>
              <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem', flex: 1 }}>
                {item.description}
              </p>
              
              <button 
                className={`btn ${isTracked ? 'btn-secondary' : 'btn-primary'}`}
                style={{ width: '100%' }}
                onClick={() => isTracked ? navigate(`/product/${item.id}`) : handleTrack(item)}
              >
                {isTracked ? (
                  <><Check size={16} /> View Tracker</>
                ) : (
                  <><Plus size={16} /> Track Product</>
                )}
              </button>
            </div>
          );
        })}
      </div>
      
      {!loading && results.length === 0 && query && (
        <div className="text-center py-12 text-muted">
          No products found matching "{query}"
        </div>
      )}
    </div>
  );
}
