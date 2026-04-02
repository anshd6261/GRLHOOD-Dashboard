/**
 * NBE (NextBigE) Supplier Portal API Client
 * Proxies all calls through backend to keep API key secure.
 */
const axios = require('axios');

const NBE_BASE = process.env.NBE_API_BASE || 'https://5060265239-api.nextbige.com/api/external';
const NBE_KEY = process.env.NBE_API_KEY || '';

const nbeClient = axios.create({
  baseURL: NBE_BASE,
  timeout: 15000,
  headers: { 'X-Customer-Api-Key': NBE_KEY },
});

// Simple in-memory cache with TTL
const cache = new Map();
function withCache(key, ttlMs, fetcher) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < ttlMs) return Promise.resolve(cached.data);
  return fetcher().then(data => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

// ─── Shipping Labels ───
async function getOrderLabels(orderId) {
  const { data } = await nbeClient.get('/customer-orders/get-shipping-labels/', {
    params: { order_id: orderId },
  });
  return data;
}

// ─── Returns ───
async function getReturns() {
  const { data } = await nbeClient.get('/customer-returns/');
  return data;
}

async function getReturnPhoto(returnId) {
  const { data } = await nbeClient.get(`/customer-returns/${returnId}/uploaded-photo/`, {
    responseType: 'arraybuffer',
  });
  return data;
}

async function getReturnLabel(returnId) {
  const { data } = await nbeClient.get(`/customer-returns/${returnId}/return-label/`, {
    responseType: 'arraybuffer',
  });
  return data;
}

// ─── Replacements ───
async function createReplacement({ file, orderType, caseTypeName, productName, originalOrderId }) {
  const FormData = require('form-data');
  const form = new FormData();
  if (file) form.append('file', file.buffer, file.originalname);
  form.append('order_type', orderType || 'Dropship POD');
  form.append('order_sub_type', 'replacement');
  form.append('case_type_name', caseTypeName || 'Soft Case');
  form.append('product_name', productName || '');
  form.append('order_id', originalOrderId);

  const { data } = await nbeClient.post('/customer-uploads/', form, {
    headers: { ...form.getHeaders(), 'X-Customer-Api-Key': NBE_KEY },
    timeout: 30000,
  });
  return data;
}

// ─── Designs (Vendor Images) ───
async function getDesigns() {
  return withCache('designs', 5 * 60 * 1000, async () => {
    const { data } = await nbeClient.get('/vendor-images/');
    return data;
  });
}

async function renderDesign(imageId) {
  const { data } = await nbeClient.get(`/vendor-images/${imageId}/render-image/`, {
    responseType: 'arraybuffer',
  });
  return data;
}

// ─── Health Check ───
async function checkConnection() {
  try {
    await nbeClient.get('/vendor-images/', { timeout: 5000 });
    return { connected: true };
  } catch (e) {
    return { connected: false, error: e.message };
  }
}

module.exports = {
  getOrderLabels,
  getReturns,
  getReturnPhoto,
  getReturnLabel,
  createReplacement,
  getDesigns,
  renderDesign,
  checkConnection,
};
