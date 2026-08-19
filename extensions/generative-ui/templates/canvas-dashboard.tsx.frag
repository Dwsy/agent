import React from "react";
import { H1, H2, Row, Stack, Stat, Table, Text } from "@gen-ui/canvas";

const ROWS = [
  ["api-gateway", "Healthy", "3.2k"],
  ["workers", "Elevated", "8.1k"],
  ["billing", "Healthy", "1.4k"],
];

export default function Dashboard() {
  return (
    <Stack gap={16}>
      <Stack gap={4}>
        <H1>Service throughput</H1>
        <Text tone="secondary" size="small">Source: production telemetry · last 24 hours</Text>
      </Stack>
      <Row gap={20} wrap>
        <Stat value="12.7k" label="Requests / min" />
        <Stat value="212 ms" label="p95 latency" tone="warning" />
      </Row>
      <Stack gap={8}>
        <H2>Active services</H2>
        <Table
          headers={["Service", "Status", "RPS"]}
          rows={ROWS}
          columnAlign={["left", "left", "right"]}
          rowTone={["success", "warning", "success"]}
        />
      </Stack>
    </Stack>
  );
}
