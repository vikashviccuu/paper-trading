# Universal Soft-Deletion & Status-Based Retention Walkthrough

## Summary of Completed Work

In response to the requirement that **no data or single piece of information is ever deleted from the entire application, and data visibility is strictly maintained via status**, universal soft deletion and lifecycle status retention have been implemented and deployed across the full stack.

---

### 1. Database Schema Changes (`backend/prisma/schema.prisma`)
The following models now contain explicit soft-deletion / soft-closure columns in PostgreSQL:
- **`Position`**: `isClosed Boolean @default(false)`, `closedAt DateTime?`
- **`Holding`**: `isDeleted Boolean @default(false)`, `deletedAt DateTime?`
- **`BankAccount`**: `isDeleted Boolean @default(false)`, `deletedAt DateTime?`
- **`BrokerLink`**: `isDeleted Boolean @default(false)`, `deletedAt DateTime?`
- **`User`**: `isDeleted Boolean @default(false)`, `deletedAt DateTime?`
- **`Contest`**: `isDeleted Boolean @default(false)`, `deletedAt DateTime?`
- **`ContestPosition`**: `isClosed Boolean @default(false)`, `closedAt DateTime?`
- **`ContestHolding`**: `isDeleted Boolean @default(false)`, `deletedAt DateTime?`
- **`ContestPrizeSlab`**: `isDeleted Boolean @default(false)`, `deletedAt DateTime?`
- **`Watchlist`**: `isDeleted Boolean @default(false)`, `deletedAt DateTime?`

---

### 2. Elimination of Hard Deletions Across All Services

| Component | Previous Behavior (Hard Delete) | New Behavior (Soft Delete / Status Retention) |
|---|---|---|
| **`PortfolioService.ts`** (`applyHoldingFill`) | Deleted holding (`prisma.holding.delete`) when all shares sold | Updates holding to `quantity: 0, isDeleted: true, deletedAt: new Date()` |
| **`PortfolioService.ts`** (`applyFill`) | Deleted position on square-off | Sets `quantity: 0, isClosed: true, closedAt: new Date()`, preserves `realizedPnL` |
| **`SquareOffScheduler.ts`** | Deleted intraday position on 15:20 auto-square-off | Sets `quantity: 0, marginBlocked: 0, isClosed: true, closedAt: new Date(), realizedPnL` |
| **`ContestPortfolioService.ts`** | Deleted contest position & holding when quantity reached 0 | Soft-closes with `quantity: 0, isClosed: true, isDeleted: true`, preserves audit trail |
| **`ContestEndService.ts`** | Deleted contest positions & holdings on contest close | Updates to `quantity: 0, isClosed: true, isDeleted: true` with realized profit/loss |
| **`BankAccountService.ts`** | Deleted bank account record from DB | Soft deletes via `isDeleted: true, deletedAt: new Date(), isPrimary: false`. Reactivates if re-added |
| **`BrokerLinkService.ts`** | Deleted broker link row from DB | Soft deletes via `isDeleted: true, deletedAt: new Date()`, clears active tokens. Reactivates if re-linked |
| **`PrizeService.ts`** | `contestPrizeSlab.deleteMany` on slab updates | Updates previous slabs to `isDeleted: true, deletedAt: new Date()` to preserve history |

---

### 3. Visibility Management in Frontend & API
- **Portfolio Active Views**:
  - Open Positions query: filters `quantity !== 0 && !isClosed`
  - Active Holdings query: filters `quantity > 0 && !isDeleted`
  - Closed Positions view: displays all squared-off positions and their booked Realized P&L
- **Bank Accounts**:
  - Active list endpoint filters `isDeleted: false`
- **Broker Links**:
  - Active list endpoint filters `isDeleted: false`

---

### 4. Verification on Remote Production Server (`187.127.178.25`)
1. **Schema Migration Executed**:
   ```sql
   -- Verified on Postgres:
   Table "Position": isClosed (boolean, default false), closedAt (timestamp)
   Table "Holding": isDeleted (boolean, default false), deletedAt (timestamp)
   Table "BankAccount": isDeleted (boolean, default false), deletedAt (timestamp)
   Table "BrokerLink": isDeleted (boolean, default false), deletedAt (timestamp)
   Table "User": isDeleted (boolean, default false), deletedAt (timestamp)
   Table "Contest": isDeleted (boolean, default false), deletedAt (timestamp)
   ```
2. **Container Status**:
   - `paper-trading-platform-backend-1`: Up (Port 4000)
   - `paper-trading-platform-frontend-1`: Up (Port 5173 / Nginx)
   - `paper-trading-platform-postgres-1`: Up (Port 5433 -> 5432)
   - `paper-trading-platform-redis-1`: Up (Port 6379)
