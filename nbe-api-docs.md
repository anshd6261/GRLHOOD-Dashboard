# API curl Command Reference

> Replace `<API_KEY>` with your `X-Customer-Api-Key`

---

## 1. Create an Order via File Uploads (Image)

### Step 1 — Create an upload item (file **or** existing design)

```bash
curl -X POST https://5060265239-api.nextbige.com/api/external/customer-uploads/ \
  -H "X-Customer-Api-Key: <API_KEY>" \
  -F "file=@/path/to/design.jpg" \
  -F "order_type=Dropship POD" \
  -F "case_type_name=Soft Case" \
  -F "product_name=iPhone 15 Pro" \
  -F "providing_shipping_label=no"
```

> Note the `id` returned in the response — you'll need it in the next steps.

You can also create an upload from a previously saved design (from `/api/external/vendor-images/`) without uploading a new file:

```bash
curl -X POST https://5060265239-api.nextbige.com/api/external/customer-uploads/ \
  -H "X-Customer-Api-Key: <API_KEY>" \
  -F "design_id=<vendor_image_id>" \
  -F "order_type=Dropship POD" \
  -F "case_type_name=Soft Case" \
  -F "product_name=iPhone 15 Pro" \
  -F "providing_shipping_label=no"
```

You may pass either `design_id` or `design_name` instead of `file`.

### Step 2 — Create the order from selected uploads

```bash
curl -X POST https://5060265239-api.nextbige.com/api/external/customer-orders/create-order/ \
  -H "X-Customer-Api-Key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "upload_id": "<upload_id>",
        "quantity": 1,
        "design_id": "<vendor_image_id>"
      }
    ],
    "order_type": "Dropship POD",
    "order_notes": "My image order notes",
    "providing_shipping_label": false,
    "partial_fulfillment": false,
    "is_urgent_order": false
  }'
```

> Note the `id` returned in the response — you'll need it in the next steps.

For each line item in `items`, you can pass:

- `upload_id` (required): the upload row to use for case/product/shipping metadata
- `quantity` (optional, default `1`)
- `design_id` (optional): design to apply for this line item
- `design_name` (optional): alternative to `design_id`

If both `design_id` and `design_name` are provided, `design_id` is used.

---

## 2. Add Labels to an Order

### Upload a shipping label file

```bash
curl -X POST https://5060265239-api.nextbige.com/api/external/customer-orders/upload-shipping-label/ \
  -H "X-Customer-Api-Key: <API_KEY>" \
  -F "order_id=<order_id>" \
  -F "upload_label=@/path/to/label.pdf"
```

### List all labels for an order

```bash
curl -X GET "https://5060265239-api.nextbige.com/api/external/customer-orders/get-shipping-labels/?order_id=<order_id>" \
  -H "X-Customer-Api-Key: <API_KEY>"
```

## 3. Check Stock

### Get available categories

```bash
curl -X GET https://5060265239-api.nextbige.com/api/external/stock-status/categories/ \
  -H "X-Customer-Api-Key: <API_KEY>"
```

### Filter products by category and stock status

```bash
curl -X POST https://5060265239-api.nextbige.com/api/external/stock-status/filter_products/ \
  -H "X-Customer-Api-Key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "categories": ["Phone Cases", "Mugs"],
    "stock": "AVL"
  }'
```

> `stock` options: `All` · `AVL` (available) · `OOS` (out of stock)

### Check stock status for specific order items

```bash
curl -X POST "https://5060265239-api.nextbige.com/api/external/stock-status/check_stock_status/?orderType=Dropship POD&partialFulfillment=false" \
  -H "X-Customer-Api-Key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "sku": "SKU-001", "quantity": 2 },
      { "sku": "SKU-002", "quantity": 1 }
    ]
  }'
```

---

## 5. Request a Replacement

### List returned items (to find the return ID)

```bash
curl -X GET https://5060265239-api.nextbige.com/api/external/customer-returns/ \
  -H "X-Customer-Api-Key: <API_KEY>"
```

### View the uploaded photo for a return

```bash
curl -X GET https://5060265239-api.nextbige.com/api/external/customer-returns/<return_id>/uploaded-photo/ \
  -H "X-Customer-Api-Key: <API_KEY>" \
  -o return_photo.jpg
```

### Download the return label

```bash
curl -X GET https://5060265239-api.nextbige.com/api/external/customer-returns/<return_id>/return-label/ \
  -H "X-Customer-Api-Key: <API_KEY>" \
  -o return_label.pdf
```

### Create a replacement upload (using order_sub_type)

```bash
curl -X POST https://5060265239-api.nextbige.com/api/external/customer-uploads/ \
  -H "X-Customer-Api-Key: <API_KEY>" \
  -F "file=@/path/to/replacement_design.jpg" \
  -F "order_type=Dropship POD" \
  -F "order_sub_type=replacement" \
  -F "case_type_name=Soft Case" \
  -F "product_name=iPhone 15 Pro" \
  -F "order_id=<original_order_id>"
```

---

## 6. Upload a New Design (Vendor Image)

### Upload the design image

```bash
curl -X POST https://5060265239-api.nextbige.com/api/external/vendor-images/ \
  -H "X-Customer-Api-Key: <API_KEY>" \
  -F "image=@/path/to/new_design.png"
```

### List all uploaded designs

```bash
curl -X GET https://5060265239-api.nextbige.com/api/external/vendor-images/ \
  -H "X-Customer-Api-Key: <API_KEY>"
```

Use the returned design `id` in order creation (`items[].design_id`) or upload creation (`design_id` / `design_name`).

### Stream / preview the design image

```bash
curl -X GET https://5060265239-api.nextbige.com/api/external/vendor-images/<image_id>/render-image/ \
  -H "X-Customer-Api-Key: <API_KEY>" \
  -o preview_design.png
```

---

## Common Error Codes

| Code  | Meaning                                                         |
| ----- | --------------------------------------------------------------- |
| `401` | Missing or invalid `X-Customer-Api-Key`                         |
| `403` | Authenticated but not permitted (e.g. not in customer group)    |
| `404` | Resource not found or not owned by your account                 |
| `400` | Validation error — check the `error` field in the response body |
