/**
 * Care Action History Logger
 * Persists all customer care actions (escalations, cancellations, notes, replacements)
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const HISTORY_PATH = path.join(__dirname, '..', 'data', 'care_history.json');

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_PATH)) {
      return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
    }
  } catch (e) {
    // Fall through
  }
  return [];
}

function saveHistory(history) {
  const dir = path.dirname(HISTORY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

/**
 * Log a care action
 * @param {object} entry
 * @param {string} entry.action - 'escalation' | 'cancel' | 'note' | 'replacement' | 'other'
 * @param {string} entry.orderId
 * @param {string} entry.customerName
 * @param {string} entry.employeeName
 * @param {string} entry.details - Free-form description
 * @param {string} entry.category - Escalation category if applicable
 */
function logAction(entry) {
  const history = loadHistory();
  const record = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    action: entry.action || 'other',
    orderId: entry.orderId || '',
    customerName: entry.customerName || '',
    employeeName: entry.employeeName || 'System',
    details: entry.details || '',
    category: entry.category || '',
  };
  history.unshift(record); // newest first
  // Keep last 1000 entries
  if (history.length > 1000) history.length = 1000;
  saveHistory(history);
  return record;
}

/**
 * Get history with optional filters
 * @param {object} filters
 * @param {string} filters.action - Filter by action type
 * @param {string} filters.startDate - ISO date string
 * @param {string} filters.endDate - ISO date string
 */
function getHistory(filters = {}) {
  let history = loadHistory();

  if (filters.action) {
    history = history.filter(h => h.action === filters.action);
  }
  if (filters.startDate) {
    const start = new Date(filters.startDate).getTime();
    history = history.filter(h => new Date(h.timestamp).getTime() >= start);
  }
  if (filters.endDate) {
    const end = new Date(filters.endDate).getTime();
    history = history.filter(h => new Date(h.timestamp).getTime() <= end);
  }

  return history;
}

module.exports = { logAction, getHistory };
