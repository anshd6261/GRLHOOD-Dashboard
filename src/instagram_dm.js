const axios = require('axios');
const { getDb } = require('./database');
require('dotenv').config();

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let cachedIgAccountId = null;
let cachedPageId = null;

/**
 * Auto-discover the Facebook Page ID from the access token.
 */
const getPageId = async () => {
    if (cachedPageId) return cachedPageId;
    if (process.env.META_PAGE_ID) { cachedPageId = process.env.META_PAGE_ID; return cachedPageId; }

    if (!META_ACCESS_TOKEN) { console.warn('[IG DM] Missing META_ACCESS_TOKEN'); return null; }

    try {
        const res = await axios.get(`${BASE_URL}/me/accounts`, {
            params: { access_token: META_ACCESS_TOKEN }
        });
        const pages = res.data.data || [];
        if (pages.length === 0) { console.warn('[IG DM] No pages found for this token'); return null; }
        cachedPageId = pages[0].id;
        console.log(`[IG DM] Auto-discovered Page ID: ${cachedPageId} (${pages[0].name})`);
        return cachedPageId;
    } catch (e) {
        console.error('[IG DM] Failed to discover Page ID:', e.response?.data?.error?.message || e.message);
        return null;
    }
};

/**
 * Get the Instagram Business Account ID from the Facebook Page.
 */
const getInstagramAccountId = async () => {
    if (cachedIgAccountId) return cachedIgAccountId;

    const pageId = await getPageId();
    if (!pageId) return null;

    try {
        const res = await axios.get(`${BASE_URL}/${pageId}`, {
            params: {
                fields: 'instagram_business_account',
                access_token: META_ACCESS_TOKEN
            }
        });
        cachedIgAccountId = res.data.instagram_business_account?.id || null;
        console.log(`[IG DM] Instagram Account ID: ${cachedIgAccountId}`);
        return cachedIgAccountId;
    } catch (e) {
        console.error('[IG DM] Failed to get IG Account ID:', e.response?.data?.error?.message || e.message);
        return null;
    }
};

/**
 * Fetch Instagram conversations with messages.
 */
const fetchConversations = async (limit = 25, cursor = null) => {
    const igId = await getInstagramAccountId();
    if (!igId) return { conversations: [], paging: null };

    try {
        const params = {
            fields: 'participants,messages{message,from,to,created_time,attachments}',
            platform: 'instagram',
            access_token: META_ACCESS_TOKEN,
            limit
        };
        if (cursor) params.after = cursor;

        const res = await axios.get(`${BASE_URL}/${igId}/conversations`, { params });
        return {
            conversations: res.data.data || [],
            paging: res.data.paging || null
        };
    } catch (e) {
        console.error('[IG DM] Fetch conversations error:', e.response?.data?.error?.message || e.message);
        return { conversations: [], paging: null };
    }
};

/**
 * Fetch messages for a specific conversation.
 */
const fetchMessages = async (conversationId, limit = 50, cursor = null) => {
    try {
        const params = {
            fields: 'message,from,to,created_time,attachments',
            access_token: META_ACCESS_TOKEN,
            limit
        };
        if (cursor) params.after = cursor;

        const res = await axios.get(`${BASE_URL}/${conversationId}/messages`, { params });
        return {
            messages: res.data.data || [],
            paging: res.data.paging || null
        };
    } catch (e) {
        console.error(`[IG DM] Fetch messages error for ${conversationId}:`, e.response?.data?.error?.message || e.message);
        return { messages: [], paging: null };
    }
};

/**
 * Send a reply to an Instagram conversation.
 */
const sendInstagramReply = async (conversationId, messageText) => {
    try {
        const res = await axios.post(`${BASE_URL}/${conversationId}/messages`, {
            message: messageText
        }, {
            params: { access_token: META_ACCESS_TOKEN }
        });
        console.log(`[IG DM] Reply sent to ${conversationId}`);
        return { success: true, data: res.data };
    } catch (e) {
        console.error(`[IG DM] Reply failed:`, e.response?.data?.error?.message || e.message);
        return { success: false, error: e.response?.data?.error?.message || e.message };
    }
};

/**
 * Sync Instagram DMs into the local SQLite database.
 */
const syncInstagramDMs = async () => {
    const igId = await getInstagramAccountId();
    if (!igId) return { synced: 0, errors: 0, error: 'No IG account ID' };

    const db = getDb();
    let synced = 0;
    let errors = 0;
    let cursor = null;
    let pageCount = 0;
    const maxPages = 5;

    const upsertQuery = db.prepare(`
        INSERT INTO customer_queries (external_id, channel, customer_name, customer_handle, last_message_text, last_message_at, status, created_at, updated_at)
        VALUES (?, 'instagram', ?, ?, ?, ?, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(external_id) DO UPDATE SET
            last_message_text = excluded.last_message_text,
            last_message_at = excluded.last_message_at,
            customer_name = COALESCE(excluded.customer_name, customer_queries.customer_name),
            customer_handle = COALESCE(excluded.customer_handle, customer_queries.customer_handle),
            updated_at = CURRENT_TIMESTAMP
    `);

    const upsertMessage = db.prepare(`
        INSERT INTO customer_messages (query_id, external_id, channel, direction, sender_name, sender_handle, body, timestamp, attachments)
        VALUES (?, ?, 'instagram', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(external_id) DO NOTHING
    `);

    const getQueryId = db.prepare(`SELECT id FROM customer_queries WHERE external_id = ?`);

    try {
        do {
            const { conversations, paging } = await fetchConversations(25, cursor);

            for (const convo of conversations) {
                try {
                    const convoId = convo.id;
                    const participants = convo.participants?.data || [];
                    // The other participant (not our page)
                    const customer = participants.find(p => p.id !== igId) || participants[0] || {};
                    const customerName = customer.name || customer.username || 'Unknown';
                    const customerHandle = customer.username || customer.id || '';

                    const messages = convo.messages?.data || [];
                    const latestMessage = messages[0];
                    const lastText = latestMessage?.message || '';
                    const lastTime = latestMessage?.created_time || new Date().toISOString();

                    // Upsert conversation
                    upsertQuery.run(convoId, customerName, customerHandle, lastText, lastTime);
                    const queryRow = getQueryId.get(convoId);
                    if (!queryRow) continue;

                    // Upsert messages
                    for (const msg of messages) {
                        const fromId = msg.from?.id;
                        const direction = fromId === igId ? 'outbound' : 'inbound';
                        const senderName = msg.from?.name || msg.from?.username || '';
                        const senderHandle = msg.from?.username || msg.from?.id || '';
                        const attachments = msg.attachments?.data ? JSON.stringify(msg.attachments.data) : null;

                        upsertMessage.run(
                            queryRow.id,
                            msg.id,
                            direction,
                            senderName,
                            senderHandle,
                            msg.message || '',
                            msg.created_time,
                            attachments
                        );
                    }

                    synced++;
                } catch (convErr) {
                    console.error(`[IG DM] Error processing conversation:`, convErr.message);
                    errors++;
                }
            }

            cursor = paging?.cursors?.after || null;
            pageCount++;
            if (cursor && pageCount < maxPages) await sleep(1000);
        } while (cursor && pageCount < maxPages);

    } catch (e) {
        console.error('[IG DM] Sync error:', e.message);
        errors++;
    }

    console.log(`[IG DM] Sync complete: ${synced} conversations, ${errors} errors`);
    return { synced, errors };
};

module.exports = {
    getInstagramAccountId,
    fetchConversations,
    fetchMessages,
    sendInstagramReply,
    syncInstagramDMs
};
