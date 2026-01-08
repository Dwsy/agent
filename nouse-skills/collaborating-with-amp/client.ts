#!/usr/bin/env bun
import { spawn } from "child_process";

// Get the query from command line arguments
const query = process.argv.slice(2).join(" ");
if (!query) {
  console.error("Usage: client.ts <query>");
  process.exit(1);
}

// Prepare the command: echo the query into amp with jsonl format
// We use bash to pipe properly.
const settingsPath = import.meta.dir + "/amp-settings.json";
const safeQuery = query.replace(/"/g, '\\"').replace(/\$/g, '\\$');
const cmd = `echo "${safeQuery}" | amp --format jsonl --settings-file "${settingsPath}"`;

const proc = spawn("bash", ["-c", cmd]);

let buffer = "";
const messages = new Map<number, any>();

proc.stdout.on("data", (data) => {
  buffer += data.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.type === "messages" && Array.isArray(msg.messages)) {
        for (const [id, message] of msg.messages) {
          messages.set(id, message);
        }
      }
    } catch (e) {
      // Ignore non-JSON lines
    }
  }
});

proc.on("close", (code) => {
  // If code is non-zero, we might still have messages, but usually it indicates failure.
  // However, sometimes tools exit with 1 on error but still print explanation.
  // We'll proceed to check messages regardless, but exit with error code if no messages found.

  const sortedKeys = Array.from(messages.keys()).sort((a, b) => a - b);
  let outputText = "";
  let hasAssistantMessage = false;

  for (const key of sortedKeys) {
    const msg = messages.get(key);
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      hasAssistantMessage = true;
      let messageText = "";
      for (const part of msg.content) {
        if (part.type === "text") {
          messageText = part.text; // Text parts usually replace previous text in updates?
          // Wait, in the log we saw: "text": "partial..." then "text": "full..."
          // So for a given part index, it updates.
          // But msg.content is an array of parts.
          // We need to just take the final state of the content array.
          // AND assume that parts don't need concatenation?
          // Actually, `part.text` contains the accumulated text for that part.
          // If there are multiple text parts (rare), we concatenate them.
        }
      }
      // Since we are iterating parts, and usually there is only one text part:
      // We should be careful.
      // In the log: `content` array had multiple objects.
      // `[{"type":"thinking",...}, {"type":"text",...}]`
      // We iterate this array and append text from text parts.
      // This is correct.
      
      // However, if the text part itself is being updated incrementally, the last state in `messages` map is the full text.
      // So iterating the final `msg.content` is correct.
      
      // One detail: if multiple text parts exist, we concatenate them.
      // `outputText += messageText` inside the loop? 
      // No, `part.text` is the content of *that part*.
      // So we loop over parts and append.
    }
  }
  
  // Re-reading logic to be sure:
  // Map stores final message object.
  // Message object has content array.
  // Content array has parts.
  // We loop parts. If part is text, append to output.
  // Correct.
  
  // Refill outputText logic properly
  outputText = ""; // Reset
  for (const key of sortedKeys) {
    const msg = messages.get(key);
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
       for (const part of msg.content) {
         if (part.type === "text") {
           outputText += part.text;
         }
       }
       // Add a newline between messages if multiple?
       outputText += "\n";
    }
  }

  if (outputText.trim()) {
    console.log(outputText.trim());
    process.exit(0);
  } else {
    // Fallback: maybe plain text output if JSON failed?
    // But we ran with --format jsonl.
    if (code !== 0) {
        console.error(`Amp process exited with code ${code} and no output captured.`);
        process.exit(code);
    }
    console.error("No response received from Amp.");
    process.exit(1);
  }
});
