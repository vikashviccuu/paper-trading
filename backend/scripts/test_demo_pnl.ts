import { prisma } from "../src/utils/prisma";
import { orderEngine } from "../src/engine/OrderEngine";
import { portfolioService } from "../src/engine/PortfolioService";
import { env } from "../src/config/env";
import { getBrokerAdapter, resetBrokerAdapter } from "../src/brokers/BrokerFactory";
import { MockAdapter } from "../src/brokers/mock/MockAdapter";

async function run() {
  console.log("================================================================");
  console.log("🚀 COMPREHENSIVE DEMO DATA TEST: REALIZED P&L, POSITIONS & HOLDINGS");
  console.log("================================================================\n");

  // Force MOCK mode for demo testing
  (env as any).BROKER_PROVIDER = "MOCK";
  process.env.BROKER_PROVIDER = "MOCK";
  resetBrokerAdapter();

  const broker = getBrokerAdapter();
  const mockBroker = broker instanceof MockAdapter ? broker : null;

  // 1. User
  const user = await prisma.user.findFirst();
  if (!user) throw new Error("No user found");
  console.log(`👤 Active User: ${user.email} (${user.id})`);

  // Ensure clean starting wallet
  await portfolioService.getOrCreateWallet(user.id, 1000000);
  let wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  console.log(`💼 Baseline Wallet: Cash = ₹${Number(wallet?.cashBalance).toFixed(2)}, MarginUsed = ₹${Number(wallet?.marginUsed).toFixed(2)}, RealizedPnL = ₹${Number(wallet?.realizedPnL).toFixed(2)}`);

  // Instrument
  let instrument = await prisma.instrument.findFirst({ where: { tradingSymbol: "RELIANCE" } });
  if (!instrument) instrument = await prisma.instrument.findFirst();
  if (!instrument) throw new Error("No instrument found");
  console.log(`📈 Trading Instrument: ${instrument.tradingSymbol} (${instrument.instrumentToken}) [${instrument.exchange}:${instrument.segment}]\n`);

  // Clean prior positions/holdings for this instrument
  await prisma.position.deleteMany({ where: { userId: user.id, instrumentId: instrument.id } });
  await prisma.holding.deleteMany({ where: { userId: user.id, instrumentId: instrument.id } });

  // --------------------------------------------------------------------------
  // SCENARIO 1: INTRADAY PROFIT TRADE (BUY @ 1200, SELL @ 1250)
  // --------------------------------------------------------------------------
  console.log(">>> [SCENARIO 1]: INTRADAY MIS PROFIT TRADE (10 Qty)");
  let wBefore = await prisma.wallet.findUnique({ where: { userId: user.id } });
  const s1StartPnL = Number(wBefore?.realizedPnL);

  if (mockBroker) mockBroker.setPrice(instrument.instrumentToken, 1200);
  const buy1 = await orderEngine.placeOrder({
    userId: user.id,
    instrumentId: instrument.id,
    transactionType: "BUY",
    orderType: "MARKET",
    productType: "INTRADAY",
    quantity: 10,
  });
  console.log(`  1. BUY Order Filled: Qty=10, Price=₹${Number(buy1.filledPrice).toFixed(2)}`);

  let pos = await prisma.position.findFirst({ where: { userId: user.id, instrumentId: instrument.id, productType: "INTRADAY" } });
  console.log(`  ✓ Open Position: Qty=${pos?.quantity}, AvgPrice=₹${Number(pos?.avgPrice).toFixed(2)}`);

  // Price moves up in market
  if (mockBroker) mockBroker.setPrice(instrument.instrumentToken, 1250);
  console.log(`  ⚡ Market price moved from ₹1200 -> ₹1250`);

  const sell1 = await orderEngine.placeOrder({
    userId: user.id,
    instrumentId: instrument.id,
    transactionType: "SELL",
    orderType: "MARKET",
    productType: "INTRADAY",
    quantity: 10,
  });
  console.log(`  2. SELL Order Filled: Qty=10, Price=₹${Number(sell1.filledPrice).toFixed(2)}`);

  pos = await prisma.position.findFirst({ where: { userId: user.id, instrumentId: instrument.id, productType: "INTRADAY" } });
  console.log(`  ✓ Position after square-off: ${pos ? "STILL OPEN" : "CLOSED (Deleted from book)"}`);

  let wAfter = await prisma.wallet.findUnique({ where: { userId: user.id } });
  const s1PnLDelta = Number(wAfter?.realizedPnL) - s1StartPnL;
  const s1Expected = (1250 - 1200) * 10;
  console.log(`  💰 Realized P&L: ₹${s1PnLDelta.toFixed(2)} (Expected: +₹${s1Expected.toFixed(2)}) ${s1PnLDelta === s1Expected ? "✅ PASS" : "❌ FAIL"}\n`);

  // --------------------------------------------------------------------------
  // SCENARIO 2: INTRADAY MIS LOSS TRADE (BUY @ 1300, SELL @ 1260)
  // --------------------------------------------------------------------------
  console.log(">>> [SCENARIO 2]: INTRADAY MIS LOSS TRADE (10 Qty)");
  wBefore = await prisma.wallet.findUnique({ where: { userId: user.id } });
  const s2StartPnL = Number(wBefore?.realizedPnL);

  if (mockBroker) mockBroker.setPrice(instrument.instrumentToken, 1300);
  const buy2 = await orderEngine.placeOrder({
    userId: user.id,
    instrumentId: instrument.id,
    transactionType: "BUY",
    orderType: "MARKET",
    productType: "INTRADAY",
    quantity: 10,
  });
  console.log(`  1. BUY Order Filled: Qty=10, Price=₹${Number(buy2.filledPrice).toFixed(2)}`);

  if (mockBroker) mockBroker.setPrice(instrument.instrumentToken, 1260);
  console.log(`  ⚡ Market price dropped from ₹1300 -> ₹1260`);

  const sell2 = await orderEngine.placeOrder({
    userId: user.id,
    instrumentId: instrument.id,
    transactionType: "SELL",
    orderType: "MARKET",
    productType: "INTRADAY",
    quantity: 10,
  });
  console.log(`  2. SELL Order Filled: Qty=10, Price=₹${Number(sell2.filledPrice).toFixed(2)}`);

  wAfter = await prisma.wallet.findUnique({ where: { userId: user.id } });
  const s2PnLDelta = Number(wAfter?.realizedPnL) - s2StartPnL;
  const s2Expected = (1260 - 1300) * 10;
  console.log(`  💰 Realized P&L: ₹${s2PnLDelta.toFixed(2)} (Expected: -₹${Math.abs(s2Expected).toFixed(2)}) ${s2PnLDelta === s2Expected ? "✅ PASS" : "❌ FAIL"}\n`);

  // --------------------------------------------------------------------------
  // SCENARIO 3: DELIVERY HOLDING LIFECYCLE (CNC BUY @ 1500, CNC SELL @ 1580)
  // --------------------------------------------------------------------------
  console.log(">>> [SCENARIO 3]: DELIVERY CNC HOLDING LIFECYCLE (5 Qty)");
  wBefore = await prisma.wallet.findUnique({ where: { userId: user.id } });
  const s3StartPnL = Number(wBefore?.realizedPnL);

  if (mockBroker) mockBroker.setPrice(instrument.instrumentToken, 1500);
  const buyHold = await orderEngine.placeOrder({
    userId: user.id,
    instrumentId: instrument.id,
    transactionType: "BUY",
    orderType: "MARKET",
    productType: "DELIVERY",
    quantity: 5,
  });
  console.log(`  1. BUY Delivery Complete: Qty=5, Price=₹${Number(buyHold.filledPrice).toFixed(2)}`);

  let holding = await prisma.holding.findFirst({ where: { userId: user.id, instrumentId: instrument.id } });
  console.log(`  ✓ Holding in Portfolio: Qty=${holding?.quantity}, AvgPrice=₹${Number(holding?.avgPrice).toFixed(2)}`);

  if (mockBroker) mockBroker.setPrice(instrument.instrumentToken, 1580);
  console.log(`  ⚡ Market price moved from ₹1500 -> ₹1580`);

  const sellHold = await orderEngine.placeOrder({
    userId: user.id,
    instrumentId: instrument.id,
    transactionType: "SELL",
    orderType: "MARKET",
    productType: "DELIVERY",
    quantity: 5,
  });
  console.log(`  2. SELL Delivery Complete: Qty=5, Price=₹${Number(sellHold.filledPrice).toFixed(2)}`);

  holding = await prisma.holding.findFirst({ where: { userId: user.id, instrumentId: instrument.id } });
  console.log(`  ✓ Holding after exit: ${holding ? "STILL IN PORTFOLIO" : "REMOVED (Sold out)"}`);

  wAfter = await prisma.wallet.findUnique({ where: { userId: user.id } });
  const s3PnLDelta = Number(wAfter?.realizedPnL) - s3StartPnL;
  const s3Expected = (1580 - 1500) * 5;
  console.log(`  💰 Realized P&L: ₹${s3PnLDelta.toFixed(2)} (Expected: +₹${s3Expected.toFixed(2)}) ${s3PnLDelta === s3Expected ? "✅ PASS" : "❌ FAIL"}\n`);

  // --------------------------------------------------------------------------
  // SCENARIO 4: PARTIAL SQUARE OFF (BUY 20, SELL 10 @ +₹50, SELL 10 @ +₹20)
  // --------------------------------------------------------------------------
  console.log(">>> [SCENARIO 4]: PARTIAL POSITION SQUARE OFF (BUY 20, SELL 10, SELL 10)");
  wBefore = await prisma.wallet.findUnique({ where: { userId: user.id } });
  const s4StartPnL = Number(wBefore?.realizedPnL);

  if (mockBroker) mockBroker.setPrice(instrument.instrumentToken, 1000);
  await orderEngine.placeOrder({
    userId: user.id,
    instrumentId: instrument.id,
    transactionType: "BUY",
    orderType: "MARKET",
    productType: "INTRADAY",
    quantity: 20,
  });
  console.log(`  1. BUY 20 Qty @ ₹1000.00`);

  // Partial exit 10 Qty @ 1050
  if (mockBroker) mockBroker.setPrice(instrument.instrumentToken, 1050);
  await orderEngine.placeOrder({
    userId: user.id,
    instrumentId: instrument.id,
    transactionType: "SELL",
    orderType: "MARKET",
    productType: "INTRADAY",
    quantity: 10,
  });
  pos = await prisma.position.findFirst({ where: { userId: user.id, instrumentId: instrument.id, productType: "INTRADAY" } });
  console.log(`  2. SELL 10 Qty @ ₹1050.00 -> Remaining Position Qty=${pos?.quantity}, Recorded Position Realized P&L=₹${Number(pos?.realizedPnL).toFixed(2)}`);

  // Full exit remaining 10 Qty @ 1020
  if (mockBroker) mockBroker.setPrice(instrument.instrumentToken, 1020);
  await orderEngine.placeOrder({
    userId: user.id,
    instrumentId: instrument.id,
    transactionType: "SELL",
    orderType: "MARKET",
    productType: "INTRADAY",
    quantity: 10,
  });
  pos = await prisma.position.findFirst({ where: { userId: user.id, instrumentId: instrument.id, productType: "INTRADAY" } });
  console.log(`  3. SELL 10 Qty @ ₹1020.00 -> Remaining Position: ${pos ? "STILL OPEN" : "CLOSED"}`);

  wAfter = await prisma.wallet.findUnique({ where: { userId: user.id } });
  const s4PnLDelta = Number(wAfter?.realizedPnL) - s4StartPnL;
  const s4Expected = (1050 - 1000) * 10 + (1020 - 1000) * 10;
  console.log(`  💰 Realized P&L: ₹${s4PnLDelta.toFixed(2)} (Expected: +₹${s4Expected.toFixed(2)}) ${s4PnLDelta === s4Expected ? "✅ PASS" : "❌ FAIL"}\n`);

  console.log("================================================================");
  console.log("🏁 ALL SCENARIOS COMPLETED");
  console.log(`Final Cumulative User Realized P&L: ₹${Number(wAfter?.realizedPnL).toFixed(2)}`);
  console.log(`Final Available Cash: ₹${Number(wAfter?.cashBalance).toFixed(2)}`);
  console.log("================================================================");
}

run()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
