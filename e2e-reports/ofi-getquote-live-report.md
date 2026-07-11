# Live OFI Get Quote Report (post wire-format fix)

**Timestamp**: 2026-07-09T09:38:37.819Z
**Base URL**: https://api.agtpay.xyz
**API Key** (...ee53e4f4): Bearer token
**Overall**: ✅ PASS

## Live call results (HttpOfiT0Client wire-format parser)

| # | Status | Step |
|---|---|---|
| 1 | ✅ | `01-gbp-swift-success` |
| 2 | ✅ | `02-gbp-swift-fresh-quote-id` |
| 3 | ✅ | `03-eur-sepa-no-quote` |
| 4 | ✅ | `04-gbp-unknown-method-handled` |
| 5 | ✅ | `05-gbp-swift-large` |

## Detail

### 01-gbp-swift-success
```json
{
  "name": "01-gbp-swift-success",
  "status": "PASS",
  "quoteId": "7-220299073",
  "rate": 0.742,
  "payOutAmount": 371,
  "settlementAmount": 500,
  "ttlMs": 58810
}
```

### 02-gbp-swift-fresh-quote-id
```json
{
  "name": "02-gbp-swift-fresh-quote-id",
  "status": "PASS",
  "firstId": "7-220299073",
  "secondId": "7-220299193"
}
```

### 03-eur-sepa-no-quote
```json
{
  "name": "03-eur-sepa-no-quote",
  "status": "PASS",
  "reason": "NO_QUOTE"
}
```

### 04-gbp-unknown-method-handled
```json
{
  "name": "04-gbp-unknown-method-handled",
  "status": "PASS",
  "failure": {
    "reason": "BAD_REQUEST",
    "message": "{\"error\":\"invalid payOutMethod\"}\n"
  }
}
```

### 05-gbp-swift-large
```json
{
  "name": "05-gbp-swift-large",
  "status": "PASS",
  "rate": 0.731,
  "payOutAmount": 731
}
```

