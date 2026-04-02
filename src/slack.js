/**
 * Slack Webhook Client for Customer Care Escalations
 * Sends rich Block Kit messages to a configured Slack channel.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || process.env.SLACK_CARE_WEBHOOK_URL || '';
const TEMPLATES_PATH = path.join(__dirname, '..', 'data', 'slack_templates.json');

// Default templates (overridable from settings)
const DEFAULT_TEMPLATES = {
  refund: {
    label: 'Refund Request',
    color: '#EF4444',
    emoji: ':money_with_wings:',
    headerText: 'Refund Request Escalation',
  },
  replacement: {
    label: 'Replacement Request',
    color: '#10B981',
    emoji: ':arrows_counterclockwise:',
    headerText: 'Replacement Request',
  },
  angry_customer: {
    label: 'Angry Customer',
    color: '#F59E0B',
    emoji: ':rotating_light:',
    headerText: 'Angry Customer Alert',
  },
  delivery_issue: {
    label: 'Delivery Issue',
    color: '#3B82F6',
    emoji: ':package:',
    headerText: 'Delivery Issue Escalation',
  },
  quality: {
    label: 'Quality Complaint',
    color: '#8B5CF6',
    emoji: ':mag:',
    headerText: 'Quality Complaint',
  },
  custom: {
    label: 'Custom Escalation',
    color: '#e3cfd8',
    emoji: ':speech_balloon:',
    headerText: 'Custom Escalation',
  },
};

function loadTemplates() {
  try {
    if (fs.existsSync(TEMPLATES_PATH)) {
      return JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf-8'));
    }
  } catch (e) {
    // Fall through to defaults
  }
  return DEFAULT_TEMPLATES;
}

function saveTemplates(templates) {
  const dir = path.dirname(TEMPLATES_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2));
}

function getTemplates() {
  return loadTemplates();
}

function updateTemplate(category, updates) {
  const templates = loadTemplates();
  templates[category] = { ...templates[category], ...updates };
  saveTemplates(templates);
  return templates;
}

/**
 * Send an escalation to Slack
 * @param {object} params
 * @param {string} params.category - Template key (refund, replacement, etc.)
 * @param {string} params.customerName
 * @param {string} params.orderId
 * @param {string} params.orderAmount
 * @param {number} params.units
 * @param {string} params.productDetails
 * @param {string} params.instagram
 * @param {string} params.message - Custom message from employee
 * @param {string} params.employeeName
 */
async function sendEscalation(params) {
  if (!SLACK_WEBHOOK_URL) {
    throw new Error('Slack webhook URL not configured. Set SLACK_WEBHOOK_URL in environment.');
  }

  const templates = loadTemplates();
  const template = templates[params.category] || templates.custom;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${template.emoji} ${template.headerText}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Customer:*\n${params.customerName || 'N/A'}` },
        { type: 'mrkdwn', text: `*Order ID:*\n#${params.orderId || 'N/A'}` },
        { type: 'mrkdwn', text: `*Amount:*\n${params.orderAmount || 'N/A'}` },
        { type: 'mrkdwn', text: `*Units:*\n${params.units || 'N/A'}` },
      ],
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Product:*\n${params.productDetails || 'N/A'}` },
        { type: 'mrkdwn', text: `*Instagram:*\n${params.instagram ? `@${params.instagram}` : 'N/A'}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Message:*\n${params.message || 'No additional details.'}` },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Escalated by *${params.employeeName || 'Care Team'}* | ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` },
      ],
    },
  ];

  const payload = {
    text: `${template.emoji} ${template.headerText} — ${params.customerName} (#${params.orderId})`,
    blocks,
    attachments: [{ color: template.color, blocks: [] }],
  };

  await axios.post(SLACK_WEBHOOK_URL, payload, { timeout: 10000 });
  return { success: true, category: params.category };
}

module.exports = {
  sendEscalation,
  getTemplates,
  updateTemplate,
};
