"use client";

/**
 * Pixel art "PROOF" logo in a retro video game style.
 * Each letter is drawn on a tiny pixel grid using CSS box-shadow trick.
 */
export default function PixelLogo() {
  return (
    <div className="flex items-center gap-1.5">
      {/* Shield/checkmark pixel icon */}
      <svg width="22" height="22" viewBox="0 0 11 11" shapeRendering="crispEdges" className="flex-shrink-0">
        {/* Shield body */}
        <rect x="3" y="0" width="5" height="1" fill="#2563eb" />
        <rect x="2" y="1" width="7" height="1" fill="#2563eb" />
        <rect x="1" y="2" width="9" height="1" fill="#3b82f6" />
        <rect x="1" y="3" width="9" height="1" fill="#3b82f6" />
        <rect x="1" y="4" width="9" height="1" fill="#2563eb" />
        <rect x="2" y="5" width="7" height="1" fill="#2563eb" />
        <rect x="2" y="6" width="7" height="1" fill="#1d4ed8" />
        <rect x="3" y="7" width="5" height="1" fill="#1d4ed8" />
        <rect x="4" y="8" width="3" height="1" fill="#1e40af" />
        <rect x="5" y="9" width="1" height="1" fill="#1e40af" />
        {/* Checkmark */}
        <rect x="7" y="2" width="1" height="1" fill="#4ade80" />
        <rect x="6" y="3" width="1" height="1" fill="#4ade80" />
        <rect x="5" y="4" width="1" height="1" fill="#22c55e" />
        <rect x="3" y="3" width="1" height="1" fill="#22c55e" />
        <rect x="4" y="4" width="1" height="1" fill="#22c55e" />
        <rect x="4" y="5" width="1" height="1" fill="#16a34a" />
      </svg>
      {/* Text */}
      <span
        className="font-bold tracking-wide"
        style={{
          fontFamily: "var(--font-pixel), 'Courier New', monospace",
          fontSize: "14px",
          color: "#1e293b",
          letterSpacing: "2px",
          imageRendering: "pixelated",
        }}
      >
        PROOF
      </span>
    </div>
  );
}
