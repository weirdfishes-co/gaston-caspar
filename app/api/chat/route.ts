import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { DOCX_MIME, type ClientMessage, type Attachment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
        data: string;
      };
    }
  | {
      type: "document";
      source: { type: "base64"; media_type: "application/pdf"; data: string };
    };

function isDocx(att: Attachment) {
  return (
    att.type.toLowerCase() === DOCX_MIME ||
    att.name.toLowerCase().endsWith(".docx")
  );
}

async function attachmentToBlock(
  att: Attachment,
): Promise<AnthropicContentBlock | null> {
  const t = att.type.toLowerCase();
  if (t === "image/png" || t === "image/jpeg" || t === "image/gif" || t === "image/webp") {
    return { type: "image", source: { type: "base64", media_type: t, data: att.data } };
  }
  if (t === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: att.data },
    };
  }
  if (isDocx(att)) {
    try {
      const buffer = Buffer.from(att.data, "base64");
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.trim() || "(empty document)";
      return {
        type: "text",
        text: `Attached Word document: ${att.name}\n\n\`\`\`\n${text}\n\`\`\``,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      return {
        type: "text",
        text: `Attached Word document: ${att.name} — could not be read (${msg}). Please ask the student to re-export or share as PDF.`,
      };
    }
  }
  if (t === "text/plain" || t === "text/markdown" || t === "text/csv") {
    let decoded = "";
    try {
      decoded = Buffer.from(att.data, "base64").toString("utf-8");
    } catch {
      decoded = "(could not decode file)";
    }
    return {
      type: "text",
      text: `Attached file: ${att.name}\n\n\`\`\`\n${decoded}\n\`\`\``,
    };
  }
  return null;
}

async function toAnthropicMessage(m: ClientMessage) {
  if (m.role === "assistant") {
    return { role: "assistant" as const, content: m.content };
  }

  const blocks: AnthropicContentBlock[] = [];
  if (m.attachments?.length) {
    for (const att of m.attachments) {
      const b = await attachmentToBlock(att);
      if (b) blocks.push(b);
    }
  }
  if (m.content?.trim()) {
    blocks.push({ type: "text", text: m.content });
  }
  if (blocks.length === 0) {
    blocks.push({ type: "text", text: "(empty message)" });
  }
  return { role: "user" as const, content: blocks };
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Server is missing ANTHROPIC_API_KEY." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let messages: ClientMessage[];
  try {
    const body = await req.json();
    messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("messages must be a non-empty array");
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const apiMessages = await Promise.all(messages.map(toAnthropicMessage));
        const apiStream = await client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages: apiMessages as any,
        });

        for await (const event of apiStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Unknown error from Anthropic API";
        controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
