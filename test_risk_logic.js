const { validateAddress, validatePhone, findDuplicates } = require('./src/riskValidator');

const test = () => {
    console.log("🛠️ Testing Risk Validator Logic...\n");

    // 1. Phone Tests
    const phones = [
        { p: "9876543210", expect: true },
        { p: "+91 9876543210", expect: true },
        { p: "8999999999", expect: true },
        { p: "6000000000", expect: true },
        { p: "999999999", expect: false }, // 9 digits
        { p: "1234567890", expect: false }, // Starts with 1
        { p: "garbage", expect: false },
        { p: null, expect: false }
    ];

    console.log("--- Phone Validation ---");
    phones.forEach(t => {
        const res = validatePhone(t.p);
        const pass = res.valid === t.expect;
        console.log(`[${pass ? '✅' : '❌'}] "${t.p}" -> ${res.valid} (${res.reason || 'OK'})`);
    });

    // 2. Address Tests
    const addresses = [
        { a: "4348 Sector 23, Gurgaon", expect: true },
        { a: "House 4, Comlia Complex", expect: true }, // User Example (Should Pass)
        { a: "House 4", expect: false }, // User Example (Should Fail - Exact Match OR Length)
        { a: "A-123", expect: false }, // Generic Short Address (< 10 chars, not in blocklist)
        { a: "Flat 2", expect: false }, // Blocked pattern
        { a: "Short", expect: false }, // Too short
        { a: "12345", expect: false }, // Just numbers
        { a: "Unknown Address", expect: false },
    ];

    console.log("\n--- Address Validation ---");
    addresses.forEach(t => {
        const mockOrder = { shippingAddress: { address1: t.a } };
        const res = validateAddress(mockOrder);
        const pass = res.valid === t.expect;
        console.log(`[${pass ? '✅' : '❌'}] "${t.a}" -> ${res.valid} (${res.reason || 'OK'})`);
    });

    // 3. Duplicate Prevention
    const orders = [
        { id: "101", name: "#101", shippingAddress: { address1: "House 123", zip: "110001", name: "Ansh Singh" } },
        { id: "102", name: "#102", shippingAddress: { address1: "House 123", zip: "110001", name: "Ansh Singh" } }, // Same Name (Allowed)
        { id: "103", name: "#103", shippingAddress: { address1: "Flat 99, Block B", zip: "90210", name: "John Doe" } },
        { id: "104", name: "#104", shippingAddress: { address1: "Flat 99, Block B", zip: "90210", name: "Jane Smith" } }, // Diff Name (Risk!)
    ];

    console.log("\n--- Duplicate Detection ---");
    const risks = findDuplicates(orders);

    console.log(`Expected: Order #103 and #104 flagged. #101/#102 safe.`);

    if (!risks.has("101") && !risks.has("102")) console.log("✅ #101/#102 Safe (Same Name)");
    else console.log("❌ #101/#102 Failed");

    if (risks.has("103") && risks.has("104")) console.log("✅ #103/#104 Flagged (Diff Name)");
    else console.log("❌ #103/#104 Failed");

    console.log("\nTest Complete.");
};

test();
