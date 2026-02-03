const ExcelJS = require('exceljs');

const generateExcel = async (rows, gstRate = 18) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Orders', {
        views: [{ showGridLines: false }] // Clean look
    });

    // Theme Colors (Inspired by "Class Schedule" Image)
    const COLORS = {
        HEADER_BG: 'FFEAD1DC',    // Dusty Pink
        HEADER_TEXT: 'FF741B47',  // Dark Maroon
        BORDER: 'FF741B47',       // Dark Maroon
        ROW_ALT_1: 'FFFFFFFF',    // White
        ROW_ALT_2: 'FFF4CCCC',    // Light Red/Pink
        TEXT_MAIN: 'FF000000',    // Black
        GRAND_TOTAL_BG: 'FFE6B8AF' // Slightly darker pink for total
    };

    // 1. Define Columns
    sheet.columns = [
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Model', key: 'model', width: 25 },
        { header: 'SKU', key: 'sku', width: 30 },
        { header: 'Customer Name', key: 'customerName', width: 25 },
        { header: 'Order ID', key: 'orderId', width: 15 },
        { header: 'Preview Product URL', key: 'previewUrl', width: 40 },
        { header: 'Payment', key: 'payment', width: 15 },
        { header: 'COGS', key: 'cogs', width: 15 },
    ];

    // 2. Add Data & Apply Alternating Colors
    let lastOrderId = null;
    let isAltColor = false;

    // Ensure rows are sorted by Order ID to keep groups together
    rows.sort((a, b) => String(a.orderId).localeCompare(String(b.orderId)));

    rows.forEach(row => {
        const currentRow = sheet.addRow({
            category: row.category,
            model: row.model,
            sku: row.sku,
            customerName: row.customerName,
            orderId: row.orderId,
            previewUrl: row.previewUrl,
            payment: row.payment,
            cogs: row.cogs
        });

        // Determine Striping Logic
        if (row.orderId !== lastOrderId) {
            isAltColor = !isAltColor; // Toggle color on new order
            lastOrderId = row.orderId;
        }

        const fillColor = isAltColor ? COLORS.ROW_ALT_2 : COLORS.ROW_ALT_1;

        // Apply Styles to the Row
        currentRow.height = 25; // Good height
        currentRow.eachCell((cell, colNumber) => {
            cell.font = { name: 'Segoe UI', size: 10, color: { argb: COLORS.TEXT_MAIN } };
            cell.alignment = { vertical: 'middle', horizontal: colNumber === 6 ? 'left' : 'center' };

            // Fill
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: fillColor }
            };

            // Border (Thick/Colored borders like the image)
            cell.border = {
                top: { style: 'thin', color: { argb: COLORS.BORDER } },
                bottom: { style: 'thin', color: { argb: COLORS.BORDER } },
                left: { style: 'thin', color: { argb: COLORS.BORDER } },
                right: { style: 'thin', color: { argb: COLORS.BORDER } }
            };

            // Currency formatting for COGS
            if (colNumber === 8) {
                cell.numFmt = '₹#,##0.00';
                cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.HEADER_TEXT } };
            }
        });
    });

    // 3. Style Header Row
    const headerRow = sheet.getRow(1);
    headerRow.height = 35;
    headerRow.eachCell((cell) => {
        cell.font = { name: 'Segoe UI', bold: true, color: { argb: COLORS.HEADER_TEXT }, size: 12 };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: COLORS.HEADER_BG }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            top: { style: 'medium', color: { argb: COLORS.BORDER } },
            bottom: { style: 'medium', color: { argb: COLORS.BORDER } },
            left: { style: 'medium', color: { argb: COLORS.BORDER } },
            right: { style: 'medium', color: { argb: COLORS.BORDER } }
        };
    });

    // 5. Calculate Summary
    const categoryCounts = {};
    let totalCOGS = 0;
    rows.forEach(r => {
        categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
        totalCOGS += (r.cogs || 0);
    });
    const gstAmount = totalCOGS * (gstRate / 100);
    const grandTotal = totalCOGS + gstAmount;

    // 6. Summary Section
    let currentRow = rows.length + 4; // Extra spacing

    const addSummaryRow = (label, value, bold = false, isCurrency = false) => {
        const r = sheet.getRow(currentRow++);
        r.getCell(2).value = label; // Column B
        r.getCell(3).value = value; // Column C

        r.getCell(2).font = { name: 'Segoe UI', bold: true, color: { argb: COLORS.HEADER_TEXT } };
        r.getCell(3).font = { name: 'Segoe UI', bold: bold, color: { argb: COLORS.TEXT_MAIN } };
        r.getCell(2).alignment = { horizontal: 'right' };
        r.getCell(3).alignment = { horizontal: 'left' };

        // Borders for Summary
        r.getCell(2).border = { bottom: { style: 'thin', color: { argb: COLORS.BORDER } }, right: { style: 'thin', color: { argb: COLORS.BORDER } } };
        r.getCell(3).border = { bottom: { style: 'thin', color: { argb: COLORS.BORDER } } };

        if (isCurrency) r.getCell(3).numFmt = '₹#,##0.00';
    };

    // Header for Summary
    const summaryHeader = sheet.getRow(currentRow++);
    summaryHeader.getCell(2).value = 'ORDER SUMMARY';
    summaryHeader.getCell(2).font = { name: 'Segoe UI', bold: true, size: 12, color: { argb: COLORS.HEADER_TEXT } };
    summaryHeader.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_BG } };
    summaryHeader.getCell(2).border = { top: { style: 'medium', color: { argb: COLORS.BORDER } }, bottom: { style: 'medium', color: { argb: COLORS.BORDER } }, left: { style: 'medium', color: { argb: COLORS.BORDER } }, right: { style: 'medium', color: { argb: COLORS.BORDER } } };
    summaryHeader.getCell(2).alignment = { horizontal: 'center' };
    sheet.mergeCells(currentRow - 1, 2, currentRow - 1, 3); // Merge B and C for header
    currentRow++;

    addSummaryRow('TOTAL ORDERS', new Set(rows.map(r => r.orderId)).size, true);
    addSummaryRow('TOTAL ITEMS', rows.length, true);

    // Categories
    Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, count]) => {
            addSummaryRow(cat, count);
        });

    currentRow++; // Spacer

    // Header for Invoice
    const invoiceHeader = sheet.getRow(currentRow++);
    invoiceHeader.getCell(2).value = 'INVOICE';
    invoiceHeader.getCell(2).font = { name: 'Segoe UI', bold: true, size: 12, color: { argb: COLORS.HEADER_TEXT } };
    invoiceHeader.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_BG } };
    invoiceHeader.getCell(2).border = { top: { style: 'medium', color: { argb: COLORS.BORDER } }, bottom: { style: 'medium', color: { argb: COLORS.BORDER } }, left: { style: 'medium', color: { argb: COLORS.BORDER } }, right: { style: 'medium', color: { argb: COLORS.BORDER } } };
    invoiceHeader.getCell(2).alignment = { horizontal: 'center' };
    sheet.mergeCells(currentRow - 1, 2, currentRow - 1, 3);
    currentRow++;

    addSummaryRow('Subtotal (COGS)', totalCOGS, false, true);
    addSummaryRow(`GST (${gstRate}%)`, gstAmount, false, true);

    // Grand Total Row with Box
    const grandTotalRow = sheet.getRow(currentRow++);
    grandTotalRow.height = 35;
    grandTotalRow.getCell(2).value = 'GRAND TOTAL';
    grandTotalRow.getCell(3).value = grandTotal;

    grandTotalRow.getCell(2).font = { name: 'Segoe UI', bold: true, size: 12, color: { argb: COLORS.HEADER_TEXT } };
    grandTotalRow.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
    grandTotalRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_BG } };

    grandTotalRow.getCell(3).font = { name: 'Segoe UI', bold: true, size: 14, color: { argb: COLORS.HEADER_TEXT } };
    grandTotalRow.getCell(3).numFmt = '₹#,##0.00';
    grandTotalRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    grandTotalRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.GRAND_TOTAL_BG } };

    grandTotalRow.getCell(2).border = { top: { style: 'medium', color: { argb: COLORS.BORDER } }, bottom: { style: 'medium', color: { argb: COLORS.BORDER } }, left: { style: 'medium', color: { argb: COLORS.BORDER } } };
    grandTotalRow.getCell(3).border = { top: { style: 'medium', color: { argb: COLORS.BORDER } }, bottom: { style: 'medium', color: { argb: COLORS.BORDER } }, right: { style: 'medium', color: { argb: COLORS.BORDER } } };

    // Return buffer
    return await workbook.xlsx.writeBuffer();
};

module.exports = { generateExcel };
