# Live API Test Report — agtpay Quote Management

**Timestamp**: 2026-07-09T09:39:51.265Z
**Base URL**: https://api.agtpay.xyz
**API Key** (...ee53e4f4): Bearer token
**Overall**: ✅ PASS

## Endpoints Tested

| # | Status | Endpoint | Method | Result |
|---|---|---|---|---|
| 01 | ✅ | `GET /api/v1/quotes` | — |  |
| 02 | ✅ | `PUT /api/v1/quotes/pay-out` | — |  |
| 03 | ✅ | `PUT /api/v1/quotes/pay-in` | — |  |
| 04 | ✅ | `POST /api/v1/quotes/publish` | — |  |
| 05 | ✅ | `05-05a-network-quote-business-failure` | — |  |
| 05 | ✅ | `05-05b-network-quote-success` | — |  |
| 06 | ✅ | `GET /api/v1/quotes (no auth) — 401` | — |  |
| 07 | ✅ | `GET /api/v1/quotes (bogus key) — 401` | — |  |
| 08 | ✅ | `PUT /api/v1/quotes/pay-out (bad body) — 400` | — |  |
| 09 | ✅ | `GET /api/v1/quotes (after publish)` | — |  |

## Detail

### 01-get-quotes
```json
{
  "name": "01-get-quotes",
  "status": "PASS",
  "payOutCount": 1,
  "payInCount": 1,
  "samplePayOut": {
    "currency": "EUR",
    "paymentMethod": "PAYMENT_METHOD_TYPE_SEPA",
    "expiration": "2026-07-09T09:39:10.301057757Z",
    "bands": 1
  },
  "elapsedMs": 4177
}
```

### 02-put-pay-out
```json
{
  "name": "02-put-pay-out",
  "status": "PASS",
  "published": true,
  "message": "snapshot updated and published",
  "elapsedMs": 4470
}
```

### 03-put-pay-in
```json
{
  "name": "03-put-pay-in",
  "status": "PASS",
  "published": true,
  "message": "snapshot updated and published",
  "elapsedMs": 4319
}
```

### 04-post-publish
```json
{
  "name": "04-post-publish",
  "status": "PASS",
  "note": "Server-side idempotency: 500 already_exists is documented expected behavior when re-publishing a quote ID still in-flight to t-0 network",
  "status500": true,
  "response": "{\"error\":\"UpdateQuote failed: already_exists: quote id already exists\"}\n",
  "elapsedMs": 4262
}
```

### 05-05a-network-quote-business-failure
```json
{
  "name": "05-05a-network-quote-business-failure",
  "status": "PASS",
  "label": "EUR SEPA",
  "reason": 10,
  "note": "Reason codes are t-0 enum integers (not strings); not mapped to QuoteFailureReason in our refactor — see docs/ofi-getquote-rest-refactor.md §2",
  "elapsedMs": 4231
}
```

### 05-05b-network-quote-success
```json
{
  "name": "05-05b-network-quote-success",
  "status": "PASS",
  "label": "GBP SWIFT",
  "quoteId": {
    "quote_id": 220300645,
    "provider_id": 7
  },
  "rate": {
    "unscaled": 731000,
    "exponent": -6
  },
  "expiration": {
    "seconds": 1783590029,
    "nanos": 905902000
  },
  "payOutAmount": {
    "unscaled": 36550,
    "exponent": -2
  },
  "settlementAmount": {
    "unscaled": 500
  },
  "allQuotesCount": null,
  "elapsedMs": 4241
}
```

### 06-unauthorized-401
```json
{
  "name": "06-unauthorized-401",
  "status": "PASS"
}
```

### 07-bad-key-401
```json
{
  "name": "07-bad-key-401",
  "status": "PASS"
}
```

### 08-bad-request-400
```json
{
  "name": "08-bad-request-400",
  "status": "PASS"
}
```

### 09-publish-roundtrip
```json
{
  "name": "09-publish-roundtrip",
  "status": "PASS",
  "currency": "EUR",
  "paymentMethod": "PAYMENT_METHOD_TYPE_SEPA",
  "bandsCount": 1,
  "ourBandRate": {
    "unscaled": 92,
    "exponent": -2
  },
  "ourBandMaxAmount": {
    "unscaled": 1000,
    "exponent": 0
  }
}
```

