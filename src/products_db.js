const { getDb } = require('./database');

// Default COGS based on category if specific product COGS is missing
const DEFAULT_COGS = {
    'Silicone Clear Case': 150,
    'Double Armoured': 150,
    'Glass Case': 150,
    'GripPad': 80,
    'Other': 150
};

const getDefaultCogs = (category, phoneModel) => {
    // If it's explicitly a GripPad by category or model name
    if (category === 'GripPad' || (phoneModel && phoneModel.includes('GripPad'))) {
        return DEFAULT_COGS['GripPad'];
    }

    // Otherwise fallback to the exact model map or the general 'Other'
    if (phoneModel && DEFAULT_COGS[phoneModel]) {
        return DEFAULT_COGS[phoneModel];
    }

    return DEFAULT_COGS['Other'];
};

const upsertProduct = (sku, name, category, defaultCogs = null) => {
    const db = getDb();
    const cogs = defaultCogs || getDefaultCogs(category, null);

    const stmt = db.prepare(`
        INSERT INTO products (sku, name, category, default_cogs, active)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(sku) DO UPDATE SET
            name=excluded.name,
            category=excluded.category,
            default_cogs=excluded.default_cogs,
            updated_at=CURRENT_TIMESTAMP
    `);

    stmt.run(sku, name, category, cogs);
    return { success: true, sku };
};

const getProductBySku = (sku) => {
    const db = getDb();
    return db.prepare('SELECT * FROM products WHERE sku = ?').get(sku);
};

const getAllProducts = () => {
    const db = getDb();
    return db.prepare('SELECT * FROM products ORDER BY category, name').all();
};

const updateProductCogs = (sku, newCogs) => {
    const db = getDb();
    const result = db.prepare('UPDATE products SET default_cogs = ?, updated_at = CURRENT_TIMESTAMP WHERE sku = ?').run(newCogs, sku);

    if (result.changes > 0) {
        // Option: we could also retroactively update COGS for past order_items here if requested
        return { success: true, message: `Updated COGS for ${sku}` };
    }
    return { success: false, message: 'SKU not found' };
};

module.exports = {
    DEFAULT_COGS,
    getDefaultCogs,
    upsertProduct,
    getProductBySku,
    getAllProducts,
    updateProductCogs
};
