const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize file if not exists
if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));
}

const getHistory = () => {
    try {
        const data = fs.readFileSync(HISTORY_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading history:', error);
        return [];
    }
};

const saveBatch = (batchData) => {
    const history = getHistory();

    // Calculate Next ID (001, 002...)
    let nextId = 1;
    if (history.length > 0) {
        // Try to parse the sequential ID from the string (assuming mixed types initially)
        const numericIds = history
            .map(h => parseInt(h.id, 10))
            .filter(n => !isNaN(n)); // Filter valid numbers

        if (numericIds.length > 0) {
            nextId = Math.max(...numericIds) + 1;
        }
    }

    const paddedId = nextId.toString().padStart(3, '0');

    const newBatch = {
        id: paddedId,
        timestamp: new Date().toISOString(),
        ...batchData
    };

    // Add to top
    history.unshift(newBatch);

    // Limit to last 50 batches to prevent bloat
    if (history.length > 50) {
        history.pop();
    }

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    return newBatch;
};

const updateBatch = (id, updatedRows) => {
    const history = getHistory();
    const index = history.findIndex(h => h.id === id);

    if (index !== -1) {
        history[index].rows = updatedRows;
        history[index].lastModified = new Date().toISOString();
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        return history[index];
    }
    return null;
};

module.exports = {
    getHistory,
    saveBatch,
    updateBatch
};
