import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Smartphone, Package, Trophy, RefreshCw } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

export default function ProductAnalysis({ startDate, endDate }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [showAllModels, setShowAllModels] = useState(false);
    const [showAllProducts, setShowAllProducts] = useState(false);

    useEffect(() => {
        fetchData();
    }, [startDate, endDate]);

    const fetchData = async () => {
        setLoading(true);
        try {
            let startStr = '';
            let endStr = '';
            if (startDate instanceof Date && !isNaN(startDate)) startStr = startDate.toISOString();
            if (endDate instanceof Date && !isNaN(endDate)) endStr = endDate.toISOString();

            const res = await axios.get(`${API_URL}/orders?status=all&startDate=${startStr}&endDate=${endStr}`);
            setData(res.data);
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center py-32 opacity-50">
                <RefreshCw size={64} className="animate-spin text-purple-500 mb-4" />
                <div className="font-medium text-lg">Analyzing Products...</div>
            </div>
        );
    }

    if (error) return <div className="text-red-500 bg-red-500/10 p-4 rounded-xl border border-red-500/20">{error}</div>;

    // Process data for analysis
    const modelCounts = {};
    const productCounts = {};

    if (data?.orders) {
        data.orders.forEach(order => {
            // Aggregate Models (e.g. "iPhone 13")
            if (order.model) {
                modelCounts[order.model] = (modelCounts[order.model] || 0) + 1;
            }

            // Aggregate Product Categories/Names (e.g. "Grip Case")
            if (order.category) {
                productCounts[order.category] = (productCounts[order.category] || 0) + 1;
            }
        });
    }

    // Sort arrays descending
    const sortedModels = Object.entries(modelCounts).sort((a, b) => b[1] - a[1]);
    const sortedProducts = Object.entries(productCounts).sort((a, b) => b[1] - a[1]);

    const displayModels = showAllModels ? sortedModels : sortedModels.slice(0, 10);
    const displayProducts = showAllProducts ? sortedProducts : sortedProducts.slice(0, 10);

    return (
        <div className="space-y-8 fade-in">
            <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 glass-card border border-white/10 rounded-2xl flex items-center justify-center">
                    <Trophy size={24} className="text-yellow-400" />
                </div>
                <div>
                    <h2 className="text-2xl font-black glow-text text-white">Analysis</h2>
                    <div className="text-sm text-gray-400 font-medium">Top products & models</div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 pb-20">

                {/* TOP MODELS */}
                <div className="glass-card p-5">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-black flex items-center gap-2 text-white">
                            <Smartphone size={18} className="text-cyan-400" /> Top Models
                        </h3>
                        <span className="text-[10px] bg-white/10 px-2 py-1 rounded-md text-gray-400 font-bold uppercase tracking-wider">{sortedModels.length} Unique</span>
                    </div>

                    <div className="space-y-3">
                        {displayModels.map(([model, count], index) => (
                            <div key={model} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm
                                    ${index === 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                        index === 1 ? 'bg-gray-300/20 text-gray-300 border border-gray-400/30' :
                                            index === 2 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-white/5 text-gray-400'}`}>
                                    #{index + 1}
                                </div>
                                <div className="flex-1 font-bold text-white text-sm line-clamp-1">{model}</div>
                                <div className="text-cyan-400 font-black text-sm">{count} <span className="text-xs text-gray-500">sold</span></div>
                            </div>
                        ))}
                    </div>

                    {sortedModels.length > 10 && (
                        <button
                            onClick={() => setShowAllModels(!showAllModels)}
                            className="mt-4 w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-sm font-bold text-white transition-colors"
                        >
                            {showAllModels ? 'Show Less' : `Show All ${sortedModels.length} Models`}
                        </button>
                    )}
                </div>

                {/* TOP CATEGORIES */}
                <div className="glass-card p-5">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-black flex items-center gap-2 text-white">
                            <Package size={18} className="text-lime-400" /> Top Products
                        </h3>
                        <span className="text-[10px] bg-white/10 px-2 py-1 rounded-md text-gray-400 font-bold uppercase tracking-wider">{sortedProducts.length} Unique</span>
                    </div>

                    <div className="space-y-3">
                        {displayProducts.map(([product, count], index) => (
                            <div key={product} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm
                                    ${index === 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                        index === 1 ? 'bg-gray-300/20 text-gray-300 border border-gray-400/30' :
                                            index === 2 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-white/5 text-gray-400'}`}>
                                    #{index + 1}
                                </div>
                                <div className="flex-1 font-bold text-white text-sm line-clamp-1">{product}</div>
                                <div className="text-lime-400 font-black text-sm">{count} <span className="text-xs text-gray-500">sold</span></div>
                            </div>
                        ))}
                    </div>

                    {sortedProducts.length > 10 && (
                        <button
                            onClick={() => setShowAllProducts(!showAllProducts)}
                            className="mt-4 w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-sm font-bold text-white transition-colors"
                        >
                            {showAllProducts ? 'Show Less' : `Show All ${sortedProducts.length} Products`}
                        </button>
                    )}
                </div>

            </div>
        </div>
    );
}
