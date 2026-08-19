import React from "react";
import { Button, Checkbox, H1, Row, Select, Stack, Text, TextArea, TextInput, Toggle, sendToAgent, useCanvasState } from "@gen-ui/canvas";

export default function SettingsForm() {
  const [form, setForm] = useCanvasState("settings", {
    name: "",
    notes: "",
    priority: "medium",
    alerts: true,
    confirmed: false,
  });
  const patch = (next: Record<string, unknown>) => setForm((prev) => ({ ...prev, ...next }));

  return (
    <Stack gap={14}>
      <Stack gap={4}>
        <H1>Deployment settings</H1>
        <Text tone="secondary">Values persist for this canvas between reloads.</Text>
      </Stack>
      <TextInput value={form.name} onChange={(name) => patch({ name })} placeholder="Deployment name" />
      <TextArea value={form.notes} onChange={(notes) => patch({ notes })} placeholder="Notes" rows={4} />
      <Select
        value={form.priority}
        onChange={(priority) => patch({ priority })}
        options={[
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ]}
      />
      <Row align="center" gap={8}>
        <Toggle checked={form.alerts} onChange={(alerts) => patch({ alerts })} />
        <Text as="span">Notify on completion</Text>
      </Row>
      <Checkbox checked={form.confirmed} onChange={(confirmed) => patch({ confirmed })} label="I reviewed the settings" />
      <Button variant="primary" disabled={!form.confirmed} onClick={() => sendToAgent(form)}>Continue</Button>
    </Stack>
  );
}
