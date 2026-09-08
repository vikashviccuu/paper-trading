-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('EQUITY', 'FUTURES', 'OPTIONS');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('INTRADAY', 'DELIVERY', 'NORMAL');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT', 'SL', 'SL_M');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'OPEN', 'COMPLETE', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OptionType" AS ENUM ('CE', 'PE');

-- CreateEnum
CREATE TYPE "ContestStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContestDurationType" AS ENUM ('WEEKLY', 'MONTHLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'DOCUMENTS_PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('PAN_CARD', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'ADDRESS_PROOF', 'BANK_PROOF', 'PHOTO');

-- CreateEnum
CREATE TYPE "KycDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BankVerificationStatus" AS ENUM ('NOT_VERIFIED', 'PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('PHONE_VERIFICATION', 'LIVE_ORDER_2FA');

-- CreateEnum
CREATE TYPE "LiveTradingStatus" AS ENUM ('NOT_ELIGIBLE', 'ELIGIBLE', 'ENABLED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "LiveOrderStatus" AS ENUM ('PENDING_SUBMISSION', 'SUBMITTED', 'OPEN', 'PARTIALLY_FILLED', 'COMPLETE', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayoutPreference" AS ENUM ('CASH_WITHDRAWAL', 'PROP_TRADING');

-- CreateEnum
CREATE TYPE "PrizePayoutStatus" AS ENUM ('PENDING_KYC', 'PENDING_BANK', 'READY', 'PROCESSING', 'PAID', 'CREDITED_TO_WALLET', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "nickname" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cashBalance" DECIMAL(18,2) NOT NULL DEFAULT 1000000,
    "marginUsed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "realizedPnL" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "tradingSymbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "segment" "Segment" NOT NULL,
    "instrumentToken" TEXT NOT NULL,
    "name" TEXT,
    "lotSize" INTEGER NOT NULL DEFAULT 1,
    "tickSize" DECIMAL(10,4) NOT NULL DEFAULT 0.05,
    "expiry" TIMESTAMP(3),
    "strike" DECIMAL(18,2),
    "optionType" "OptionType",
    "lastPrice" DECIMAL(18,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contestParticipantId" TEXT,
    "instrumentId" TEXT NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "productType" "ProductType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(18,2),
    "triggerPrice" DECIMAL(18,2),
    "filledPrice" DECIMAL(18,2),
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "targetPrice" DECIMAL(18,2),
    "stopLossPrice" DECIMAL(18,2),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "avgPrice" DECIMAL(18,2) NOT NULL,
    "realizedPnL" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "marginBlocked" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "avgPrice" DECIMAL(18,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Watchlist',
    "symbols" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationType" "ContestDurationType" NOT NULL DEFAULT 'CUSTOM',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "startingVirtualCash" DECIMAL(18,2) NOT NULL DEFAULT 100000,
    "maxParticipants" INTEGER,
    "status" "ContestStatus" NOT NULL DEFAULT 'UPCOMING',
    "returnWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "riskWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "squaredOffAt" TIMESTAMP(3),
    "totalPrizePool" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "prizesComputedAt" TIMESTAMP(3),

    CONSTRAINT "Contest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestParticipant" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cashBalance" DECIMAL(18,2) NOT NULL,
    "marginUsed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "realizedPnL" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rank" INTEGER,
    "returnPct" DOUBLE PRECISION,
    "riskScore" DOUBLE PRECISION,
    "maxDrawdownPct" DOUBLE PRECISION,
    "compositeScore" DOUBLE PRECISION,
    "lastScoredAt" TIMESTAMP(3),

    CONSTRAINT "ContestParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestPosition" (
    "id" TEXT NOT NULL,
    "contestParticipantId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "avgPrice" DECIMAL(18,2) NOT NULL,
    "realizedPnL" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "marginBlocked" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContestPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestHolding" (
    "id" TEXT NOT NULL,
    "contestParticipantId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "avgPrice" DECIMAL(18,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContestHolding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestPortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "contestParticipantId" TEXT NOT NULL,
    "nav" DECIMAL(18,2) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestPortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestPrizeSlab" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "rankFrom" INTEGER NOT NULL,
    "rankTo" INTEGER NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ContestPrizeSlab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestPrizeAward" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "contestParticipantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "tdsRatePct" DOUBLE PRECISION NOT NULL,
    "tdsAmount" DECIMAL(18,2) NOT NULL,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "payoutPreference" "PayoutPreference" NOT NULL,
    "payoutStatus" "PrizePayoutStatus" NOT NULL DEFAULT 'PENDING_KYC',
    "blockedReason" TEXT,
    "payoutBankAccountId" TEXT,
    "payoutAccountLast4" TEXT,
    "payoutIfsc" TEXT,
    "payoutProvider" TEXT,
    "payoutRaw" JSONB,
    "releasedByAdminId" TEXT,
    "paidAt" TIMESTAMP(3),
    "unlockedLiveTradingEligibility" BOOLEAN NOT NULL DEFAULT false,
    "liveTradingEligibilityGrantedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContestPrizeAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveTradingAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "LiveTradingStatus" NOT NULL DEFAULT 'NOT_ELIGIBLE',
    "eligibleSince" TIMESTAMP(3),
    "enabledAt" TIMESTAMP(3),
    "brokerLinkId" TEXT,
    "dailyOrderLimit" INTEGER NOT NULL DEFAULT 50,
    "maxOrderValue" DECIMAL(18,2) NOT NULL DEFAULT 50000,
    "killSwitchActive" BOOLEAN NOT NULL DEFAULT false,
    "suspendedByAdminId" TEXT,
    "suspendedReason" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveTradingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerLinkId" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "tradingSymbol" TEXT NOT NULL,
    "instrumentToken" TEXT,
    "transactionType" "TransactionType" NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "productType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(18,2),
    "triggerPrice" DECIMAL(18,2),
    "brokerOrderId" TEXT,
    "status" "LiveOrderStatus" NOT NULL DEFAULT 'PENDING_SUBMISSION',
    "filledQuantity" INTEGER NOT NULL DEFAULT 0,
    "averageFillPrice" DECIMAL(18,2),
    "rejectionReason" TEXT,
    "algoId" TEXT,
    "twoFactorVerifiedAt" TIMESTAMP(3),
    "rawRequest" JSONB NOT NULL,
    "rawResponse" JSONB,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveOrderEvent" (
    "id" TEXT NOT NULL,
    "liveOrderId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender",
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "phone" TEXT,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "alternateEmail" TEXT,
    "payoutPreference" "PayoutPreference" NOT NULL DEFAULT 'CASH_WITHDRAWAL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kyc" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "panNumber" TEXT,
    "panVerified" BOOLEAN NOT NULL DEFAULT false,
    "panVerifiedAt" TIMESTAMP(3),
    "panVerificationProvider" TEXT,
    "panVerificationRaw" JSONB,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,
    "rejectionReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kyc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycDocument" (
    "id" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "type" "KycDocumentType" NOT NULL,
    "filePath" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" "KycDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "bankName" TEXT,
    "branch" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "BankVerificationStatus" NOT NULL DEFAULT 'NOT_VERIFIED',
    "verificationProvider" TEXT,
    "verificationRaw" JSONB,
    "nameAtBank" TEXT,
    "nameMatchResult" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "target" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerLink_userId_provider_key" ON "BrokerLink"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_instrumentToken_key" ON "Instrument"("instrumentToken");

-- CreateIndex
CREATE INDEX "Instrument_tradingSymbol_idx" ON "Instrument"("tradingSymbol");

-- CreateIndex
CREATE INDEX "Instrument_segment_idx" ON "Instrument"("segment");

-- CreateIndex
CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");

-- CreateIndex
CREATE INDEX "Order_contestParticipantId_status_idx" ON "Order"("contestParticipantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Position_userId_instrumentId_productType_key" ON "Position"("userId", "instrumentId", "productType");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_userId_instrumentId_key" ON "Holding"("userId", "instrumentId");

-- CreateIndex
CREATE INDEX "Contest_status_idx" ON "Contest"("status");

-- CreateIndex
CREATE INDEX "ContestParticipant_contestId_compositeScore_idx" ON "ContestParticipant"("contestId", "compositeScore");

-- CreateIndex
CREATE UNIQUE INDEX "ContestParticipant_contestId_userId_key" ON "ContestParticipant"("contestId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestPosition_contestParticipantId_instrumentId_productTy_key" ON "ContestPosition"("contestParticipantId", "instrumentId", "productType");

-- CreateIndex
CREATE UNIQUE INDEX "ContestHolding_contestParticipantId_instrumentId_key" ON "ContestHolding"("contestParticipantId", "instrumentId");

-- CreateIndex
CREATE INDEX "ContestPortfolioSnapshot_contestParticipantId_timestamp_idx" ON "ContestPortfolioSnapshot"("contestParticipantId", "timestamp");

-- CreateIndex
CREATE INDEX "ContestPrizeSlab_contestId_idx" ON "ContestPrizeSlab"("contestId");

-- CreateIndex
CREATE INDEX "ContestPrizeAward_contestId_payoutStatus_idx" ON "ContestPrizeAward"("contestId", "payoutStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ContestPrizeAward_contestId_userId_key" ON "ContestPrizeAward"("contestId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveTradingAccount_userId_key" ON "LiveTradingAccount"("userId");

-- CreateIndex
CREATE INDEX "LiveOrder_userId_status_idx" ON "LiveOrder"("userId", "status");

-- CreateIndex
CREATE INDEX "LiveOrder_brokerLinkId_idx" ON "LiveOrder"("brokerLinkId");

-- CreateIndex
CREATE INDEX "LiveOrderEvent_liveOrderId_occurredAt_idx" ON "LiveOrderEvent"("liveOrderId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Kyc_userId_key" ON "Kyc"("userId");

-- CreateIndex
CREATE INDEX "KycDocument_kycId_idx" ON "KycDocument"("kycId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_userId_accountNumber_ifsc_key" ON "BankAccount"("userId", "accountNumber", "ifsc");

-- CreateIndex
CREATE INDEX "OtpVerification_userId_purpose_idx" ON "OtpVerification"("userId", "purpose");

-- AddForeignKey
ALTER TABLE "BrokerLink" ADD CONSTRAINT "BrokerLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_contestParticipantId_fkey" FOREIGN KEY ("contestParticipantId") REFERENCES "ContestParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contest" ADD CONSTRAINT "Contest_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestParticipant" ADD CONSTRAINT "ContestParticipant_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestParticipant" ADD CONSTRAINT "ContestParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestPosition" ADD CONSTRAINT "ContestPosition_contestParticipantId_fkey" FOREIGN KEY ("contestParticipantId") REFERENCES "ContestParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestPosition" ADD CONSTRAINT "ContestPosition_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestHolding" ADD CONSTRAINT "ContestHolding_contestParticipantId_fkey" FOREIGN KEY ("contestParticipantId") REFERENCES "ContestParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestHolding" ADD CONSTRAINT "ContestHolding_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestPortfolioSnapshot" ADD CONSTRAINT "ContestPortfolioSnapshot_contestParticipantId_fkey" FOREIGN KEY ("contestParticipantId") REFERENCES "ContestParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestPrizeSlab" ADD CONSTRAINT "ContestPrizeSlab_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestPrizeAward" ADD CONSTRAINT "ContestPrizeAward_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestPrizeAward" ADD CONSTRAINT "ContestPrizeAward_contestParticipantId_fkey" FOREIGN KEY ("contestParticipantId") REFERENCES "ContestParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestPrizeAward" ADD CONSTRAINT "ContestPrizeAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestPrizeAward" ADD CONSTRAINT "ContestPrizeAward_releasedByAdminId_fkey" FOREIGN KEY ("releasedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveTradingAccount" ADD CONSTRAINT "LiveTradingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveTradingAccount" ADD CONSTRAINT "LiveTradingAccount_brokerLinkId_fkey" FOREIGN KEY ("brokerLinkId") REFERENCES "BrokerLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveTradingAccount" ADD CONSTRAINT "LiveTradingAccount_suspendedByAdminId_fkey" FOREIGN KEY ("suspendedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveOrder" ADD CONSTRAINT "LiveOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveOrder" ADD CONSTRAINT "LiveOrder_brokerLinkId_fkey" FOREIGN KEY ("brokerLinkId") REFERENCES "BrokerLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveOrderEvent" ADD CONSTRAINT "LiveOrderEvent_liveOrderId_fkey" FOREIGN KEY ("liveOrderId") REFERENCES "LiveOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kyc" ADD CONSTRAINT "Kyc_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kyc" ADD CONSTRAINT "Kyc_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "Kyc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpVerification" ADD CONSTRAINT "OtpVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
