/** @type {import('next').NextConfig} */

// Comma-separated list of origins allowed to embed Gaston in an iframe.
// Defaults to "*" (any site). Set EMBED_ALLOWED_ORIGINS to lock it down.
// Example: "https://learn.nyenrode.nl https://canvas.nyenrode.nl"
const allowedAncestors =
  process.env.EMBED_ALLOWED_ORIGINS
    ?.split(/[,\s]+/)
    .filter(Boolean)
    .join(" ") || "*";

const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${allowedAncestors};`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
