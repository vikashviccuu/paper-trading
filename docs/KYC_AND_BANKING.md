# Profile, KYC & Bank Verification

The profile page (`/profile`) has five sections: Personal Details, Address
Details, Communication Details, KYC Verification, and Bank Details. This
doc covers the last two, since they're the ones that talk to third-party
verification APIs.

## Architecture

Same adapter pattern as the broker layer
(`backend/src/brokers/IBrokerAdapter.ts`) and nothing new conceptually:
`backend/src/kyc/IKycProvider.ts` defines `verifyPan` and
`verifyBankAccount`; `SetuKycProvider`, `CashfreeKycProvider`, and
`MockKycProvider` implement it; `KycProviderFactory.getKycProvider()` picks
one based on `KYC_PROVIDER` in `.env`. Nothing else in the app imports a
concrete provider - `KycService` and `BankAccountService` only ever call
through the interface.

```
Profile page → KycService / BankAccountService → IKycProvider → Setu | Cashfree | Mock
```

## PAN verification (KYC section, step 1)

The user enters their PAN + name (+ optional DOB) and clicks "Verify PAN".
`KycService.verifyPan` calls `provider.verifyPan(...)`, stores the result
on the `Kyc` row (`panVerified`, `panVerificationProvider`,
`panVerificationRaw` for audit), and moves `Kyc.status` to
`DOCUMENTS_PENDING` on first success.

## Document upload (KYC section, step 2)

Six document types: PAN Card, Aadhaar (front/back), Address Proof, Bank
Proof, Photo. Uploaded via `POST /api/kyc/documents` (multipart,
`multer` - see `backend/src/middleware/upload.middleware.ts`), written to
`KYC_UPLOAD_DIR/<userId>/` on disk, JPEG/PNG/WebP/PDF only, capped at
`KYC_MAX_UPLOAD_MB` (default 5MB). Files are served back only through an
authenticated route (`GET /api/kyc/documents/:id/file`, owner or admin
only) - never as static public files.

## Submit for review (KYC section, step 3) → admin approval

There's no fully-automated identity verification here (that would require
Aadhaar eKYC with a licensed KUA/AUA relationship, which is a much heavier
regulatory lift than a PAN check or bank penny-drop). Instead, once PAN is
verified and PAN Card + Address Proof + Photo are uploaded, the user hits
"Submit for Review" (`POST /api/kyc/submit`), which moves `Kyc.status` to
`SUBMITTED`. An admin (see `docs/ADMIN.md` - same `Admin` accounts that
manage contests) reviews the documents and PAN result at `/admin/kyc` and
approves or rejects with a reason (`POST /api/admin/kyc/:userId/approve` /
`/reject`).

## Bank account verification (Bank Details section)

Adding a bank account (`POST /api/bank-accounts`) immediately triggers
online penny-drop verification - `BankAccountService.add` calls
`provider.verifyBankAccount(accountNumber, ifsc, accountHolderName)`,
which sends a nominal transfer through the banking network and reports
back the name actually registered on that account. The result
(`nameAtBank`, `nameMatchResult`: `MATCH` / `PARTIAL_MATCH` / `NO_MATCH`)
is stored and shown immediately - this is the "online verification of bank
details" requested for this section. A failed match can be retried
(`POST /api/bank-accounts/:id/verify`) after correcting the details; only
a `VERIFIED` account can be set as primary.

## Setu

**Docs:** https://docs.setu.co/data/pan/ and https://docs.setu.co/data/bav/
**What it covers:** PAN Verification (direct NSDL connection) and Bank
Account Verification - Penny Drop, among other KYC/data products.

### Getting credentials

1. Sign up at https://setu.co and go to the Bridge merchant console
   (bridge.setu.co).
2. Create product instances for **PAN Verification** and **BAV — Penny
   Drop** (Setu's console; each product instance gets its own
   `x-product-instance-id`).
3. Copy your `clientID` / `clientSecret` and each product's
   `product-instance-id` into `backend/.env`:
   ```
   KYC_PROVIDER=SETU
   SETU_CLIENT_ID=
   SETU_CLIENT_SECRET=
   SETU_PRODUCT_INSTANCE_ID=
   ```
4. Setu's docs site (docs.setu.co) is a JS-rendered interactive reference -
   **verify exact request/response field names there** before going live;
   `SetuKycProvider.ts` follows Setu's established auth convention
   (`x-client-id` / `x-client-secret` / `x-product-instance-id` headers,
   `dg-sandbox.setu.co` / `dg.setu.co` host split) and general response
   shape, but field names in a fast-moving API can drift from what's
   written here.

## Cashfree Verification Suite

**Docs:** https://www.cashfree.com/docs/api-reference/vrs
**What it covers:** PAN verification, Bank Account Verification (Penny
Drop, both classic account+IFSC and UPI VPA variants), plus Aadhaar,
Voter ID, Passport, GSTIN, and more if you want to extend this later.
**Pricing (as of Aug 2026):** roughly ₹3 per bank verification check,
600+ banks covered; contact Cashfree for current PAN verification pricing.

### Getting credentials

1. Sign up at https://merchant.cashfree.com and enable the **Verification
   Suite** product.
2. Go to Verification Suite → Developers → API Keys to get your
   `x-client-id` / `x-client-secret` (sandbox and production are separate
   key pairs).
3. Add to `backend/.env`:
   ```
   KYC_PROVIDER=CASHFREE
   CASHFREE_CLIENT_ID=
   CASHFREE_CLIENT_SECRET=
   ```
4. Every Cashfree Verification Suite call requires an explicit `user_consent`
   object (`obtained: true`, `type: "EXPLICIT"`, a `timestamp` within 5
   minutes of the request, and a `purpose` string) - `CashfreeKycProvider.ts`
   builds this automatically, but it means you must actually have the
   user's consent before calling verifyPan/verifyBankAccount, not just
   technically satisfy the field.
5. Confirmed directly against Cashfree's published OpenAPI spec: base URLs
   are `sandbox.cashfree.com/verification` (sandbox) and
   `api.cashfree.com/verification` (production), and every request needs an
   `x-api-version` date header (`2024-12-01` is hardcoded here as a
   reasonable default - bump it if Cashfree ships a newer version you want).

## Running without any provider account (MOCK mode)

`KYC_PROVIDER=MOCK` (the default) uses `MockKycProvider.ts`, which
validates PAN/IFSC format locally and always "succeeds" for well-formed
input - no third-party account needed to exercise the whole profile → KYC
→ bank verification → admin approval flow end to end.

## Security notes

This is a demo project's data-handling posture, not a production-ready
one. Before handling real PAN numbers, real bank account numbers, or real
identity documents:

- **Encrypt sensitive fields at rest.** `BankAccount.accountNumber` and
  `Kyc.panNumber` are stored in plaintext in this schema. Use
  column-level/application-level encryption (or a vault/tokenization
  service) in production.
- **Move document storage off local disk.** `KYC_UPLOAD_DIR` is a local
  folder here for simplicity. Use a private S3/GCS bucket with signed URLs,
  encryption at rest, and a retention/deletion policy.
- **Redact provider raw responses before logging.** `panVerificationRaw` /
  `verificationRaw` are stored for audit but contain PII - restrict who can
  query these columns and never log them in plaintext application logs.
- **DPDP Act, 2023 (India's data protection law) applies** to PAN,
  Aadhaar-adjacent documents, and bank details as personal/financial data -
  you need a real consent flow, a documented lawful basis, a data
  retention policy, and breach-notification readiness before processing
  real users' data this way.
- **Rate-limit and audit-log every verification and admin-approval call** -
  these endpoints are natural targets for enumeration/abuse (e.g.
  hammering PAN verification to test stolen numbers).
