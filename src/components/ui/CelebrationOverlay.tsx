"use client";

import { useEffect, useState } from "react";

/**
 * Pixel art celebration overlay shown when Jack completes all daily tasks.
 * Features animated pixel stars, a trophy, and a "LEVEL COMPLETE" message.
 */
export default function CelebrationOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState(0); // 0=entering, 1=showing, 2=exiting

  useEffect(() => {
    // Entrance
    requestAnimationFrame(() => setVisible(true));
    const t1 = setTimeout(() => setPhase(1), 100);
    // Auto-dismiss after 4 seconds
    const t2 = setTimeout(() => {
      setPhase(2);
      setTimeout(onDismiss, 500);
    }, 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={() => { setPhase(2); setTimeout(onDismiss, 300); }}
      style={{
        background: phase === 2 ? "transparent" : "rgba(0,0,0,0.6)",
        transition: "background 0.3s ease",
        cursor: "pointer",
      }}
    >
      {/* Falling pixel stars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <PixelStar key={i} delay={i * 150} />
        ))}
      </div>

      {/* Main card */}
      <div
        className="relative text-center px-8 py-6 rounded-2xl border-4"
        style={{
          background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 100%)",
          borderColor: "#eab308",
          transform: visible && phase < 2 ? "scale(1)" : "scale(0.3)",
          opacity: visible && phase < 2 ? 1 : 0,
          transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease",
          boxShadow: "0 0 40px rgba(234, 179, 8, 0.3), inset 0 0 20px rgba(99, 102, 241, 0.2)",
        }}
      >
        {/* Trophy pixel art */}
        <div className="flex justify-center mb-3">
          <PixelTrophy />
        </div>

        <div
          className="text-yellow-400 font-bold mb-1"
          style={{
            fontFamily: "var(--font-pixel), monospace",
            fontSize: "16px",
            textShadow: "2px 2px 0px #92400e",
            letterSpacing: "2px",
            animation: "pixel-glow 1s ease-in-out infinite alternate",
          }}
        >
          LEVEL COMPLETE!
        </div>

        <p className="text-indigo-200 text-sm mt-2" style={{ fontFamily: "var(--font-pixel), monospace", fontSize: "8px", lineHeight: "1.6" }}>
          All tasks done for today
        </p>

        {/* XP bar */}
        <div className="mt-4 mx-auto w-48">
          <div className="flex justify-between text-[8px] text-yellow-300 mb-1" style={{ fontFamily: "var(--font-pixel), monospace" }}>
            <span>EXP</span>
            <span>+100</span>
          </div>
          <div className="h-3 bg-indigo-900 rounded-sm border border-indigo-600 overflow-hidden">
            <div
              className="h-full rounded-sm"
              style={{
                background: "linear-gradient(90deg, #22c55e, #4ade80)",
                width: visible ? "100%" : "0%",
                transition: "width 2s ease-out 0.5s",
                boxShadow: "0 0 8px rgba(34, 197, 94, 0.5)",
              }}
            />
          </div>
        </div>

        <p className="text-indigo-400 text-xs mt-3 opacity-60">tap to dismiss</p>
      </div>
    </div>
  );
}

/** Single falling pixel star particle */
function PixelStar({ delay }: { delay: number }) {
  const left = Math.random() * 100;
  const size = Math.random() > 0.5 ? 6 : 4;
  const duration = 2 + Math.random() * 2;
  const colors = ["#eab308", "#facc15", "#fde047", "#22c55e", "#3b82f6", "#a855f7"];
  const color = colors[Math.floor(Math.random() * colors.length)];

  return (
    <div
      style={{
        position: "absolute",
        left: `${left}%`,
        top: "-10px",
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: color,
        imageRendering: "pixelated" as const,
        animation: `pixel-fall ${duration}s linear ${delay}ms infinite`,
        opacity: 0,
      }}
    />
  );
}

/** Pixel art trophy */
function PixelTrophy() {
  return (
    <svg width="48" height="48" viewBox="0 0 16 16" shapeRendering="crispEdges">
      {/* Cup rim */}
      <rect x="4" y="1" width="8" height="1" fill="#eab308" />
      {/* Cup body */}
      <rect x="3" y="2" width="10" height="1" fill="#eab308" />
      <rect x="3" y="3" width="10" height="1" fill="#facc15" />
      <rect x="3" y="4" width="10" height="1" fill="#facc15" />
      <rect x="4" y="5" width="8" height="1" fill="#eab308" />
      <rect x="5" y="6" width="6" height="1" fill="#eab308" />
      {/* Handles */}
      <rect x="1" y="2" width="2" height="1" fill="#ca8a04" />
      <rect x="0" y="3" width="2" height="1" fill="#ca8a04" />
      <rect x="0" y="4" width="2" height="1" fill="#ca8a04" />
      <rect x="1" y="5" width="2" height="1" fill="#ca8a04" />
      <rect x="13" y="2" width="2" height="1" fill="#ca8a04" />
      <rect x="14" y="3" width="2" height="1" fill="#ca8a04" />
      <rect x="14" y="4" width="2" height="1" fill="#ca8a04" />
      <rect x="13" y="5" width="2" height="1" fill="#ca8a04" />
      {/* Stem */}
      <rect x="7" y="7" width="2" height="2" fill="#ca8a04" />
      {/* Base */}
      <rect x="5" y="9" width="6" height="1" fill="#a16207" />
      <rect x="4" y="10" width="8" height="1" fill="#a16207" />
      {/* Star on cup */}
      <rect x="7" y="3" width="2" height="1" fill="#fef08a" />
      <rect x="7" y="4" width="2" height="1" fill="#fef08a" />
    </svg>
  );
}
