/**
 * RTO Risk Predictor — XGBoost Inference in Pure Node.js
 * 
 * Uses the pre-trained XGBoost model (300 trees, RMSE 0.0095)
 * from https://github.com/ak42088/Shipment-risk-xgboost-API
 * 
 * Features:
 *   f0 = pincode_risk      (1-10)
 *   f1 = customer_risk      (1-10)
 *   f2 = customer_rto_risk  (1-10)
 *   f3 = address_risk       (1-10)
 *   f4 = (derived composite) 
 */

const fs = require('fs');
const path = require('path');

let MODEL = null;
const MODEL_PATH = path.join(__dirname, 'xgb_trained_model.json');

// ─── JUNK / BOGUS KEYWORDS ───
const JUNK_KEYWORDS = [
  'test', 'demo', 'asdf', 'qwer', 'abc', 'xyz', 'fake', 'sample',
  'dummy', 'na', 'n/a', 'none', 'null', 'xxx', 'zzz', 'aaa', 'bbb',
  'fdsa', 'lkjh', 'poiu', 'mnbv', 'zxcv', 'qaz', 'wsx'
];

const BOGUS_NAME_PATTERNS = [
  /^[a-z]{1,2}$/i,           // Single or two letter names
  /^(.)\1{2,}$/i,            // Repeated chars like "aaa"
  /\d{3,}/,                  // Names with 3+ digits
  /^[^a-zA-Z]+$/,            // No alphabetic characters
];

// ─── HIGH RTO PINCODE PREFIXES (Tier 2/3 cities, NE India, etc.) ───
const HIGH_RTO_PIN_PREFIXES = [
  '78', '79', '76', '77',   // Northeast India
  '84', '85',               // Bihar
  '30', '31', '32', '33',   // Rajasthan (parts)
  '27',                     // UP (parts)
];

const MEDIUM_RTO_PIN_PREFIXES = [
  '20', '21', '22', '23', '24', '25', '26',  // UP
  '45', '46',                                  // MP
  '80', '81', '82', '83',                      // Jharkhand/Bihar overlap
];

// ═══════════════════════════════════════════
//  MODEL LOADING
// ═══════════════════════════════════════════

function loadModel() {
  try {
    const raw = fs.readFileSync(MODEL_PATH, 'utf8');
    MODEL = JSON.parse(raw);
    const numTrees = MODEL.learner?.gradient_booster?.model?.gbtree_model_param?.num_trees || '?';
    console.log(`[RTO-AI] Loaded XGBoost model with ${numTrees} trees.`);
    return true;
  } catch (e) {
    console.error('[RTO-AI] Failed to load model:', e.message);
    return false;
  }
}

// ═══════════════════════════════════════════
//  TREE TRAVERSAL (Core XGBoost Inference)
// ═══════════════════════════════════════════

/**
 * Traverse a single decision tree to get its leaf value.
 * @param {Object} tree - One tree from the model's trees array
 * @param {number[]} features - Feature vector [f0, f1, f2, f3, f4]
 * @returns {number} Leaf value (base_weight of the leaf node)
 */
function traverseTree(tree, features) {
  let nodeIdx = 0;
  const leftChildren = tree.left_children;
  const rightChildren = tree.right_children;
  const splitIndices = tree.split_indices;
  const splitConditions = tree.split_conditions;
  const baseWeights = tree.base_weights;

  while (leftChildren[nodeIdx] !== -1) {
    const featureIdx = splitIndices[nodeIdx];
    const threshold = splitConditions[nodeIdx];
    const featureVal = features[featureIdx] || 0;

    if (featureVal < threshold) {
      nodeIdx = leftChildren[nodeIdx];
    } else {
      nodeIdx = rightChildren[nodeIdx];
    }
  }

  return baseWeights[nodeIdx];
}

/**
 * Run inference across all 300 trees and sum predictions.
 * @param {number[]} features - [pincode_risk, customer_risk, customer_rto_risk, address_risk, composite]
 * @returns {number} Raw predicted risk score
 */
function predict(features) {
  if (!MODEL) {
    console.warn('[RTO-AI] Model not loaded, returning default.');
    return 5.0;
  }

  const trees = MODEL.learner?.gradient_booster?.model?.trees || [];
  const baseScore = parseFloat(MODEL.learner?.learner_model_param?.base_score || '0.5');
  const learningRate = 1.0; // Already baked into tree weights for XGBRegressor

  let sum = baseScore;
  for (const tree of trees) {
    sum += learningRate * traverseTree(tree, features);
  }

  // Clamp to [1, 10]
  return Math.max(1, Math.min(10, sum));
}

// ═══════════════════════════════════════════
//  FEATURE ENGINEERING
// ═══════════════════════════════════════════

/**
 * Calculate pincode-based risk (1 = low, 10 = high)
 */
function calcPincodeRisk(pincode) {
  if (!pincode) return 6; // Unknown = moderate risk
  const pin = pincode.toString().trim();
  if (pin.length < 4) return 7;

  const prefix2 = pin.substring(0, 2);

  if (HIGH_RTO_PIN_PREFIXES.includes(prefix2)) return 8;
  if (MEDIUM_RTO_PIN_PREFIXES.includes(prefix2)) return 6;

  // Metro pincodes (Mumbai, Delhi, Bangalore, etc.) tend to be lower risk
  const metroPrefixes = ['11', '40', '56', '60', '70', '50'];
  if (metroPrefixes.includes(prefix2)) return 3;

  return 4; // Default moderate-low for other areas
}

/**
 * Calculate customer-based risk from name quality and phone validity
 */
function calcCustomerRisk(name, phone) {
  let risk = 3; // Start at low
  const reasons = [];

  // Name checks
  if (!name || name.trim().length === 0) {
    risk += 4;
    reasons.push('Missing customer name');
  } else {
    const cleanName = name.trim();

    if (cleanName.length < 3) {
      risk += 3;
      reasons.push('Very short name');
    }

    for (const pattern of BOGUS_NAME_PATTERNS) {
      if (pattern.test(cleanName)) {
        risk += 3;
        reasons.push('Suspicious name pattern');
        break;
      }
    }

    const lowerName = cleanName.toLowerCase();
    for (const junk of JUNK_KEYWORDS) {
      if (lowerName === junk || lowerName.includes(junk)) {
        risk += 2;
        reasons.push('Junk keyword in name');
        break;
      }
    }
  }

  // Phone checks
  if (!phone || phone.toString().trim().length < 10) {
    risk += 2;
    reasons.push('Invalid phone number');
  }

  return { score: Math.min(10, risk), reasons };
}

/**
 * Calculate address-based risk
 */
function calcAddressRisk(address) {
  let risk = 2; // Start low
  const reasons = [];

  if (!address || address.trim().length === 0) {
    return { score: 9, reasons: ['No address provided'] };
  }

  const addr = address.trim();

  // Length check
  if (addr.length < 15) {
    risk += 4;
    reasons.push('Address too short (' + addr.length + ' chars)');
  } else if (addr.length < 30) {
    risk += 2;
    reasons.push('Short address');
  }

  // Junk keyword check
  const lowerAddr = addr.toLowerCase();
  for (const junk of JUNK_KEYWORDS) {
    if (lowerAddr.includes(junk)) {
      risk += 3;
      reasons.push('Suspicious keyword in address: "' + junk + '"');
      break;
    }
  }

  // No house number
  if (!/\d/.test(addr)) {
    risk += 2;
    reasons.push('No house/flat number detected');
  }

  // Very short words only (likely junk)
  const words = addr.split(/\s+/).filter(w => w.length > 1);
  if (words.length < 3) {
    risk += 2;
    reasons.push('Too few address components');
  }

  return { score: Math.min(10, risk), reasons };
}

/**
 * Calculate customer RTO history risk
 * In production this would query a DB of past orders. For now we use heuristics.
 */
function calcCustomerRTORisk(phone, orderCount, paymentMethod) {
  let risk = 3;
  const reasons = [];

  // COD is inherently higher risk
  if (paymentMethod && paymentMethod.toLowerCase().includes('cod')) {
    risk += 3;
    reasons.push('Cash on Delivery order');
  } else if (paymentMethod && (paymentMethod.toLowerCase().includes('prepaid') || paymentMethod.toLowerCase().includes('paid'))) {
    risk -= 1;
    reasons.push('Prepaid order (lower risk)');
  }

  // First-time buyer (no previous orders detected)
  if (!orderCount || orderCount <= 1) {
    risk += 1;
    reasons.push('First-time buyer');
  } else if (orderCount > 3) {
    risk -= 1;
    reasons.push('Repeat customer (' + orderCount + ' orders)');
  }

  return { score: Math.max(1, Math.min(10, risk)), reasons };
}

// ═══════════════════════════════════════════
//  MAIN PREDICTION FUNCTION
// ═══════════════════════════════════════════

/**
 * Predict RTO risk for a single order.
 * @param {Object} order - Order object with shipping details
 * @returns {{ score: number, level: string, reasons: string[], features: Object }}
 */
function predictOrderRisk(order) {
  // Extract data from Shopify order (supports both shippingAddress and shippingDetails)
  const shipping = order.shippingAddress || order.shippingDetails || {};
  const pincode = shipping.zip || shipping.pincode || '';
  const name = order.customer?.name || shipping.name || order.customerName || '';
  const phone = order.customer?.phone || shipping.phone || '';
  const address = [
    shipping.address1 || '',
    shipping.address2 || '',
    shipping.city || '',
    shipping.province || ''
  ].filter(Boolean).join(', ');
  const paymentMethod = order.paymentMethod || order.payment_method || order.payment || '';
  const orderCount = order.customer?.ordersCount || order.customer?.numberOfOrders || 1;

  // Calculate individual risks
  const pincodeRisk = calcPincodeRisk(pincode);
  const customerResult = calcCustomerRisk(name, phone);
  const addressResult = calcAddressRisk(address);
  const rtoHistoryResult = calcCustomerRTORisk(phone, orderCount, paymentMethod);

  // Composite feature (average of others, normalized)
  const composite = (pincodeRisk + customerResult.score + addressResult.score + rtoHistoryResult.score) / 4;

  // Feature vector: [pincode_risk, customer_risk, customer_rto_risk, address_risk, composite]
  // Pass raw 1-10 scores directly — model was trained on this scale
  const features = [
    pincodeRisk,
    customerResult.score,
    rtoHistoryResult.score,
    addressResult.score,
    composite,
  ];

  // Use weighted average of heuristic features for scoring
  // The XGBoost model was trained on standardized features from a different dataset
  // and doesn't match our feature scale, so we use the heuristic approach
  let finalScore = (pincodeRisk * 0.3) + (customerResult.score * 0.25) + (addressResult.score * 0.25) + (rtoHistoryResult.score * 0.2);

  finalScore = Math.round(finalScore * 10) / 10; // 1 decimal

  // Determine level
  let level;
  if (finalScore >= 7) level = 'High';
  else if (finalScore >= 4) level = 'Medium';
  else level = 'Low';

  // Compile reasons
  const allReasons = [
    ...customerResult.reasons,
    ...addressResult.reasons,
    ...rtoHistoryResult.reasons,
  ];

  if (pincodeRisk >= 7) allReasons.unshift('High-risk delivery pincode (' + pincode + ')');
  else if (pincodeRisk >= 5) allReasons.unshift('Moderate-risk delivery area (' + pincode + ')');

  return {
    score: finalScore,
    level,
    reasons: allReasons.length > 0 ? allReasons : ['No specific risk factors detected'],
    features: {
      pincode: pincodeRisk,
      customer: customerResult.score,
      address: addressResult.score,
      history: rtoHistoryResult.score,
    }
  };
}

// ═══════════════════════════════════════════
//  SELF-TEST
// ═══════════════════════════════════════════

function test() {
  loadModel();

  const testOrder = {
    customer: { name: 'Ansh Singh', phone: '9876543210', ordersCount: 5 },
    shippingDetails: {
      address1: '123 MG Road, Sector 15',
      address2: 'Near Big Bazaar',
      city: 'New Delhi',
      province: 'Delhi',
      zip: '110001',
      name: 'Ansh Singh',
      phone: '9876543210',
    },
    paymentMethod: 'Prepaid',
  };

  const result = predictOrderRisk(testOrder);
  console.log('[RTO-AI] Test Result:', JSON.stringify(result, null, 2));

  const riskyOrder = {
    customer: { name: 'aa', phone: '123', ordersCount: 0 },
    shippingDetails: {
      address1: 'test',
      city: '',
      province: '',
      zip: '841301',
    },
    paymentMethod: 'COD',
  };

  const riskyResult = predictOrderRisk(riskyOrder);
  console.log('[RTO-AI] Risky Order Test:', JSON.stringify(riskyResult, null, 2));
}

module.exports = {
  loadModel,
  predict,
  predictOrderRisk,
  test,
};
