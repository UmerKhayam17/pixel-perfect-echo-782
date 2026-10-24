import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChartPoint } from "@/types";

export function ActivityChart({ data }: { data: ChartPoint[] }) {
  // Guard against SSR: Recharts needs a measured DOM before rendering.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader>
        <CardTitle className="font-display text-base font-semibold">Lead collection activity</CardTitle>
        <CardDescription>Leads collected per day over the last 14 days</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          {mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                    fontSize: 13,
                    color: "var(--color-popover-foreground)",
                  }}
                  labelStyle={{ color: "var(--color-muted-foreground)" }}
                  formatter={(value: number | string, name: string) => [value, name === "leads" ? "Leads" : "Searches"]}
                />
                <Area
                  type="monotone"
                  dataKey="leads"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  fill="url(#leadFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
