import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { DOCX_MIME, type ClientMessage, type Attachment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Keep at most this many of the most recent turns in the request to Anthropic.
// Each "turn" is one message (user or assistant). Older turns are dropped to
// stay under the input-token rate limit and to keep latency reasonable.
const MAX_HISTORY_TURNS = 12;

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

// Trim conversation to the most recent N turns, but always start with a
// user-role message so the API accepts it.
function trimHistory(messages: ClientMessage[]): ClientMessage[] {
  const trimmed = messages.slice(-MAX_HISTORY_TURNS);
  while (trimmed.length > 0 && trimmed[0].role !== "user") {
    trimmed.shift();
  }
  return trimmed.length > 0 ? trimmed : messages.slice(-1);
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "server_misconfigured", message: "Server is missing ANTHROPIC_API_KEY." },
      { status: 500 },
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
    return Response.json(
      { error: "bad_request", message: "Invalid request body." },
      { status: 400 },
    );
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const apiMessages = await Promise.all(
    trimHistory(messages).map(toAnthropicMessage),
  );

  // Open the stream BEFORE returning the Response so we can catch 429/5xx
  // synchronously and return a clean JSON error instead of leaking it into
  // a 200 text/plain stream.
  let apiStream;
  try {
    apiStream = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: apiMessages as any,
      stream: true,
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError && err.status === 429) {
      const headers = (err as unknown as { headers?: Record<string, string> })
        .headers;
      const retryAfter = Number(headers?.["retry-after"]) || 30;
      return Response.json(
        {
          error: "rate_limit",
          message:
            "Het is even druk bij Gaston — er staan veel verzoeken in de wachtrij. Probeer het over ongeveer een minuut opnieuw.",
          retryAfter,
        },
        { status: 429 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      return Response.json(
        {
          error: "upstream_error",
          message:
            err.status === 401 || err.status === 403
              ? "De server kan niet authenticeren bij het AI-model. Neem contact op met de beheerder."
              : "Gaston kon het AI-model niet bereiken. Probeer het opnieuw.",
          status: err.status,
        },
        { status: 502 },
      );
    }
    return Response.json(
      {
        error: "unknown_error",
        message:
          err instanceof Error ? err.message : "Onbekende fout bij het AI-model.",
      },
      { status: 500 },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
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
        controller.enqueue(
          encoder.encode(
            `\n\n[Verbinding met Gaston werd onderbroken: ${msg}. Probeer het opnieuw.]`,
          ),
        );
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
