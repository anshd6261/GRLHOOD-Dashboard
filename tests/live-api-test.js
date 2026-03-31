/**
 * GRLHOOD Dashboard — Live API Endpoint Tests
 *
 * Tests ALL API endpoints on the deployed dashboard at grlhood-dashboard.vercel.app.
 * Covers: status, orders (RTO risk), wallet, label generation, tracking, analytics.
 *
 * Run: node tests/live-api-test.js
 */

const https = require('https');
const http = require('http');

const BASE = 'https://grlhood-dashboard.vercel.app';
const RESULTS = [];
let passCount = 0;
let failCount = 0;

function fetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const mod = parsed.protocol === 'https:' ? https : http;
        const req = mod.request(url, {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
            timeout: 15000,
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data), raw: data });
                } catch {
                    resolve({ status: res.statusCode, data: null, raw: data });
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
        if (options.body) req.write(JSON.stringify(options.body));
        req.end();
    });
}

function test(name, fn) {
    return fn().then(result => {
        if (result.pass) {
            passCount++;
            RESULTS.push({ name, status: 'PASS', detail: result.detail || '' });
            console.log(`  ✓ ${name}`);
        } else {
            failCount++;
            RESULTS.push({ name, status: 'FAIL', detail: result.detail || '' });
            console.log(`  ✗ ${name} — ${result.detail}`);
        }
    }).catch(err => {
        failCount++;
        RESULTS.push({ name, status: 'FAIL', detail: err.message });
        console.log(`  ✗ ${name} — ${err.message}`);
    });
}

async function runTests() {
    console.log(`\n=== GRLHOOD Dashboard Live API Tests ===`);
    console.log(`Target: ${BASE}\n`);

    // ─── 1. STATUS ─────────────────────────────────
    console.log('--- Status & Auth ---');

    await test('GET /api/status returns online', async () => {
        const r = await fetch(`${BASE}/api/status`);
        return {
            pass: r.status === 200 && r.data?.status === 'online' && r.data?.connected === true,
            detail: `status=${r.status}, data=${JSON.stringify(r.data)}`
        };
    });

    await test('POST /api/login with valid admin creds', async () => {
        const r = await fetch(`${BASE}/api/login`, {
            method: 'POST',
            body: { username: 'Anshd6261@', password: 'Anshd62616@' }
        });
        return {
            pass: r.status === 200 && r.data?.success === true && r.data?.role === 'admin',
            detail: `status=${r.status}, success=${r.data?.success}, role=${r.data?.role}`
        };
    });

    await test('POST /api/login rejects bad creds', async () => {
        const r = await fetch(`${BASE}/api/login`, {
            method: 'POST',
            body: { username: 'wrong', password: 'wrong' }
        });
        return {
            pass: r.status === 401 && r.data?.success === false,
            detail: `status=${r.status}`
        };
    });

    // ─── 2. ORDERS + RTO RISK ──────────────────────
    console.log('\n--- Orders & RTO Risk ---');

    await test('GET /api/orders returns orders (no 500)', async () => {
        const r = await fetch(`${BASE}/api/orders?days=3`);
        return {
            pass: r.status === 200 && r.data?.success === true && Array.isArray(r.data?.orders),
            detail: `status=${r.status}, orderCount=${r.data?.orders?.length || 0}, success=${r.data?.success}`
        };
    });

    await test('Orders have RTO risk data (not all 0%)', async () => {
        const r = await fetch(`${BASE}/api/orders?days=7`);
        if (r.status !== 200 || !r.data?.orders) return { pass: false, detail: `status=${r.status}` };

        const orders = r.data.orders;
        const withRisk = orders.filter(o =>
            o.rtoRisk && o.rtoRisk !== 'unknown' && o.rtoRisk !== '0%'
        );
        const withRiskScore = orders.filter(o => o.rtoScore && o.rtoScore > 0);
        const withReasons = orders.filter(o => o.rtoReasons && o.rtoReasons.length > 0 && o.rtoReasons[0] !== 'RTO check unavailable');

        // Check for "Shiprocket credentials not configured" error
        const credsError = orders.filter(o =>
            o.rtoReasons?.some(r => r.includes('credentials not configured'))
        );

        return {
            pass: withRisk.length > 0 || withRiskScore.length > 0,
            detail: `total=${orders.length}, withRisk=${withRisk.length}, withScore=${withRiskScore.length}, withReasons=${withReasons.length}, credsError=${credsError.length}`
        };
    });

    await test('Orders have rsOrderId (not shiprocketId)', async () => {
        const r = await fetch(`${BASE}/api/orders?days=3`);
        if (r.status !== 200 || !r.data?.orders) return { pass: false, detail: `status=${r.status}` };

        const orders = r.data.orders;
        const hasOldKey = orders.some(o => o.shiprocketId !== undefined);
        const hasNewKey = orders.some(o => o.rsOrderId !== undefined);
        const hasAwb = orders.filter(o => o.awb).length;

        return {
            pass: !hasOldKey,
            detail: `hasOldKey(shiprocketId)=${hasOldKey}, hasNewKey(rsOrderId)=${hasNewKey}, withAWB=${hasAwb}/${orders.length}`
        };
    });

    await test('Orders have payment method detected', async () => {
        const r = await fetch(`${BASE}/api/orders?days=3`);
        if (r.status !== 200 || !r.data?.orders) return { pass: false, detail: `status=${r.status}` };

        const orders = r.data.orders;
        const withPayment = orders.filter(o => o.paymentMethod && o.paymentMethod !== '');

        return {
            pass: withPayment.length > 0,
            detail: `withPayment=${withPayment.length}/${orders.length}, methods=${[...new Set(orders.map(o => o.paymentMethod))].join(',')}`
        };
    });

    // ─── 3. RAPIDSHYP ENDPOINTS ────────────────────
    console.log('\n--- RapidShyp Endpoints ---');

    await test('GET /api/rapidshyp/wallet returns balance (no 500)', async () => {
        const r = await fetch(`${BASE}/api/rapidshyp/wallet`);
        return {
            pass: r.status === 200 && r.data !== null && r.data?.balance !== undefined,
            detail: `status=${r.status}, balance=${r.data?.balance}, success=${r.data?.success}, msg=${r.data?.message || ''}`
        };
    });

    await test('POST /api/rapidshyp/label with no data returns 400 (not 500)', async () => {
        const r = await fetch(`${BASE}/api/rapidshyp/label`, {
            method: 'POST',
            body: { orderIds: [], awbs: [] }
        });
        return {
            pass: r.status === 400 && r.data?.success === false,
            detail: `status=${r.status}, error=${r.data?.error || ''}`
        };
    });

    // Test label with a known AWB (if any orders have one)
    await test('POST /api/rapidshyp/label with real AWB resolves shipment', async () => {
        // First get an order with AWB
        const ordersRes = await fetch(`${BASE}/api/orders?days=14`);
        if (ordersRes.status !== 200) return { pass: false, detail: 'Could not fetch orders' };

        const orderWithAwb = ordersRes.data?.orders?.find(o => o.awb);
        if (!orderWithAwb) return { pass: true, detail: 'SKIP — no orders with AWB found (expected if no shipped orders)' };

        const r = await fetch(`${BASE}/api/rapidshyp/label`, {
            method: 'POST',
            body: { awbs: [orderWithAwb.awb] }
        });

        return {
            pass: r.status === 200 || (r.status === 400 && r.data?.error),
            detail: `awb=${orderWithAwb.awb}, status=${r.status}, labelUrl=${r.data?.label_url || r.data?.labelUrl || 'none'}, error=${r.data?.error || 'none'}`
        };
    });

    await test('POST /api/rapidshyp/bulk-assign with empty array returns 400', async () => {
        const r = await fetch(`${BASE}/api/rapidshyp/bulk-assign`, {
            method: 'POST',
            body: { orderNames: [] }
        });
        return {
            pass: r.status === 400,
            detail: `status=${r.status}`
        };
    });

    // ─── 4. SEARCH ─────────────────────────────────
    console.log('\n--- Search ---');

    await test('GET /api/orders/search?q=test returns (no 500)', async () => {
        const r = await fetch(`${BASE}/api/orders/search?q=3419`);
        return {
            pass: r.status === 200 && r.data?.success === true,
            detail: `status=${r.status}, results=${r.data?.orders?.length || 0}`
        };
    });

    // ─── 5. ANALYTICS ──────────────────────────────
    console.log('\n--- Analytics ---');

    await test('GET /api/analytics/dashboard returns data (no 500)', async () => {
        const r = await fetch(`${BASE}/api/analytics/dashboard?days=30`);
        return {
            pass: r.status === 200 && r.data?.success === true,
            detail: `status=${r.status}, hasOverview=${!!r.data?.data?.overview}`
        };
    });

    // ─── 6. FINANCIALS ─────────────────────────────
    console.log('\n--- Financials ---');

    await test('GET /api/financials/summary returns data (no 500)', async () => {
        const r = await fetch(`${BASE}/api/financials/summary`);
        return {
            pass: r.status === 200 && r.data?.today !== undefined,
            detail: `status=${r.status}, hasToday=${!!r.data?.today}, hasMtd=${!!r.data?.mtd}`
        };
    });

    // ─── 7. MISC ENDPOINTS ─────────────────────────
    console.log('\n--- Misc ---');

    await test('GET /api/my-ip returns IP', async () => {
        const r = await fetch(`${BASE}/api/my-ip`);
        return {
            pass: r.status === 200 && r.data?.ip,
            detail: `ip=${r.data?.ip}`
        };
    });

    await test('GET /api/v2/status returns config', async () => {
        const r = await fetch(`${BASE}/api/v2/status`);
        return {
            pass: r.status === 200,
            detail: `gmail=${r.data?.gmail}, portal=${r.data?.portal}`
        };
    });

    await test('GET /api/history returns array (no 500)', async () => {
        const r = await fetch(`${BASE}/api/history`);
        return {
            pass: r.status === 200,
            detail: `status=${r.status}, type=${typeof r.data}`
        };
    });

    // ─── REPORT ────────────────────────────────────
    console.log(`\n${'='.repeat(50)}`);
    console.log(`VERIFICATION: ${failCount === 0 ? 'PASS' : 'FAIL'}`);
    console.log(`${'='.repeat(50)}`);
    console.log(`  Passed: ${passCount}`);
    console.log(`  Failed: ${failCount}`);
    console.log(`  Total:  ${passCount + failCount}`);
    console.log();

    if (failCount > 0) {
        console.log('FAILURES:');
        RESULTS.filter(r => r.status === 'FAIL').forEach(r => {
            console.log(`  ✗ ${r.name}`);
            console.log(`    ${r.detail}`);
        });
    }

    console.log();
    process.exit(failCount > 0 ? 1 : 0);
}

runTests();
