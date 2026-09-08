import { env } from "../config/env";
import { InstrumentDTO } from "../brokers/IBrokerAdapter";

/**
 * Simplified margin model. Real brokers use SPAN + exposure margin for F&O
 * (computed by an exchange-published SPAN file) and VaR-based margin for
 * equity intraday. Replicating that exactly is out of scope for a paper
 * trading simulator, so we use flat percentage-of-notional margins that are
 * configurable via .env (EQUITY_INTRADAY_MARGIN_PCT, FNO_MARGIN_PCT). This
 * keeps behavior directionally realistic (F&O needs less margin % than the
 * full notional, intraday equity needs a fraction of delivery) without
 * requiring a SPAN engine.
 */
export interface MarginInput {
  instrument: Pick<InstrumentDTO, "segment" | "lotSize">;
  productType: "INTRADAY" | "DELIVERY" | "NORMAL";
  quantity: number;
  price: number;
}

export function calculateRequiredMargin({ instrument, productType, quantity, price }: MarginInput): number {
  const notional = Math.abs(quantity) * price;

  if (instrument.segment === "EQUITY") {
    if (productType === "DELIVERY") return notional; // full amount, no leverage
    return notional * env.EQUITY_INTRADAY_MARGIN_PCT; // MIS leverage
  }

  // FUTURES / OPTIONS (buying options = premium only, selling/futures = margin %)
  if (instrument.segment === "OPTIONS" && quantity > 0) {
    return notional; // long option = pay full premium, no margin needed
  }
  return notional * env.FNO_MARGIN_PCT;
}
