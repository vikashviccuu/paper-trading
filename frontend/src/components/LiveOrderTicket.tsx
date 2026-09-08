import { useEffect, useState, FormEvent } from "react";
import { Instrument } from "../services/api";
import { LiveTradingAPI, LiveOrder } from "../services/liveTradingApi";

/**
 * The live (real-money) order ticket - deliberately a separate component
 * from the paper order form in Trade.tsx, with its own 2FA step before
 * every submission (SEBI's Feb 2025 algo-trading circular requires 2FA for
 * API/algo order placement - see docs/LIVE_TRADING.md).
 */
export default function LiveOrderTicket({ instrument }: { instrument: Instrument }) {
  const [transactionType, setTransactionType] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "SL" | "SL_M">("MARKET");
  const [productType, setProductType] = useState<"INTRADAY" | "DELIVERY" | "NORMAL">("INTRADAY");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState<number | "">("");
  const [triggerPrice, setTriggerPrice] = useState<number | "">("");

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function loadOrders() {
    LiveTradingAPI.listOrders().then((res) => setOrders(res.data.slice(0, 10)));
  }
  useEffect(loadOrders, []);

  async function sendOtp() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await LiveTradingAPI.sendOrderOtp(phone);
      setOtpSent(true);
      setOtpVerified(false);
      setDevOtp((res.data as any).otp ?? null);
      setMessage("OTP sent - confirm it to unlock order placement.");
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? "Could not send OTP");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setBusy(true);
    setMessage(null);
    try {
      await LiveTradingAPI.verifyOrderOtp(phone, otp);
      setOtpVerified(true);
      setMessage("OTP confirmed - you can place this order now.");
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? "Incorrect or expired OTP");
    } finally {
      setBusy(false);
    }
  }

  async function submitOrder(e: FormEvent) {
    e.preventDefault();
    if (!otpVerified) {
      setMessage("Confirm the OTP before placing a live order.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await LiveTradingAPI.placeOrder({
        tradingSymbol: instrument.tradingSymbol,
        exchange: instrument.exchange,
        instrumentToken: instrument.instrumentToken,
        transactionType,
        orderType,
        productType,
        quantity: Number(quantity),
        price: price === "" ? undefined : Number(price),
        triggerPrice: triggerPrice === "" ? undefined : Number(triggerPrice),
        twoFactorPhone: phone,
      });
      setMessage("Live order submitted to your broker.");
      setOtpVerified(false);
      setOtpSent(false);
      setOtp("");
      loadOrders();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? "Live order failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ borderColor: "#f85149" }}>
      <h3 style={{ color: "#f85149" }}>Live Order Ticket - Real Money</h3>

      <form onSubmit={submitOrder}>
        <div className="row">
          <button type="button" onClick={() => setTransactionType("BUY")} style={{ opacity: transactionType === "BUY" ? 1 : 0.5 }}>
            BUY
          </button>
          <button type="button" className="sell" onClick={() => setTransactionType("SELL")} style={{ opacity: transactionType === "SELL" ? 1 : 0.5 }}>
            SELL
          </button>
        </div>

        <label>
          Product
          <select value={productType} onChange={(e) => setProductType(e.target.value as any)}>
            <option value="INTRADAY">Intraday</option>
            <option value="DELIVERY">Delivery</option>
            <option value="NORMAL">Normal / Carry-forward (F&O)</option>
          </select>
        </label>

        <label>
          Order Type
          <select value={orderType} onChange={(e) => setOrderType(e.target.value as any)}>
            <option value="MARKET">Market</option>
            <option value="LIMIT">Limit</option>
            <option value="SL">Stop-loss Limit</option>
            <option value="SL_M">Stop-loss Market</option>
          </select>
        </label>

        <label>
          Quantity
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </label>

        {(orderType === "LIMIT" || orderType === "SL") && (
          <label>
            Price
            <input type="number" step="0.05" value={price} onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))} />
          </label>
        )}

        {(orderType === "SL" || orderType === "SL_M") && (
          <label>
            Trigger Price
            <input
              type="number"
              step="0.05"
              value={triggerPrice}
              onChange={(e) => setTriggerPrice(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </label>
        )}

        <div className="card" style={{ marginTop: 12, marginBottom: 12 }}>
          <strong>Confirm with OTP (required for every live order)</strong>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              placeholder="10-digit mobile number"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setOtpSent(false);
                setOtpVerified(false);
              }}
              maxLength={10}
            />
            <button type="button" onClick={sendOtp} disabled={busy || phone.length !== 10}>
              Send OTP
            </button>
          </div>
          {otpSent && !otpVerified && (
            <div className="row" style={{ marginTop: 8 }}>
              <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit OTP" maxLength={6} />
              <button type="button" onClick={verifyOtp} disabled={busy || otp.length !== 6}>
                Verify OTP
              </button>
            </div>
          )}
          {devOtp && <div style={{ color: "#999", fontSize: 12, marginTop: 4 }}>Dev mode: OTP is <strong>{devOtp}</strong></div>}
          {otpVerified && <div style={{ color: "#3fb950", marginTop: 4 }}>✓ OTP confirmed - ready to submit</div>}
        </div>

        <button type="submit" className={transactionType === "SELL" ? "sell" : ""} disabled={busy || !otpVerified}>
          Place LIVE {transactionType} order
        </button>
        {message && <div style={{ marginTop: 8 }}>{message}</div>}
      </form>

      <h4 style={{ marginTop: 16 }}>Recent Live Orders</h4>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Side</th>
            <th>Qty</th>
            <th>Status</th>
            <th>Broker Order ID</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.tradingSymbol}</td>
              <td>{o.transactionType}</td>
              <td>{o.quantity}</td>
              <td>{o.status}{o.rejectionReason ? ` - ${o.rejectionReason}` : ""}</td>
              <td>{o.brokerOrderId ?? "-"}</td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={5} style={{ color: "#999" }}>
                No live orders yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
