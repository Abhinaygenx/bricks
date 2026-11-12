"use client";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

// Palette derived from the brand: brick red leads, charcoal and beige support,
// with a teal and an amber for contrast where a second/third series needs it.
export const C = { brick: "#A63D2F", charcoal: "#3A3A3A", beige: "#C9B48F", teal: "#2F7F7A", amber: "#D4912A", sky: "#5B8DB8", grid: "#E7E2DA" };

const inrTick = (v: number) => (Math.abs(v) >= 1e5 ? `₹${(v / 1e5).toFixed(1)}L` : Math.abs(v) >= 1e3 ? `₹${(v / 1e3).toFixed(0)}k` : `₹${v}`);
const numTick = (v: number) => (Math.abs(v) >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : `${v}`);
const inr = (v: number) => "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const nfmt = (v: number) => Number(v).toLocaleString("en-IN");
const shortDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

const tooltipStyle = { borderRadius: 8, border: "1px solid #E7E2DA", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" };

function Empty({ h }: { h: number }) {
  return <div style={{ height: h }} className="flex items-center justify-center text-sm text-muted-foreground">No data for this period</div>;
}

export function SalesCollectionChart({ data, height = 260 }: { data: { bucket: string; sales: number; collected: number }[]; height?: number }) {
  if (!data.length || data.every((d) => !d.sales && !d.collected)) return <Empty h={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={shortDate} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tickFormatter={inrTick} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
        <Tooltip formatter={(v: number) => inr(v)} labelFormatter={shortDate} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
        <Bar dataKey="sales" name="Sales (invoiced)" fill={C.brick} radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Line dataKey="collected" name="Collected" stroke={C.teal} strokeWidth={2} dot={false} type="monotone" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function MonthlySalesChart({ data, height = 260 }: { data: { bucket: string; sales: number }[]; height?: number }) {
  if (!data.length || data.every((d) => !d.sales)) return <Empty h={height} />;
  const monthFmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={monthFmt} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={inrTick} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
        <Tooltip formatter={(v: number) => inr(v)} labelFormatter={monthFmt} contentStyle={tooltipStyle} />
        <Bar dataKey="sales" name="Sales" fill={C.brick} radius={[3, 3, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StockMovementChart({
  data,
  height = 260,
}: {
  data: { bucket: string; production: number; incoming: number; dispatch: number; damage: number }[];
  height?: number;
}) {
  if (!data.length || data.every((d) => !d.production && !d.incoming && !d.dispatch && !d.damage)) return <Empty h={height} />;
  const rows = data.map((d) => ({ ...d, dispatch: -d.dispatch, damage: -d.damage }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} stackOffset="sign" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={shortDate} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tickFormatter={numTick} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
        <Tooltip formatter={(v: number) => nfmt(Math.abs(v)) + " bricks"} labelFormatter={shortDate} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
        <Bar dataKey="production" name="Produced" stackId="s" fill={C.brick} maxBarSize={28} />
        <Bar dataKey="incoming" name="Incoming" stackId="s" fill={C.beige} maxBarSize={28} />
        <Bar dataKey="dispatch" name="Dispatched" stackId="s" fill={C.charcoal} maxBarSize={28} />
        <Bar dataKey="damage" name="Damaged" stackId="s" fill={C.amber} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProductionChart({ data, height = 240 }: { data: { bucket: string; production: number }[]; height?: number }) {
  if (!data.length || data.every((d) => !d.production)) return <Empty h={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="prodFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.brick} stopOpacity={0.3} />
            <stop offset="100%" stopColor={C.brick} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={shortDate} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tickFormatter={numTick} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
        <Tooltip formatter={(v: number) => nfmt(v) + " bricks"} labelFormatter={shortDate} contentStyle={tooltipStyle} />
        <Area dataKey="production" name="Produced" stroke={C.brick} fill="url(#prodFill)" strokeWidth={2} type="monotone" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CreditChart({ data, height = 260 }: { data: { name: string; balance: number; limit: number }[]; height?: number }) {
  if (!data.length) return <Empty h={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} horizontal={false} />
        <XAxis type="number" tickFormatter={inrTick} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={110} />
        <Tooltip formatter={(v: number) => inr(v)} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
        <Bar dataKey="balance" name="Outstanding" fill={C.brick} radius={[0, 3, 3, 0]} maxBarSize={18}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.limit > 0 && d.balance > d.limit ? C.amber : C.brick} />
          ))}
        </Bar>
        <Bar dataKey="limit" name="Credit limit" fill={C.beige} radius={[0, 3, 3, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PaymentModeChart({ data, height = 240 }: { data: { mode: string; amount: number }[]; height?: number }) {
  const rows = data.filter((d) => d.amount > 0);
  if (!rows.length) return <Empty h={height} />;
  const colors = [C.brick, C.teal, C.charcoal, C.beige, C.amber, C.sky];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={rows} dataKey="amount" nameKey="mode" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
          {rows.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => inr(v)} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
}
