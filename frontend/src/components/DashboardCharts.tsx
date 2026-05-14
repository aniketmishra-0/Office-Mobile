"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

// ---------------------------------------------------------------------------
// Submissions Area Chart (Last 30 Days)
// ---------------------------------------------------------------------------

export function SubmissionsChart({ data }: { data: Array<{ date: string; count: number }> }) {
  if (data.length === 0) {
    return <p className="widget__empty">No submissions in the last 30 days</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#C8623A" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#C8623A" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#9C9488" }}
          tickFormatter={(v) => {
            const d = new Date(v);
            return `${d.getDate()}/${d.getMonth() + 1}`;
          }}
          axisLine={{ stroke: "#D4CECC" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#9C9488" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: "#FAF8F5",
            border: "1px solid #D4CECC",
            borderRadius: 0,
            fontFamily: "var(--font-plex-mono), monospace",
            fontSize: 11,
          }}
          labelFormatter={(v) => {
            const d = new Date(v as string);
            return d.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            });
          }}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#C8623A"
          strokeWidth={2}
          fill="url(#colorCount)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Top Forms Bar Chart
// ---------------------------------------------------------------------------

export function TopFormsChart({
  data,
}: {
  data: Array<{ id: string; form_title: string; submission_count: number }>;
}) {
  if (data.length === 0) {
    return <p className="widget__empty">No forms yet</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
      >
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: "#9C9488" }}
          axisLine={{ stroke: "#D4CECC" }}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="form_title"
          tick={{ fontSize: 11, fill: "#1A1714" }}
          width={120}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "#FAF8F5",
            border: "1px solid #D4CECC",
            borderRadius: 0,
            fontFamily: "var(--font-plex-mono), monospace",
            fontSize: 11,
          }}
        />
        <Bar dataKey="submission_count" radius={[0, 3, 3, 0]}>
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={i === 0 ? "#C8623A" : "#9C9488"}
              opacity={1 - i * 0.07}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
