"use client";

/**
 * Proof wordmark — stylish serif, not pixelated.
 * Pairs a small wax-seal-style monogram with an italic serif wordmark.
 */
export default function PixelLogo() {
  return (
    <div className="flex items-center gap-2">
      {/* Wax-seal monogram */}
      <svg
        width="26"
        height="26"
        viewBox="0 0 32 32"
        className="flex-shrink-0"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="proof-seal-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e3a8a" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
        </defs>
        <circle
          cx="16"
          cy="16"
          r="14.5"
          fill="url(#proof-seal-bg)"
          stroke="#dbeafe"
          strokeWidth="0.75"
        />
        <circle
          cx="16"
          cy="16"
          r="12"
          fill="none"
          stroke="#dbeafe"
          strokeWidth="0.5"
          strokeDasharray="0.5 1.25"
          opacity="0.7"
        />
        <text
          x="16"
          y="22"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="18"
          fontStyle="italic"
          fontWeight="600"
          fill="#fef3c7"
        >
          P
        </text>
      </svg>

      {/* Wordmark */}
      <span
        className="select-none"
        style={{
          fontFamily:
            "'Playfair Display', 'Cormorant Garamond', 'Didot', 'Bodoni 72', Georgia, 'Times New Roman', serif",
          fontStyle: "italic",
          fontWeight: 600,
          fontSize: "22px",
          letterSpacing: "0.5px",
          color: "#0f172a",
          lineHeight: 1,
        }}
      >
        Proof
      </span>
    </div>
  );
}
