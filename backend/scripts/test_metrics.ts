import { volatilityPct, maxDrawdown, round2, round3 } from "../src/engine/LeaderboardService";

function testScenarios() {
  console.log("=== Testing Leaderboard Metric Formulations ===");

  // Scenario 1: Newly joined, par equity curve (100,000)
  const parSeries = [100000, 100000];
  const rPar = volatilityPct(parSeries);
  const mddPar = maxDrawdown(parSeries);
  console.log("Scenario 1 (Par / No Trades):", {
    volatility: rPar,
    mddPct: mddPar * 100,
    expected: "Volatility: 0, MDD: 0"
  });

  // Scenario 2: Single trade with 5% gain (100,000 -> 105,000)
  const gain1Series = [100000, 105000];
  const rGain1 = volatilityPct(gain1Series);
  const mddGain1 = maxDrawdown(gain1Series);
  const comp1 = round3(0.6 * 5.0 - 0.4 * rGain1);
  console.log("Scenario 2 (Single 5% Gain):", {
    returnPct: 5.0,
    volatility: rGain1,
    mddPct: mddGain1 * 100,
    compositeScore: comp1,
  });

  // Scenario 3: Volatile equity curve with pullback (100k -> 97k -> 106k -> 102k -> 110k)
  const volSeries = [100000, 97000, 106000, 102000, 110000];
  const rVol = round2(volatilityPct(volSeries));
  const mddVol = round2(maxDrawdown(volSeries) * 100);
  const retVol = round2(((110000 - 100000) / 100000) * 100);
  const compVol = round3(0.6 * retVol - 0.4 * rVol);
  console.log("Scenario 3 (Multi-step with Drawdown):", {
    returnPct: retVol,
    volatilityPct: rVol,
    maxDrawdownPct: mddVol,
    compositeScore: compVol,
  });

  console.log("=== All Metric Formula Checks Complete ===");
}

testScenarios();
