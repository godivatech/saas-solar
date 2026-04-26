import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp } from "lucide-react";

interface AttendanceTrendChartProps {
  data: Array<{
    date: string;
    present: number;
    absent: number;
    late: number;
  }>;
}

export function AttendanceTrendChart({ data }: AttendanceTrendChartProps) {
  return (
    <Card data-testid="card-attendance-trend">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base md:text-lg">
          <TrendingUp className="h-5 w-5" />
          Attendance Trend (7 Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '8px',
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
              iconType="circle"
            />
            <Bar dataKey="present" fill="#10B981" name="Present" radius={[4, 4, 0, 0]} />
            <Bar dataKey="late" fill="#F59E0B" name="Late" radius={[4, 4, 0, 0]} />
            <Bar dataKey="absent" fill="#EF4444" name="Absent" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
