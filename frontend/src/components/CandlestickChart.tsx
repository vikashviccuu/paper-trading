import { useEffect, useRef } from "react";
import { createChart, IChartApi, ISeriesApi, CandlestickData } from "lightweight-charts";
import { getSocket, Tick } from "../services/socket";

interface Props {
  instrumentToken: string;
  bars: CandlestickData[]; // initial historical bars from /market/history
}

/**
 * Renders historical candles then keeps updating the last (in-progress) bar
 * live from the WebSocket tick stream - the same pattern TradingView-style
 * charts use for "live candle" behavior.
 */
export default function CandlestickChart({ instrumentToken, bars }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 400,
      layout: { background: { color: "#171b26" }, textColor: "#ccc" },
      grid: { vertLines: { color: "#232733" }, horzLines: { color: "#232733" } },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#3fb950",
      downColor: "#f85149",
      borderVisible: false,
      wickUpColor: "#3fb950",
      wickDownColor: "#f85149",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const resize = () => chart.applyOptions({ width: containerRef.current!.clientWidth });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    seriesRef.current?.setData(bars);
  }, [bars]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("subscribe", [instrumentToken]);

    let currentBar: CandlestickData | null = bars[bars.length - 1] ?? null;

    const onTick = (tick: Tick) => {
      if (tick.instrumentToken !== instrumentToken || !seriesRef.current) return;
      const time = Math.floor(Date.now() / 1000) as any;
      if (!currentBar) {
        currentBar = { time, open: tick.lastPrice, high: tick.lastPrice, low: tick.lastPrice, close: tick.lastPrice };
      } else {
        currentBar = {
          ...currentBar,
          close: tick.lastPrice,
          high: Math.max(Number(currentBar.high), tick.lastPrice),
          low: Math.min(Number(currentBar.low), tick.lastPrice),
        };
      }
      seriesRef.current.update(currentBar);
    };

    socket.on("tick", onTick);
    return () => {
      socket.off("tick", onTick);
      socket.emit("unsubscribe", [instrumentToken]);
    };
  }, [instrumentToken, bars]);

  return <div ref={containerRef} />;
}
