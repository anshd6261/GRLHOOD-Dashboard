/**
 * RTO Risk Prediction using XGBoost Model
 *
 * Pure JavaScript inference engine for the trained XGBoost model.
 * Model: 300 trees, 5 features, RMSE 0.0095
 *
 * Features (0-4):
 *   0: pincode_risk      - RTO probability for delivery pincode (0-1)
 *   1: customer_risk     - Customer behavioral risk score (0-1)
 *   2: address_risk      - Address quality/completeness score (0-1)
 *   3: customer_rto_risk - Customer's historical RTO tendency (0-1)
 *   4: payment_risk      - Payment method risk (COD=1, Prepaid=0)
 *
 * Based on: https://medium.com/@ak42088/i-built-an-ai-model-to-predict-shipment-rto-risk-heres-what-i-learned-fae796ca30da
 */

const path = require('path');
const fs = require('fs');

let modelData = null;

const loadModel = () => {
    if (modelData) return modelData;
    const modelPath = path.join(__dirname, 'xgb_rto_model.json');
    if (!fs.existsSync(modelPath)) {
        console.warn('[RTO-MODEL] Model file not found at', modelPath);
        return null;
    }
    modelData = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
    const numTrees = modelData.learner.gradient_booster.model.trees.length;
    console.log(`[RTO-MODEL] Loaded XGBoost model with ${numTrees} trees`);
    return modelData;
};

/**
 * Traverse a single decision tree and return the leaf value.
 */
const traverseTree = (tree, features) => {
    let nodeIdx = 0;
    const leftChildren = tree.left_children;
    const rightChildren = tree.right_children;
    const splitIndices = tree.split_indices;
    const splitConditions = tree.split_conditions;
    const baseWeights = tree.base_weights;

    while (leftChildren[nodeIdx] !== -1) {
        const featureIdx = splitIndices[nodeIdx];
        const threshold = splitConditions[nodeIdx];
        const featureVal = features[featureIdx] !== undefined ? features[featureIdx] : 0;

        if (featureVal < threshold) {
            nodeIdx = leftChildren[nodeIdx];
        } else {
            nodeIdx = rightChildren[nodeIdx];
        }
    }

    return baseWeights[nodeIdx];
};

/**
 * Run XGBoost inference: sum leaf values from all trees + apply base score.
 * For regression, output = base_score + sum(tree predictions) * learning_rate
 */
const predict = (features) => {
    const model = loadModel();
    if (!model) return 0.5;

    const trees = model.learner.gradient_booster.model.trees;
    const baseScore = parseFloat(model.learner.learner_model_param?.base_score) || 0.5;

    let sum = 0;
    for (const tree of trees) {
        sum += traverseTree(tree, features);
    }

    // Apply sigmoid to convert to probability
    const raw = baseScore + sum;
    const probability = 1 / (1 + Math.exp(-raw));

    return Math.max(0, Math.min(1, probability));
};

/**
 * Extract features from order data for the XGBoost model.
 * Maps RapidShyp address_score + order metadata → 5 model features.
 */
const extractFeatures = (order) => {
    const addressScore = order.addressScore || order.address_score || {};
    const reasons = [];

    // Feature 0: Pincode Risk (from RapidShyp pin_code_probability)
    let pincodeRisk = 0;
    if (addressScore.pin_code_probability !== undefined) {
        pincodeRisk = parseFloat(addressScore.pin_code_probability) || 0;
    } else if (addressScore.pin_code_score === 0) {
        pincodeRisk = 0.7;
    }
    if (pincodeRisk > 0.3) {
        reasons.push(`Risky pincode area (${(pincodeRisk * 100).toFixed(0)}% RTO rate)`);
    }

    // Feature 1: Customer Risk
    let customerRisk = 0.3; // Default moderate
    const buyerExp = addressScore.buyer_experience_score;
    if (buyerExp === 0) {
        customerRisk = 0.8;
        reasons.push('First-time or risky buyer');
    } else if (buyerExp === 1 && addressScore.buyer_experience_probability > 0.3) {
        customerRisk = 0.5;
        reasons.push(`Moderate buyer risk (${(addressScore.buyer_experience_probability * 100).toFixed(0)}%)`);
    } else if (buyerExp === 2) {
        customerRisk = 0.1;
    }
    if (order.hasCopiedNumberDifferentName) {
        customerRisk = Math.min(1, customerRisk + 0.3);
        reasons.push('Phone number shared with different customer name');
    }
    if ((order.customerOrdersCount || 1) > 2) {
        customerRisk = Math.max(0, customerRisk - 0.2);
    }

    // Feature 2: Address Risk
    let addressRisk = 0;
    let addressIssues = 0;
    if (addressScore.invalid_address === 1) {
        addressRisk += 0.4;
        addressIssues++;
        reasons.push('Invalid address detected');
    }
    if (addressScore.landmark === 0) {
        addressRisk += 0.15;
        addressIssues++;
        reasons.push('No landmark in address');
    }
    if (addressScore.house_number === 0) {
        addressRisk += 0.15;
        addressIssues++;
        reasons.push('Missing house number');
    }
    if (addressScore.address_length === 0) {
        addressRisk += 0.15;
        addressIssues++;
        reasons.push('Address too short');
    }
    if (addressScore.address_entities === 0) {
        addressRisk += 0.15;
        addressIssues++;
        reasons.push('Incomplete address details');
    }
    addressRisk = Math.min(1, addressRisk);

    // Feature 3: Customer RTO Risk (derived from behavioral signals)
    let customerRtoRisk = 0.2;
    if (order.rtoRisk === 'High' || (order.rtoReason && order.rtoReason.toLowerCase().includes('high'))) {
        customerRtoRisk = 0.8;
    } else if (order.rtoRisk === 'Medium') {
        customerRtoRisk = 0.5;
    } else if (order.rtoRisk === 'Low') {
        customerRtoRisk = 0.1;
    }

    // Feature 4: Payment Risk (COD = high risk, Prepaid = low risk)
    let paymentRisk = 0;
    const payment = (order.payment || order.paymentMethod || '').toLowerCase();
    if (payment.includes('cod') || payment.includes('cash')) {
        paymentRisk = 0.8;
        if (reasons.length > 0) {
            reasons.push('Cash on Delivery order (higher RTO probability)');
        }
    }

    return {
        features: [pincodeRisk, customerRisk, addressRisk, customerRtoRisk, paymentRisk],
        reasons
    };
};

/**
 * Main prediction function. Takes an order object and returns risk assessment.
 * @param {Object} order - Order with addressScore, payment, rtoRisk fields
 * @returns {Object} { risk: 'High'|'Medium'|'Low', score: 0-1, reasons: string[], features: number[] }
 */
const predictRTO = (order) => {
    const { features, reasons } = extractFeatures(order);
    const score = predict(features);

    let risk = 'Low';
    if (score >= 0.65) {
        risk = 'High';
    } else if (score >= 0.35) {
        risk = 'Medium';
    }

    // If no specific reasons were generated but risk is high, add generic
    if (risk === 'High' && reasons.length === 0) {
        reasons.push('AI model detected high-risk pattern');
    }

    return {
        risk,
        score: Math.round(score * 100) / 100,
        reasons,
        features: {
            pincode_risk: features[0],
            customer_risk: features[1],
            address_risk: features[2],
            customer_rto_risk: features[3],
            payment_risk: features[4]
        }
    };
};

module.exports = {
    predictRTO,
    loadModel,
    predict,
    extractFeatures
};
