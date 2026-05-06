"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ACCEPT_ATTRIBUTE,
  ACCEPTED_MIME,
  MAX_ATTACHMENTS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  type Attachment,
  type ClientMessage,
} from "@/lib/types";

type Message = ClientMessage;

function isAccepted(mime: string, name: string) {
  if ((ACCEPTED_MIME as readonly string[]).includes(mime.toLowerCase())) return true;
  // Some browsers/OSes report empty MIME for .docx — accept by extension.
  if (name.toLowerCase().endsWith(".docx")) return true;
  return false;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(mime: string) {
  if (mime.startsWith("image/")) return "🖼";
  if (mime === "application/pdf") return "📄";
  if (mime.includes("wordprocessingml")) return "📘";
  return "📝";
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Array<Attachment & { size: number }>>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  async function addFiles(files: FileList | File[]) {
    setError(null);
    const list = Array.from(files);
    const next = [...pending];
    let totalBytes = next.reduce((s, a) => s + a.size, 0);

    for (const file of list) {
      if (next.length >= MAX_ATTACHMENTS) {
        setError(`Up to ${MAX_ATTACHMENTS} files per message.`);
        break;
      }
      if (!isAccepted(file.type, file.name)) {
        setError(
          `"${file.name}": unsupported type. Accepted: images, PDF, .docx, .txt, .md, .csv.`,
        );
        continue;
      }
      // Normalize MIME for .docx uploads where the browser reported nothing.
      const normalizedType =
        file.type ||
        (file.name.toLowerCase().endsWith(".docx")
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/octet-stream");
      if (totalBytes + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
        setError(
          `Total attachment size would exceed ${formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)}.`,
        );
        break;
      }
      const data = await fileToBase64(file);
      next.push({ name: file.name, type: normalizedType, data, size: file.size });
      totalBytes += file.size;
    }
    setPending(next);
  }

  function removePending(idx: number) {
    setPending(pending.filter((_, i) => i !== idx));
  }

  async function send() {
    const text = input.trim();
    if ((!text && pending.length === 0) || streaming) return;
    setError(null);

    const attachments: Attachment[] | undefined = pending.length
      ? pending.map(({ name, type, data }) => ({ name, type, data }))
      : undefined;

    const userMsg: Message = {
      role: "user",
      content: text,
      ...(attachments ? { attachments } : {}),
    };
    const next: Message[] = [...messages, userMsg];

    setMessages(next);
    setInput("");
    setPending([]);
    setStreaming(true);
    setMessages([...next, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages([
          ...next,
          { role: "assistant", content: `Error: ${errBody.error ?? res.statusText}` },
        ]);
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: acc }]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setMessages([...next, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setStreaming(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (streaming) return;
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  }

  return (
    <>
      <main
        onDragOver={(e) => {
          e.preventDefault();
          if (!streaming) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {dragOver && (
          <div className="drop-overlay">Drop files to attach to your message</div>
        )}

        {messages.length === 0 && (
          <div className="welcome">
            <div className="welcome-portrait">
              <img src="/gaston-caspar.png" alt="Gaston Caspar" />
            </div>
            <h1>Meet Gaston Caspar</h1>
            <p>
              Nyenrode&apos;s academic assistant — your research and writing
              copilot, built to help you think rigorously, find good sources,
              and write strong academic work. You can attach images, PDFs, Word
              documents, and text files for me to review.
            </p>
          </div>
        )}

        <div className="messages">
          {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            const showCursor = streaming && isLast && m.role === "assistant";
            return (
              <div
                key={i}
                className={`msg ${m.role === "user" ? "msg-user" : "msg-assistant"}`}
              >
                <div className="msg-avatar">
                  {m.role === "user" ? (
                    "YOU"
                  ) : (
                    <img src="/gaston-caspar.png" alt="Gaston Caspar" />
                  )}
                </div>
                <div className={`msg-bubble ${showCursor ? "cursor" : ""}`}>
                  {m.attachments?.length ? (
                    <div className="msg-attachments">
                      {m.attachments.map((a, j) => (
                        <span key={j} className="att-chip att-chip-static">
                          <span className="att-icon">{fileIcon(a.type)}</span>
                          <span className="att-name">{a.name}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {m.role === "assistant" ? (
                    m.content ? (
                      <div className="markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    ) : showCursor ? (
                      ""
                    ) : (
                      "…"
                    )
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="composer-wrap">
          {pending.length > 0 && (
            <div className="pending-bar">
              {pending.map((a, i) => (
                <span key={i} className="att-chip">
                  <span className="att-icon">{fileIcon(a.type)}</span>
                  <span className="att-name">{a.name}</span>
                  <span className="att-size">{formatBytes(a.size)}</span>
                  <button
                    type="button"
                    onClick={() => removePending(i)}
                    aria-label={`Remove ${a.name}`}
                    className="att-remove"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {error && <div className="composer-error">{error}</div>}

          <div className="composer">
            <button
              type="button"
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming}
              aria-label="Attach file"
              title="Attach file (PDF, image, text)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M21 12.5l-8.5 8.5a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8-8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              placeholder="Ask Gaston… or drop a PDF, Word doc, image, or text file"
              rows={1}
              disabled={streaming}
            />
            <button
              className="send-btn"
              onClick={send}
              disabled={streaming || (!input.trim() && pending.length === 0)}
            >
              Send
            </button>
          </div>
          <div className="composer-hint">
            Enter to send · Shift+Enter for newline · Drop / paste files to attach
          </div>
        </div>
      </main>
    </>
  );
}
