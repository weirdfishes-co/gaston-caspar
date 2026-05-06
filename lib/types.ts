export type Attachment = {
  name: string;
  // The MIME type as reported by the browser
  type: string;
  // base64-encoded file contents (no data: prefix)
  data: string;
};

export type ClientMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
};

// Anthropic API allows up to 5 images and 5 documents per request, and the
// PDF feature is gated by file size. We're conservative.
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const ACCEPTED_MIME = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  DOCX_MIME,
] as const;

export const ACCEPT_ATTRIBUTE =
  ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.docx,image/*,application/pdf," +
  DOCX_MIME;

// Vercel App Router default body limit is ~4.5MB. base64 inflates by ~33%.
// We cap raw attached bytes at 3 MB total to leave room for the message JSON.
export const MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
