const ExcelJS = require('exceljs');

const generateExcel = async (rows, gstRate = 18) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Orders', {
        views: [{ showGridLines: false }] // Clean look
    });

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

    // 2. Add Data
    rows.forEach(row => {
        sheet.addRow({
            category: row.category,
            model: row.model,
            sku: row.sku,
            customerName: row.customerName,
            orderId: row.orderId,
            previewUrl: row.previewUrl,
            payment: row.payment,
            cogs: row.cogs
        });
    });

    // 3. Style Header Row
    const headerRow = sheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F46E5' } // Indigo color
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            bottom: { style: 'medium', color: { argb: 'FF000000' } }
        };
    });

    // 4. Style Data Rows
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        row.height = 20;
        row.eachCell((cell, colNumber) => {
            cell.alignment = { vertical: 'middle', horizontal: colNumber === 6 ? 'left' : 'center' }; // URL left align, others centered
            cell.border = {
                bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } } // Subtle separator
            };

            // Currency formatting for COGS
            if (colNumber === 8) {
                cell.numFmt = '₹#,##0.00';
            }
        });
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

    // 6. Summary Section (Spacer + Content)
    let currentRow = rows.length + 3;

    const addSummaryRow = (label, value, bold = false, isCurrency = false) => {
        const r = sheet.getRow(currentRow++);
        r.getCell(2).value = label; // Column B
        r.getCell(3).value = value; // Column C

        r.getCell(2).font = { bold: true, color: { argb: 'FF333333' } };
        r.getCell(3).font = { bold: bold };
        r.getCell(2).alignment = { horizontal: 'right' };
        r.getCell(3).alignment = { horizontal: 'left' };

        if (isCurrency) r.getCell(3).numFmt = '₹#,##0.00';
    };

    // Header for Summary
    const summaryHeader = sheet.getRow(currentRow++);
    summaryHeader.getCell(2).value = 'ORDER SUMMARY';
    summaryHeader.getCell(2).font = { bold: true, size: 14, color: { argb: 'FF4F46E5' } };
    currentRow++;

    addSummaryRow('TOTAL ORDERS', new Set(rows.map(r => r.orderId)).size, true);
    addSummaryRow('TOTAL ITEMS', rows.length, true);
    currentRow++; // Spacer

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
    invoiceHeader.getCell(2).font = { bold: true, size: 14, color: { argb: 'FF4F46E5' } };
    currentRow++;

    addSummaryRow('Subtotal (COGS)', totalCOGS, false, true);
    addSummaryRow(`GST (${gstRate}%)`, gstAmount, false, true);

    // Grand Total Row with Box
    const grandTotalRow = sheet.getRow(currentRow++);
    grandTotalRow.getCell(2).value = 'GRAND TOTAL';
    grandTotalRow.getCell(3).value = grandTotal;

    grandTotalRow.getCell(2).font = { bold: true, size: 12 };
    grandTotalRow.getCell(2).alignment = { horizontal: 'right' };

    grandTotalRow.getCell(3).font = { bold: true, size: 12, color: { argb: 'FF000000' } };
    grandTotalRow.getCell(3).numFmt = '₹#,##0.00';
    grandTotalRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Light yellow
    grandTotalRow.getCell(3).border = { top: { style: 'thin' }, bottom: { style: 'double' } };

    // Return buffer
    return await workbook.xlsx.writeBuffer();
};

module.exports = { generateExcel };
