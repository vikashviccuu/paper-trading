import { useEffect, useState, useRef, FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams, Link } from "react-router-dom";
import { createChart, IChartApi, ISeriesApi, CandlestickData } from "lightweight-charts";
import { Instrument, MarketAPI, OrdersAPI, PortfolioAPI, api } from "../services/api";
import { getSocket, Tick } from "../services/socket";

const INDICES = [
  { label: "NIFTY 50",  token: "256265" },
  { label: "BANKNIFTY", token: "260105" },
  { label: "FINNIFTY",  token: "257801" },
  { label: "INDIA VIX", token: "264969" },
  { label: "MIDCAP",    token: "288009" },
];

// ── Ticker bar ───────────────────────────────────────────────
function TickerBar() {
  const [prices, setPrices] = useState<Record<string, { ltp: number; chg: number; pct: number }>>({});

  useEffect(() => {
    const s = getSocket();
    const tokens = INDICES.map((i) => i.token);
    s.emit("subscribe", tokens);
    const onTick = (t: Tick) =>
      setPrices((p) => ({
        ...p,
        [t.instrumentToken]: {
          ltp: t.lastPrice,
          chg: t.lastPrice - (t.close ?? 0),
          pct: t.close ? ((t.lastPrice - t.close) / t.close) * 100 : 0,
        },
      }));
    s.on("tick", onTick);
    return () => { s.off("tick", onTick); s.emit("unsubscribe", tokens); };
  }, []);

  return (
    <div className="t-ticker">
      {INDICES.map((idx, i) => {
        const p = prices[idx.token];
        const up = p ? p.chg >= 0 : true;
        return (
          <div key={idx.token} style={{ display: "flex", alignItems: "center", gap: 28 }}>
            {i > 0 && <div className="t-tick-sep" />}
            <div className="t-tick">
              <span className="lbl">{idx.label}</span>
              <span className="val">{p ? p.ltp.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}</span>
              {p && <span className={`chg ${up ? "up" : "dn"}`}>{up ? "+" : ""}{p.chg.toFixed(2)} ({up ? "+" : ""}{p.pct.toFixed(2)}%)</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Kite status bar (shown only when token is invalid) ───────
function KiteStatusBar() {
  return null;
}

// ── Live candlestick chart ───────────────────────────────────
function LiveChart({ instrument, bars }: { instrument: Instrument; bars: CandlestickData[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const c = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: ref.current.clientHeight || 320,
      layout: { background: { color: "#080b12" }, textColor: "#484f58" },
      grid: { vertLines: { color: "#1e2d3d" }, horzLines: { color: "#1e2d3d" } },
      crosshair: { vertLine: { color: "#2563eb66" }, horzLine: { color: "#2563eb66" } },
      rightPriceScale: { borderColor: "#1e2d3d" },
      timeScale: { borderColor: "#1e2d3d", timeVisible: true, secondsVisible: false },
    });
    const s = c.addCandlestickSeries({
      upColor: "#3fb950", downColor: "#f85149",
      borderVisible: false, wickUpColor: "#3fb950", wickDownColor: "#f85149",
    });
    chart.current = c; series.current = s;
    const onResize = () => ref.current && c.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight || 320 });
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); c.remove(); };
  }, []);

  useEffect(() => { series.current?.setData(bars); }, [bars]);

  useEffect(() => {
    const s = getSocket();
    s.emit("subscribe", [instrument.instrumentToken]);
    let cur: CandlestickData | null = bars[bars.length - 1] ?? null;
    const onTick = (t: Tick) => {
      if (t.instrumentToken !== instrument.instrumentToken || !series.current) return;
      const time = Math.floor(Date.now() / 1000) as any;
      cur = cur
        ? { ...cur, time, close: t.lastPrice, high: Math.max(+cur.high, t.lastPrice), low: Math.min(+cur.low, t.lastPrice) }
        : { time, open: t.lastPrice, high: t.lastPrice, low: t.lastPrice, close: t.lastPrice };
      series.current.update(cur);
    };
    s.on("tick", onTick);
    return () => { s.off("tick", onTick); s.emit("unsubscribe", [instrument.instrumentToken]); };
  }, [instrument.instrumentToken, bars]);

  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}

// ── Main terminal ────────────────────────────────────────────
export default function Terminal() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const [sp]      = useSearchParams();
  const contestId = sp.get("contestId") ?? undefined;
  const isAdmin   = location.pathname.startsWith("/admin");

  const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const defaultApiKey = isLocal ? "ouuv4g2r3iyafu5c" : "jfwd2gvwal8pq0rp";
  const [loginUrl, setLoginUrl] = useState(`https://kite.zerodha.com/connect/login?api_key=${defaultApiKey}&v=3`);

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

  const [instrument, setInstrument] = useState<Instrument | null>((location.state as Instrument) ?? null);
  const [bars,       setBars]       = useState<CandlestickData[]>([]);
  const [tf,         setTf]         = useState("day");
  const [ltp,        setLtp]        = useState<number | null>(null);
  const [prevClose,  setPrevClose]  = useState<number | null>(null);
  const [quote,      setQuote]      = useState<any>(null);

  // order form
  const [side,  setSide]  = useState<"BUY"|"SELL">("BUY");
  const [otype, setOtype] = useState<"MARKET"|"LIMIT"|"SL"|"SL_M">("MARKET");
  const [ptype, setPtype] = useState<"INTRADAY"|"DELIVERY"|"NORMAL">("INTRADAY");
  const [qty,   setQty]   = useState(1);
  const [lp,    setLp]    = useState<number|"">("");
  const [tp,    setTp]    = useState<number|"">("");
  const [msg,   setMsg]   = useState<{text:string;ok:boolean}|null>(null);

  const [wallet,    setWallet]    = useState<number|null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [orders,    setOrders]    = useState<any[]>([]);
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState<Instrument[]>([]);
  const [wPrices,   setWPrices]   = useState<Record<string,number>>({});
  const [page,          setPage]          = useState(1);
  const pageSize = 10;
  const [sidebarTab,          setSidebarTab]          = useState<"watchlist" | "positions" | "orders">("watchlist");
  const [segmentFilter,       setSegmentFilter]       = useState<"ALL" | "NSE" | "NFO" | "MCX">("ALL");
  const [isSidebarCollapsed,  setIsSidebarCollapsed]  = useState(false);
  const [expandedSymbolId,    setExpandedSymbolId]    = useState<string | null>(null);

  // Watchlist History Modal state
  const [historyItem,    setHistoryItem]    = useState<Instrument | null>(null);
  const [historyTf,      setHistoryTf]      = useState<"day" | "15minute" | "5minute" | "1minute">("day");
  const [historyData,    setHistoryData]    = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Watchlist Market Depth Modal state
  const [depthItem,      setDepthItem]      = useState<Instrument | null>(null);

  // Watchlist Option Chain Modal state
  const [chainItem,      setChainItem]      = useState<Instrument | null>(null);
  const [chainExpiry,    setChainExpiry]    = useState<string>("24-SEP-2026");

  function generateOptionChain(spotPrice: number) {
    const basePrice = spotPrice > 0 ? spotPrice : 24000;
    const step = basePrice > 15000 ? 100 : basePrice > 2000 ? 50 : 20;
    const atmStrike = Math.round(basePrice / step) * step;

    const strikes = [];
    let totalCallOI = 0;
    let totalPutOI = 0;

    for (let i = -7; i <= 7; i++) {
      const strike = atmStrike + i * step;
      const isATM = strike === atmStrike;
      const isCallITM = strike < basePrice;
      const isPutITM = strike > basePrice;

      const callIntrinsic = Math.max(0, basePrice - strike);
      const callTimeVal = Math.max(5, (step * 2.5) - Math.abs(i) * (step * 0.25));
      const callLtp = +(callIntrinsic + callTimeVal).toFixed(2);
      const callChg = +( (i < 0 ? 1 : -1) * (12.5 + Math.abs(i) * 2.1) ).toFixed(2);
      const callOI = Math.max(1000, Math.floor(150000 - Math.abs(i) * 12000 + (i === 0 ? 45000 : 0)));
      const callVol = Math.floor(callOI * 0.35);
      const callIv = +(15.2 + Math.abs(i) * 0.4).toFixed(1);

      const putIntrinsic = Math.max(0, strike - basePrice);
      const putTimeVal = Math.max(5, (step * 2.5) - Math.abs(i) * (step * 0.25));
      const putLtp = +(putIntrinsic + putTimeVal).toFixed(2);
      const putChg = +( (i > 0 ? 1 : -1) * (14.2 + Math.abs(i) * 1.8) ).toFixed(2);
      const putOI = Math.max(1000, Math.floor(140000 - Math.abs(i) * 11000 + (i === 0 ? 52000 : 0)));
      const putVol = Math.floor(putOI * 0.38);
      const putIv = +(16.1 + Math.abs(i) * 0.5).toFixed(1);

      totalCallOI += callOI;
      totalPutOI += putOI;

      strikes.push({
        strike, isATM, isCallITM, isPutITM,
        callLtp, callChg, callOI, callVol, callIv,
        putLtp, putChg, putOI, putVol, putIv
      });
    }

    const pcr = totalCallOI > 0 ? +(totalPutOI / totalCallOI).toFixed(2) : 1.0;
    const sentiment = pcr > 1.2 ? "BULLISH" : pcr < 0.8 ? "BEARISH" : "NEUTRAL";

    return { strikes, atmStrike, totalCallOI, totalPutOI, pcr, sentiment };
  }

  function generateMarketDepth(price: number) {
    const basePrice = price > 0 ? price : 100;
    const tick = 0.05;
    
    const bids = [
      { orders: 12, qty: 1450, price: +(basePrice - tick * 1).toFixed(2) },
      { orders: 28, qty: 3200, price: +(basePrice - tick * 2).toFixed(2) },
      { orders: 45, qty: 5800, price: +(basePrice - tick * 3).toFixed(2) },
      { orders: 19, qty: 2100, price: +(basePrice - tick * 4).toFixed(2) },
      { orders: 62, qty: 8900, price: +(basePrice - tick * 5).toFixed(2) },
    ];

    const asks = [
      { price: +(basePrice + tick * 1).toFixed(2), qty: 1200, orders: 15 },
      { price: +(basePrice + tick * 2).toFixed(2), qty: 2900, orders: 31 },
      { price: +(basePrice + tick * 3).toFixed(2), qty: 4400, orders: 22 },
      { price: +(basePrice + tick * 4).toFixed(2), qty: 1800, orders: 11 },
      { price: +(basePrice + tick * 5).toFixed(2), qty: 7300, orders: 54 },
    ];

    const totalBidQty = bids.reduce((acc, b) => acc + b.qty, 0);
    const totalAskQty = asks.reduce((acc, a) => acc + a.qty, 0);

    return { bids, asks, totalBidQty, totalAskQty };
  }

  // fetch historical data for modal
  useEffect(() => {
    if (!historyItem) return;
    setHistoryLoading(true);
    const to = new Date().toISOString().slice(0, 10);
    const days = historyTf === "day" ? 60 : historyTf === "15minute" ? 5 : 2;
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    MarketAPI.history(historyItem.instrumentToken, historyTf, from, to)
      .then((r) => setHistoryData(r.data ?? []))
      .catch(() => setHistoryData([]))
      .finally(() => setHistoryLoading(false));
  }, [historyItem?.instrumentToken, historyTf]);

  // portfolio refresh
  useEffect(() => {
    PortfolioAPI.get().then((r) => {
      setWallet(Number(r.data.wallet?.cashBalance ?? r.data.wallet?.balance ?? 0));
      setPositions(r.data.positions ?? []);
    }).catch(() => {});
    OrdersAPI.list().then((r) => setOrders(r.data ?? [])).catch(() => {});
  }, [msg]);

  // REST quote for OHLC chip — fires once per instrument selection
  useEffect(() => {
    if (!instrument) return;
    setQuote(null);
    api.get("/broker/zerodha/live-quotes")
      .then((r) => {
        const found = (r.data as any[]).find((q) =>
          q.symbol === `${instrument.exchange}:${instrument.tradingSymbol}` ||
          String(q.instrumentToken) === instrument.instrumentToken
        );
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
    const to   = new Date().toISOString().slice(0, 10);
    const days = tf === "day" ? 60 : tf === "15minute" ? 5 : 2;
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    MarketAPI.history(instrument.instrumentToken, tf as any, from, to)
      .then((r) => {
        const mapped = r.data.map((b: any) => ({
          time: (new Date(b.timestamp).getTime() / 1000) as any,
          open: b.open, high: b.high, low: b.low, close: b.close,
        }));
        setBars(mapped);
        if (mapped.length) setPrevClose(mapped[mapped.length - 1].close);
      }).catch(() => {});
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
    const t = setTimeout(() => MarketAPI.search(query).then((r) => setResults(r.data)).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [query]);

  // watchlist live prices
  useEffect(() => {
    if (!results.length) return;
    const s = getSocket();
    const tokens = results.map((r) => r.instrumentToken);
    s.emit("subscribe", tokens);
    const onTick = (t: Tick) => setWPrices((p) => ({ ...p, [t.instrumentToken]: t.lastPrice }));
    s.on("tick", onTick);
    return () => { s.off("tick", onTick); s.emit("unsubscribe", tokens); };
  }, [results]);

  async function placeOrder(e: FormEvent) {
    e.preventDefault();
    if (!instrument) return;
    setMsg(null);
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

  const displayLtp   = ltp ?? quote?.lastPrice ?? null;
  const displayClose = prevClose ?? quote?.close ?? null;
  const chg    = displayLtp && displayClose ? displayLtp - displayClose : null;
  const chgPct = chg && displayClose ? (chg / displayClose) * 100 : null;
  const up     = chg !== null ? chg >= 0 : true;
  const totalPnl    = positions.reduce((s: number, p: any) => s + Number(p.unrealisedPnl ?? p.realizedPnL ?? 0), 0);
  const deployedPct = wallet ? Math.min(100, positions.reduce((s: number, p: any) => s + Math.abs(+p.quantity) * +(p.averagePrice ?? p.avgPrice ?? 0), 0) / wallet * 100) : 0;
  const margin      = instrument ? (+(displayLtp ?? 0) * qty * (instrument.lotSize || 1) * 0.12) : 0;

  return (
    <div className="t-root">
      <TickerBar />
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
            <div className="t-nav-title" style={{ color: "#60a5fa", fontWeight: 800 }}>Admin Terminal</div>
          </div>
        )}
        <div className="t-nav-right">
          <span className="pill pill-blue">Paper</span>
          <span className="pill pill-live">KITE LIVE</span>
          <a
            href={loginUrl}
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
                      flex: 1, padding: "6px 6px", borderRadius: 6, border: "none",
                      background: sidebarTab === "watchlist" ? "linear-gradient(135deg, rgba(37,99,235,0.25), rgba(124,58,237,0.25))" : "transparent",
                      color: sidebarTab === "watchlist" ? "#60a5fa" : "var(--text-muted)",
                      fontWeight: sidebarTab === "watchlist" ? 700 : 500, fontSize: 11,
                      cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                      boxShadow: sidebarTab === "watchlist" ? "inset 0 0 0 1px rgba(96,165,250,0.3)" : "none"
                    }}
                  >
                    <span>⭐ Watchlist</span>
                  </button>

                  <button
                    onClick={() => setSidebarTab("positions")}
                    style={{
                      flex: 1, padding: "6px 6px", borderRadius: 6, border: "none",
                      background: sidebarTab === "positions" ? "linear-gradient(135deg, rgba(37,99,235,0.25), rgba(124,58,237,0.25))" : "transparent",
                      color: sidebarTab === "positions" ? "#60a5fa" : "var(--text-muted)",
                      fontWeight: sidebarTab === "positions" ? 700 : 500, fontSize: 11,
                      cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                      boxShadow: sidebarTab === "positions" ? "inset 0 0 0 1px rgba(96,165,250,0.3)" : "none"
                    }}
                  >
                    <span>💼 Positions</span>
                    {positions.filter((p: any) => p.quantity !== 0).length > 0 && (
                      <span style={{ fontSize: 9, background: "#2563eb", color: "#fff", borderRadius: 99, padding: "1px 5px", fontWeight: 800 }}>
                        {positions.filter((p: any) => p.quantity !== 0).length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setSidebarTab("orders")}
                    style={{
                      flex: 1, padding: "6px 6px", borderRadius: 6, border: "none",
                      background: sidebarTab === "orders" ? "linear-gradient(135deg, rgba(37,99,235,0.25), rgba(124,58,237,0.25))" : "transparent",
                      color: sidebarTab === "orders" ? "#60a5fa" : "var(--text-muted)",
                      fontWeight: sidebarTab === "orders" ? 700 : 500, fontSize: 11,
                      cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
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
                  {/* Segment Filter Pills */}
                  <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                    {(["ALL", "NSE", "NFO", "MCX"] as const).map((seg) => (
                      <button
                        key={seg}
                        onClick={() => { setSegmentFilter(seg); setPage(1); }}
                        style={{
                          flex: 1, padding: "4px 0", borderRadius: 5, border: "1px solid",
                          borderColor: segmentFilter === seg ? "rgba(96,165,250,0.4)" : "rgba(255,255,255,0.06)",
                          background: segmentFilter === seg ? "rgba(37,99,235,0.2)" : "rgba(255,255,255,0.02)",
                          color: segmentFilter === seg ? "#60a5fa" : "var(--text-muted)",
                          fontSize: 10, fontWeight: 700, cursor: "pointer", transition: "all 0.12s"
                        }}
                      >
                        {seg}
                      </button>
                    ))}
                  </div>

                  {/* Search Input Container */}
                  <div style={{ position: "relative", marginBottom: 10 }}>
                    <input
                      className="t-search"
                      placeholder="Search symbol (e.g. RELIANCE, NIFTY)…"
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
                      if (segmentFilter === "NSE") return r.exchange === "NSE";
                      if (segmentFilter === "NFO") return r.exchange === "NFO" || String(r.segment) === "FUTURES" || String(r.segment) === "OPTIONS";
                      if (segmentFilter === "MCX") return r.exchange === "MCX";
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
                              const p = wPrices[r.instrumentToken] ?? Number(r.lastPrice ?? 0);
                              const sel = instrument?.id === r.id;
                              const isExpanded = expandedSymbolId === r.id;
                              const isNFO = r.exchange === "NFO" || String(r.segment) === "FUTURES" || String(r.segment) === "OPTIONS";
                              const isMCX = r.exchange === "MCX";

                              const segBg = isNFO ? "rgba(168,85,247,0.15)" : isMCX ? "rgba(245,158,11,0.15)" : "rgba(59,130,246,0.15)";
                              const segColor = isNFO ? "#c084fc" : isMCX ? "#fbbf24" : "#60a5fa";

                              return (
                                <div
                                  key={r.id}
                                  style={{
                                    borderRadius: 8, marginBottom: 6, overflow: "hidden",
                                    background: sel ? "rgba(37, 99, 235, 0.12)" : "rgba(255, 255, 255, 0.02)",
                                    border: sel ? "1px solid rgba(96, 165, 250, 0.4)" : "1px solid rgba(255, 255, 255, 0.05)",
                                    borderLeft: sel ? "3px solid #3b82f6" : "3px solid transparent",
                                    transition: "all 0.15s ease"
                                  }}
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
                                        <div style={{ fontWeight: 800, fontSize: 13, color: "#f8fafc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                          {r.tradingSymbol}
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: segBg, color: segColor }}>
                                            {r.exchange}
                                          </span>
                                          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                                            {r.segment}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                                      <div style={{
                                        fontWeight: 800, fontSize: 13, fontFamily: "var(--font-mono)",
                                        color: p > 0 ? "#4ade80" : "var(--text-secondary)"
                                      }}>
                                        {p > 0 ? `₹${p.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
                                      </div>
                                      <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                                        {isExpanded ? "Click to collapse" : "Click to expand"}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Expandable Accordion Drawer */}
                                  {isExpanded && (
                                    <div style={{
                                      padding: "8px 10px 10px", background: "rgba(0, 0, 0, 0.25)",
                                      borderTop: "1px solid rgba(255, 255, 255, 0.05)", display: "flex",
                                      flexDirection: "column", gap: 6
                                    }}>
                                      {/* Quick Order Actions */}
                                      <div style={{ display: "flex", gap: 6 }}>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setInstrument(r); setSide("BUY"); }}
                                          style={{
                                            flex: 1, padding: "6px", borderRadius: 6, border: "none",
                                            background: "linear-gradient(135deg, #16a34a, #22c55e)", color: "#fff",
                                            fontWeight: 800, fontSize: 11, cursor: "pointer", boxShadow: "0 2px 8px rgba(34, 197, 94, 0.3)"
                                          }}
                                        >
                                          🟢 BUY
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setInstrument(r); setSide("SELL"); }}
                                          style={{
                                            flex: 1, padding: "6px", borderRadius: 6, border: "none",
                                            background: "linear-gradient(135deg, #dc2626, #ef4444)", color: "#fff",
                                            fontWeight: 800, fontSize: 11, cursor: "pointer", boxShadow: "0 2px 8px rgba(239, 68, 68, 0.3)"
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
                                          style={{
                                            flex: 1, background: "rgba(245, 158, 11, 0.15)",
                                            border: "1px solid rgba(245, 158, 11, 0.35)",
                                            color: "#fbbf24", borderRadius: 5, padding: "4px 4px",
                                            fontSize: 10, fontWeight: 700, cursor: "pointer", textAlign: "center"
                                          }}
                                        >
                                          ⛓️ Option Chain
                                        </button>

                                        <button
                                          title="View Market Depth (Level 2)"
                                          onClick={(e) => { e.stopPropagation(); setDepthItem(r); }}
                                          style={{
                                            flex: 1, background: "rgba(56, 189, 248, 0.15)",
                                            border: "1px solid rgba(56, 189, 248, 0.35)",
                                            color: "#38bdf8", borderRadius: 5, padding: "4px 4px",
                                            fontSize: 10, fontWeight: 700, cursor: "pointer", textAlign: "center"
                                          }}
                                        >
                                          📖 Depth
                                        </button>

                                        <button
                                          title="View Historical Market Data"
                                          onClick={(e) => { e.stopPropagation(); setHistoryItem(r); }}
                                          style={{
                                            flex: 1, background: "rgba(99, 102, 241, 0.15)",
                                            border: "1px solid rgba(99, 102, 241, 0.35)",
                                            color: "#818cf8", borderRadius: 5, padding: "4px 4px",
                                            fontSize: 10, fontWeight: 700, cursor: "pointer", textAlign: "center"
                                          }}
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
                              style={{
                                padding: "4px 10px", borderRadius: 5, border: "1px solid var(--border)",
                                background: page === 1 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
                                color: page === 1 ? "var(--text-muted)" : "#f8fafc",
                                fontSize: 11, fontWeight: 700, cursor: page === 1 ? "not-allowed" : "pointer"
                              }}
                            >
                              ← Prev
                            </button>

                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)" }}>
                              Page {page} of {totalPages} ({filteredResults.length})
                            </span>

                            <button
                              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                              disabled={page === totalPages}
                              style={{
                                padding: "4px 10px", borderRadius: 5, border: "1px solid var(--border)",
                                background: page === totalPages ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
                                color: page === totalPages ? "var(--text-muted)" : "#f8fafc",
                                fontSize: 11, fontWeight: 700, cursor: page === totalPages ? "not-allowed" : "pointer"
                              }}
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
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                    Open Positions ({positions.filter((p: any) => p.quantity !== 0).length})
                  </div>
                  {positions.filter((p: any) => p.quantity !== 0).length === 0 ? (
                    <div style={{ padding: "30px 10px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                      No open positions currently active
                    </div>
                  ) : (
                    positions.filter((p: any) => p.quantity !== 0).map((p: any, i: number) => {
                      const pnl = Number(p.unrealisedPnl ?? p.realizedPnL ?? 0);
                      return (
                        <div
                          key={i}
                          className={`t-pos-card ${pnl >= 0 ? "profit" : "loss"}`}
                          onClick={() => p.instrument && setInstrument(p.instrument)}
                        >
                          <div className="t-pos-sym">{p.instrument?.tradingSymbol ?? "—"}</div>
                          <div className="t-pos-meta">Qty {p.quantity} · Avg ₹{Number(p.averagePrice ?? p.avgPrice ?? 0).toFixed(2)}</div>
                          <div className={`t-pos-pnl ${pnl >= 0 ? "profit" : "loss"}`}>
                            {pnl >= 0 ? "+" : ""}₹{Math.abs(pnl).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
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
                        style={{
                          background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)",
                          borderRadius: 8, padding: "8px 10px", marginBottom: 6
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: "#f8fafc" }}>
                            {o.instrument?.tradingSymbol ?? "—"}
                          </span>
                          <span className={`tag ${o.transactionType === "BUY" ? "tag-buy" : "tag-sell"}`}>
                            {o.transactionType}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                          <span>Qty: {o.quantity} @ ₹{Number(o.price || o.averagePrice || 0).toFixed(2)}</span>
                          <span style={{ fontWeight: 700, color: o.status === "COMPLETE" ? "#4ade80" : "#f43f5e" }}>
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
                  <span className={`ltp ${up ? "up" : "dn"}`}>
                    ₹{(displayLtp ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                  {chg !== null && (
                    <span className={`chg ${up ? "up" : "dn"}`}>
                      {up ? "+" : ""}{chg.toFixed(2)} ({up ? "+" : ""}{chgPct?.toFixed(2)}%)
                    </span>
                  )}
                  {quote && (
                    <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 6, fontFamily: "var(--font-mono)" }}>
                      O:{quote.open?.toFixed(2)} H:{quote.high?.toFixed(2)} L:{quote.low?.toFixed(2)} C:{quote.close?.toFixed(2)}
                    </span>
                  )}
                </>
              ) : (
                <span className="placeholder">← Select a symbol from watchlist</span>
              )}
            </div>
            <div className="t-divider" />
            <div className="tf-group">
              {[["1minute","1m"],["5minute","5m"],["15minute","15m"],["day","1D"]].map(([v,l]) => (
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
              ? <LiveChart instrument={instrument} bars={bars} />
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
            <div className="t-risk-label">Virtual Wallet</div>
            <div className="t-balance">₹{(wallet ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
            <div className={`t-balance-sub ${totalPnl >= 0 ? "pos" : "neg"}`}>
              {totalPnl >= 0 ? "+" : ""}₹{Math.abs(totalPnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })} unrealised P&amp;L
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

              <button type="submit" className={`t-place-btn ${side === "BUY" ? "buy" : "sell"}`} disabled={!instrument}>
                Place {side} Order
              </button>
              {msg && <div className={`t-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
            </form>
          </div>



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
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0, 0, 0, 0.78)", backdropFilter: "blur(10px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16
        }} onClick={() => setHistoryItem(null)}>
          <div style={{
            width: "100%", maxWidth: 840, maxHeight: "90vh",
            background: "rgba(13, 17, 28, 0.98)", border: "1px solid rgba(99, 102, 241, 0.35)",
            borderRadius: 16, padding: "24px 28px", boxShadow: "0 25px 60px rgba(0,0,0,0.85)",
            display: "flex", flexDirection: "column", overflow: "hidden"
          }} onClick={(e) => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 14 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 900, color: "#f8fafc", margin: 0 }}>
                    {historyItem.tradingSymbol}
                  </h2>
                  <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(99, 102, 241, 0.2)", border: "1px solid rgba(99, 102, 241, 0.4)", color: "#a5b4fc", fontSize: 11, fontWeight: 700 }}>
                    {historyItem.exchange} · {historyItem.segment}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                  Historical Market Data &amp; OHLC Candlestick Summary
                </div>
              </div>

              {/* Timeframe selector & Close */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 3, border: "1px solid rgba(255,255,255,0.1)" }}>
                  {[["day", "1D"], ["15minute", "15m"], ["5minute", "5m"], ["1minute", "1m"]].map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => setHistoryTf(v as any)}
                      style={{
                        padding: "4px 12px", borderRadius: 6, border: "none",
                        background: historyTf === v ? "linear-gradient(135deg, #4f46e5, #6366f1)" : "transparent",
                        color: historyTf === v ? "#fff" : "#94a3b8",
                        fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s"
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                
                <button
                  onClick={() => setHistoryItem(null)}
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
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
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", color: "#64748b", fontWeight: 700, letterSpacing: "0.05em" }}>Period High</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#38bdf8", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                      {periodHigh ? `₹${periodHigh.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
                    </div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", color: "#64748b", fontWeight: 700, letterSpacing: "0.05em" }}>Period Low</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#f43f5e", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                      {periodLow ? `₹${periodLow.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
                    </div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", color: "#64748b", fontWeight: 700, letterSpacing: "0.05em" }}>Period Change</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: periodChg >= 0 ? "#4ade80" : "#f43f5e", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                      {periodChg >= 0 ? "+" : ""}{periodChg.toFixed(2)} ({periodChg >= 0 ? "+" : ""}{periodPct.toFixed(2)}%)
                    </div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", color: "#64748b", fontWeight: 700, letterSpacing: "0.05em" }}>Total Candles</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                      {historyData.length} records
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Historical Data Table */}
            <div style={{ flex: 1, overflowY: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, background: "rgba(0,0,0,0.2)" }}>
              {historyLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  ⏳ Fetching historical market records...
                </div>
              ) : historyData.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                  No historical records returned for this symbol timeframe.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "#0f172a", borderBottom: "1px solid rgba(255,255,255,0.1)", zIndex: 2 }}>
                    <tr>
                      <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>Date / Time</th>
                      <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>Open (₹)</th>
                      <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 11, color: "#38bdf8", fontWeight: 700 }}>High (₹)</th>
                      <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 11, color: "#f43f5e", fontWeight: 700 }}>Low (₹)</th>
                      <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>Close (₹)</th>
                      <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>Change</th>
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
                        <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", transition: "background 0.1s" }}>
                          <td style={{ padding: "9px 14px", fontSize: 12, color: "#cbd5e1", fontFamily: "var(--font-mono)" }}>{dateStr}</td>
                          <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 12, color: "#e2e8f0", fontFamily: "var(--font-mono)" }}>₹{open.toFixed(2)}</td>
                          <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 12, color: "#38bdf8", fontWeight: 600, fontFamily: "var(--font-mono)" }}>₹{Number(row.high || 0).toFixed(2)}</td>
                          <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 12, color: "#f43f5e", fontWeight: 600, fontFamily: "var(--font-mono)" }}>₹{Number(row.low || 0).toFixed(2)}</td>
                          <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 12, color: "#e2e8f0", fontWeight: 700, fontFamily: "var(--font-mono)" }}>₹{close.toFixed(2)}</td>
                          <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 12, fontWeight: 700, color: chg >= 0 ? "#4ade80" : "#f43f5e", fontFamily: "var(--font-mono)" }}>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <button
                onClick={() => {
                  setInstrument(historyItem);
                  setHistoryItem(null);
                }}
                style={{
                  padding: "9px 18px", borderRadius: 8, border: "none",
                  background: "linear-gradient(135deg, #2563eb, #4f46e5)", color: "#fff",
                  fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 14px rgba(37, 99, 235, 0.4)"
                }}
              >
                📈 Select {historyItem.tradingSymbol} &amp; Load Chart
              </button>

              <button
                onClick={() => setHistoryItem(null)}
                style={{
                  padding: "9px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.05)", color: "#94a3b8",
                  fontWeight: 700, fontSize: 12, cursor: "pointer"
                }}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Market Depth Modal */}
      {depthItem && (() => {
        const liveP = wPrices[depthItem.tradingSymbol] || ltp || 100;
        const depthData = generateMarketDepth(liveP);
        const totalQty = depthData.totalBidQty + depthData.totalAskQty;
        const buyPct = totalQty > 0 ? ((depthData.totalBidQty / totalQty) * 100).toFixed(1) : "50.0";
        const sellPct = totalQty > 0 ? ((depthData.totalAskQty / totalQty) * 100).toFixed(1) : "50.0";
        const upperCircuit = +(liveP * 1.10).toFixed(2);
        const lowerCircuit = +(liveP * 0.90).toFixed(2);

        return (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(3, 7, 18, 0.82)", backdropFilter: "blur(8px)",
            zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20
          }}>
            <div style={{
              background: "#0f172a", border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 16, width: "100%", maxWidth: 640, overflow: "hidden",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)", display: "flex", flexDirection: "column"
            }}>
              {/* Header */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "16px 20px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(255,255,255,0.02)"
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.01em" }}>
                      {depthItem.tradingSymbol}
                    </span>
                    <span style={{ fontSize: 11, background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>
                      {depthItem.exchange} · {depthItem.segment}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                    Level 2 Real-Time Order Depth
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#38bdf8", fontFamily: "var(--font-mono)" }}>
                    ₹{liveP.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </div>
                  <button
                    onClick={() => setDepthItem(null)}
                    style={{ background: "none", border: "none", color: "#64748b", fontSize: 18, cursor: "pointer", padding: "0 4px", marginTop: 2 }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Buy / Sell Liquidity Meter Bar */}
              <div style={{ padding: "14px 20px", background: "rgba(0,0,0,0.15)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                  <span style={{ color: "#4ade80" }}>BUY {buyPct}% ({depthData.totalBidQty.toLocaleString()} Qty)</span>
                  <span style={{ color: "#f43f5e" }}>SELL {sellPct}% ({depthData.totalAskQty.toLocaleString()} Qty)</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(244, 63, 94, 0.4)", overflow: "hidden", display: "flex" }}>
                  <div style={{ width: `${buyPct}%`, background: "linear-gradient(90deg, #16a34a, #4ade80)", transition: "width 0.3s" }} />
                </div>
              </div>

              {/* Depth Grid (Bids vs Asks) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "rgba(255,255,255,0.08)" }}>
                {/* Bids Column */}
                <div style={{ background: "#0f172a", padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid rgba(74, 222, 128, 0.2)" }}>
                    Bids (Buyers)
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: "#64748b", fontSize: 10, textAlign: "left" }}>
                        <th style={{ padding: "4px 2px", fontWeight: 700 }}>Orders</th>
                        <th style={{ padding: "4px 2px", fontWeight: 700, textAlign: "right" }}>Qty</th>
                        <th style={{ padding: "4px 2px", fontWeight: 700, textAlign: "right" }}>Price (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {depthData.bids.map((b, i) => (
                        <tr key={i} style={{ background: "rgba(34, 197, 94, 0.04)" }}>
                          <td style={{ padding: "6px 2px", color: "#94a3b8", fontFamily: "var(--font-mono)" }}>{b.orders}</td>
                          <td style={{ padding: "6px 2px", color: "#cbd5e1", textAlign: "right", fontFamily: "var(--font-mono)" }}>{b.qty.toLocaleString()}</td>
                          <td style={{ padding: "6px 2px", color: "#4ade80", fontWeight: 700, textAlign: "right", fontFamily: "var(--font-mono)" }}>₹{b.price.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 11, fontWeight: 700 }}>
                    <span style={{ color: "#94a3b8" }}>Total Bid Qty</span>
                    <span style={{ color: "#4ade80", fontFamily: "var(--font-mono)" }}>{depthData.totalBidQty.toLocaleString()}</span>
                  </div>
                </div>

                {/* Asks Column */}
                <div style={{ background: "#0f172a", padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#f43f5e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid rgba(244, 63, 94, 0.2)" }}>
                    Asks (Sellers)
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: "#64748b", fontSize: 10, textAlign: "left" }}>
                        <th style={{ padding: "4px 2px", fontWeight: 700 }}>Price (₹)</th>
                        <th style={{ padding: "4px 2px", fontWeight: 700, textAlign: "right" }}>Qty</th>
                        <th style={{ padding: "4px 2px", fontWeight: 700, textAlign: "right" }}>Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {depthData.asks.map((a, i) => (
                        <tr key={i} style={{ background: "rgba(239, 68, 68, 0.04)" }}>
                          <td style={{ padding: "6px 2px", color: "#f43f5e", fontWeight: 700, fontFamily: "var(--font-mono)" }}>₹{a.price.toFixed(2)}</td>
                          <td style={{ padding: "6px 2px", color: "#cbd5e1", textAlign: "right", fontFamily: "var(--font-mono)" }}>{a.qty.toLocaleString()}</td>
                          <td style={{ padding: "6px 2px", color: "#94a3b8", textAlign: "right", fontFamily: "var(--font-mono)" }}>{a.orders}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 11, fontWeight: 700 }}>
                    <span style={{ color: "#94a3b8" }}>Total Ask Qty</span>
                    <span style={{ color: "#f43f5e", fontFamily: "var(--font-mono)" }}>{depthData.totalAskQty.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Circuit Limits & Info */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: 14, background: "rgba(0,0,0,0.2)" }}>
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Lower Circuit</div>
                  <div style={{ fontSize: 13, color: "#f43f5e", fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: 2 }}>₹{lowerCircuit.toFixed(2)}</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Upper Circuit</div>
                  <div style={{ fontSize: 13, color: "#4ade80", fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: 2 }}>₹{upperCircuit.toFixed(2)}</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Spread</div>
                  <div style={{ fontSize: 13, color: "#38bdf8", fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: 2 }}>₹0.05</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: 10, padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
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
                  style={{
                    padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontWeight: 700, fontSize: 12, cursor: "pointer"
                  }}
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
        const liveP = wPrices[chainItem.tradingSymbol] || ltp || 24850;
        const chain = generateOptionChain(liveP);
        const expiries = ["24-SEP-2026", "01-OCT-2026", "08-OCT-2026", "29-OCT-2026"];

        return (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(3, 7, 18, 0.85)", backdropFilter: "blur(10px)",
            zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20
          }}>
            <div style={{
              background: "#0d1117", border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 16, width: "100%", maxWidth: 1100, maxHeight: "90vh", overflow: "hidden",
              boxShadow: "0 25px 60px rgba(0,0,0,0.8)", display: "flex", flexDirection: "column"
            }}>
              {/* Header */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "16px 22px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(255,255,255,0.02)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: "#f8fafc" }}>
                        {chainItem.tradingSymbol} Option Chain
                      </span>
                      <span style={{ fontSize: 10, background: "rgba(245, 158, 11, 0.2)", color: "#fbbf24", padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>
                        {chainItem.exchange} · OPTIONS
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3, display: "flex", alignItems: "center", gap: 12 }}>
                      <span>Spot LTP: <strong style={{ color: "#4ade80", fontFamily: "var(--font-mono)" }}>₹{liveP.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong></span>
                      <span>ATM Strike: <strong style={{ color: "#fbbf24", fontFamily: "var(--font-mono)" }}>{chain.atmStrike}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Expiry Selector & Close */}
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Expiry:</span>
                    <select
                      value={chainExpiry}
                      onChange={(e) => setChainExpiry(e.target.value)}
                      style={{
                        background: "#161b22", border: "1px solid rgba(255,255,255,0.15)",
                        color: "#f8fafc", padding: "6px 12px", borderRadius: 6,
                        fontSize: 12, fontWeight: 700, outline: "none", cursor: "pointer"
                      }}
                    >
                      {expiries.map((exp) => (
                        <option key={exp} value={exp}>{exp}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => setChainItem(null)}
                    style={{ background: "none", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer", padding: "0 4px" }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Sentiment & PCR Banner */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 22px", background: "rgba(0,0,0,0.25)", borderBottom: "1px solid rgba(255,255,255,0.06)",
                fontSize: 11, fontWeight: 700
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ color: "#94a3b8" }}>
                    Put-Call Ratio (PCR): <strong style={{ color: chain.pcr >= 1 ? "#4ade80" : "#f43f5e", fontFamily: "var(--font-mono)" }}>{chain.pcr}</strong>
                  </span>
                  <span style={{
                    padding: "2px 8px", borderRadius: 4, fontSize: 10,
                    background: chain.sentiment === "BULLISH" ? "rgba(34, 197, 94, 0.15)" : chain.sentiment === "BEARISH" ? "rgba(239, 68, 68, 0.15)" : "rgba(148, 163, 184, 0.15)",
                    color: chain.sentiment === "BULLISH" ? "#4ade80" : chain.sentiment === "BEARISH" ? "#f43f5e" : "#cbd5e1"
                  }}>
                    {chain.sentiment} SENTIMENT
                  </span>
                </div>

                <div style={{ color: "#94a3b8", display: "flex", gap: 20 }}>
                  <span>Total Call OI: <strong style={{ color: "#4ade80", fontFamily: "var(--font-mono)" }}>{chain.totalCallOI.toLocaleString()}</strong></span>
                  <span>Total Put OI: <strong style={{ color: "#f43f5e", fontFamily: "var(--font-mono)" }}>{chain.totalPutOI.toLocaleString()}</strong></span>
                </div>
              </div>

              {/* Option Chain Table Header (CALLS | STRIKE | PUTS) */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead style={{ position: "sticky", top: 0, background: "#0d1117", zIndex: 5 }}>
                    <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.1)", textTransform: "uppercase", fontSize: 10, letterSpacing: "0.05em" }}>
                      <th colSpan={6} style={{ padding: "8px 12px", textAlign: "center", color: "#4ade80", borderRight: "1px solid rgba(255,255,255,0.1)" }}>
                        CALLS (CE)
                      </th>
                      <th colSpan={1} style={{ padding: "8px 12px", textAlign: "center", color: "#fbbf24", background: "rgba(245, 158, 11, 0.15)", borderRight: "1px solid rgba(255,255,255,0.1)" }}>
                        STRIKE
                      </th>
                      <th colSpan={6} style={{ padding: "8px 12px", textAlign: "center", color: "#f43f5e" }}>
                        PUTS (PE)
                      </th>
                    </tr>
                    <tr style={{ color: "#64748b", borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 10 }}>
                      {/* Calls Headers */}
                      <th style={{ padding: "6px 8px", textAlign: "left" }}>Action</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>OI</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Volume</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>IV %</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Chg %</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", color: "#4ade80", borderRight: "1px solid rgba(255,255,255,0.1)" }}>LTP (₹)</th>

                      {/* Strike Header */}
                      <th style={{ padding: "6px 12px", textAlign: "center", color: "#fbbf24", background: "rgba(245, 158, 11, 0.1)", borderRight: "1px solid rgba(255,255,255,0.1)" }}>Price (₹)</th>

                      {/* Puts Headers */}
                      <th style={{ padding: "6px 8px", textAlign: "left", color: "#f43f5e" }}>LTP (₹)</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Chg %</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>IV %</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Volume</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>OI</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chain.strikes.map((row) => {
                      const callBg = row.isCallITM ? "rgba(34, 197, 94, 0.08)" : "transparent";
                      const putBg = row.isPutITM ? "rgba(239, 68, 68, 0.08)" : "transparent";
                      const strikeBg = row.isATM ? "rgba(234, 179, 8, 0.25)" : "#161b22";

                      return (
                        <tr
                          key={row.strike}
                          style={{
                            borderBottom: row.isATM ? "2px solid #eab308" : "1px solid rgba(255,255,255,0.03)",
                            transition: "background 0.1s"
                          }}
                        >
                          {/* Calls Data */}
                          <td style={{ padding: "7px 8px", background: callBg }}>
                            <button
                              onClick={() => {
                                setInstrument({
                                  ...chainItem,
                                  tradingSymbol: `${chainItem.tradingSymbol}${row.strike}CE`,
                                  segment: "OPTIONS"
                                });
                                setSide("BUY");
                                setChainItem(null);
                              }}
                              style={{
                                padding: "2px 6px", borderRadius: 4, border: "none",
                                background: "rgba(34, 197, 94, 0.2)", color: "#4ade80",
                                fontWeight: 700, fontSize: 10, cursor: "pointer"
                              }}
                            >
                              BUY CE
                            </button>
                          </td>
                          <td style={{ padding: "7px 8px", textAlign: "right", color: "#94a3b8", fontFamily: "var(--font-mono)", background: callBg }}>
                            {row.callOI.toLocaleString()}
                          </td>
                          <td style={{ padding: "7px 8px", textAlign: "right", color: "#64748b", fontFamily: "var(--font-mono)", background: callBg }}>
                            {row.callVol.toLocaleString()}
                          </td>
                          <td style={{ padding: "7px 8px", textAlign: "right", color: "#cbd5e1", fontFamily: "var(--font-mono)", background: callBg }}>
                            {row.callIv}%
                          </td>
                          <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600, color: row.callChg >= 0 ? "#4ade80" : "#f43f5e", fontFamily: "var(--font-mono)", background: callBg }}>
                            {row.callChg >= 0 ? "+" : ""}{row.callChg}%
                          </td>
                          <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 800, color: "#4ade80", fontFamily: "var(--font-mono)", background: callBg, borderRight: "1px solid rgba(255,255,255,0.1)" }}>
                            ₹{row.callLtp.toFixed(2)}
                          </td>

                          {/* Strike Price Column */}
                          <td style={{
                            padding: "7px 12px", textAlign: "center", fontWeight: 800,
                            color: row.isATM ? "#fbbf24" : "#f8fafc", background: strikeBg,
                            fontFamily: "var(--font-mono)", borderRight: "1px solid rgba(255,255,255,0.1)"
                          }}>
                            {row.strike} {row.isATM && <span style={{ fontSize: 9, background: "#eab308", color: "#000", padding: "1px 4px", borderRadius: 3, marginLeft: 4, fontWeight: 900 }}>ATM</span>}
                          </td>

                          {/* Puts Data */}
                          <td style={{ padding: "7px 8px", textAlign: "left", fontWeight: 800, color: "#f43f5e", fontFamily: "var(--font-mono)", background: putBg }}>
                            ₹{row.putLtp.toFixed(2)}
                          </td>
                          <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600, color: row.putChg >= 0 ? "#4ade80" : "#f43f5e", fontFamily: "var(--font-mono)", background: putBg }}>
                            {row.putChg >= 0 ? "+" : ""}{row.putChg}%
                          </td>
                          <td style={{ padding: "7px 8px", textAlign: "right", color: "#cbd5e1", fontFamily: "var(--font-mono)", background: putBg }}>
                            {row.putIv}%
                          </td>
                          <td style={{ padding: "7px 8px", textAlign: "right", color: "#64748b", fontFamily: "var(--font-mono)", background: putBg }}>
                            {row.putVol.toLocaleString()}
                          </td>
                          <td style={{ padding: "7px 8px", textAlign: "right", color: "#94a3b8", fontFamily: "var(--font-mono)", background: putBg }}>
                            {row.putOI.toLocaleString()}
                          </td>
                          <td style={{ padding: "7px 8px", textAlign: "right", background: putBg }}>
                            <button
                              onClick={() => {
                                setInstrument({
                                  ...chainItem,
                                  tradingSymbol: `${chainItem.tradingSymbol}${row.strike}PE`,
                                  segment: "OPTIONS"
                                });
                                setSide("BUY");
                                setChainItem(null);
                              }}
                              style={{
                                padding: "2px 6px", borderRadius: 4, border: "none",
                                background: "rgba(239, 68, 68, 0.2)", color: "#f43f5e",
                                fontWeight: 700, fontSize: 10, cursor: "pointer"
                              }}
                            >
                              BUY PE
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer Actions */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 22px", borderTop: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                <span style={{ fontSize: 11, color: "#64748b" }}>
                  💡 Click <strong>BUY CE</strong> or <strong>BUY PE</strong> on any strike to immediately load the option contract into the Order Form.
                </span>

                <button
                  onClick={() => setChainItem(null)}
                  style={{
                    padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontWeight: 700, fontSize: 12, cursor: "pointer"
                  }}
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
