const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const { getDb } = require('./database');
require('dotenv').config();

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

/**
 * Create an IMAP connection to Gmail.
 */
const createImapConnection = () => {
    return new Imap({
        user: GMAIL_USER,
        password: GMAIL_APP_PASSWORD,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000
    });
};

/**
 * Create a Nodemailer transporter for sending replies.
 */
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD
    }
});

/**
 * Wrap IMAP operations in a promise.
 */
const imapFetch = (daysSince = 7, maxResults = 100) => {
    return new Promise((resolve, reject) => {
        if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
            return resolve([]);
        }

        const imap = createImapConnection();
        const emails = [];

        imap.once('ready', () => {
            imap.openBox('INBOX', true, (err, box) => {
                if (err) {
                    imap.end();
                    return reject(err);
                }

                const sinceDate = new Date();
                sinceDate.setDate(sinceDate.getDate() - daysSince);
                const dateStr = sinceDate.toISOString().split('T')[0].split('-');
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const imapDate = `${dateStr[2]}-${months[parseInt(dateStr[1]) - 1]}-${dateStr[0]}`;

                imap.search(['ALL', ['SINCE', imapDate]], (err, results) => {
                    if (err) {
                        imap.end();
                        return reject(err);
                    }

                    if (!results || results.length === 0) {
                        imap.end();
                        return resolve([]);
                    }

                    // Take most recent N results
                    const uids = results.slice(-maxResults);

                    const f = imap.fetch(uids, { bodies: '', struct: true });

                    f.on('message', (msg, seqno) => {
                        let buffer = '';

                        msg.on('body', (stream) => {
                            stream.on('data', (chunk) => {
                                buffer += chunk.toString('utf8');
                            });
                        });

                        msg.once('end', () => {
                            emails.push(buffer);
                        });
                    });

                    f.once('error', (err) => {
                        console.error('[GMAIL] Fetch error:', err.message);
                    });

                    f.once('end', () => {
                        imap.end();
                    });
                });
            });
        });

        imap.once('error', (err) => {
            console.error('[GMAIL] IMAP connection error:', err.message);
            resolve([]);
        });

        imap.once('end', () => {
            resolve(emails);
        });

        imap.connect();
    });
};

/**
 * Sync Gmail inbox into the local SQLite database.
 */
const syncGmailInbox = async (daysSince = 7) => {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
        console.warn('[GMAIL] Missing credentials. Skipping sync.');
        return { synced: 0, errors: 0, error: 'Missing credentials' };
    }

    const db = getDb();
    let synced = 0;
    let errors = 0;

    const upsertQuery = db.prepare(`
        INSERT INTO customer_queries (external_id, channel, customer_name, customer_handle, subject, last_message_text, last_message_at, status, created_at, updated_at)
        VALUES (?, 'email', ?, ?, ?, ?, ?, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(external_id) DO UPDATE SET
            last_message_text = CASE WHEN excluded.last_message_at > customer_queries.last_message_at THEN excluded.last_message_text ELSE customer_queries.last_message_text END,
            last_message_at = CASE WHEN excluded.last_message_at > customer_queries.last_message_at THEN excluded.last_message_at ELSE customer_queries.last_message_at END,
            updated_at = CURRENT_TIMESTAMP
    `);

    const upsertMessage = db.prepare(`
        INSERT INTO customer_messages (query_id, external_id, channel, direction, sender_name, sender_handle, body, timestamp, attachments)
        VALUES (?, ?, 'email', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(external_id) DO NOTHING
    `);

    const getQueryId = db.prepare(`SELECT id FROM customer_queries WHERE external_id = ?`);

    try {
        console.log(`[GMAIL] Fetching emails from last ${daysSince} days...`);
        const rawEmails = await imapFetch(daysSince);
        console.log(`[GMAIL] Fetched ${rawEmails.length} raw emails`);

        for (const raw of rawEmails) {
            try {
                const parsed = await simpleParser(raw);
                const messageId = parsed.messageId || `gmail-${Date.now()}-${Math.random()}`;
                const from = parsed.from?.value?.[0] || {};
                const senderName = from.name || '';
                const senderEmail = from.address || '';
                const subject = parsed.subject || '(No subject)';
                const body = parsed.text || parsed.html || '';
                const date = parsed.date ? parsed.date.toISOString() : new Date().toISOString();

                // Use thread ID (In-Reply-To or References) to group, or message ID as thread root
                const threadId = parsed.references?.[0] || parsed.inReplyTo || messageId;

                // Determine direction: if from our email, it's outbound
                const direction = senderEmail.toLowerCase() === GMAIL_USER?.toLowerCase() ? 'outbound' : 'inbound';

                // Upsert the conversation (using thread root as external_id)
                upsertQuery.run(threadId, senderName, senderEmail, subject, body.substring(0, 200), date);
                const queryRow = getQueryId.get(threadId);
                if (!queryRow) continue;

                // Attachments
                const attachments = parsed.attachments?.length > 0
                    ? JSON.stringify(parsed.attachments.map(a => ({ filename: a.filename, contentType: a.contentType, size: a.size })))
                    : null;

                // Upsert the message
                upsertMessage.run(
                    queryRow.id,
                    messageId,
                    direction,
                    senderName,
                    senderEmail,
                    body,
                    date,
                    attachments
                );

                synced++;
            } catch (parseErr) {
                console.error('[GMAIL] Parse error:', parseErr.message);
                errors++;
            }
        }
    } catch (e) {
        console.error('[GMAIL] Sync error:', e.message);
        errors++;
    }

    console.log(`[GMAIL] Sync complete: ${synced} emails, ${errors} errors`);
    return { synced, errors };
};

/**
 * Send an email reply with proper threading headers.
 */
const sendEmailReply = async (to, subject, body, inReplyTo, references) => {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
        return { success: false, error: 'Missing Gmail credentials' };
    }

    try {
        const mailOptions = {
            from: GMAIL_USER,
            to,
            subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
            text: body,
            headers: {}
        };

        if (inReplyTo) mailOptions.headers['In-Reply-To'] = inReplyTo;
        if (references) mailOptions.headers['References'] = references;

        const info = await transporter.sendMail(mailOptions);
        console.log(`[GMAIL] Reply sent to ${to}: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (e) {
        console.error('[GMAIL] Reply failed:', e.message);
        return { success: false, error: e.message };
    }
};

module.exports = {
    syncGmailInbox,
    sendEmailReply
};
