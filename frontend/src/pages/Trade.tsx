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
  const [status, setStatus] = useState<"checking" | "ok" | "error">("checking");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  useEffect(() => {
    api.get("/broker/zerodha/status")
      .then((r) => setStatus(r.data.connected ? "ok" : "error"))
      .catch(() => setStatus("error"));
  }, []);

  async function sync() {
    setSyncing(true); setSyncMsg("");
    try {
      const r = await api.post("/market/sync-instruments-public");
      setSyncMsg(`✓ Synced ${r.data.synced.toLocaleString("en-IN")} instruments`);
    } catch { setSyncMsg("Sync failed"); }
    finally { setSyncing(false); }
  }

  if (status === "ok") return null;

  return (
    <div style={{
      background: status === "checking" ? "var(--bg-elevated)" : "var(--red-bg)",
      borderBottom: `1px solid ${status === "checking" ? "var(--border)" : "var(--red-border)"}`,
      padding: "5px 16px", display: "flex", alignItems: "center", gap: 12,
      fontSize: 12, flexShrink: 0,
    }}>
      <span style={{ color: status === "checking" ? "var(--text-muted)" : "var(--red)", fontWeight: 600 }}>
        {status === "checking" ? "⏳ Checking Zerodha…" : "⚠ Zerodha token expired"}
      </span>
      {status === "error" && <>
        <a href="https://kite.zerodha.com/connect/login?api_key=jfwd2gvwal8pq0rp&v=3"
          style={{ color: "#60a5fa", fontWeight: 700, textDecoration: "none" }}>
          Re-authenticate →
        </a>
        <button onClick={sync} disabled={syncing} style={{
          padding: "2px 10px", borderRadius: 4, border: "1px solid var(--border-light)",
          background: "transparent", color: "var(--text-secondary)", fontSize: 11,
          fontWeight: 600, cursor: syncing ? "not-allowed" : "pointer",
        }}>{syncing ? "Syncing…" : "Sync Instruments"}</button>
        {syncMsg && <span style={{ color: "var(--green)", fontSize: 11 }}>{syncMsg}</span>}
      </>}
    </div>
  );
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

  // Zerodha redirects to /trade?status=success&request_token=...
  // Exchange token silently then reload clean URL
  useEffect(() => {
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
        <div className="t-nav-right">
          <span className="pill pill-blue">Paper</span>
          <span className="pill pill-live">KITE LIVE</span>
          <a
            href="https://kite.zerodha.com/connect/login?api_key=jfwd2gvwal8pq0rp&v=3"
            style={{ fontSize: 11, color: "var(--text-muted)", textDecoration: "none", padding: "3px 8px", border: "1px solid var(--border)", borderRadius: 4 }}
          >Re-auth</a>
        </div>
      </nav>

      <div className="t-body">
        {/* ══ LEFT SIDEBAR ══ */}
        <aside className="t-sidebar">
          <div className="t-sidebar-section">Platform</div>
          <div className="t-sidebar-item" onClick={() => navigate("/")}><span className="si-icon">⊞</span>Dashboard</div>
          <div className="t-sidebar-item" onClick={() => navigate("/contests")}><span className="si-icon">🏆</span>Competitions</div>
          <div className="t-sidebar-item active"><span className="si-icon">📈</span>F&amp;O Terminal</div>
          <div className="t-sidebar-item" onClick={() => navigate("/contests")}><span className="si-icon">🥇</span>Leaderboard</div>
          <div className="t-sidebar-item" onClick={() => navigate("/portfolio")}><span className="si-icon">💼</span>My Portfolio</div>

          <div className="t-sidebar-section">Pro Features</div>
          <div className="t-sidebar-item"><span className="si-icon">🧠</span>Strategy Eval<span className="si-pro">PRO</span></div>
          <div className="t-sidebar-item"><span className="si-icon">📊</span>NIFTY Index<span className="si-pro">PRO</span></div>
          <div className="t-sidebar-item"><span className="si-icon">🎯</span>Prop Challenge<span className="si-pro">PRO</span></div>

          <div className="t-sidebar-section">Account</div>
          <div className="t-sidebar-item" onClick={() => navigate("/profile")}><span className="si-icon">👤</span>Profile &amp; KYC</div>
          <div className="t-sidebar-item" onClick={() => navigate("/contests")}><span className="si-icon">🎁</span>Prizes &amp; Payouts</div>

          <div className="t-sidebar-section">System</div>
          <div className="t-sidebar-item" onClick={() => navigate("/admin/login")}><span className="si-icon">⚙️</span>Admin Panel</div>

          {positions.filter((p: any) => p.quantity !== 0).length > 0 && (
            <>
              <div className="t-sidebar-section" style={{ marginTop: 8 }}>Open Positions</div>
              {positions.filter((p: any) => p.quantity !== 0).slice(0, 4).map((p: any, i: number) => {
                const pnl = Number(p.unrealisedPnl ?? 0);
                return (
                  <div key={i} className={`t-pos-card ${pnl >= 0 ? "profit" : "loss"}`}>
                    <div className="t-pos-sym">{p.instrument?.tradingSymbol ?? "—"}</div>
                    <div className="t-pos-meta">Qty {p.quantity} · Avg ₹{Number(p.averagePrice ?? p.avgPrice ?? 0).toFixed(2)}</div>
                    <div className={`t-pos-pnl ${pnl >= 0 ? "profit" : "loss"}`}>
                      {pnl >= 0 ? "+" : ""}₹{Math.abs(pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                );
              })}
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

          {/* Watchlist */}
          <div className="t-watchlist">
            <div className="t-section-hdr" style={{ position: "static", marginBottom: 8 }}>Watchlist</div>
            <input className="t-search" placeholder="Search symbol…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {results.slice(0, 12).map((r) => {
              const p = wPrices[r.instrumentToken] ?? Number(r.lastPrice ?? 0);
              const sel = instrument?.id === r.id;
              return (
                <div key={r.id} className={`t-watch-row ${sel ? "selected" : ""}`} onClick={() => setInstrument(r)}>
                  <div>
                    <div className="t-watch-sym">{r.tradingSymbol}</div>
                    <div className="t-watch-seg">{r.exchange} · {r.segment}</div>
                  </div>
                  <div className={`t-watch-price ${p > 0 ? "up" : "neu"}`}>
                    {p > 0 ? `₹${p.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
                  </div>
                </div>
              );
            })}
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
    </div>
  );
}
