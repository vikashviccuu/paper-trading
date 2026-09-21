import { useEffect, useState, useRef, FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams, Link } from "react-router-dom";
import { createChart, IChartApi, ISeriesApi, CandlestickData } from "lightweight-charts";
import { Instrument, MarketAPI, OrdersAPI, PortfolioAPI, OptionsAPI, api, FullMarketQuote } from "../services/api";
import { getSocket, Tick } from "../services/socket";
import { useTheme } from "../store/ThemeContext";
import ThemeSelector from "../components/ThemeSelector";

const DEFAULT_INDICES = [
  { label: "NIFTY 50",  token: "256265" },
  { label: "BANKNIFTY", token: "260105" },
  { label: "FINNIFTY",  token: "257801" },
  { label: "INDIA VIX", token: "264969" },
  { label: "MIDCAP",    token: "288009" },
];

// ── Ticker bar ───────────────────────────────────────────────
function TickerBar({ marketStatus }: { marketStatus?: { isOpen: boolean; currentIstTime?: string } | null }) {
  const [indices, setIndices] = useState<Array<{ label: string; token: string; tradingSymbol?: string }>>(DEFAULT_INDICES);
  const [prices, setPrices] = useState<Record<string, { ltp: number; close: number; chg: number; pct: number }>>({});

  useEffect(() => {
    MarketAPI.indices()
      .then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setIndices(res.data.map((d) => ({ label: d.label, token: d.token, tradingSymbol: d.tradingSymbol })));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const tokens = indices.map((i) => i.token);
    MarketAPI.quote(tokens)
      .then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setPrices((prev) => {
            const next = { ...prev };
            for (const q of res.data) {
              if (q && q.instrumentToken) {
                const ltp = Number(q.lastPrice || 0);
                const close = Number((q as any).closePrice || q.close || ltp);
                const chg = Number(((q as any).netChange ?? (ltp - close)).toFixed(2));
                const pct = close > 0 ? Number(((q as any).changePercent ?? ((chg / close) * 100)).toFixed(2)) : 0;
                next[q.instrumentToken] = { ltp, close, chg, pct };
              }
            }
            return next;
          });
        }
      })
      .catch(() => {});

    // Subscribe to WebSocket ticks for real-time live updates
    const s = getSocket();
    s.emit("subscribe", tokens);
    const onTick = (t: Tick) =>
      setPrices((p) => {
        const existing = p[t.instrumentToken];
        const close = t.close ?? (t as any).closePrice ?? existing?.close ?? t.lastPrice;
        const chg = Number((t.lastPrice - close).toFixed(2));
        const pct = close > 0 ? Number(((chg / close) * 100).toFixed(2)) : 0;
        return {
          ...p,
          [t.instrumentToken]: {
            ltp: t.lastPrice,
            close,
            chg,
            pct,
          },
        };
      });
    s.on("tick", onTick);
    return () => { s.off("tick", onTick); s.emit("unsubscribe", tokens); };
  }, [indices]);

  return (
    <div className="t-ticker">
      {indices.map((idx, i) => {
        const p = prices[idx.token];
        const hasData = Boolean(p && typeof p.ltp === "number" && p.ltp > 0);
        const up = p ? p.chg >= 0 : true;
        return (
          <div key={idx.token} style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {i > 0 && <div className="t-tick-sep" />}
            <div className="t-tick" style={{ gap: 8 }}>
              <span className="lbl">{idx.label}</span>
              <span className="val" style={{ fontFamily: "var(--font-mono)", fontWeight: 800 }}>
                {hasData ? p!.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
              </span>
              {hasData ? (
                <span className={`chg ${up ? "up" : "dn"}`} style={{ fontFamily: "var(--font-mono)" }}>
                  {up ? "+" : ""}{p!.chg.toFixed(2)} ({up ? "+" : ""}{p!.pct.toFixed(2)}%)
                </span>
              ) : (
                <span style={{ color: "#64748b", fontFamily: "var(--font-mono)", fontSize: 11 }}>—</span>
              )}
              {hasData && p!.close > 0 ? (
                <span style={{
                  fontSize: 10,
                  color: "#94a3b8",
                  fontFamily: "var(--font-mono)",
                  background: "rgba(255, 255, 255, 0.05)",
                  padding: "1px 5px",
                  borderRadius: 3,
                  border: "1px solid rgba(255, 255, 255, 0.06)"
                }}>
                  Close: ₹{p!.close.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* Market Hours Indicator pill */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, paddingRight: 8 }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.05em",
          padding: "2px 8px",
          borderRadius: 99,
          background: marketStatus?.isOpen ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
          color: marketStatus?.isOpen ? "#4ade80" : "#f87171",
          border: `1px solid ${marketStatus?.isOpen ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: marketStatus?.isOpen ? "#22c55e" : "#ef4444",
            boxShadow: marketStatus?.isOpen ? "0 0 8px #22c55e" : "none"
          }} />
          {marketStatus?.isOpen ? "MARKET OPEN (09:15 - 15:30 IST)" : "MARKET CLOSED (09:15 - 15:30 IST)"}
        </span>
      </div>
    </div>
  );
}

// ── Kite status bar (shown only when token is invalid) ───────
function KiteStatusBar() {
  return null;
}

// ── Client Fallback Candlestick Generator ────────────────────
// Returns "end of IST day" ISO string so the full trading session (09:15–15:30 IST) is included.
function getISTDayEnd(offsetDays = 0): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  // 18:29:59 UTC = 23:59:59 IST
  now.setUTCHours(18, 29, 59, 0);
  return now.toISOString();
}

function getISTDayStart(offsetDays = 0): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  // 03:45:00 UTC = 09:15:00 IST
  now.setUTCHours(3, 44, 0, 0);
  return now.toISOString();
}

function generateClientFallbackBars(inst: Instrument, timeframe: string, from: string, to: string): CandlestickData[] {
  const current = Number(inst.lastPrice || (inst as any).close || 23379.35);
  const startMs = new Date(from).getTime();
  const endMs = new Date(to).getTime();
  let stepSec = 86400;
  if (timeframe === "minute" || timeframe === "1m") stepSec = 60;
  else if (timeframe === "5minute" || timeframe === "5m") stepSec = 300;
  else if (timeframe === "15minute" || timeframe === "15m") stepSec = 900;
  else if (timeframe === "60minute" || timeframe === "60m" || timeframe === "1h") stepSec = 3600;

  // For intraday, generate bars anchored to market-session timestamps (09:15–15:30 IST)
  const isIntraday = stepSec < 86400;
  const res: CandlestickData[] = [];

  if (isIntraday) {
    // Build bars for each trading day in the range using IST session windows
    const sessionStartHrUtc = 3;  // 09:15 IST = 03:45 UTC
    const sessionStartMinUtc = 45;
    const sessionEndHrUtc = 10;   // 15:30 IST = 10:00 UTC
    const sessionEndMinUtc = 0;
    const dayMs = 86400000;
    let dayStart = new Date(startMs);
    dayStart.setUTCHours(sessionStartHrUtc, sessionStartMinUtc, 0, 0);

    const totalDays = Math.ceil((endMs - startMs) / dayMs);
    let p = current * (1 - Math.min(totalDays * 75 / stepSec, 80) * 0.0003);

    for (let d = 0; d < totalDays; d++) {
      const sessionStart = new Date(dayStart.getTime() + d * dayMs);
      // Skip weekends
      const dow = sessionStart.getUTCDay();
      if (dow === 0 || dow === 6) continue;

      const sessionEndMs = new Date(sessionStart);
      sessionEndMs.setUTCHours(sessionEndHrUtc, sessionEndMinUtc, 0, 0);

      let t = sessionStart.getTime();
      const end = Math.min(sessionEndMs.getTime(), endMs);
      while (t < end && res.length < 200) {
        const isLast = t + stepSec * 1000 >= end && d === totalDays - 1;
        const open = p;
        const change = isLast ? (current - open) : (Math.random() - 0.49) * p * 0.006;
        const close = isLast ? current : Math.max(1, open + change);
        const high = Math.max(open, close) + Math.random() * p * 0.003;
        const low  = Math.min(open, close) - Math.random() * p * 0.003;
        res.push({
          time: Math.floor(t / 1000) as any,
          open: Number(open.toFixed(2)),
          high: Number(high.toFixed(2)),
          low:  Number(low.toFixed(2)),
          close: Number(close.toFixed(2)),
        });
        p = close;
        t += stepSec * 1000;
      }
    }
  } else {
    // Daily bars — keep existing logic
    const count = Math.min(Math.max(Math.floor((endMs - startMs) / (stepSec * 1000)), 25), 100);
    const actualStep = Math.floor((endMs - startMs) / (count * 1000));
    let p = current * (1 - count * 0.0006);
    for (let i = 0; i < count; i++) {
      const time = Math.floor(startMs / 1000) + i * actualStep;
      const d = new Date(time * 1000).getUTCDay();
      if (d === 0 || d === 6) continue;
      const isLast = i === count - 1;
      const open = p;
      const change = isLast ? (current - open) : (Math.random() - 0.49) * p * 0.008;
      const close = isLast ? current : Math.max(1, open + change);
      const high = Math.max(open, close) + Math.random() * p * 0.004;
      const low  = Math.min(open, close) - Math.random() * p * 0.004;
      res.push({
        time: time as any,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low:  Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
      });
      p = close;
    }
  }
  return res;
}

// ── Live candlestick chart ───────────────────────────────────
function LiveChart({ instrument, bars, timeframe, theme }: { instrument: Instrument; bars: CandlestickData[]; timeframe: string; theme?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastBarTimeRef = useRef<number>(0);
  const curBarRef = useRef<CandlestickData | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const isLight = theme === "modern-white" || theme === "nordic-snow";
    const c = createChart(ref.current, {
      width: ref.current.clientWidth || 600,
      height: ref.current.clientHeight || 340,
      layout: {
        background: { color: isLight ? "#ffffff" : "#080b12" },
        textColor: isLight ? "#475569" : "#484f58"
      },
      grid: {
        vertLines: { color: isLight ? "#f1f5f9" : "#1e2d3d" },
        horzLines: { color: isLight ? "#f1f5f9" : "#1e2d3d" }
      },
      crosshair: {
        vertLine: { color: isLight ? "#2563eb44" : "#2563eb66" },
        horzLine: { color: isLight ? "#2563eb44" : "#2563eb66" }
      },
      rightPriceScale: { borderColor: isLight ? "#e2e8f0" : "#1e2d3d" },
      timeScale: { borderColor: isLight ? "#e2e8f0" : "#1e2d3d", timeVisible: true, secondsVisible: false },
    });
    const s = c.addCandlestickSeries({
      upColor: isLight ? "#16a34a" : "#3fb950",
      downColor: isLight ? "#dc2626" : "#f85149",
      borderVisible: false,
      wickUpColor: isLight ? "#16a34a" : "#3fb950",
      wickDownColor: isLight ? "#dc2626" : "#f85149",
    });
    chart.current = c;
    series.current = s;

    // Use ResizeObserver for accurate, instantaneous layout responsiveness
    const ro = new ResizeObserver((entries) => {
      if (!entries || !entries[0] || !chart.current) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        chart.current.applyOptions({ width, height });
      }
    });
    ro.observe(ref.current);

    const onResize = () => ref.current && c.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight || 340 });
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      c.remove();
    };
  }, []);

  // Update chart layout colors when theme changes
  useEffect(() => {
    if (!chart.current || !series.current) return;
    const isLight = theme === "modern-white" || theme === "nordic-snow";
    chart.current.applyOptions({
      layout: {
        background: { color: isLight ? "#ffffff" : "#080b12" },
        textColor: isLight ? "#475569" : "#484f58"
      },
      grid: {
        vertLines: { color: isLight ? "#f1f5f9" : "#1e2d3d" },
        horzLines: { color: isLight ? "#f1f5f9" : "#1e2d3d" }
      },
      crosshair: {
        vertLine: { color: isLight ? "#2563eb44" : "#2563eb66" },
        horzLine: { color: isLight ? "#2563eb44" : "#2563eb66" }
      },
      rightPriceScale: { borderColor: isLight ? "#e2e8f0" : "#1e2d3d" },
      timeScale: { borderColor: isLight ? "#e2e8f0" : "#1e2d3d" },
    });
    series.current.applyOptions({
      upColor: isLight ? "#16a34a" : "#3fb950",
      downColor: isLight ? "#dc2626" : "#f85149",
      wickUpColor: isLight ? "#16a34a" : "#3fb950",
      wickDownColor: isLight ? "#dc2626" : "#f85149",
    });
  }, [theme]);

  // ── Load bars ─────────────────────────────────────────────────────────────
  // Cap bar timestamps to the latest valid market-close time so lightweight-charts
  // never rejects bars with "future" timestamps after 15:30 IST.
  useEffect(() => {
    if (!series.current) return;

    // Always call setData (even with []) so chart axes stay visible
    if (!bars || bars.length === 0) {
      try { series.current.setData([]); } catch {}
      lastBarTimeRef.current = 0;
      curBarRef.current = null;
      return;
    }

    try {
      // IST market close = 10:00 UTC; cap timestamps to that (or now if still open)
      const nowSec = Math.floor(Date.now() / 1000);
      const utcNow = new Date();
      const todayCloseSec = Math.floor(
        Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth(), utcNow.getUTCDate(), 10, 0, 0) / 1000
      );
      const capSec = Math.min(todayCloseSec, nowSec);

      const sorted = [...bars]
        .filter((b) => b && b.time != null && !isNaN(Number(b.close)) && Number(b.open) > 0)
        .map((b) => ({ ...b, time: Math.min(Number(b.time), capSec) as any }))
        .sort((a, b) => Number(a.time) - Number(b.time));

      const uniqueBars: CandlestickData[] = [];
      const seen = new Set<number>();
      for (const b of sorted) {
        const t = Number(b.time);
        if (!seen.has(t)) { seen.add(t); uniqueBars.push(b); }
      }

      if (uniqueBars.length === 0) {
        try { series.current.setData([]); } catch {}
        return;
      }

      const last = uniqueBars[uniqueBars.length - 1];
      lastBarTimeRef.current = Number(last.time);
      curBarRef.current = last;

      series.current.setData(uniqueBars);
      chart.current?.timeScale().fitContent();
    } catch (e) {
      console.warn("[Chart] setData error:", e);
    }
  }, [bars, timeframe]);

  // ── Live tick updates ──────────────────────────────────────────────────────
  useEffect(() => {
    const s = getSocket();
    s.emit("subscribe", [instrument.instrumentToken]);

    const onTick = (t: Tick) => {
      if (t.instrumentToken !== instrument.instrumentToken || !series.current) return;

      const nowSec = Math.floor(Date.now() / 1000);
      let stepSec = 60;
      if (timeframe === "5minute"  || timeframe === "5m")  stepSec = 300;
      else if (timeframe === "15minute" || timeframe === "15m") stepSec = 900;
      else if (timeframe === "60minute" || timeframe === "60m" || timeframe === "1h") stepSec = 3600;
      else if (timeframe === "day" || timeframe === "1d") stepSec = 86400;

      // NSE market hours in UTC: 03:44 – 10:00
      const utcNow = new Date();
      const dayStartUTC = Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth(), utcNow.getUTCDate());
      const todayOpenSec  = Math.floor(dayStartUTC / 1000) + 3 * 3600 + 44 * 60;  // 03:44 UTC
      const todayCloseSec = Math.floor(dayStartUTC / 1000) + 10 * 3600;            // 10:00 UTC

      const isMarketHours = nowSec >= todayOpenSec && nowSec < todayCloseSec;
      const lastBarTime = lastBarTimeRef.current;
      if (!lastBarTime) return; // bars not yet loaded

      let cur = curBarRef.current;

      if (isMarketHours) {
        // During market hours: maintain proper time-bucketed candles
        const timeBucket = Math.floor(nowSec / stepSec) * stepSec;
        const barTime = Math.max(timeBucket, lastBarTime);

        if (cur && Number(cur.time) === barTime) {
          cur = { ...cur, time: barTime as any, close: t.lastPrice,
            high: Math.max(+cur.high, t.lastPrice), low: Math.min(+cur.low, t.lastPrice) };
        } else if (barTime > lastBarTime) {
          const prevC = cur ? Number(cur.close) : t.lastPrice;
          cur = { time: barTime as any, open: prevC,
            high: Math.max(prevC, t.lastPrice), low: Math.min(prevC, t.lastPrice), close: t.lastPrice };
        } else {
          if (!cur) return;
          cur = { ...cur, close: t.lastPrice,
            high: Math.max(+cur.high, t.lastPrice), low: Math.min(+cur.low, t.lastPrice) };
        }
        lastBarTimeRef.current = Number(cur.time);
      } else {
        // ✅ After market close: update the LAST existing bar's close/high/low.
        // Do NOT add a new bar with a future timestamp — lightweight-charts rejects it.
        if (!cur) return;
        cur = { ...cur, close: t.lastPrice,
          high: Math.max(+cur.high, t.lastPrice), low: Math.min(+cur.low, t.lastPrice) };
      }

      curBarRef.current = cur;
      try { series.current.update(cur); } catch (_e) {}
    };

    s.on("tick", onTick);
    return () => { s.off("tick", onTick); s.emit("unsubscribe", [instrument.instrumentToken]); };
  }, [instrument.instrumentToken, timeframe]);

  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}

// ── Market Depth Card (Level 2 Quotes per Kite Connect specification) ──
function MarketDepthCard({ quote, instrument }: { quote: FullMarketQuote | null; instrument: Instrument | null; isLight?: boolean }) {
  if (!quote || !instrument) return null;

  const buyLevels = quote.depth?.buy || [];
  const sellLevels = quote.depth?.sell || [];
  const totalBuyQty = quote.buyQuantity || buyLevels.reduce((acc, b) => acc + (b.quantity || 0), 0);
  const totalSellQty = quote.sellQuantity || sellLevels.reduce((acc, s) => acc + (s.quantity || 0), 0);

  return (
    <div className="t-depth-widget">
      <div className="t-depth-widget-header">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Market Depth (5 Levels)
          </span>
          <span className="t-token-pill">
            LIVE
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Vol: <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{(quote.volume || 0).toLocaleString("en-IN")}</span>
        </div>
      </div>

      {/* 5-Level Depth Columns */}
      <div className="t-depth-grid-2col">
        {/* BUY BIDS */}
        <div>
          <div className="t-depth-col-head buy">
            <span>Orders</span>
            <span>Qty</span>
            <span>Bid</span>
          </div>
          {buyLevels.slice(0, 5).map((b, idx) => (
            <div key={idx} className="t-depth-row">
              <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{b.orders !== undefined ? b.orders : "—"}</span>
              <span>{(b.quantity || 0).toLocaleString("en-IN")}</span>
              <span style={{ color: "var(--blue)", fontWeight: 700 }}>{b.price ? `₹${Number(b.price).toFixed(2)}` : "—"}</span>
            </div>
          ))}
          <div className="t-depth-total-row" style={{ color: "var(--blue)" }}>
            <span>Total</span>
            <span>{totalBuyQty.toLocaleString("en-IN")}</span>
            <span />
          </div>
        </div>

        {/* SELL ASKS */}
        <div>
          <div className="t-depth-col-head sell">
            <span>Offer</span>
            <span>Qty</span>
            <span>Orders</span>
          </div>
          {sellLevels.slice(0, 5).map((s, idx) => (
            <div key={idx} className="t-depth-row">
              <span style={{ color: "var(--red)", fontWeight: 700 }}>{s.price ? `₹${Number(s.price).toFixed(2)}` : "—"}</span>
              <span>{(s.quantity || 0).toLocaleString("en-IN")}</span>
              <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{s.orders !== undefined ? s.orders : "—"}</span>
            </div>
          ))}
          <div className="t-depth-total-row" style={{ color: "var(--red)" }}>
            <span />
            <span>{totalSellQty.toLocaleString("en-IN")}</span>
            <span>Total</span>
          </div>
        </div>
      </div>

      {/* Stats summary: VWAP, Circuit Limits, OI */}
      <div className="t-depth-stats-grid">
        <div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>VWAP / Avg</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
            {quote.averagePrice || quote.lastPrice ? `₹${Number(quote.averagePrice || quote.lastPrice).toFixed(2)}` : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>Lower Limit</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--red)", fontFamily: "var(--font-mono)" }}>
            {quote.lowerCircuitLimit ? `₹${Number(quote.lowerCircuitLimit).toFixed(2)}` : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>Upper Limit</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", fontFamily: "var(--font-mono)" }}>
            {quote.upperCircuitLimit ? `₹${Number(quote.upperCircuitLimit).toFixed(2)}` : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>Open Interest</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
            {quote.oi !== undefined && quote.oi !== null ? Number(quote.oi).toLocaleString("en-IN") : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main terminal ────────────────────────────────────────────
function Terminal() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const [sp]      = useSearchParams();
  const contestId = sp.get("contestId") ?? undefined;
  const isAdmin   = location.pathname.startsWith("/admin");

  // Global Theme Engine
  const { theme, setTheme, isLight } = useTheme();

  const [loginUrl, setLoginUrl] = useState("");
  const [dbTotalCount, setDbTotalCount] = useState<number | null>(null);

  useEffect(() => {
    MarketAPI.stats()
      .then((res) => {
        if (res.data?.total !== undefined) setDbTotalCount(Number(res.data.total));
      })
      .catch(() => {});
  }, []);

  // Zerodha redirects to /trade?status=success&request_token=...
  // Exchange token silently then reload clean URL
  useEffect(() => {
    api.get("/broker/zerodha/login-url")
      .then((r) => { if (r.data?.url) setLoginUrl(r.data.url); })
      .catch(() => {});

    const rt = sp.get("request_token");
    const st = sp.get("status");
    if (rt && st === "success") {
      api.post("/broker/zerodha/exchange", { requestToken: rt })
        .then(() => api.post("/market/sync-instruments-public"))
        .catch(() => {})
        .finally(() => navigate("/trade", { replace: true }));
    }
  }, []);

  const [instrument, setInstrument] = useState<Instrument | null>(
    (location.state as Instrument) ?? {
      id: "default-nifty50",
      tradingSymbol: "NIFTY 50",
      exchange: "NSE",
      segment: "EQUITY",
      instrumentToken: "256265",
      lotSize: 25,
      lastPrice: 23379.35,
      close: 23346.40,
    }
  );
  const [bars,       setBars]       = useState<CandlestickData[]>([]);
  const [tf,         setTf]         = useState("day");
  const [ltp,        setLtp]        = useState<number | null>(null);
  const [prevClose,  setPrevClose]  = useState<number | null>(null);
  const [quote,      setQuote]      = useState<any>(null);
  const [priceFlash, setPriceFlash] = useState<"up" | "dn" | null>(null);
  const prevLtpRef = useRef<number | null>(null);

  useEffect(() => {
    if (ltp != null && prevLtpRef.current != null && ltp !== prevLtpRef.current) {
      setPriceFlash(ltp > prevLtpRef.current ? "up" : "dn");
      const timer = setTimeout(() => setPriceFlash(null), 600);
      prevLtpRef.current = ltp;
      return () => clearTimeout(timer);
    }
    prevLtpRef.current = ltp;
  }, [ltp]);

  // order form
  const [side,  setSide]  = useState<"BUY"|"SELL">("BUY");
  const [otype, setOtype] = useState<"MARKET"|"LIMIT"|"SL"|"SL_M">("MARKET");
  const [ptype, setPtype] = useState<"INTRADAY"|"DELIVERY"|"NORMAL">("INTRADAY");
  const [qty,   setQty]   = useState(1);
  const [lp,    setLp]    = useState<number|"">("");
  const [tp,    setTp]    = useState<number|"">("");
  const [msg,   setMsg]   = useState<{text:string;ok:boolean}|null>(null);

  const [wallet,            setWallet]            = useState<number|null>(null);
  const [walletRealizedPnL, setWalletRealizedPnL] = useState<number>(0);
  const [positions,         setPositions]         = useState<any[]>([]);
  const [holdings,          setHoldings]          = useState<any[]>([]);
  const [orders,    setOrders]    = useState<any[]>([]);
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState<Instrument[]>([]);
  const [wPrices,   setWPrices]   = useState<Record<string, { ltp: number; close: number; chg: number; pct: number }>>({});
  const [page,          setPage]          = useState(1);
  const pageSize = 15;
  const [sidebarTab,          setSidebarTab]          = useState<"watchlist" | "positions" | "holdings" | "orders">("watchlist");
  const [segmentFilter,       setSegmentFilter]       = useState<"ALL" | "NSE" | "NFO" | "MCX">("ALL");
  const [isSidebarCollapsed,  setIsSidebarCollapsed]  = useState(false);
  const [expandedSymbolId,    setExpandedSymbolId]    = useState<string | null>(null);
  const [isSyncingInstruments, setIsSyncingInstruments] = useState(false);

  async function triggerInstrumentSync() {
    setIsSyncingInstruments(true);
    setMsg({ text: "⏳ Syncing full Zerodha market instruments (NSE, NFO, MCX)...", ok: true });
    try {
      const res = await MarketAPI.syncInstruments();
      setMsg({ text: `✓ Synced! Total available in DB: ${res.data.totalInDb.toLocaleString()} instruments`, ok: true });
      MarketAPI.search(query, segmentFilter, undefined, 100).then((r) => setResults(r.data)).catch(() => {});
    } catch (e: any) {
      setMsg({ text: "Failed to sync instruments: " + (e.response?.data?.error || e.message), ok: false });
    } finally {
      setIsSyncingInstruments(false);
    }
  }

  // Broker Feed Mode (ZERODHA vs MOCK)
  const [brokerMode, setBrokerMode] = useState<"ZERODHA" | "MOCK">("ZERODHA");
  const [isBrokerConnected, setIsBrokerConnected] = useState<boolean>(true);
  const [marketStatus, setMarketStatus] = useState<{ isOpen: boolean; reason?: string; currentIstTime?: string; marketOpenTime?: string; marketCloseTime?: string } | null>(null);

  useEffect(() => {
    const fetchStatus = () => {
      api.get("/market/status").then((r) => {
        if (r.data) setMarketStatus(r.data);
      }).catch(() => {});
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  async function toggleBrokerMode() {
    const nextMode = brokerMode === "ZERODHA" ? "MOCK" : "ZERODHA";
    try {
      await api.post("/broker/mode", { provider: nextMode });
      setBrokerMode(nextMode);
      setIsBrokerConnected(true);
      setMsg({ text: `✓ Switched data feed to ${nextMode === "ZERODHA" ? "Zerodha Live" : "Demo Simulation"}`, ok: true });
    } catch {
      setMsg({ text: "Failed to switch broker mode", ok: false });
    }
  }

  useEffect(() => {
    api.get("/broker/mode").then((r) => {
      if (r.data?.provider) setBrokerMode(r.data.provider);
      if (r.data?.connected !== undefined) setIsBrokerConnected(r.data.connected);
    }).catch(() => {});
  }, []);

  // Watchlist History Modal state
  const [historyItem,    setHistoryItem]    = useState<Instrument | null>(null);
  const [historyTf,      setHistoryTf]      = useState<"day" | "15minute" | "5minute" | "minute">("day");
  const [historyData,    setHistoryData]    = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Watchlist Market Depth Modal state
  const [depthItem,      setDepthItem]      = useState<Instrument | null>(null);
  const [depthQuote,     setDepthQuote]     = useState<FullMarketQuote | null>(null);
  const [depthLoading,   setDepthLoading]   = useState(false);

  useEffect(() => {
    if (!depthItem) {
      setDepthQuote(null);
      return;
    }
    setDepthLoading(true);
    MarketAPI.quote([depthItem.instrumentToken])
      .then((r) => {
        if (r.data && r.data[0]) {
          setDepthQuote(r.data[0]);
        }
      })
      .catch(() => {})
      .finally(() => setDepthLoading(false));
  }, [depthItem?.instrumentToken]);

  // Watchlist Option Chain Modal state
  const [chainItem,      setChainItem]      = useState<Instrument | null>(null);
  const [chainExpiries,  setChainExpiries]  = useState<string[]>([]);
  const [chainExpiry,    setChainExpiry]    = useState<string>("");
  const [chainRows,      setChainRows]      = useState<any[]>([]);
  const [chainLoading,   setChainLoading]   = useState<boolean>(false);

  // Load available expiries for underlying from database
  useEffect(() => {
    if (!chainItem) {
      setChainExpiries([]);
      setChainExpiry("");
      setChainRows([]);
      return;
    }
    const underlying = chainItem.tradingSymbol.replace(/[0-9].*$/, "").trim() || chainItem.tradingSymbol;
    OptionsAPI.expiries(underlying)
      .then((res: any) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setChainExpiries(res.data);
          setChainExpiry(res.data[0]);
        } else {
          setChainExpiries([]);
          setChainExpiry("");
        }
      })
      .catch(() => {
        setChainExpiries([]);
        setChainExpiry("");
      });
  }, [chainItem?.tradingSymbol]);

  // Load option chain rows from database/broker
  useEffect(() => {
    if (!chainItem) return;
    setChainLoading(true);
    const underlying = chainItem.tradingSymbol.replace(/[0-9].*$/, "").trim() || chainItem.tradingSymbol;
    OptionsAPI.chain(underlying, chainExpiry || undefined)
      .then((res: any) => {
        setChainRows(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        setChainRows([]);
      })
      .finally(() => setChainLoading(false));
  }, [chainItem?.tradingSymbol, chainExpiry]);

  // fetch historical data for modal
  useEffect(() => {
    if (!historyItem) return;
    setHistoryLoading(true);
    const to   = getISTDayEnd();
    const days = historyTf === "day" ? 60 : historyTf === "15minute" ? 5 : 2;
    const from = getISTDayStart(-days);
    MarketAPI.history(historyItem.instrumentToken, historyTf, from, to)
      .then((r) => setHistoryData(r.data ?? []))
      .catch(() => setHistoryData([]))
      .finally(() => setHistoryLoading(false));
  }, [historyItem?.instrumentToken, historyTf]);

  // portfolio refresh
  useEffect(() => {
    PortfolioAPI.get().then((r) => {
      setWallet(Number(r.data.wallet?.cashBalance ?? r.data.wallet?.balance ?? 0));
      setWalletRealizedPnL(Number(r.data.wallet?.realizedPnL ?? 0));
      setPositions(r.data.positions ?? []);
      setHoldings(r.data.holdings ?? []);
    }).catch(() => {});
    OrdersAPI.list().then((r) => setOrders(r.data ?? [])).catch(() => {});
  }, [msg]);

  // REST quote for OHLC chip and Market Depth — fires once per instrument selection
  useEffect(() => {
    if (!instrument) return;
    setQuote(null);
    MarketAPI.quote([instrument.instrumentToken])
      .then((r) => {
        const found = r.data?.[0];
        if (found) {
          setQuote(found);
          if (!ltp) setLtp(found.lastPrice);
          if (!prevClose) setPrevClose(found.close);
        }
      }).catch(() => {});
  }, [instrument?.instrumentToken]);

  // chart bars
  useEffect(() => {
    if (!instrument) return;
    // Use full IST-day end timestamp so bars from the entire trading session
    // (09:15–15:30 IST) are always included even after market close.
    const to   = getISTDayEnd();   // today 23:59:59 IST
    const days = tf === "day" ? 90 : tf === "15minute" ? 7 : tf === "5minute" ? 4 : 2;
    const from = getISTDayStart(-days); // N days ago 09:15 IST
    MarketAPI.history(instrument.instrumentToken, tf as any, from, to)
      .then((r) => {
        if (r.data && Array.isArray(r.data) && r.data.length > 0) {
          const mapped = r.data.map((b: any) => ({
            time: (new Date(b.timestamp).getTime() / 1000) as any,
            open: b.open, high: b.high, low: b.low, close: b.close,
          }));
          setBars(mapped);
          if (mapped.length) {
            setPrevClose(mapped[mapped.length - 1].close);
            if (!ltp) setLtp(mapped[mapped.length - 1].close);
          }
        } else {
          const fallback = generateClientFallbackBars(instrument, tf, from, to);
          setBars(fallback);
          if (fallback.length) {
            setPrevClose(fallback[fallback.length - 1].close);
            if (!ltp) setLtp(fallback[fallback.length - 1].close);
          }
        }
      }).catch(() => {
        const fallback = generateClientFallbackBars(instrument, tf, from, to);
        setBars(fallback);
        if (fallback.length) {
          setPrevClose(fallback[fallback.length - 1].close);
          if (!ltp) setLtp(fallback[fallback.length - 1].close);
        }
      });
  }, [instrument?.instrumentToken, tf]);

  // WebSocket live price
  useEffect(() => {
    if (!instrument) return;
    const s = getSocket();
    s.emit("subscribe", [instrument.instrumentToken]);
    const onTick = (t: Tick) => {
      if (t.instrumentToken !== instrument.instrumentToken) return;
      setLtp(t.lastPrice);
      if (!prevClose && t.close) setPrevClose(t.close);
    };
    s.on("tick", onTick);
    return () => { s.off("tick", onTick); };
  }, [instrument?.instrumentToken]);

  // watchlist search
  useEffect(() => {
    setPage(1);
    const t = setTimeout(() => {
      MarketAPI.search(query, segmentFilter === "ALL" ? undefined : segmentFilter, undefined, 100)
        .then((r) => {
          setResults(r.data);
          if (r.data.length > 0) {
            setInstrument((prev) => {
              if (!prev || prev.id === "default-nifty50") {
                const found = r.data.find((d) => d.instrumentToken === "256265") || r.data[0];
                return found;
              }
              return prev;
            });
          }
          const initial: Record<string, { ltp: number; close: number; chg: number; pct: number }> = {};
          for (const item of r.data) {
            const ltp = Number(item.lastPrice || 0);
            const close = Number((item as any).closePrice || (item as any).close || ltp);
            const chg = Number(((item as any).netChange ?? (close > 0 ? ltp - close : 0)).toFixed(2));
            const pct = Number(((item as any).changePercent ?? (close > 0 ? (chg / close) * 100 : 0)).toFixed(2));
            initial[item.instrumentToken] = { ltp, close, chg, pct };
          }
          setWPrices((prev) => ({ ...initial, ...prev }));
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [query, segmentFilter]);

  // watchlist live prices - subscribe to active / visible instruments
  useEffect(() => {
    if (!results.length) return;
    const s = getSocket();
    const tokens = results.slice(0, 30).map((r) => r.instrumentToken);
    if (instrument && !tokens.includes(instrument.instrumentToken)) {
      tokens.push(instrument.instrumentToken);
    }
    s.emit("subscribe", tokens);
    const onTick = (t: Tick) =>
      setWPrices((p) => {
        const existing = p[t.instrumentToken];
        const ltp = t.lastPrice;
        const close = t.close ?? (t as any).closePrice ?? existing?.close ?? ltp;
        const chg = Number((ltp - close).toFixed(2));
        const pct = close > 0 ? Number(((chg / close) * 100).toFixed(2)) : 0;
        return {
          ...p,
          [t.instrumentToken]: { ltp, close, chg, pct },
        };
      });
    s.on("tick", onTick);
    return () => { s.off("tick", onTick); s.emit("unsubscribe", tokens); };
  }, [results, instrument?.instrumentToken]);

  // Live prices for open positions & holdings
  useEffect(() => {
    const posTokens = positions.map((p) => p.instrument?.instrumentToken).filter(Boolean);
    const holdTokens = holdings.map((h) => h.instrument?.instrumentToken).filter(Boolean);
    const allTokens = Array.from(new Set([...posTokens, ...holdTokens]));
    if (!allTokens.length) return;

    const s = getSocket();
    s.emit("subscribe", allTokens);
    const onTick = (t: Tick) =>
      setWPrices((p) => {
        const existing = p[t.instrumentToken];
        const ltp = t.lastPrice;
        const close = t.close ?? (t as any).closePrice ?? existing?.close ?? ltp;
        const chg = Number((ltp - close).toFixed(2));
        const pct = close > 0 ? Number(((chg / close) * 100).toFixed(2)) : 0;
        return {
          ...p,
          [t.instrumentToken]: { ltp, close, chg, pct },
        };
      });
    s.on("tick", onTick);
    return () => { s.off("tick", onTick); };
  }, [positions, holdings]);

  async function placeOrder(e: FormEvent) {
    e.preventDefault();
    if (!instrument) return;
    setMsg(null);

    // Enforce Indian market hours before submitting order
    if (marketStatus && !marketStatus.isOpen) {
      setMsg({
        text: `⛔ Market is Closed. Orders can only be placed Monday to Friday between 09:15 AM and 03:30 PM IST. (Current IST: ${marketStatus.currentIstTime || "Closed"})`,
        ok: false,
      });
      return;
    }

    try {
      await OrdersAPI.place({
        instrumentId: instrument.id, transactionType: side,
        orderType: otype, productType: ptype, quantity: +qty,
        price: lp === "" ? undefined : +lp,
        triggerPrice: tp === "" ? undefined : +tp,
        contestId,
      });
      setMsg({ text: `✓ ${side} order placed — ${instrument.tradingSymbol}`, ok: true });
    } catch (err: any) {
      setMsg({ text: err.response?.data?.error ?? "Order failed", ok: false });
    }
  }

  const displayLtp   = ltp ?? quote?.lastPrice ?? (instrument?.lastPrice ? Number(instrument.lastPrice) : null);
  const displayClose = prevClose ?? quote?.close ?? (instrument as any)?.closePrice ?? (instrument as any)?.close ?? null;
  const chg    = displayLtp && displayClose ? displayLtp - displayClose : null;
  const chgPct = chg && displayClose ? (chg / displayClose) * 100 : null;
  const up     = chg !== null ? chg >= 0 : true;

  // Real-time calculation of unrealised floating P&L on all open positions
  const totalPnl = positions.reduce((s: number, p: any) => {
    if (!p.quantity || p.quantity === 0) return s;
    const curPrice = wPrices[p.instrument?.instrumentToken]?.ltp ?? p.ltp ?? Number(p.instrument?.lastPrice || p.avgPrice);
    const pnl = p.quantity * (curPrice - Number(p.avgPrice));
    return s + pnl;
  }, 0);

  const deployedPct = wallet && wallet > 0 ? Math.min(100, positions.reduce((s: number, p: any) => s + Math.abs(+p.quantity) * +(p.averagePrice ?? p.avgPrice ?? 0), 0) / wallet * 100) : 0;
  const margin      = instrument && displayLtp ? (Number(displayLtp) * qty * (instrument.lotSize || 1) * (ptype === "DELIVERY" ? 1.0 : 0.2)) : 0;

  return (
    <div className="t-root" data-theme={theme}>
      <TickerBar marketStatus={marketStatus} />
      <KiteStatusBar />

      {/* ── Navbar ── */}
      <nav className="t-nav">
        {!isAdmin ? (
          <div className="t-nav-brand">
            <div className="t-nav-logo">PT</div>
            <div className="t-nav-title">F&amp;O Terminal</div>
            <div className="t-nav-links">
              <Link to="/"          className="t-nav-link">Dashboard</Link>
              <Link to="/trade"     className="t-nav-link active">Terminal</Link>
              <Link to="/portfolio" className="t-nav-link">Portfolio</Link>
              <Link to="/contests"  className="t-nav-link">Contests</Link>
              <Link to="/options"   className="t-nav-link">Options</Link>
              <Link to="/profile"   className="t-nav-link">Profile</Link>
            </div>
          </div>
        ) : (
          <div className="t-nav-brand">
            <div className="t-nav-title" style={{ color: "var(--accent-text)", fontWeight: 800 }}>Admin Terminal</div>
          </div>
        )}
        <div className="t-nav-right">
          {/* Theme Selector */}
          <ThemeSelector />

          <span className="pill pill-blue">Paper</span>
          {brokerMode === "ZERODHA" ? (
            <button
              onClick={toggleBrokerMode}
              title="Active: Zerodha Live Data. Click to switch to Demo Simulation."
              className="pill pill-live"
              style={{ cursor: "pointer", border: "none", outline: "none", display: "flex", alignItems: "center", gap: 4 }}
            >
              <span>⚡</span> KITE LIVE
            </button>
          ) : (
            <button
              onClick={toggleBrokerMode}
              title="Active: Demo/Mock Simulation. Click to switch to Zerodha Live."
              style={{
                background: "rgba(234, 179, 8, 0.2)",
                color: "#facc15",
                border: "1px solid rgba(234, 179, 8, 0.4)",
                padding: "2px 8px",
                borderRadius: 99,
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4
              }}
            >
              <span>🎮</span> DEMO MOCK
            </button>
          )}
          <button
            onClick={toggleBrokerMode}
            title="Toggle between Zerodha live feed and local demo simulation"
            style={{
              fontSize: 10, color: "var(--text-secondary)", background: "rgba(255,255,255,0.06)",
              border: "1px solid var(--border)", borderRadius: 4, padding: "3px 8px", cursor: "pointer",
              fontWeight: 600
            }}
          >
            {brokerMode === "ZERODHA" ? "Switch to Demo" : "Switch to Live"}
          </button>
          <a
            href={loginUrl || "#"}
            onClick={(e) => {
              if (!loginUrl) {
                e.preventDefault();
                api.get("/broker/zerodha/login-url")
                  .then((r) => { if (r.data?.url) window.location.href = r.data.url; })
                  .catch(() => setMsg({ text: "Login URL unavailable. Please check broker connection.", ok: false }));
              }
            }}
            style={{ fontSize: 11, color: "var(--text-muted)", textDecoration: "none", padding: "3px 8px", border: "1px solid var(--border)", borderRadius: 4 }}
          >Re-auth</a>
        </div>
      </nav>

      <div className="t-body" style={{ gridTemplateColumns: isSidebarCollapsed ? "58px 1fr 280px" : "310px 1fr 280px", transition: "grid-template-columns 0.25s cubic-bezier(0.16, 1, 0.3, 1)" }}>
        {/* ══ LEFT SIDEBAR ══ */}
        <aside className="t-sidebar" style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-surface)", borderRight: "1px solid var(--border)", overflow: "hidden" }}>
          
          {/* Top Modern Header (Expanded vs Collapsed) */}
          {isSidebarCollapsed ? (
            /* COLLAPSED MODE (58px Icon Sidebar) */
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0", gap: 12 }}>
              {/* Expand Toggle Button */}
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                title="Expand Sidebar"
                style={{
                  width: 38, height: 38, borderRadius: 8, border: "1px solid rgba(96,165,250,0.4)",
                  background: "rgba(37,99,235,0.2)", color: "#60a5fa", fontSize: 14,
                  fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                }}
              >
                ▶
              </button>

              <div style={{ width: 32, height: 1, background: "var(--border)", margin: "2px 0" }} />

              {/* Watchlist Icon */}
              <button
                onClick={() => { setSidebarTab("watchlist"); setIsSidebarCollapsed(false); }}
                title="Watchlist"
                style={{
                  width: 38, height: 38, borderRadius: 8, border: "none",
                  background: sidebarTab === "watchlist" ? "rgba(37,99,235,0.25)" : "transparent",
                  color: sidebarTab === "watchlist" ? "#60a5fa" : "var(--text-muted)",
                  fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                }}
              >
                ⭐
              </button>

              {/* Positions Icon */}
              <button
                onClick={() => { setSidebarTab("positions"); setIsSidebarCollapsed(false); }}
                title="Open Positions"
                style={{
                  width: 38, height: 38, borderRadius: 8, border: "none", position: "relative",
                  background: sidebarTab === "positions" ? "rgba(37,99,235,0.25)" : "transparent",
                  color: sidebarTab === "positions" ? "#60a5fa" : "var(--text-muted)",
                  fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                }}
              >
                💼
                {positions.filter((p: any) => p.quantity !== 0).length > 0 && (
                  <span style={{
                    position: "absolute", top: 4, right: 4, width: 8, height: 8,
                    borderRadius: "50%", background: "#2563eb", border: "2px solid var(--bg-surface)"
                  }} />
                )}
              </button>

              {/* Holdings Icon */}
              <button
                onClick={() => { setSidebarTab("holdings"); setIsSidebarCollapsed(false); }}
                title="Holdings (Delivery CNC)"
                style={{
                  width: 38, height: 38, borderRadius: 8, border: "none", position: "relative",
                  background: sidebarTab === "holdings" ? "rgba(37,99,235,0.25)" : "transparent",
                  color: sidebarTab === "holdings" ? "#60a5fa" : "var(--text-muted)",
                  fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                }}
              >
                📦
                {holdings.length > 0 && (
                  <span style={{
                    position: "absolute", top: 4, right: 4, width: 8, height: 8,
                    borderRadius: "50%", background: "#10b981", border: "2px solid var(--bg-surface)"
                  }} />
                )}
              </button>

              {/* Orders Icon */}
              <button
                onClick={() => { setSidebarTab("orders"); setIsSidebarCollapsed(false); }}
                title="Recent Orders"
                style={{
                  width: 38, height: 38, borderRadius: 8, border: "none",
                  background: sidebarTab === "orders" ? "rgba(37,99,235,0.25)" : "transparent",
                  color: sidebarTab === "orders" ? "#60a5fa" : "var(--text-muted)",
                  fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                }}
              >
                📋
              </button>
            </div>
          ) : (
            /* EXPANDED MODE (310px Full Sidebar) */
            <>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px",
                background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
                  <button
                    onClick={() => setSidebarTab("watchlist")}
                    style={{
                      flex: 1, padding: "6px 4px", borderRadius: 6, border: "none",
                      background: sidebarTab === "watchlist" ? "linear-gradient(135deg, rgba(37,99,235,0.25), rgba(124,58,237,0.25))" : "transparent",
                      color: sidebarTab === "watchlist" ? "#60a5fa" : "var(--text-muted)",
                      fontWeight: sidebarTab === "watchlist" ? 700 : 500, fontSize: 10,
                      cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                      boxShadow: sidebarTab === "watchlist" ? "inset 0 0 0 1px rgba(96,165,250,0.3)" : "none"
                    }}
                  >
                    <span>⭐ Watch</span>
                  </button>

                  <button
                    onClick={() => setSidebarTab("positions")}
                    style={{
                      flex: 1, padding: "6px 4px", borderRadius: 6, border: "none",
                      background: sidebarTab === "positions" ? "linear-gradient(135deg, rgba(37,99,235,0.25), rgba(124,58,237,0.25))" : "transparent",
                      color: sidebarTab === "positions" ? "#60a5fa" : "var(--text-muted)",
                      fontWeight: sidebarTab === "positions" ? 700 : 500, fontSize: 10,
                      cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                      boxShadow: sidebarTab === "positions" ? "inset 0 0 0 1px rgba(96,165,250,0.3)" : "none"
                    }}
                  >
                    <span>💼 Pos</span>
                    {positions.filter((p: any) => p.quantity !== 0).length > 0 && (
                      <span style={{ fontSize: 9, background: "#2563eb", color: "#fff", borderRadius: 99, padding: "1px 4px", fontWeight: 800 }}>
                        {positions.filter((p: any) => p.quantity !== 0).length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setSidebarTab("holdings")}
                    style={{
                      flex: 1, padding: "6px 4px", borderRadius: 6, border: "none",
                      background: sidebarTab === "holdings" ? "linear-gradient(135deg, rgba(37,99,235,0.25), rgba(124,58,237,0.25))" : "transparent",
                      color: sidebarTab === "holdings" ? "#60a5fa" : "var(--text-muted)",
                      fontWeight: sidebarTab === "holdings" ? 700 : 500, fontSize: 10,
                      cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                      boxShadow: sidebarTab === "holdings" ? "inset 0 0 0 1px rgba(96,165,250,0.3)" : "none"
                    }}
                  >
                    <span>📦 Hold</span>
                    {holdings.length > 0 && (
                      <span style={{ fontSize: 9, background: "#10b981", color: "#fff", borderRadius: 99, padding: "1px 4px", fontWeight: 800 }}>
                        {holdings.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setSidebarTab("orders")}
                    style={{
                      flex: 1, padding: "6px 4px", borderRadius: 6, border: "none",
                      background: sidebarTab === "orders" ? "linear-gradient(135deg, rgba(37,99,235,0.25), rgba(124,58,237,0.25))" : "transparent",
                      color: sidebarTab === "orders" ? "#60a5fa" : "var(--text-muted)",
                      fontWeight: sidebarTab === "orders" ? 700 : 500, fontSize: 10,
                      cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                      boxShadow: sidebarTab === "orders" ? "inset 0 0 0 1px rgba(96,165,250,0.3)" : "none"
                    }}
                  >
                    <span>📋 Orders</span>
                  </button>
                </div>

                {/* Collapse Sidebar Button */}
                <button
                  onClick={() => setIsSidebarCollapsed(true)}
                  title="Collapse Left Sidebar"
                  style={{
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                    color: "var(--text-muted)", borderRadius: 6, padding: "5px 7px",
                    fontSize: 10, fontWeight: 700, cursor: "pointer", marginLeft: 4,
                    transition: "all 0.15s ease"
                  }}
                >
                  ◀
                </button>
              </div>

              {/* Tab Content: WATCHLIST */}
              {sidebarTab === "watchlist" && (
                <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                  {/* Watchlist Header & Sync Button */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Market Watch
                      </span>
                      <span className="t-token-pill">
                        {dbTotalCount !== null ? `${dbTotalCount.toLocaleString()} SYMBOLS` : "— SYMBOLS"}
                      </span>
                    </div>
                    <button
                      onClick={triggerInstrumentSync}
                      disabled={isSyncingInstruments}
                      title="Fetch & Sync all latest market instruments from Zerodha Kite (NSE, NFO, MCX)"
                      className="t-sync-btn"
                    >
                      <span>🔄</span>
                      {isSyncingInstruments ? "Syncing..." : "Sync All"}
                    </button>
                  </div>

                  {/* Segment Filter Pills */}
                  <div className="t-seg-bar">
                    {(["ALL", "NSE", "NFO", "MCX"] as const).map((seg) => (
                      <button
                        key={seg}
                        onClick={() => { setSegmentFilter(seg); setPage(1); }}
                        className={`t-seg-btn ${segmentFilter === seg ? "active" : ""}`}
                      >
                        {seg}
                      </button>
                    ))}
                  </div>

                  {/* Search Input Container */}
                  <div style={{ position: "relative", marginBottom: 10 }}>
                    <input
                      className="t-search"
                      placeholder="Search symbols from database (e.g. RELIANCE, NIFTY, CRUDE, CE/PE)…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      style={{ marginBottom: 0, paddingRight: query ? 28 : 10 }}
                    />
                    {query && (
                      <button
                        onClick={() => setQuery("")}
                        style={{
                          position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                          background: "none", border: "none", color: "var(--text-muted)",
                          fontSize: 12, cursor: "pointer", padding: "2px 4px"
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Watchlist Symbol Accordion Cards */}
                  {(() => {
                    const filteredResults = results.filter((r) => {
                      if (segmentFilter === "ALL") return true;
                      if (segmentFilter === "NSE") return r.exchange === "NSE" || r.exchange === "BSE" || r.segment === "EQUITY";
                      if (segmentFilter === "NFO") return r.exchange === "NFO" || r.exchange === "BFO" || String(r.segment) === "FUTURES" || String(r.segment) === "OPTIONS";
                      if (segmentFilter === "MCX") return r.exchange === "MCX" || r.exchange === "NCO";
                      return true;
                    });

                    const totalPages = Math.ceil(filteredResults.length / pageSize) || 1;
                    const paginatedResults = filteredResults.slice((page - 1) * pageSize, page * pageSize);

                    return (
                      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                        <div style={{ flex: 1, overflowY: "auto", paddingRight: 2 }}>
                          {paginatedResults.length === 0 ? (
                            <div style={{ padding: "30px 10px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                              No symbols matching filter
                            </div>
                          ) : (
                            paginatedResults.map((r) => {
                              const pData = wPrices[r.instrumentToken];
                              const ltp = pData?.ltp ?? Number(r.lastPrice ?? 0);
                              const close = pData?.close ?? Number((r as any).closePrice ?? (r as any).close ?? ltp);
                              const chg = pData?.chg ?? Number(((r as any).netChange ?? (close > 0 ? ltp - close : 0)).toFixed(2));
                              const pct = pData?.pct ?? Number(((r as any).changePercent ?? (close > 0 ? (chg / close) * 100 : 0)).toFixed(2));
                              const up = chg >= 0;

                              const sel = instrument?.id === r.id;
                              const isExpanded = expandedSymbolId === r.id;
                              const isNFO = r.exchange === "NFO" || String(r.segment) === "FUTURES" || String(r.segment) === "OPTIONS";
                              const isMCX = r.exchange === "MCX";
                              const tagClass = isNFO ? "nfo" : isMCX ? "mcx" : "nse";

                              return (
                                <div
                                  key={r.id}
                                  className={`t-sym-card ${sel ? "selected" : ""}`}
                                >
                                  {/* Main Row Header */}
                                  <div
                                    onClick={() => {
                                      setInstrument(r);
                                      setExpandedSymbolId(isExpanded ? null : r.id);
                                    }}
                                    style={{
                                      display: "flex", alignItems: "center", justifyContent: "space-between",
                                      padding: "9px 10px", cursor: "pointer"
                                    }}
                                  >
                                    <div style={{ minWidth: 0, flex: 1, paddingRight: 6, display: "flex", alignItems: "center", gap: 8 }}>
                                      <span style={{ fontSize: 10, color: "var(--text-muted)", transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                                        ▶
                                      </span>
                                      <div>
                                        <div style={{
                                          fontWeight: 800, fontSize: 13,
                                          color: "var(--text-primary)",
                                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                                        }}>
                                          {r.tradingSymbol}
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                          <span className={`t-sym-tag ${tagClass}`}>
                                            {r.exchange}
                                          </span>
                                          <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>
                                            {r.segment}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                                      <div style={{
                                        fontWeight: 800, fontSize: 13, fontFamily: "var(--font-mono)",
                                        color: ltp > 0 ? (up ? "var(--green)" : "var(--red)") : "var(--text-secondary)"
                                      }}>
                                        {ltp > 0 ? `₹${ltp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                                      </div>
                                      <div style={{
                                        fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700,
                                        color: up ? "var(--green)" : "var(--red)",
                                        marginTop: 1
                                      }}>
                                        {up ? "+" : ""}{chg.toFixed(2)} ({up ? "+" : ""}{pct.toFixed(2)}%)
                                      </div>
                                      <div style={{
                                        fontSize: 9, fontFamily: "var(--font-mono)",
                                        color: "var(--text-muted)",
                                        marginTop: 2
                                      }}>
                                        Close: ₹{close > 0 ? close.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Expandable Accordion Drawer */}
                                  {isExpanded && (
                                    <div style={{
                                      padding: "8px 10px 10px",
                                      background: "var(--bg-elevated)",
                                      borderTop: "1px solid var(--border)",
                                      display: "flex", flexDirection: "column", gap: 6
                                    }}>
                                      {/* Quick Price Summary Bar */}
                                      <div style={{
                                        display: "flex", justifyContent: "space-between", alignItems: "center",
                                        padding: "5px 8px",
                                        background: "var(--bg-surface)",
                                        border: "1px solid var(--border)",
                                        borderRadius: 5,
                                        fontSize: 10, fontFamily: "var(--font-mono)",
                                        color: "var(--text-secondary)"
                                      }}>
                                        <span>Last: <strong style={{ color: up ? "var(--green)" : "var(--red)" }}>₹{ltp.toFixed(2)}</strong></span>
                                        <span>Close: <strong style={{ color: "var(--text-primary)" }}>₹{close.toFixed(2)}</strong></span>
                                        <span style={{ color: up ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                                          {up ? "+" : ""}{chg.toFixed(2)} ({up ? "+" : ""}{pct.toFixed(2)}%)
                                        </span>
                                      </div>

                                      {/* Quick Order Actions */}
                                      <div style={{ display: "flex", gap: 6 }}>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setInstrument(r); setSide("BUY"); }}
                                          style={{
                                            flex: 1, padding: "6px", borderRadius: 6, border: "none",
                                            background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff",
                                            fontWeight: 800, fontSize: 11, cursor: "pointer", boxShadow: "0 2px 8px rgba(22, 163, 74, 0.3)"
                                          }}
                                        >
                                          🟢 BUY
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setInstrument(r); setSide("SELL"); }}
                                          style={{
                                            flex: 1, padding: "6px", borderRadius: 6, border: "none",
                                            background: "linear-gradient(135deg, #dc2626, #b91c1c)", color: "#fff",
                                            fontWeight: 800, fontSize: 11, cursor: "pointer", boxShadow: "0 2px 8px rgba(220, 38, 38, 0.3)"
                                          }}
                                        >
                                          🔴 SELL
                                        </button>
                                      </div>

                                      {/* Expanded Analytics Tools */}
                                      <div style={{ display: "flex", gap: 5 }}>
                                        <button
                                          title="View Option Chain"
                                          onClick={(e) => { e.stopPropagation(); setChainItem(r); }}
                                          className="app-btn-outline"
                                          style={{ flex: 1, padding: "5px 4px", fontSize: 10, fontWeight: 700 }}
                                        >
                                          ⛓️ Option Chain
                                        </button>

                                        <button
                                          title="View Market Depth (Level 2)"
                                          onClick={(e) => { e.stopPropagation(); setDepthItem(r); }}
                                          className="app-btn-outline"
                                          style={{ flex: 1, padding: "5px 4px", fontSize: 10, fontWeight: 700 }}
                                        >
                                          📖 Depth
                                        </button>

                                        <button
                                          title="View Historical Market Data"
                                          onClick={(e) => { e.stopPropagation(); setHistoryItem(r); }}
                                          className="app-btn-outline"
                                          style={{ flex: 1, padding: "5px 4px", fontSize: 10, fontWeight: 700 }}
                                        >
                                          📊 History
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* Modern Watchlist Pagination */}
                        {totalPages > 1 && (
                          <div style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "8px 4px 2px", marginTop: 6, borderTop: "1px solid var(--border)",
                            fontSize: 11, color: "var(--text-secondary)"
                          }}>
                            <button
                              onClick={() => setPage((p) => Math.max(p - 1, 1))}
                              disabled={page === 1}
                              className="app-btn-outline"
                              style={{ padding: "4px 10px", fontSize: 11, opacity: page === 1 ? 0.4 : 1 }}
                            >
                              ← Prev
                            </button>

                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)" }}>
                              Page {page} of {totalPages} ({filteredResults.length})
                            </span>

                            <button
                              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                              disabled={page === totalPages}
                              className="app-btn-outline"
                              style={{ padding: "4px 10px", fontSize: 11, opacity: page === totalPages ? 0.4 : 1 }}
                            >
                              Next →
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Tab Content: POSITIONS */}
              {sidebarTab === "positions" && (
                <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Open Positions ({positions.filter((p: any) => p.quantity !== 0).length})
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: walletRealizedPnL >= 0 ? "#4ade80" : "#f87171", background: walletRealizedPnL >= 0 ? "rgba(74, 222, 128, 0.1)" : "rgba(248, 113, 113, 0.1)", padding: "2px 6px", borderRadius: 4 }}>
                      Realized: {walletRealizedPnL >= 0 ? "+" : ""}₹{walletRealizedPnL.toFixed(2)}
                    </div>
                  </div>
                  {positions.filter((p: any) => p.quantity !== 0).length === 0 ? (
                    <div style={{ padding: "24px 10px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                      No open positions currently active
                    </div>
                  ) : (
                    positions.filter((p: any) => p.quantity !== 0).map((p: any, i: number) => {
                      const pData = wPrices[p.instrument?.instrumentToken];
                      const curPrice = pData?.ltp ?? p.ltp ?? Number(p.instrument?.lastPrice || p.avgPrice);
                      const closePrice = pData?.close ?? Number(p.instrument?.closePrice || p.instrument?.close || curPrice);
                      const avgPrice = Number(p.avgPrice || p.averagePrice || 0);
                      const pnl = p.quantity * (curPrice - avgPrice);
                      const pnlPct = avgPrice > 0 ? ((curPrice - avgPrice) / avgPrice) * 100 * Math.sign(p.quantity) : 0;
                      const isProfit = pnl >= 0;

                      return (
                        <div
                          key={p.id || i}
                          className={`t-pos-card ${isProfit ? "profit" : "loss"}`}
                          onClick={() => p.instrument && setInstrument(p.instrument)}
                        >
                          <div className="t-pos-header">
                            <div>
                              <div className="t-pos-sym">{p.instrument?.tradingSymbol ?? "—"}</div>
                              <div className="t-pos-meta">Qty {p.quantity} · Avg ₹{avgPrice.toFixed(2)} ({p.productType})</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div className={`t-pos-pnl ${isProfit ? "profit" : "loss"}`}>
                                {isProfit ? "+" : ""}₹{pnl.toFixed(2)}
                              </div>
                              <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: isProfit ? "var(--green)" : "var(--red)" }}>
                                {isProfit ? "+" : ""}{pnlPct.toFixed(2)}%
                              </div>
                            </div>
                          </div>
                          <div className="t-pos-footer">
                            <span className="t-pos-ltp">
                              LTP: ₹{curPrice.toFixed(2)} · Close: ₹{closePrice.toFixed(2)}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (p.instrument) setInstrument(p.instrument);
                                setSide(p.quantity > 0 ? "SELL" : "BUY");
                                setPtype(p.productType || "INTRADAY");
                                setOtype("MARKET");
                                setQty(Math.abs(p.quantity));
                              }}
                              className="t-pos-sq-btn"
                            >
                              Square Off
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Closed / Squared-off Positions */}
                  {positions.filter((p: any) => p.quantity === 0 && Number(p.realizedPnL) !== 0).length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                        Closed Positions ({positions.filter((p: any) => p.quantity === 0 && Number(p.realizedPnL) !== 0).length})
                      </div>
                      {positions.filter((p: any) => p.quantity === 0 && Number(p.realizedPnL) !== 0).map((p: any, i: number) => {
                        const pnl = Number(p.realizedPnL);
                        const isProfit = pnl >= 0;
                        return (
                          <div
                            key={`closed-${p.id || i}`}
                            className="t-closed-card"
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 12, color: "var(--text-primary)" }}>
                                  {p.instrument?.tradingSymbol ?? "—"} <span style={{ fontSize: 10, color: "var(--text-muted)" }}>({p.productType})</span>
                                </div>
                                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                                  Entry: ₹{Number(p.avgPrice).toFixed(2)} · <span style={{ color: "var(--accent)", fontWeight: 600 }}>Squared Off</span>
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "var(--font-mono)", color: isProfit ? "var(--green)" : "var(--red)" }}>
                                  {isProfit ? "+" : ""}₹{pnl.toFixed(2)}
                                </div>
                                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                                  Realized
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab Content: HOLDINGS */}
              {sidebarTab === "holdings" && (
                <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Holdings — Delivery CNC ({holdings.length})
                    </div>
                    {holdings.length > 0 && (() => {
                      const totalInvested = holdings.reduce((s, h) => s + (Number(h.avgPrice || 0) * h.quantity), 0);
                      const totalVal = holdings.reduce((s, h) => {
                        const cp = wPrices[h.instrument?.instrumentToken]?.ltp ?? h.ltp ?? Number(h.instrument?.lastPrice || h.avgPrice || 0);
                        return s + (cp * h.quantity);
                      }, 0);
                      const pnl = totalVal - totalInvested;
                      return (
                        <div style={{ fontSize: 10, fontWeight: 800, color: pnl >= 0 ? "var(--green)" : "var(--red)", background: pnl >= 0 ? "var(--green-bg)" : "var(--red-bg)", padding: "2px 6px", borderRadius: 4 }}>
                          P&amp;L: {pnl >= 0 ? "+" : ""}₹{pnl.toFixed(2)}
                        </div>
                      );
                    })()}
                  </div>
                  {holdings.length === 0 ? (
                    <div style={{ padding: "30px 10px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                      No delivery holdings yet.<br/>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6, display: "inline-block" }}>
                        Place BUY orders with Product: <strong>CNC</strong> (Delivery) to build your equity holdings.
                      </span>
                    </div>
                  ) : (
                    holdings.map((h: any, i: number) => {
                      const pData = wPrices[h.instrument?.instrumentToken];
                      const curPrice = pData?.ltp ?? h.ltp ?? Number(h.instrument?.lastPrice || h.avgPrice || 0);
                      const closePrice = pData?.close ?? Number(h.instrument?.closePrice || h.instrument?.close || curPrice);
                      const avgPrice = Number(h.avgPrice || 0);
                      const invested = avgPrice * h.quantity;
                      const currentValue = curPrice * h.quantity;
                      const pnl = currentValue - invested;
                      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
                      const isProfit = pnl >= 0;

                      return (
                        <div
                          key={h.id || i}
                          className="t-holding-card"
                          onClick={() => h.instrument && setInstrument(h.instrument)}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                              <div className="t-holding-sym">
                                {h.instrument?.tradingSymbol ?? "—"}
                              </div>
                              <div className="t-holding-meta">
                                Qty {h.quantity} · Avg ₹{avgPrice.toFixed(2)}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div className="t-holding-val">
                                ₹{currentValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                              </div>
                              <div className={`t-holding-pnl ${isProfit ? "profit" : "loss"}`}>
                                {isProfit ? "+" : ""}₹{pnl.toFixed(2)} ({isProfit ? "+" : ""}{pnlPct.toFixed(2)}%)
                              </div>
                            </div>
                          </div>

                          <div className="t-holding-footer">
                            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                              LTP: ₹{curPrice.toFixed(2)} · Close: ₹{closePrice.toFixed(2)}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (h.instrument) setInstrument(h.instrument);
                                setSide("SELL");
                                setPtype("DELIVERY");
                                setOtype("MARKET");
                                setQty(h.quantity);
                              }}
                              className="t-holding-exit-btn"
                            >
                              Exit / Sell
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Tab Content: ORDERS */}
              {sidebarTab === "orders" && (
                <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                    Recent Orders ({orders.length})
                  </div>
                  {orders.length === 0 ? (
                    <div style={{ padding: "30px 10px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                      No orders recorded yet
                    </div>
                  ) : (
                    orders.slice(0, 15).map((o: any, i: number) => (
                      <div
                        key={i}
                        className="t-order-card"
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span className="t-order-sym">
                            {o.instrument?.tradingSymbol ?? "—"}
                          </span>
                          <span className={`tag ${o.transactionType === "BUY" ? "tag-buy" : "tag-sell"}`}>
                            {o.transactionType}
                          </span>
                        </div>
                        <div className="t-order-detail">
                          <span>Qty: {o.quantity} @ ₹{Number(o.price || o.averagePrice || 0).toFixed(2)}</span>
                          <span style={{ fontWeight: 700, color: o.status === "COMPLETE" ? "var(--green)" : "var(--red)" }}>
                            {o.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}

        </aside>

        {/* ══ CENTER MAIN ══ */}
        <main className="t-main">
          {/* Chart toolbar */}
          <div className="t-chart-bar">
            <div className="t-sym-chip">
              {instrument ? (
                <>
                  <span className="sym">{instrument.tradingSymbol}</span>
                  <span
                    className={`ltp ${up ? "up" : "dn"}`}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 800,
                      transition: "background-color 0.3s ease, color 0.3s ease",
                      padding: "2px 6px",
                      borderRadius: 4,
                      backgroundColor: priceFlash === "up" ? "rgba(34, 197, 94, 0.2)" : priceFlash === "dn" ? "rgba(239, 68, 68, 0.2)" : "transparent",
                    }}
                  >
                    ₹{(displayLtp ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  {chg !== null && (
                    <span className={`chg ${up ? "up" : "dn"}`} style={{ fontFamily: "var(--font-mono)" }}>
                      {up ? "+" : ""}{chg.toFixed(2)} ({up ? "+" : ""}{chgPct?.toFixed(2)}%)
                    </span>
                  )}
                  {displayClose !== null && (
                    <span className="t-chip-close">
                      Last Close: ₹{Number(displayClose).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                  {quote && (
                    <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 6, fontFamily: "var(--font-mono)" }}>
                      O:{quote.open?.toFixed(2)} H:{quote.high?.toFixed(2)} L:{quote.low?.toFixed(2)}
                    </span>
                  )}
                </>
              ) : (
                <span className="placeholder">← Select a symbol from watchlist</span>
              )}
            </div>
            <div className="t-divider" />
            <div className="tf-group">
              {[["minute","1m"],["5minute","5m"],["15minute","15m"],["day","1D"]].map(([v,l]) => (
                <button key={v} className={`tf-btn ${tf === v ? "active" : ""}`} onClick={() => setTf(v)}>{l}</button>
              ))}
            </div>
            <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
              {instrument ? `${instrument.exchange} · ${instrument.segment}` : ""}
            </div>
          </div>

          {/* Chart */}
          <div className="t-chart">
            {instrument
              ? <LiveChart instrument={instrument} bars={bars} timeframe={tf} theme={theme} />
              : (
                <div className="t-chart-empty">
                  <div className="icon">📈</div>
                  <div className="txt">No symbol selected</div>
                  <div className="sub">Search and click a symbol in the watchlist →</div>
                </div>
              )
            }
          </div>

          {/* Order history */}
          <div className="t-orders">
            <div className="t-section-hdr">
              Order History
              {orders.length > 0 && <span className="count">{orders.length}</span>}
            </div>
            {orders.length === 0 ? (
              <div style={{ padding: "14px 16px", color: "var(--text-muted)", fontSize: 12 }}>No orders yet.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Time</th><th>Symbol</th><th>Side</th>
                    <th>Qty</th><th>Price</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 25).map((o: any) => (
                    <tr key={o.id}>
                      <td style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {new Date(o.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ fontWeight: 700 }}>{o.instrument?.tradingSymbol ?? "—"}</td>
                      <td><span className={`tag tag-${o.transactionType === "BUY" ? "buy" : "sell"}`}>{o.transactionType}</span></td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{o.quantity}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>
                        {o.filledPrice ? `₹${Number(o.filledPrice).toFixed(2)}` : "—"}
                      </td>
                      <td><span className={`tag ${o.status === "OPEN" || o.status === "PENDING" ? "tag-open" : "tag-done"}`}>{o.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>

        {/* ══ RIGHT PANEL ══ */}
        <aside className="t-right">
          {/* Risk dashboard */}
          <div className="t-risk">
            <div className="t-risk-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Virtual Wallet</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: walletRealizedPnL >= 0 ? "#4ade80" : "#f87171", background: "rgba(255,255,255,0.05)", padding: "1px 6px", borderRadius: 4 }}>
                Realized: {walletRealizedPnL >= 0 ? "+" : ""}₹{walletRealizedPnL.toFixed(2)}
              </span>
            </div>
            <div className="t-balance">₹{(wallet ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
              <div className={`t-balance-sub ${totalPnl >= 0 ? "pos" : "neg"}`} style={{ margin: 0 }}>
                {totalPnl >= 0 ? "+" : ""}₹{Math.abs(totalPnl).toLocaleString("en-IN", { maximumFractionDigits: 2 })} unrealised
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", color: walletRealizedPnL >= 0 ? "var(--green)" : "var(--red)" }}>
                {walletRealizedPnL >= 0 ? "+" : ""}₹{walletRealizedPnL.toFixed(2)} realized
              </div>
            </div>
            <div className="t-risk-row"><span className="lbl">Capital deployed</span><span className="val">{deployedPct.toFixed(0)}%</span></div>
            <div className="t-bar"><div className="t-bar-fill g" style={{ width: `${deployedPct}%` }} /></div>
            <div className="t-risk-row"><span className="lbl">Margin used</span><span className="val" style={{ color: "var(--yellow)" }}>₹{margin.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></div>
            <div className="t-bar"><div className="t-bar-fill y" style={{ width: `${Math.min(100, wallet ? margin / wallet * 100 : 0)}%` }} /></div>
          </div>

          {/* Order ticket */}
          <div className="t-ticket">
            <div className="t-ticket-hdr">Place Order</div>

            <div className="t-fg">
              <label className="t-lbl">Symbol</label>
              <select className="t-select" value={instrument?.id ?? ""} onChange={(e) => {
                const f = results.find((r) => r.id === e.target.value);
                if (f) setInstrument(f);
              }}>
                <option value="">{instrument ? instrument.tradingSymbol : "— select from watchlist —"}</option>
                {results.map((r) => <option key={r.id} value={r.id}>{r.tradingSymbol}</option>)}
              </select>
            </div>

            {instrument && (
              <div className="t-stat-card" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Last Price (LTP)</div>
                  <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "var(--font-mono)", color: up ? "var(--green)" : "var(--red)" }}>
                    ₹{(displayLtp ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  {chg !== null && (
                    <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700, color: up ? "var(--green)" : "var(--red)" }}>
                      {up ? "+" : ""}{chg.toFixed(2)} ({up ? "+" : ""}{chgPct?.toFixed(2)}%)
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Last Close Price</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                    ₹{(displayClose ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 10, color: marketStatus?.isOpen ? "var(--green)" : "var(--red)", fontWeight: 700, marginTop: 1 }}>
                    {marketStatus?.isOpen ? "● Market Open" : "○ Market Closed"}
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={placeOrder}>
              <div className="t-bs-toggle">
                <button type="button" className={`t-btn-buy ${side === "BUY" ? "active" : ""}`} onClick={() => setSide("BUY")}>BUY</button>
                <button type="button" className={`t-btn-sell ${side === "SELL" ? "active" : ""}`} onClick={() => setSide("SELL")}>SELL</button>
              </div>

              <div className="t-fg">
                <label className="t-lbl">Qty{instrument?.lotSize && instrument.lotSize > 1 ? ` (lot ${instrument.lotSize})` : ""}</label>
                <input className="t-input" type="number" min={1} value={qty} onChange={(e) => setQty(+e.target.value)} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div className="t-fg">
                  <label className="t-lbl">Order Type</label>
                  <select className="t-select" value={otype} onChange={(e) => setOtype(e.target.value as any)}>
                    <option value="MARKET">Market</option>
                    <option value="LIMIT">Limit</option>
                    <option value="SL">SL Limit</option>
                    <option value="SL_M">SL Market</option>
                  </select>
                </div>
                <div className="t-fg">
                  <label className="t-lbl">Product</label>
                  <select className="t-select" value={ptype} onChange={(e) => setPtype(e.target.value as any)}>
                    <option value="INTRADAY">MIS</option>
                    <option value="DELIVERY">CNC</option>
                    <option value="NORMAL">NRML</option>
                  </select>
                </div>
              </div>

              {(otype === "LIMIT" || otype === "SL") && (
                <div className="t-fg">
                  <label className="t-lbl">Limit Price</label>
                  <input className="t-input" type="number" step="0.05" value={lp} onChange={(e) => setLp(e.target.value === "" ? "" : +e.target.value)} />
                </div>
              )}
              {(otype === "SL" || otype === "SL_M") && (
                <div className="t-fg">
                  <label className="t-lbl">Trigger Price</label>
                  <input className="t-input" type="number" step="0.05" value={tp} onChange={(e) => setTp(e.target.value === "" ? "" : +e.target.value)} />
                </div>
              )}

              <div className="t-margin-box">
                <div className="t-margin-row"><span className="ml">Margin required</span><span className="mv">₹{margin.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></div>
                <div className="t-margin-row"><span className="ml">Available</span><span className="mv">₹{(wallet ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></div>
              </div>

              {marketStatus && !marketStatus.isOpen && (
                <div className="t-market-banner">
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800 }}>
                    <span>⛔</span> Market Closed
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.9, marginTop: 2 }}>
                    Orders cannot be executed. Regular hours: Monday to Friday, 09:15 AM to 03:30 PM IST.
                  </div>
                </div>
              )}

              <button
                type="submit"
                className={`t-place-btn ${side === "BUY" ? "buy" : "sell"}`}
                disabled={!instrument || (marketStatus !== null && !marketStatus.isOpen)}
                style={marketStatus && !marketStatus.isOpen ? { opacity: 0.6, cursor: "not-allowed", filter: "grayscale(0.5)" } : {}}
              >
                {marketStatus && !marketStatus.isOpen
                  ? `Market Closed (09:15 - 15:30 IST)`
                  : `Place ${side} Order`}
              </button>
              {msg && <div className={`t-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
            </form>
          </div>

          {/* 5-Level Market Depth & Quotes */}
          {instrument && quote && (
            <MarketDepthCard quote={quote} instrument={instrument} isLight={isLight} />
          )}

          {/* Competition rank */}
          <div className="t-rank">
            <div className="t-risk-label">Return Score</div>
            <div className={`t-rank-score ${totalPnl >= 0 ? "pos" : "neg"}`}>
              {totalPnl >= 0 ? "+" : ""}{wallet ? ((totalPnl / wallet) * 100).toFixed(2) : "0.00"}%
            </div>
            <div className="t-rank-meta">
              Unrealised · <Link to="/contests">View leaderboard →</Link>
            </div>
          </div>
        </aside>
      </div>

      {/* ══ HISTORICAL DATA MODAL ══ */}
      {historyItem && (
        <div className="t-modal-overlay" onClick={() => setHistoryItem(null)}>
          <div className="t-modal-card" onClick={(e) => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="t-modal-header">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 900, color: "var(--text-primary)", margin: 0 }}>
                    {historyItem.tradingSymbol}
                  </h2>
                  <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(99, 102, 241, 0.15)", border: "1px solid var(--border)", color: "var(--accent)", fontSize: 11, fontWeight: 700 }}>
                    {historyItem.exchange} · {historyItem.segment}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  Historical Market Data &amp; OHLC Candlestick Summary
                </div>
              </div>

              {/* Timeframe selector & Close */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", background: "var(--bg-elevated)", borderRadius: 8, padding: 3, border: "1px solid var(--border)" }}>
                  {[["day", "1D"], ["15minute", "15m"], ["5minute", "5m"], ["minute", "1m"]].map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => setHistoryTf(v as any)}
                      style={{
                        padding: "4px 12px", borderRadius: 6, border: "none",
                        background: historyTf === v ? "linear-gradient(135deg, #2563eb, #3b82f6)" : "transparent",
                        color: historyTf === v ? "#fff" : "var(--text-secondary)",
                        fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s"
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                
                <button
                  onClick={() => setHistoryItem(null)}
                  className="app-btn-outline"
                  style={{ width: 32, height: 32, borderRadius: "50%", padding: 0, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Summary Stat Cards */}
            {(() => {
              const highs = historyData.map((d: any) => Number(d.high || 0)).filter(Boolean);
              const lows = historyData.map((d: any) => Number(d.low || 0)).filter(Boolean);
              const periodHigh = highs.length ? Math.max(...highs) : null;
              const periodLow = lows.length ? Math.min(...lows) : null;
              const firstClose = historyData.length ? Number(historyData[0].close) : null;
              const lastClose = historyData.length ? Number(historyData[historyData.length - 1].close) : null;
              const periodChg = firstClose && lastClose ? lastClose - firstClose : 0;
              const periodPct = firstClose ? (periodChg / firstClose) * 100 : 0;

              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
                  <div className="t-stat-card">
                    <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.05em" }}>Period High</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "var(--blue)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                      {periodHigh ? `₹${periodHigh.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
                    </div>
                  </div>
                  <div className="t-stat-card">
                    <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.05em" }}>Period Low</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "var(--red)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                      {periodLow ? `₹${periodLow.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
                    </div>
                  </div>
                  <div className="t-stat-card">
                    <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.05em" }}>Period Change</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: periodChg >= 0 ? "var(--green)" : "var(--red)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                      {periodChg >= 0 ? "+" : ""}{periodChg.toFixed(2)} ({periodChg >= 0 ? "+" : ""}{periodPct.toFixed(2)}%)
                    </div>
                  </div>
                  <div className="t-stat-card">
                    <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.05em" }}>Total Candles</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                      {historyData.length} records
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Historical Data Table */}
            <div className="t-modal-table-wrap">
              {historyLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  ⏳ Fetching historical market records...
                </div>
              ) : historyData.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  No historical records returned for this symbol timeframe.
                </div>
              ) : (
                <table className="t-modal-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Date / Time</th>
                      <th>Open (₹)</th>
                      <th style={{ color: "var(--blue)" }}>High (₹)</th>
                      <th style={{ color: "var(--red)" }}>Low (₹)</th>
                      <th>Close (₹)</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...historyData].reverse().slice(0, 100).map((row: any, idx: number) => {
                      const open = Number(row.open || 0);
                      const close = Number(row.close || 0);
                      const chg = close - open;
                      const chgPct = open ? (chg / open) * 100 : 0;
                      const dateStr = new Date(row.timestamp).toLocaleString("en-IN", {
                        dateStyle: "medium", timeStyle: historyTf === "day" ? undefined : "short"
                      });

                      return (
                        <tr key={idx}>
                          <td style={{ textAlign: "left", color: "var(--text-secondary)" }}>{dateStr}</td>
                          <td>₹{open.toFixed(2)}</td>
                          <td style={{ color: "var(--blue)", fontWeight: 600 }}>₹{Number(row.high || 0).toFixed(2)}</td>
                          <td style={{ color: "var(--red)", fontWeight: 600 }}>₹{Number(row.low || 0).toFixed(2)}</td>
                          <td style={{ fontWeight: 700 }}>₹{close.toFixed(2)}</td>
                          <td style={{ fontWeight: 700, color: chg >= 0 ? "var(--green)" : "var(--red)" }}>
                            {chg >= 0 ? "+" : ""}{chg.toFixed(2)} ({chg >= 0 ? "+" : ""}{chgPct.toFixed(2)}%)
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <button
                onClick={() => {
                  setInstrument(historyItem);
                  setHistoryItem(null);
                }}
                style={{
                  padding: "9px 18px", borderRadius: 8, border: "none",
                  background: "linear-gradient(135deg, #2563eb, #3b82f6)", color: "#fff",
                  fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 14px rgba(37, 99, 235, 0.4)"
                }}
              >
                📈 Select {historyItem.tradingSymbol} &amp; Load Chart
              </button>

              <button
                onClick={() => setHistoryItem(null)}
                className="app-btn-outline"
                style={{ padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Market Depth Modal */}
      {depthItem && (() => {
        const liveP = depthQuote?.lastPrice || wPrices[depthItem.instrumentToken]?.ltp || Number(depthItem.lastPrice) || ltp || 0;
        const closeP = depthQuote?.close || wPrices[depthItem.instrumentToken]?.close || Number((depthItem as any).closePrice || (depthItem as any).close) || 0;
        const buyLevels = depthQuote?.depth?.buy || [];
        const sellLevels = depthQuote?.depth?.sell || [];
        const totalBidQty = depthQuote?.buyQuantity || buyLevels.reduce((acc, b) => acc + (b.quantity || 0), 0);
        const totalAskQty = depthQuote?.sellQuantity || sellLevels.reduce((acc, s) => acc + (s.quantity || 0), 0);
        const totalQty = totalBidQty + totalAskQty;
        const buyPct = totalQty > 0 ? ((totalBidQty / totalQty) * 100).toFixed(1) : "0.0";
        const sellPct = totalQty > 0 ? ((totalAskQty / totalQty) * 100).toFixed(1) : "0.0";
        const upperCircuit = depthQuote?.upperCircuitLimit;
        const lowerCircuit = depthQuote?.lowerCircuitLimit;
        const bestBid = buyLevels[0]?.price;
        const bestAsk = sellLevels[0]?.price;
        const spread = (bestAsk && bestBid) ? (bestAsk - bestBid).toFixed(2) : "—";

        return (
          <div className="t-modal-overlay" onClick={() => setDepthItem(null)}>
            <div className="t-modal-card" style={{ maxWidth: 640, padding: 0 }} onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "16px 20px", borderBottom: "1px solid var(--border)",
                background: "var(--bg-elevated)"
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                      {depthItem.tradingSymbol}
                    </span>
                    <span className="t-token-pill">
                      {depthItem.exchange} · {depthItem.segment}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                    Level 2 Real-Time Order Depth
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "var(--blue)", fontFamily: "var(--font-mono)" }}>
                    {liveP > 0 ? `₹${liveP.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                    Last Close: {closeP > 0 ? `₹${closeP.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                  </div>
                  <button
                    onClick={() => setDepthItem(null)}
                    className="app-btn-outline"
                    style={{ width: 26, height: 26, borderRadius: "50%", padding: 0, fontSize: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", marginTop: 4 }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Buy / Sell Liquidity Meter Bar */}
              <div style={{ padding: "14px 20px", background: "var(--bg-base)", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                  <span style={{ color: "var(--green)" }}>BUY {buyPct}% ({totalBidQty.toLocaleString()} Qty)</span>
                  <span style={{ color: "var(--red)" }}>SELL {sellPct}% ({totalAskQty.toLocaleString()} Qty)</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "var(--red-bg)", border: "1px solid var(--red-border)", overflow: "hidden", display: "flex" }}>
                  <div style={{ width: `${buyPct}%`, background: "linear-gradient(90deg, #16a34a, #22c55e)", transition: "width 0.3s" }} />
                </div>
              </div>

              {/* Depth Grid (Bids vs Asks) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--border)" }}>
                {/* Bids Column */}
                <div className="t-depth-side-col">
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid var(--green-border)" }}>
                    Bids (Buyers)
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: "var(--text-muted)", fontSize: 10, textAlign: "left" }}>
                        <th style={{ padding: "4px 2px", fontWeight: 700 }}>Orders</th>
                        <th style={{ padding: "4px 2px", fontWeight: 700, textAlign: "right" }}>Qty</th>
                        <th style={{ padding: "4px 2px", fontWeight: 700, textAlign: "right" }}>Price (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buyLevels.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ padding: "16px 2px", textAlign: "center", color: "var(--text-muted)" }}>
                            {depthLoading ? "Loading depth..." : "No bid depth available"}
                          </td>
                        </tr>
                      ) : (
                        buyLevels.slice(0, 5).map((b, i) => (
                          <tr key={i} style={{ background: "var(--green-bg)" }}>
                            <td style={{ padding: "6px 2px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{b.orders !== undefined ? b.orders : "—"}</td>
                            <td style={{ padding: "6px 2px", color: "var(--text-secondary)", textAlign: "right", fontFamily: "var(--font-mono)" }}>{(b.quantity || 0).toLocaleString()}</td>
                            <td style={{ padding: "6px 2px", color: "var(--green)", fontWeight: 700, textAlign: "right", fontFamily: "var(--font-mono)" }}>{b.price ? `₹${Number(b.price).toFixed(2)}` : "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 6, borderTop: "1px solid var(--border)", fontSize: 11, fontWeight: 700 }}>
                    <span style={{ color: "var(--text-muted)" }}>Total Bid Qty</span>
                    <span style={{ color: "var(--green)", fontFamily: "var(--font-mono)" }}>{totalBidQty.toLocaleString()}</span>
                  </div>
                </div>

                {/* Asks Column */}
                <div className="t-depth-side-col">
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid var(--red-border)" }}>
                    Asks (Sellers)
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: "var(--text-muted)", fontSize: 10, textAlign: "left" }}>
                        <th style={{ padding: "4px 2px", fontWeight: 700 }}>Price (₹)</th>
                        <th style={{ padding: "4px 2px", fontWeight: 700, textAlign: "right" }}>Qty</th>
                        <th style={{ padding: "4px 2px", fontWeight: 700, textAlign: "right" }}>Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sellLevels.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ padding: "16px 2px", textAlign: "center", color: "var(--text-muted)" }}>
                            {depthLoading ? "Loading depth..." : "No ask depth available"}
                          </td>
                        </tr>
                      ) : (
                        sellLevels.slice(0, 5).map((a, i) => (
                          <tr key={i} style={{ background: "var(--red-bg)" }}>
                            <td style={{ padding: "6px 2px", color: "var(--red)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{a.price ? `₹${Number(a.price).toFixed(2)}` : "—"}</td>
                            <td style={{ padding: "6px 2px", color: "var(--text-secondary)", textAlign: "right", fontFamily: "var(--font-mono)" }}>{(a.quantity || 0).toLocaleString()}</td>
                            <td style={{ padding: "6px 2px", color: "var(--text-muted)", textAlign: "right", fontFamily: "var(--font-mono)" }}>{a.orders !== undefined ? a.orders : "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 6, borderTop: "1px solid var(--border)", fontSize: 11, fontWeight: 700 }}>
                    <span style={{ color: "var(--text-muted)" }}>Total Ask Qty</span>
                    <span style={{ color: "var(--red)", fontFamily: "var(--font-mono)" }}>{totalAskQty.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Circuit Limits & Info */}
              <div className="t-depth-circuits">
                <div className="t-stat-card">
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Lower Circuit</div>
                  <div style={{ fontSize: 13, color: "var(--red)", fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: 2 }}>
                    {lowerCircuit ? `₹${Number(lowerCircuit).toFixed(2)}` : "—"}
                  </div>
                </div>
                <div className="t-stat-card">
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Upper Circuit</div>
                  <div style={{ fontSize: 13, color: "var(--green)", fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: 2 }}>
                    {upperCircuit ? `₹${Number(upperCircuit).toFixed(2)}` : "—"}
                  </div>
                </div>
                <div className="t-stat-card">
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Spread</div>
                  <div style={{ fontSize: 13, color: "var(--blue)", fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: 2 }}>
                    {spread !== "—" ? `₹${spread}` : "—"}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                <button
                  onClick={() => {
                    setInstrument(depthItem);
                    setSide("BUY");
                    setDepthItem(null);
                  }}
                  style={{
                    flex: 1, padding: "10px", borderRadius: 8, border: "none",
                    background: "linear-gradient(135deg, #16a34a, #22c55e)", color: "#fff",
                    fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 12px rgba(34, 197, 94, 0.3)"
                  }}
                >
                  BUY {depthItem.tradingSymbol}
                </button>
                <button
                  onClick={() => {
                    setInstrument(depthItem);
                    setSide("SELL");
                    setDepthItem(null);
                  }}
                  style={{
                    flex: 1, padding: "10px", borderRadius: 8, border: "none",
                    background: "linear-gradient(135deg, #dc2626, #ef4444)", color: "#fff",
                    fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 12px rgba(239, 68, 68, 0.3)"
                  }}
                >
                  SELL {depthItem.tradingSymbol}
                </button>
                <button
                  onClick={() => setDepthItem(null)}
                  className="app-btn-outline"
                  style={{ padding: "10px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Option Chain Modal */}
      {chainItem && (() => {
        const liveP = wPrices[chainItem.instrumentToken]?.ltp || Number(chainItem.lastPrice) || ltp || 0;
        const closeP = wPrices[chainItem.instrumentToken]?.close || Number((chainItem as any).closePrice || (chainItem as any).close) || liveP;
        const totalCallOI = chainRows.reduce((acc, r) => acc + Number(r.call?.oi || 0), 0);
        const totalPutOI = chainRows.reduce((acc, r) => acc + Number(r.put?.oi || 0), 0);
        const pcr = totalCallOI > 0 ? +(totalPutOI / totalCallOI).toFixed(2) : 0;
        const sentiment = pcr > 1.2 ? "BULLISH" : (pcr < 0.8 && pcr > 0) ? "BEARISH" : "NEUTRAL";

        return (
          <div className="t-modal-overlay" onClick={() => setChainItem(null)}>
            <div className="t-modal-card" style={{ maxWidth: 1100, padding: 0 }} onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "16px 22px", borderBottom: "1px solid var(--border)",
                background: "var(--bg-elevated)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
                        {chainItem.tradingSymbol} Option Chain
                      </span>
                      <span style={{ fontSize: 10, background: "var(--yellow-bg)", color: "var(--yellow)", border: "1px solid var(--yellow-border)", padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>
                        {chainItem.exchange} · OPTIONS
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3, display: "flex", alignItems: "center", gap: 14 }}>
                      <span>Spot LTP: <strong style={{ color: "var(--green)", fontFamily: "var(--font-mono)" }}>{liveP > 0 ? `₹${liveP.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</strong></span>
                      <span>Last Close: <strong style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{closeP > 0 ? `₹${closeP.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Expiry Selector & Close */}
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Expiry:</span>
                    {chainExpiries.length > 0 ? (
                      <select
                        value={chainExpiry}
                        onChange={(e) => setChainExpiry(e.target.value)}
                        className="t-chain-select"
                      >
                        {chainExpiries.map((exp) => (
                          <option key={exp} value={exp}>{exp}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>No expiries in DB</span>
                    )}
                  </div>

                  <button
                    onClick={() => setChainItem(null)}
                    className="app-btn-outline"
                    style={{ width: 30, height: 30, borderRadius: "50%", padding: 0, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Sentiment & PCR Banner */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 22px",
                background: "var(--bg-base)",
                borderBottom: "1px solid var(--border)",
                fontSize: 11, fontWeight: 700
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ color: "var(--text-muted)" }}>
                    Put-Call Ratio (PCR): <strong style={{ color: pcr >= 1 ? "var(--green)" : "var(--red)", fontFamily: "var(--font-mono)" }}>{pcr > 0 ? pcr : "—"}</strong>
                  </span>
                  {pcr > 0 && (
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 10,
                      background: sentiment === "BULLISH" ? "var(--green-bg)" : sentiment === "BEARISH" ? "var(--red-bg)" : "var(--bg-elevated)",
                      color: sentiment === "BULLISH" ? "var(--green)" : sentiment === "BEARISH" ? "var(--red)" : "var(--text-secondary)",
                      border: `1px solid ${sentiment === "BULLISH" ? "var(--green-border)" : sentiment === "BEARISH" ? "var(--red-border)" : "var(--border)"}`
                    }}>
                      {sentiment} SENTIMENT
                    </span>
                  )}
                </div>

                <div style={{ color: "var(--text-muted)", display: "flex", gap: 20 }}>
                  <span>Total Call OI: <strong style={{ color: "var(--green)", fontFamily: "var(--font-mono)" }}>{totalCallOI > 0 ? totalCallOI.toLocaleString() : "—"}</strong></span>
                  <span>Total Put OI: <strong style={{ color: "var(--red)", fontFamily: "var(--font-mono)" }}>{totalPutOI > 0 ? totalPutOI.toLocaleString() : "—"}</strong></span>
                </div>
              </div>

              {/* Option Chain Table Header (CALLS | STRIKE | PUTS) */}
              <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-surface)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--bg-elevated)", zIndex: 5 }}>
                    <tr style={{ borderBottom: "1px solid var(--border)", textTransform: "uppercase", fontSize: 10, letterSpacing: "0.05em" }}>
                      <th colSpan={6} style={{ padding: "8px 12px", textAlign: "center", color: "var(--green)", borderRight: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                        CALLS (CE)
                      </th>
                      <th colSpan={1} style={{ padding: "8px 12px", textAlign: "center", color: "var(--yellow)", background: "var(--yellow-bg)", borderRight: "1px solid var(--border)" }}>
                        STRIKE
                      </th>
                      <th colSpan={6} style={{ padding: "8px 12px", textAlign: "center", color: "var(--red)", background: "var(--bg-elevated)" }}>
                        PUTS (PE)
                      </th>
                    </tr>
                    <tr style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)", fontSize: 10, background: "var(--bg-elevated)" }}>
                      {/* Calls Headers */}
                      <th style={{ padding: "6px 8px", textAlign: "left" }}>Action</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>OI</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Volume</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>IV %</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Chg %</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", color: "var(--green)", borderRight: "1px solid var(--border)" }}>LTP (₹)</th>

                      {/* Strike Header */}
                      <th style={{ padding: "6px 12px", textAlign: "center", color: "var(--yellow)", background: "var(--yellow-bg)", borderRight: "1px solid var(--border)" }}>Price (₹)</th>

                      {/* Puts Headers */}
                      <th style={{ padding: "6px 8px", textAlign: "left", color: "var(--red)" }}>LTP (₹)</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Chg %</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>IV %</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Volume</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>OI</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chainLoading ? (
                      <tr>
                        <td colSpan={13} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                          ⏳ Loading option contracts from database...
                        </td>
                      </tr>
                    ) : chainRows.length === 0 ? (
                      <tr>
                        <td colSpan={13} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                          No option contracts found in database for {chainItem.tradingSymbol}{chainExpiry ? ` (${chainExpiry})` : ""}.
                        </td>
                      </tr>
                    ) : (
                      chainRows.map((row) => {
                        const callLtp = Number(row.call?.lastPrice || 0);
                        const putLtp = Number(row.put?.lastPrice || 0);
                        const strike = Number(row.strike || 0);
                        const isATM = liveP > 0 && Math.abs(strike - liveP) < 50;
                        const isCallITM = liveP > 0 && strike < liveP;
                        const isPutITM = liveP > 0 && strike > liveP;
                        const callBg = isCallITM ? "var(--green-bg)" : "transparent";
                        const putBg = isPutITM ? "var(--red-bg)" : "transparent";
                        const strikeBg = isATM ? "var(--yellow-bg)" : "var(--bg-elevated)";

                        return (
                          <tr
                            key={strike}
                            style={{
                              borderBottom: isATM ? "2px solid var(--yellow)" : "1px solid var(--border)",
                              transition: "background 0.1s"
                            }}
                          >
                            {/* Calls Data */}
                            <td style={{ padding: "7px 8px", background: callBg }}>
                              {row.call ? (
                                <button
                                  onClick={() => {
                                    setInstrument({
                                      id: row.call.instrumentToken || `${chainItem.id}-${strike}-CE`,
                                      instrumentToken: row.call.instrumentToken || `${chainItem.instrumentToken}`,
                                      tradingSymbol: row.call.tradingSymbol || `${chainItem.tradingSymbol}${strike}CE`,
                                      exchange: chainItem.exchange || "NFO",
                                      segment: "OPTIONS",
                                      lotSize: chainItem.lotSize || 1,
                                      lastPrice: callLtp,
                                    });
                                    setSide("BUY");
                                    setChainItem(null);
                                  }}
                                  style={{
                                    padding: "2px 6px", borderRadius: 4, border: "1px solid var(--green-border)",
                                    background: "var(--green-bg)", color: "var(--green)",
                                    fontWeight: 700, fontSize: 10, cursor: "pointer"
                                  }}
                                >
                                  BUY CE
                                </button>
                              ) : "—"}
                            </td>
                            <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", background: callBg }}>
                              {row.call?.oi !== undefined && row.call?.oi !== null ? Number(row.call.oi).toLocaleString() : "—"}
                            </td>
                            <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-muted)", fontFamily: "var(--font-mono)", background: callBg }}>
                              {row.call?.volume !== undefined && row.call?.volume !== null ? Number(row.call.volume).toLocaleString() : "—"}
                            </td>
                            <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", background: callBg }}>
                              {row.call?.iv ? `${Number(row.call.iv).toFixed(1)}%` : "—"}
                            </td>
                            <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600, color: (row.call?.netChange || 0) >= 0 ? "var(--green)" : "var(--red)", fontFamily: "var(--font-mono)", background: callBg }}>
                              {row.call?.changePercent !== undefined ? `${Number(row.call.changePercent).toFixed(2)}%` : "—"}
                            </td>
                            <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 800, color: "var(--green)", fontFamily: "var(--font-mono)", background: callBg, borderRight: "1px solid var(--border)" }}>
                              {callLtp > 0 ? `₹${callLtp.toFixed(2)}` : "—"}
                            </td>

                            {/* Strike Price Column */}
                            <td style={{
                              padding: "7px 12px", textAlign: "center", fontWeight: 800,
                              color: isATM ? "var(--yellow)" : "var(--text-primary)", background: strikeBg,
                              fontFamily: "var(--font-mono)", borderRight: "1px solid var(--border)"
                            }}>
                              {strike} {isATM && <span style={{ fontSize: 9, background: "var(--yellow)", color: "#000", padding: "1px 4px", borderRadius: 3, marginLeft: 4, fontWeight: 900 }}>ATM</span>}
                            </td>

                            {/* Puts Data */}
                            <td style={{ padding: "7px 8px", textAlign: "left", fontWeight: 800, color: "var(--red)", fontFamily: "var(--font-mono)", background: putBg }}>
                              {putLtp > 0 ? `₹${putLtp.toFixed(2)}` : "—"}
                            </td>
                            <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600, color: (row.put?.netChange || 0) >= 0 ? "var(--green)" : "var(--red)", fontFamily: "var(--font-mono)", background: putBg }}>
                              {row.put?.changePercent !== undefined ? `${Number(row.put.changePercent).toFixed(2)}%` : "—"}
                            </td>
                            <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", background: putBg }}>
                              {row.put?.iv ? `${Number(row.put.iv).toFixed(1)}%` : "—"}
                            </td>
                            <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-muted)", fontFamily: "var(--font-mono)", background: putBg }}>
                              {row.put?.volume !== undefined && row.put?.volume !== null ? Number(row.put.volume).toLocaleString() : "—"}
                            </td>
                            <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", background: putBg }}>
                              {row.put?.oi !== undefined && row.put?.oi !== null ? Number(row.put.oi).toLocaleString() : "—"}
                            </td>
                            <td style={{ padding: "7px 8px", textAlign: "right", background: putBg }}>
                              {row.put ? (
                                <button
                                  onClick={() => {
                                    setInstrument({
                                      id: row.put.instrumentToken || `${chainItem.id}-${strike}-PE`,
                                      instrumentToken: row.put.instrumentToken || `${chainItem.instrumentToken}`,
                                      tradingSymbol: row.put.tradingSymbol || `${chainItem.tradingSymbol}${strike}PE`,
                                      exchange: chainItem.exchange || "NFO",
                                      segment: "OPTIONS",
                                      lotSize: chainItem.lotSize || 1,
                                      lastPrice: putLtp,
                                    });
                                    setSide("BUY");
                                    setChainItem(null);
                                  }}
                                  style={{
                                    padding: "2px 6px", borderRadius: 4, border: "1px solid var(--red-border)",
                                    background: "var(--red-bg)", color: "var(--red)",
                                    fontWeight: 700, fontSize: 10, cursor: "pointer"
                                  }}
                                >
                                  BUY PE
                                </button>
                              ) : "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer Actions */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 22px", borderTop: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  💡 Click <strong>BUY CE</strong> or <strong>BUY PE</strong> on any strike to immediately load the option contract into the Order Form.
                </span>

                <button
                  onClick={() => setChainItem(null)}
                  className="app-btn-outline"
                  style={{ padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}
                >
                  Close Option Chain
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Error Boundary to prevent page breaking across prod, qc, uat, beta, dev ──
import React from "react";

class TerminalErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: any) {
    console.error("[Terminal Crash Prevented by ErrorBoundary]:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-base)",
          color: "var(--text-primary)",
          padding: 24,
          textAlign: "center"
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--red)", marginBottom: 8 }}>
            Trading Terminal Temporary State Notice
          </h2>
          <p style={{ color: "var(--text-muted)", maxWidth: 520, fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
            The terminal encountered an unexpected response format while loading market data. The interface was protected from crashing.
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            className="app-btn-outline"
            style={{
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              color: "#fff",
              border: "none",
              padding: "10px 24px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            Reload Terminal
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ProtectedTerminal() {
  return (
    <TerminalErrorBoundary>
      <Terminal />
    </TerminalErrorBoundary>
  );
}
