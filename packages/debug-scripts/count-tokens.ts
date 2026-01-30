#!/usr/bin/env node
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { MAX_CONTEXT_TOKENS } from "../shared/src/constants/context-limits";

// 106429 / .8 = x

const MAX_TOKENS = MAX_CONTEXT_TOKENS;

// Initialize Anthropic client with API key from environment
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY not found in environment variables");
  console.error(
    "Please create a .env file with your API key or set it as an environment variable",
  );
  process.exit(1);
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface Message {
  role: "user" | "assistant";
  content: string | Array<{ type: string; text?: string; [key: string]: any }>;
}

interface MessageEntry {
  message?: Message;
  system?: string;
  messages?: Message[];
  isSidechain?: boolean;
}

async function countTokensFromJsonl(filePath: string) {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const allMessages: Message[] = [];
  let systemPrompt: string | undefined;
  let lineNumber = 0;
  let entriesProcessed = 0;

  console.log("Reading JSONL file...\n");

  for await (const line of rl) {
    lineNumber++;

    if (!line.trim()) continue;

    try {
      const entry: MessageEntry = JSON.parse(line);
      entriesProcessed++;

      if (entry.isSidechain) {
        continue;
      }

      // Handle different entry formats
      if (entry.message) {
        // Single message format
        allMessages.push(entry.message);
        console.log(
          `Line ${lineNumber}: Added 1 message (${entry.message.role})`,
        );
      } else if (entry.messages) {
        // Multiple messages format
        allMessages.push(...entry.messages);
        console.log(
          `Line ${lineNumber}: Added ${entry.messages.length} messages`,
        );
      } else {
        console.log(`Line ${lineNumber}: No messages found (skipping)`);
      }
    } catch (error) {
      console.error(
        `Error parsing line ${lineNumber}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  if (allMessages.length === 0) {
    console.error("No messages found in the JSONL file");
    return;
  }

  console.log(`\nTotal entries processed: ${entriesProcessed}`);
  console.log(`Total messages collected: ${allMessages.length}`);
  console.log(
    `System prompt: ${systemPrompt ? `"${systemPrompt.substring(0, 50)}..."` : "None"}`,
  );

  console.log("\nCounting tokens for all messages combined...");

  // Convert messages to the format expected by the API
  const apiMessages = allMessages as any;

  for (const msg of apiMessages) {
    delete msg.usage;
    delete msg.stop_reason;
    delete msg.stop_sequence;
    delete msg.id;
    delete msg.type;
    delete msg.model;
  }

  try {
    const response = await client.messages.countTokens({
      model: "claude-opus-4-20250514",
      system: systemPrompt,
      messages: apiMessages,
    });

    console.log(response);

    console.log(`\nToken count results:`);
    console.log(`  Total input tokens: ${response.input_tokens}`);
  } catch (error) {
    console.error(
      `Error counting tokens: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

// Get file path from command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node count-tokens.ts <path-to-jsonl-file>");
  console.error("\nExpected JSONL format:");
  console.error(
    '{"system": "optional system prompt", "messages": [{"role": "user", "content": "..."}]}',
  );
  process.exit(1);
}

const filePath = args[0]!;

// Check if file exists
try {
  readFileSync(filePath);
} catch (error) {
  console.error(`Error: Cannot read file "${filePath}"`);
  process.exit(1);
}

// Run the token counting
countTokensFromJsonl(filePath).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
