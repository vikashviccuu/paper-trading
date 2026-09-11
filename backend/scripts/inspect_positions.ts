import { prisma } from "../src/utils/prisma";

async function main() {
  const users = await prisma.user.findMany();
  for (const user of users) {
    console.log(`\n=== User: ${user.email} (${user.id}) ===`);
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    console.log("Wallet:", wallet);
    const positions = await prisma.position.findMany({ where: { userId: user.id }, include: { instrument: true } });
    console.log("Positions:", positions.map(p => ({
      sym: p.instrument.tradingSymbol,
      prod: p.productType,
      qty: p.quantity,
      avg: p.avgPrice,
      realizedPnL: p.realizedPnL,
    })));
    const holdings = await prisma.holding.findMany({ where: { userId: user.id }, include: { instrument: true } });
    console.log("Holdings:", holdings.map(h => ({
      sym: h.instrument.tradingSymbol,
      qty: h.quantity,
      avg: h.avgPrice,
    })));
  }
}

main().finally(() => prisma.$disconnect());
