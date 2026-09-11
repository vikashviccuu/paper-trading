# Soft Deletion & Audit Retention Architecture Plan

## Goal Description
Implement a universal **soft-deletion and status-based visibility system** across the entire application and database. No user, financial, portfolio, bank account, broker link, or contest data will ever be permanently deleted (`HARD DELETE`) from PostgreSQL. Instead, records are retained indefinitely with status indicators (`isDeleted: Boolean`, `deletedAt: DateTime?`, `isClosed: Boolean`, or lifecycle statuses like `CANCELLED`, `CLOSED`, `UNLINKED`), and queries will filter records to show or hide them dynamically in the UI.

---

## User Review Required

> [!IMPORTANT]
> **Database Schema Migration & Unique Constraints**:
> Several tables have composite unique constraints:
> 1. `BankAccount`: `@@unique([userId, accountNumber, ifsc])`
> 2. `BrokerLink`: `@@unique([userId, provider])`
> 3. `Holding`: `@@unique([userId, instrumentId])`
>
> When a user "deletes" or unlinks a record and later re-adds the same account or re-buys the same stock:
> - **Behavior**: The system will detect the existing soft-deleted/zero-quantity record and **reactivate / update** it (`isDeleted: false`, `deletedAt: null`, update details) rather than throwing a duplicate key error or creating an orphaned record.
> - **Data Safety**: Historical transactions, created dates, and audit trail records remain fully preserved.

---

## Open Questions

> [!NOTE]
> 1. **Admin Visibility of Soft-Deleted Data**: Should admins have a toggle on the Admin Dashboard to "Show Deleted/Closed Records" (e.g. view all historical bank accounts, unlinked brokers, or deactivated users)?
>    *(Default proposed: Yes, queries default to hiding deleted records for regular users, but admins can inspect audit logs).*
> 2. **Holding History**: When a user sells 100% of their shares in a stock holding, we retain the holding row with `quantity: 0` and `deletedAt: now()`. The Portfolio page will hide it from the active "Holdings" list, but it remains in the database and can be viewed in an "Archived / Past Holdings" view if desired.

---

## Proposed Changes

### 1. Database Schema (`backend/prisma/schema.prisma`)

#### [MODIFY] [schema.prisma](file:///d:/python-pron/paper-trading-platform/backend/prisma/schema.prisma)
Add soft-delete fields and status tracking to core models:
- **`User`**:
  ```prisma
  isDeleted Boolean   @default(false)
  deletedAt DateTime?
  ```
- **`BankAccount`**:
  ```prisma
  isDeleted Boolean   @default(false)
  deletedAt DateTime?
  ```
- **`BrokerLink`**:
  ```prisma
  isDeleted Boolean   @default(false)
  deletedAt DateTime?
  ```
- **`Holding`**:
  ```prisma
  isDeleted Boolean   @default(false)
  deletedAt DateTime?
  ```
- **`Position`**:
  ```prisma
  isClosed Boolean   @default(false)
  closedAt DateTime?
  ```
- **`ContestPosition` & `ContestHolding`**:
  ```prisma
  isClosed Boolean   @default(false)
  closedAt DateTime?
  isDeleted Boolean  @default(false)
  deletedAt DateTime?
  ```
- **`Contest`**:
  ```prisma
  isDeleted Boolean   @default(false)
  deletedAt DateTime?
  ```
- **`Watchlist`**:
  ```prisma
  isDeleted Boolean   @default(false)
  deletedAt DateTime?
  ```

---

### 2. Backend Services & Engines

#### [MODIFY] [PortfolioService.ts](file:///d:/python-pron/paper-trading-platform/backend/src/engine/PortfolioService.ts)
- Replace `prisma.holding.delete({ where: { id: existing.id } })` with:
  ```ts
  await prisma.holding.update({
    where: { id: existing.id },
    data: { quantity: 0, isDeleted: true, deletedAt: new Date() }
  });
  ```
- Update `applyHoldingFill` so if a user buys shares of a previously soft-deleted holding, it reactivates the record:
  ```ts
  data: { quantity: signedQty, avgPrice: fillPrice, isDeleted: false, deletedAt: null }
  ```
- Update active holding queries in `getPortfolioSnapshot` to filter `isDeleted: false` and `quantity > 0`.

#### [MODIFY] [ContestPortfolioService.ts](file:///d:/python-pron/paper-trading-platform/backend/src/engine/ContestPortfolioService.ts)
- Replace `prisma.contestPosition.delete` with `update({ data: { quantity: 0, isClosed: true, closedAt: new Date() } })`.
- Replace `prisma.contestHolding.delete` with `update({ data: { quantity: 0, isDeleted: true, deletedAt: new Date() } })`.
- Ensure reactivation on new orders.

#### [MODIFY] [SquareOffScheduler.ts](file:///d:/python-pron/paper-trading-platform/backend/src/jobs/SquareOffScheduler.ts)
- Replace `prisma.position.delete({ where: { id: pos.id } })` with:
  ```ts
  prisma.position.update({
    where: { id: pos.id },
    data: {
      quantity: 0,
      isClosed: true,
      closedAt: new Date(),
      marginBlocked: 0,
      realizedPnL: { increment: realizedPnL },
    }
  })
  ```
- Ensure query only picks up active open positions: `where: { productType: "INTRADAY", isClosed: false, quantity: { not: 0 } }`.

#### [MODIFY] [ContestEndService.ts](file:///d:/python-pron/paper-trading-platform/backend/src/engine/ContestEndService.ts)
- Replace `prisma.contestPosition.delete` and `prisma.contestHolding.delete` with soft-close updates (`quantity: 0`, `isClosed: true`, `closedAt: new Date()`, `isDeleted: true`).

#### [MODIFY] [BankAccountService.ts](file:///d:/python-pron/paper-trading-platform/backend/src/services/BankAccountService.ts)
- In `remove(userId, accountId)`:
  Replace `prisma.bankAccount.delete` with `prisma.bankAccount.update({ where: { id: accountId }, data: { isDeleted: true, deletedAt: new Date(), isPrimary: false } })`.
- In `list(userId)`:
  Query only non-deleted accounts: `where: { userId, isDeleted: false }`.
- In `add(userId, input)`:
  If a soft-deleted bank account with the same details already exists, reactivate and re-verify it instead of rejecting with conflict error.

#### [MODIFY] [BrokerLinkService.ts](file:///d:/python-pron/paper-trading-platform/backend/src/services/BrokerLinkService.ts)
- In `unlink(userId, linkId)`:
  Replace `prisma.brokerLink.delete` with `prisma.brokerLink.update({ where: { id: linkId }, data: { isDeleted: true, deletedAt: new Date(), accessToken: null, refreshToken: null } })`.
- In `link(userId, input)`:
  If an unlinked broker link exists, update and reactivate it (`isDeleted: false`, `deletedAt: null`, new tokens).
- Query methods (`list`, `findFirst`, `getForLiveTrading`):
  Filter `isDeleted: false`.

#### [MODIFY] [PrizeService.ts](file:///d:/python-pron/paper-trading-platform/backend/src/services/PrizeService.ts)
- Replace `contestPrizeSlab.deleteMany` with soft-archiving or slab versioning to keep full audit trail of prize pool configuration changes.

---

### 3. Frontend Views

#### [MODIFY] [Portfolio.tsx](file:///d:/python-pron/paper-trading-platform/frontend/src/pages/Portfolio.tsx)
- Active views display open positions (`quantity !== 0 && !isClosed`) and active holdings (`quantity > 0 && !isDeleted`).
- Closed positions table displays all squared-off intraday positions and closed holdings with their exact entry price, exit price, and realized profit/loss.

---

## Verification Plan

### Automated Tests & Typecheck
1. Run Prisma database migration on PostgreSQL:
   ```bash
   npx prisma db push # or migrate dev
   npx prisma generate
   ```
2. Run backend & frontend builds:
   ```bash
   npm run build # backend
   npm run build # frontend
   ```

### Manual Verification
1. **Bank Account Soft Deletion**:
   - Add a bank account on the profile page.
   - Click "Remove / Delete".
   - Confirm bank account disappears from UI (`isDeleted: true`).
   - Query PostgreSQL directly: verify the bank account record still exists with `isDeleted = true` and `deletedAt` set.
   - Re-add the same bank account: verify it reactivates without unique constraint violation.
2. **Broker Link Soft Deletion**:
   - Link a broker account.
   - Click "Unlink".
   - Confirm broker is marked unlinked in UI.
   - Query PostgreSQL directly: verify record still exists in `BrokerLink` table.
3. **Position & Holding Square-Off**:
   - Place an intraday trade, then click "Square Off".
   - Confirm record remains in database (`quantity = 0`, `isClosed = true`, `realizedPnL` computed).
   - Sell all shares of a delivery holding: confirm holding row remains in PostgreSQL with `quantity = 0` and `isDeleted = true`.
