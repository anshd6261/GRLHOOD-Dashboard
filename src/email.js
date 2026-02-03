const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

const sendApprovalEmail = async (csvContent, filename) => {
  if (!process.env.GMAIL_APP_PASSWORD) {
    console.warn('[EMAIL] Skipped: GMAIL_APP_PASSWORD not set.');
    return false;
  }

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: 'Anshd8959@gmail.com', // Updated recipient
    subject: `[ACTION REQUIRED] Fulfillment Approval: ${filename}`,
    html: `
      <h2>Fulfillment CSV Generated</h2>
      <p>Please review the attached CSV file.</p>
      
      <h3>Summary</h3>
      <p>Total Orders: <b>${(csvContent.match(/\n/g) || []).length - 1}</b></p>

      <div style="margin: 30px 0;">
        <a href="http://localhost:3001/dashboard?action=approve" style="background-color: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 15px;">
          ✅ APPROVE & UPLOAD
        </a>
        <a href="http://localhost:3001/dashboard?action=edit" style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          ✏️ EDIT CSV
        </a>
      </div>
      
      <p style="color: #666; font-size: 12px; margin-top: 30px;">
        Clicking 'Edit' will open the dashboard where you can modify the order details before sending.
      </p>
    `,
    attachments: [
      {
        filename: filename,
        content: csvContent
      }
    ]
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('[EMAIL] Sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('[EMAIL] Failed:', error);
    return false;
  }
};

module.exports = { sendApprovalEmail };
