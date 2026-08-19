import React from "react";
import { BarChart, H1, H2, LineChart, PieChart, Stack, Text } from "@gen-ui/canvas";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function Charts() {
  return (
    <Stack gap={18}>
      <Stack gap={4}>
        <H1>Traffic and reliability</H1>
        <Text tone="secondary" size="small">Source: production telemetry · current week</Text>
      </Stack>
      <Stack gap={8}>
        <H2>Requests by surface</H2>
        <BarChart
          categories={DAYS}
          series={[
            { name: "IDE", data: [120, 138, 132, 151, 164] },
            { name: "CLI", data: [42, 48, 51, 55, 63] },
          ]}
          stacked
          valueSuffix="k"
        />
      </Stack>
      <Stack gap={8}>
        <H2>p95 latency</H2>
        <LineChart
          categories={DAYS}
          series={[{ name: "p95", data: [180, 210, 205, 232, 198], tone: "info" }]}
          valueSuffix=" ms"
          referenceLines={[{ value: 220, label: "Budget", tone: "warning" }]}
        />
      </Stack>
      <Stack gap={8}>
        <H2>Request mix</H2>
        <PieChart
          donut
          data={[
            { label: "IDE", value: 67 },
            { label: "CLI", value: 21 },
            { label: "Cloud", value: 12 },
          ]}
        />
      </Stack>
    </Stack>
  );
}
