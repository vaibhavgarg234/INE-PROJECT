import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { ArrowLeft, Trash2, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        // Find the product in the tracked list to get its details
        const tracked = await api.getTracked();
        const p = tracked.find(t => t.product_id === parseInt(id));
        if (!p) throw new Error("Product not found or not tracked");
        setProduct(p);

        // Fetch history and logs in parallel
        const [h, l] = await Promise.all([
          api.getHistory(id),
          api.getLogs(id)
        ]);
        setHistory(h);
        setLogs(l);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  const handleUntrack = async () => {
    if (!window.confirm('Are you sure you want to untrack this product? All history will be deleted.')) return;
    try {
      await api.untrackProduct(id);
      navigate('/');
    } catch (err) {
      alert(`Failed to untrack: ${err.message}`);
    }
  };

  if (loading) return <div className="loader"><div className="spinner"><Activity/></div>Loading details...</div>;
  if (error) return <div className="card" style={{borderColor: 'var(--danger)', color: 'var(--danger)'}}>{error}</div>;
  if (!product) return null;

  // Format data for chart
  const chartData = history.map(h => ({
    ...h,
    formattedDate: format(new Date(h.scraped_at), 'MMM dd, HH:mm'),
  })).reverse(); // Oldest to newest for chart

  return (
    <div>
      <div className="mb-4">
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      <div className="page-header">
        <div>
          <div className="product-brand">{product.brand}</div>
          <h1 className="page-title">{product.name}</h1>
          <p className="page-subtitle">SKU: {product.sku}</p>
        </div>
        <button className="btn btn-danger" onClick={handleUntrack}>
          <Trash2 size={16} /> Untrack
        </button>
      </div>

      <div className="detail-grid">
        <div className="card">
          <h2 className="mb-4">Price History</h2>
          {history.length > 0 ? (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis 
                    dataKey="formattedDate" 
                    stroke="var(--text-tertiary)" 
                    fontSize={12}
                    tickMargin={10}
                  />
                  <YAxis 
                    domain={['auto', 'auto']}
                    stroke="var(--text-tertiary)"
                    fontSize={12}
                    tickFormatter={(val) => `₹${val}`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }}
                    labelStyle={{ color: 'var(--text-secondary)' }}
                    itemStyle={{ color: 'var(--accent-primary)', fontWeight: 600 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="price" 
                    stroke="var(--accent-primary)" 
                    strokeWidth={3}
                    dot={{ r: 4, fill: 'var(--bg-primary)', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: 'var(--accent-primary)' }}
                    name="Price"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-muted text-center py-12">
              No price history available yet. Wait for the first scrape.
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="mb-4">Scrape Log</h2>
          {logs.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{format(new Date(log.created_at), 'MMM dd')}</div>
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>{format(new Date(log.created_at), 'HH:mm:ss')}</div>
                      </td>
                      <td>
                        <span className={`badge ${log.status === 'failed' ? 'danger' : log.status === 'retried' ? 'warning' : 'success'}`}>
                          {log.status}
                        </span>
                        {log.error_message && (
                          <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>
                            {log.error_message}
                          </div>
                        )}
                      </td>
                      <td>{log.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-muted text-center py-12">
              No scrape logs yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
