import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { TrendingUp, TrendingDown, Clock, AlertCircle, Play, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function Dashboard() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scraping, setScraping] = useState(false);

  const fetchTracked = async () => {
    try {
      setLoading(true);
      const data = await api.getTracked();
      setProducts(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracked();
  }, []);

  const handleManualScrape = async () => {
    try {
      setScraping(true);
      await api.triggerScrape();
      alert('Scrape triggered successfully in the background. It may take a few minutes to complete.');
    } catch (err) {
      alert(`Error triggering scrape: ${err.message}`);
    } finally {
      setScraping(false);
    }
  };

  if (loading) return (
    <div className="loader">
      <div className="spinner"><Activity /></div>
      Loading dashboard...
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Monitoring {products.length} products</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={handleManualScrape}
          disabled={scraping || products.length === 0}
        >
          <Play size={16} />
          {scraping ? 'Starting...' : 'Trigger Scrape Now'}
        </button>
      </div>

      {error && (
        <div className="card mb-4" style={{ borderColor: 'var(--danger)' }}>
          <div className="flex items-center gap-2" style={{ color: 'var(--danger)' }}>
            <AlertCircle size={20} />
            {error}
          </div>
        </div>
      )}

      {products.length === 0 ? (
        <div className="card text-center py-12">
          <h3 className="mb-4">No products tracked yet</h3>
          <p className="text-muted mb-6">Search for products from the INE store to start tracking them.</p>
          <Link to="/search" className="btn btn-primary">Find Products</Link>
        </div>
      ) : (
        <div className="grid">
          {products.map(product => {
            const price = product.latestPrice;
            const log = product.lastScrape;
            
            return (
              <Link to={`/product/${product.product_id}`} key={`${product.product_id}-${product.id || 'row'}`} className="card interactive product-card">
                <div className="product-brand">{product.brand || 'Brand'}</div>
                <h3 className="product-name">{product.name}</h3>
                
                {price ? (
                  <div className="mt-4">
                    <div className="product-price">
                      ₹{price.price?.toLocaleString()}
                      {price.mrp && price.mrp > price.price && (
                        <span className="mrp">₹{price.mrp?.toLocaleString()}</span>
                      )}
                    </div>
                    {price.discount_pct && (
                      <span className="badge success mt-2">{price.discount_pct}% OFF</span>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 text-muted flex items-center gap-2">
                    <Clock size={16} /> Waiting for first scrape
                  </div>
                )}
                
                <div className="product-meta">
                  <span>
                    Status: {log ? (
                      <span className={`badge ${log.status === 'failed' ? 'danger' : 'success'}`}>
                        {log.status}
                      </span>
                    ) : 'Pending'}
                  </span>
                  <span>
                    {log?.created_at ? formatDistanceToNow(new Date(log.created_at), { addSuffix: true }) : 'Never'}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
