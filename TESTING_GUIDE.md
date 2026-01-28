# Payment Testing Guide

## Step 1: Order Create Karein

### Endpoint: `POST /api/orders/checkout`

**Request Body Example:**
```json
{
  "customerName": "John Doe",
  "customerEmail": "john@example.com",
  "customerPhone": "1234567890",
  "customerAddress": "123 Main Street, Nairobi, Kenya",
  "deliveryMode": "home_delivery",
  "agencyId": "your-agency-uuid-here",
  "items": [
    {
      "productId": "your-product-uuid-here",
      "productName": "LPG Gas",
      "variantLabel": "14.2kg",
      "variantPrice": 1000,
      "quantity": 1
    }
  ],
  "paymentMethod": "pesapal",
  "couponCode": ""
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order": {
      "id": "order-uuid-here",
      "orderNumber": "ORD-123456-ABCDEF",
      "totalAmount": 1000,
      ...
    }
  }
}
```

**Important:** Response se `order.id` copy kar lo, payment ke liye zaroori hai.

---

## Step 2: Payment Initiate Karein (Different Countries)

### Endpoint: `POST /api/orders/payment`

### Kenya (KE) - Default
```json
{
  "orderId": "order-uuid-from-step-1",
  "countryCode": "KE"
}
```

### Uganda (UG)
```json
{
  "orderId": "order-uuid-from-step-1",
  "countryCode": "UG"
}
```

### Tanzania (TZ)
```json
{
  "orderId": "order-uuid-from-step-1",
  "countryCode": "TZ"
}
```

### Malawi (MW)
```json
{
  "orderId": "order-uuid-from-step-1",
  "countryCode": "MW"
}
```

### Rwanda (RW)
```json
{
  "orderId": "order-uuid-from-step-1",
  "countryCode": "RW"
}
```

### Zambia (ZM)
```json
{
  "orderId": "order-uuid-from-step-1",
  "countryCode": "ZM"
}
```

### Zimbabwe (ZW)
```json
{
  "orderId": "order-uuid-from-step-1",
  "countryCode": "ZW"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Pesapal Order Created Successfully",
  "order_tracking_id": "xxxxx-xxxxx-xxxxx",
  "redirect_url": "https://pay.pesapal.com/v3/xxxxx",
  "data": { ... }
}
```

---

## Step 3: Payment Status Check Karein

### Endpoint: `GET /api/orders/payment/status/:orderId`

**Example:**
```
GET /api/orders/payment/status/order-uuid-here
```

**Response:**
```json
{
  "success": true,
  "message": "Payment status retrieved successfully",
  "data": {
    "orderId": "...",
    "orderNumber": "...",
    "paymentStatus": "paid",
    "pesapalStatus": "COMPLETED",
    "pesapalData": { ... }
  }
}
```

---

## Postman/Thunder Client Testing

### Collection Setup:

1. **Create Order**
   - Method: `POST`
   - URL: `http://localhost:5000/api/orders/checkout`
   - Headers: `Content-Type: application/json`
   - Body: Order creation JSON (Step 1)

2. **Initiate Payment**
   - Method: `POST`
   - URL: `http://localhost:5000/api/orders/payment`
   - Headers: `Content-Type: application/json`
   - Body: Payment JSON with countryCode (Step 2)

3. **Check Payment Status**
   - Method: `GET`
   - URL: `http://localhost:5000/api/orders/payment/status/{orderId}`
   - Replace `{orderId}` with actual order ID

---

## cURL Commands (Terminal Testing)

### 1. Create Order
```bash
curl -X POST http://localhost:5000/api/orders/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "customerPhone": "1234567890",
    "customerAddress": "123 Main Street",
    "deliveryMode": "home_delivery",
    "agencyId": "your-agency-id",
    "items": [{
      "productId": "your-product-id",
      "productName": "LPG Gas",
      "variantLabel": "14.2kg",
      "variantPrice": 1000,
      "quantity": 1
    }],
    "paymentMethod": "pesapal"
  }'
```

### 2. Initiate Payment (Kenya)
```bash
curl -X POST http://localhost:5000/api/orders/payment \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order-id-from-step-1",
    "countryCode": "KE"
  }'
```

### 3. Check Payment Status
```bash
curl -X GET http://localhost:5000/api/orders/payment/status/order-id-here
```

---

## Database Check

Order create hone ke baad database mein check karein:

```sql
SELECT id, order_number, total_amount, payment_status, admin_notes 
FROM orders 
WHERE order_number = 'ORD-xxxxx';
```

`admin_notes` mein yeh dikhna chahiye:
- `Country Code: KE` (ya jo bhi country code use kiya)
- `Pesapal Tracking ID: xxxxx`

---

## Common Issues & Solutions

1. **Order not found**
   - Check karein ki order ID sahi hai
   - Order successfully create hua hai ya nahi

2. **Invalid credentials**
   - Country code sahi hai ya nahi (KE, UG, TZ, etc.)
   - `pesapalConfig.js` mein credentials sahi hain ya nahi

3. **Token generation failed**
   - Pesapal API accessible hai ya nahi
   - Network connection check karein

4. **Payment not processing**
   - `redirect_url` open karke payment complete karein
   - Callback URL sahi configure hai ya nahi

---

## Testing Checklist

- [ ] Order successfully create hua
- [ ] Order ID mil gaya
- [ ] Payment initiate hua (different countries ke liye)
- [ ] Redirect URL mila
- [ ] Payment complete kiya
- [ ] Callback received
- [ ] Payment status updated
- [ ] Order status changed to "confirmed"
- [ ] Notification sent to customer

