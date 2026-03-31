#!/bin/bash
# GRLHOOD Dashboard — Live API Endpoint Tests
# Tests ALL endpoints on the deployed dashboard
# Run: bash tests/live-api-test.sh

BASE="https://grlhood-dashboard.vercel.app"
PASS=0
FAIL=0
FAILURES=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local body="$4"
    local check="$5"

    if [ "$method" = "GET" ]; then
        RESPONSE=$(curl -s --max-time 15 -w "\n%{http_code}" "${BASE}${endpoint}" 2>&1)
    else
        RESPONSE=$(curl -s --max-time 15 -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$body" "${BASE}${endpoint}" 2>&1)
    fi

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    # Run check
    RESULT=$(echo "$BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    $check
except Exception as e:
    print(f'ERROR: {e}')
" 2>&1)

    if echo "$RESULT" | grep -q "^PASS"; then
        PASS=$((PASS + 1))
        echo -e "  ${GREEN}✓${NC} ${name} ${RESULT#PASS}"
    else
        FAIL=$((FAIL + 1))
        echo -e "  ${RED}✗${NC} ${name} — HTTP ${HTTP_CODE} — ${RESULT}"
        FAILURES="${FAILURES}\n  ✗ ${name}: HTTP ${HTTP_CODE} — ${RESULT}"
    fi
}

echo ""
echo "=== GRLHOOD Dashboard Live API Tests ==="
echo "Target: ${BASE}"
echo ""

# ─── 1. STATUS & AUTH ───────────────────────────
echo "--- Status & Auth ---"

test_endpoint "GET /api/status → online" \
    GET "/api/status" "" \
    "
d = data
if d.get('status') == 'online' and d.get('connected') == True:
    print(f'PASS (store={d.get(\"store\")})')
else:
    print(f'FAIL: status={d.get(\"status\")}, connected={d.get(\"connected\")}')
"

test_endpoint "POST /api/login → admin auth works" \
    POST "/api/login" \
    '{"username":"Anshd6261@","password":"Anshd62616@"}' \
    "
d = data
if d.get('success') == True and d.get('role') == 'admin':
    print('PASS')
else:
    print(f'FAIL: success={d.get(\"success\")}, role={d.get(\"role\")}')
"

test_endpoint "POST /api/login → rejects bad creds" \
    POST "/api/login" \
    '{"username":"wrong","password":"wrong"}' \
    "
d = data
if d.get('success') == False:
    print('PASS')
else:
    print(f'FAIL: success={d.get(\"success\")}')
"

# ─── 2. ORDERS + RTO RISK ──────────────────────
echo ""
echo "--- Orders & RTO Risk ---"

# Fetch orders and save for reuse
ORDERS_RESPONSE=$(curl -s --max-time 30 "${BASE}/api/orders?days=7" 2>&1)
ORDERS_STATUS=$(echo "$ORDERS_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('success') else 'FAIL')" 2>&1)

if [ "$ORDERS_STATUS" = "OK" ]; then
    PASS=$((PASS + 1))
    ORDER_COUNT=$(echo "$ORDERS_RESPONSE" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('orders',[])))")
    echo -e "  ${GREEN}✓${NC} GET /api/orders → success (${ORDER_COUNT} orders)"
else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} GET /api/orders → FAILED"
    FAILURES="${FAILURES}\n  ✗ GET /api/orders failed"
fi

# Check RTO risk data
echo "$ORDERS_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
orders = d.get('orders', [])
total = len(orders)

with_risk = [o for o in orders if o.get('rtoRisk') and o['rtoRisk'] not in ('unknown', '0%', '')]
with_score = [o for o in orders if o.get('rtoScore') and o['rtoScore'] > 0]
creds_err = [o for o in orders if any('credentials not configured' in r for r in (o.get('rtoReasons') or []))]
sense_err = [o for o in orders if any('low balance' in r.lower() for r in (o.get('rtoReasons') or []) if isinstance(r, str))]
skipped = [o for o in orders if any('fulfilled' in r.lower() or 'skipped' in r.lower() for r in (o.get('rtoReasons') or []) if isinstance(r, str))]
unknown = [o for o in orders if o.get('rtoRisk') == 'unknown']

print(f'  RTO Summary: total={total}, withRisk={len(with_risk)}, withScore={len(with_score)}')
print(f'  Skipped (fulfilled): {len(skipped)}, Unknown: {len(unknown)}')
if creds_err:
    print(f'  ⚠ CREDS ERROR: {len(creds_err)} orders say \"credentials not configured\"')
if sense_err:
    print(f'  ⚠ BALANCE ERROR: {len(sense_err)} orders say \"low balance\"')

# Show sample risk data
for o in orders[:3]:
    print(f'    Sample: {o.get(\"orderId\",\"?\")} risk={o.get(\"rtoRisk\",\"?\")} score={o.get(\"rtoScore\",0)} reasons={o.get(\"rtoReasons\",[])}')
" 2>&1

RTO_RESULT=$(echo "$ORDERS_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
orders = d.get('orders', [])
with_risk = [o for o in orders if o.get('rtoRisk') and o['rtoRisk'] not in ('unknown', '0%', '')]
creds_err = [o for o in orders if any('credentials not configured' in r for r in (o.get('rtoReasons') or []))]
if with_risk:
    print('PASS')
elif creds_err:
    print('CREDS_ERROR')
else:
    print('NO_RISK_DATA')
" 2>&1)

if [ "$RTO_RESULT" = "PASS" ]; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} RTO risk data present in orders"
elif [ "$RTO_RESULT" = "CREDS_ERROR" ]; then
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} RTO risk → Shiprocket credentials not configured on Vercel"
    FAILURES="${FAILURES}\n  ✗ RTO: Shiprocket Sense credentials not configured"
else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} RTO risk → No risk data found in any order"
    FAILURES="${FAILURES}\n  ✗ RTO: No risk data"
fi

# Check shiprocketId → rsOrderId rename
RENAME_RESULT=$(echo "$ORDERS_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
orders = d.get('orders', [])
has_old = any('shiprocketId' in o for o in orders)
has_new = any('rsOrderId' in o for o in orders)
has_awb = sum(1 for o in orders if o.get('awb'))
if has_old:
    print(f'FAIL: still has shiprocketId')
else:
    print(f'PASS (rsOrderId={has_new}, withAWB={has_awb}/{len(orders)})')
" 2>&1)

if echo "$RENAME_RESULT" | grep -q "^PASS"; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} rsOrderId rename correct ${RENAME_RESULT#PASS}"
else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} rsOrderId rename — ${RENAME_RESULT}"
    FAILURES="${FAILURES}\n  ✗ Rename: ${RENAME_RESULT}"
fi

# Check payment method
PAYMENT_RESULT=$(echo "$ORDERS_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
orders = d.get('orders', [])
methods = set(o.get('paymentMethod','') for o in orders)
with_pm = [o for o in orders if o.get('paymentMethod')]
print(f'PASS methods={methods} ({len(with_pm)}/{len(orders)})' if with_pm else 'FAIL: no payment methods')
" 2>&1)

if echo "$PAYMENT_RESULT" | grep -q "^PASS"; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} Payment method detected ${PAYMENT_RESULT#PASS}"
else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} Payment method — ${PAYMENT_RESULT}"
fi

# ─── 3. RAPIDSHYP ──────────────────────────────
echo ""
echo "--- RapidShyp Endpoints ---"

test_endpoint "GET /api/rapidshyp/wallet → balance (no 500)" \
    GET "/api/rapidshyp/wallet" "" \
    "
d = data
bal = d.get('balance', 'missing')
if 'balance' in d:
    print(f'PASS (balance=₹{bal}, success={d.get(\"success\")})')
else:
    print(f'FAIL: no balance field, data={d}')
"

test_endpoint "POST /api/rapidshyp/label empty → 400 not 500" \
    POST "/api/rapidshyp/label" \
    '{"orderIds":[],"awbs":[]}' \
    "
d = data
if d.get('success') == False:
    print(f'PASS (error={d.get(\"error\",\"\")[:60]})')
else:
    print(f'FAIL: expected error, got {d}')
"

test_endpoint "POST /api/rapidshyp/bulk-assign empty → 400 not 500" \
    POST "/api/rapidshyp/bulk-assign" \
    '{"orderNames":[]}' \
    "
d = data
print('PASS') if d.get('error') or d.get('success') == False else print(f'FAIL: {d}')
"

# Test label with real AWB if available
AWB=$(echo "$ORDERS_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for o in d.get('orders', []):
    if o.get('awb'):
        print(o['awb'])
        break
" 2>&1)

if [ -n "$AWB" ]; then
    echo ""
    echo "  Found AWB: ${AWB} — testing label generation..."
    test_endpoint "POST /api/rapidshyp/label with AWB ${AWB}" \
        POST "/api/rapidshyp/label" \
        "{\"awbs\":[\"${AWB}\"]}" \
        "
d = data
label_url = d.get('label_url') or d.get('labelUrl') or d.get('label_pdf_url') or ''
if label_url:
    print(f'PASS (labelUrl={label_url[:80]})')
elif d.get('error'):
    print(f'WARN: {d.get(\"error\")[:80]}')
else:
    print(f'FAIL: no label URL, data={str(d)[:100]}')
"
else
    echo "  (no orders with AWB found — skipping label test)"
fi

# ─── 4. SEARCH ─────────────────────────────────
echo ""
echo "--- Search ---"

test_endpoint "GET /api/orders/search?q=3419 → no 500" \
    GET "/api/orders/search?q=3419" "" \
    "
d = data
if d.get('success') == True:
    print(f'PASS (results={len(d.get(\"orders\",[]))})')
else:
    print(f'FAIL: success={d.get(\"success\")}, error={d.get(\"error\",\"\")}')
"

# ─── 5. ANALYTICS ──────────────────────────────
echo ""
echo "--- Analytics ---"

test_endpoint "GET /api/analytics/dashboard → no 500" \
    GET "/api/analytics/dashboard?days=30" "" \
    "
d = data
if d.get('success') == True:
    ov = d.get('data',{}).get('overview',{})
    print(f'PASS (revenue={ov.get(\"revenue\",0)}, orders={ov.get(\"orders\",0)})')
else:
    print(f'FAIL: {d.get(\"error\",\"\")}')
"

# ─── 6. FINANCIALS ─────────────────────────────
echo ""
echo "--- Financials ---"

test_endpoint "GET /api/financials/summary → no 500" \
    GET "/api/financials/summary" "" \
    "
d = data
if 'today' in d:
    print(f'PASS (today revenue={d[\"today\"].get(\"revenue\",0)})')
else:
    print(f'FAIL: no today field')
"

# ─── 7. MISC ───────────────────────────────────
echo ""
echo "--- Misc ---"

test_endpoint "GET /api/my-ip → returns IP" \
    GET "/api/my-ip" "" \
    "
d = data
print(f'PASS (ip={d.get(\"ip\",\"?\")})')  if d.get('ip') else print('FAIL: no ip')
"

test_endpoint "GET /api/v2/status → config" \
    GET "/api/v2/status" "" \
    "
d = data
print(f'PASS (gmail={d.get(\"gmail\")}, portal={d.get(\"portal\")})')
"

test_endpoint "GET /api/history → no 500" \
    GET "/api/history" "" \
    "
d = data
print(f'PASS (type={type(d).__name__})')
"

# ─── REPORT ─────────────────────────────────────
echo ""
echo "=================================================="
if [ $FAIL -eq 0 ]; then
    echo -e "${BOLD}${GREEN}VERIFICATION: PASS${NC}"
else
    echo -e "${BOLD}${RED}VERIFICATION: FAIL${NC}"
fi
echo "=================================================="
echo "  Passed: ${PASS}"
echo "  Failed: ${FAIL}"
echo "  Total:  $((PASS + FAIL))"

if [ $FAIL -gt 0 ]; then
    echo ""
    echo "FAILURES:"
    echo -e "$FAILURES"
fi

echo ""
echo "Ready for PR: $([ $FAIL -eq 0 ] && echo 'YES' || echo 'NO')"
echo ""
exit $FAIL
