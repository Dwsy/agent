import React from "react";
import { Callout, H1, H2, Stack, Table, Text } from "@gen-ui/canvas";

const EVIDENCE = [
  ["Checkout conversion", "3.8%", "+0.6 pp", "Experiment cohort"],
  ["p95 completion time", "42 s", "-11 s", "Session telemetry"],
  ["Support contacts", "1.7%", "-0.4 pp", "Tagged tickets"],
];

export default function EvidenceBrief() {
  return (
    <Stack gap={24}>
      <Stack gap={4}>
        <H1>Checkout change — evidence brief</H1>
        <Text tone="secondary" size="small">Scope: web checkout · last 14 days · sources: experiment, telemetry, support</Text>
      </Stack>

      <Callout tone="success" title="Takeaway">
        The simplified checkout improved conversion while reducing completion time; support contacts also declined in the same cohort.
      </Callout>

      <Stack gap={8}>
        <H2>Evidence</H2>
        <Table
          headers={["Measure", "Current", "Change", "Evidence"]}
          rows={EVIDENCE}
          columnAlign={["left", "right", "right", "left"]}
          rowTone={["success", "success", "success"]}
        />
      </Stack>

      <Stack gap={6}>
        <H2>What matters</H2>
        <Text>Conversion and speed moved in the same direction, which reduces the chance that the headline result is only a trade-off between throughput and user effort.</Text>
        <Text tone="secondary">Treat the support-contact change as supporting evidence rather than causal proof unless the ticket taxonomy and cohort assignment are verified.</Text>
      </Stack>

      <Text tone="tertiary" size="small">Replace all example values above with supplied or retrieved evidence before rendering a real brief.</Text>
    </Stack>
  );
}
