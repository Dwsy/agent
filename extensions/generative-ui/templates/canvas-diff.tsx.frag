import React from "react";
import { Card, CardBody, CardHeader, DiffStats, DiffView, H1, Stack, Text } from "@gen-ui/canvas";

const LINES = [
  { type: "unchanged" as const, content: "export function add(a: number, b: number) {", lineNumber: 1 },
  { type: "removed" as const, content: "  return a + b;", lineNumber: 2 },
  { type: "added" as const, content: "  const result = a + b;", lineNumber: 2 },
  { type: "added" as const, content: "  return result;", lineNumber: 3 },
  { type: "unchanged" as const, content: "}", lineNumber: 4 },
];

export default function DiffReview() {
  return (
    <Stack gap={14}>
      <Stack gap={4}>
        <H1>Change review</H1>
        <Text tone="secondary" size="small">1 file changed · +2 / -1</Text>
      </Stack>
      <Card collapsible defaultOpen>
        <CardHeader trailing={<DiffStats additions={2} deletions={1} />}>src/math.ts</CardHeader>
        <CardBody style={{ padding: 0 }}>
          <DiffView path="src/math.ts" lines={LINES} />
        </CardBody>
      </Card>
    </Stack>
  );
}
