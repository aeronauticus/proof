"use client";

import { useEffect, useState, useMemo } from "react";

/**
 * Pixel art celebration overlay shown when Jack completes all daily tasks.
 * Features glitch effects, a pixel sword, screen shake, and combo counter.
 */
export default function CelebrationOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState(0); // 0=entering, 1=showing, 2=exiting
  const [combo, setCombo] = useState(0);
  const [shake, setShake] = useState(true);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const t1 = setTimeout(() => setPhase(1), 100);

    // Screen shake for 600ms
    const t2 = setTimeout(() => setShake(false), 600);

    // Combo counter
    let c = 0;
    const comboInterval = setInterval(() => {
      c += Math.floor(Math.random() * 30) + 10;
      if (c > 999) { c = 999; clearInterval(comboInterval); }
      setCombo(c);
    }, 50);
    const t3 = setTimeout(() => clearInterval(comboInterval), 1500);

    // Auto-dismiss after 5 seconds
    const t4 = setTimeout(() => {
      setPhase(2);
      setTimeout(onDismiss, 500);
    }, 5000);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
      clearInterval(comboInterval);
    };
  }, [onDismiss]);

  const shakeStyle = shake ? {
    animation: "screen-shake 0.08s linear infinite",
  } : {};

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={() => { setPhase(2); setTimeout(onDismiss, 300); }}
      style={{
        background: phase === 2 ? "transparent" : "rgba(0,0,0,0.75)",
        transition: "background 0.3s ease",
        cursor: "pointer",
        ...shakeStyle,
      }}
    >
      {/* Particle explosion */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 30 }).map((_, i) => (
          <ExplosionPixel key={i} index={i} />
        ))}
      </div>

      {/* Scanlines overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
        }}
      />

      {/* Main card */}
      <div
        className="relative text-center px-10 py-8 rounded-none border-4"
        style={{
          background: "linear-gradient(180deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)",
          borderColor: "#00ff41",
          borderStyle: "solid",
          transform: visible && phase < 2 ? "scale(1)" : "scale(0.1)",
          opacity: visible && phase < 2 ? 1 : 0,
          transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease",
          boxShadow: "0 0 60px rgba(0, 255, 65, 0.3), 0 0 120px rgba(0, 255, 65, 0.1), inset 0 0 30px rgba(0, 255, 65, 0.05)",
          imageRendering: "pixelated",
        }}
      >
        {/* Pixel sword */}
        <div className="flex justify-center mb-4">
          <PixelSword />
        </div>

        {/* Glitch text */}
        <div className="relative">
          <div
            className="text-[#00ff41] font-bold"
            style={{
              fontFamily: "var(--font-pixel), monospace",
              fontSize: "18px",
              textShadow: "0 0 10px #00ff41, 0 0 20px #00ff41, 0 0 40px #00ff41",
              letterSpacing: "3px",
              animation: "glitch-text 2s ease-in-out infinite",
            }}
          >
            QUEST COMPLETE
          </div>
          {/* Glitch copies */}
          <div
            className="absolute inset-0 text-[#ff0040] font-bold opacity-60"
            style={{
              fontFamily: "var(--font-pixel), monospace",
              fontSize: "18px",
              letterSpacing: "3px",
              animation: "glitch-r 0.3s ease-in-out infinite alternate",
              clipPath: "inset(20% 0 40% 0)",
            }}
          >
            QUEST COMPLETE
          </div>
          <div
            className="absolute inset-0 text-[#00d4ff] font-bold opacity-60"
            style={{
              fontFamily: "var(--font-pixel), monospace",
              fontSize: "18px",
              letterSpacing: "3px",
              animation: "glitch-b 0.3s ease-in-out infinite alternate-reverse",
              clipPath: "inset(60% 0 0% 0)",
            }}
          >
            QUEST COMPLETE
          </div>
        </div>

        <p
          className="text-gray-500 mt-2"
          style={{ fontFamily: "var(--font-pixel), monospace", fontSize: "8px", lineHeight: "1.6" }}
        >
          ALL OBJECTIVES CLEARED
        </p>

        {/* Combo counter */}
        <div className="mt-5 flex items-center justify-center gap-3">
          <div
            className="px-4 py-2 border-2 border-[#00ff41]"
            style={{
              background: "rgba(0, 255, 65, 0.05)",
            }}
          >
            <div className="text-[8px] text-[#00ff41] opacity-60 mb-0.5" style={{ fontFamily: "var(--font-pixel), monospace" }}>
              SCORE
            </div>
            <div
              className="text-[#00ff41] font-bold"
              style={{
                fontFamily: "var(--font-pixel), monospace",
                fontSize: "20px",
                textShadow: "0 0 8px #00ff41",
              }}
            >
              {String(combo).padStart(3, "0")}
            </div>
          </div>

          <div
            className="px-4 py-2 border-2 border-[#ff6b00]"
            style={{
              background: "rgba(255, 107, 0, 0.05)",
            }}
          >
            <div className="text-[8px] text-[#ff6b00] opacity-60 mb-0.5" style={{ fontFamily: "var(--font-pixel), monospace" }}>
              RANK
            </div>
            <div
              className="text-[#ff6b00] font-bold"
              style={{
                fontFamily: "var(--font-pixel), monospace",
                fontSize: "20px",
                textShadow: "0 0 8px #ff6b00",
                animation: visible ? "rank-pop 0.5s ease-out 1.5s both" : "none",
              }}
            >
              S
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 mx-auto w-52">
          <div className="h-2 bg-gray-900 border border-[#00ff41]/30 overflow-hidden">
            <div
              style={{
                height: "100%",
                background: "linear-gradient(90deg, #00ff41, #00d4ff)",
                width: visible ? "100%" : "0%",
                transition: "width 1.5s ease-out 0.3s",
                boxShadow: "0 0 10px rgba(0, 255, 65, 0.5)",
              }}
            />
          </div>
        </div>

        <p className="text-gray-600 text-xs mt-4 opacity-40" style={{ fontFamily: "var(--font-pixel), monospace", fontSize: "7px" }}>
          TAP TO CONTINUE
        </p>
      </div>

      <style jsx>{`
        @keyframes screen-shake {
          0% { transform: translate(0, 0); }
          25% { transform: translate(-3px, 2px); }
          50% { transform: translate(3px, -2px); }
          75% { transform: translate(-2px, -3px); }
          100% { transform: translate(2px, 3px); }
        }
        @keyframes glitch-text {
          0%, 90%, 100% { opacity: 1; }
          92% { opacity: 0.8; transform: translateX(-2px); }
          94% { opacity: 1; transform: translateX(2px); }
          96% { opacity: 0.6; transform: translateX(0); }
        }
        @keyframes glitch-r {
          0% { transform: translateX(-2px); }
          100% { transform: translateX(2px); }
        }
        @keyframes glitch-b {
          0% { transform: translateX(2px); }
          100% { transform: translateX(-2px); }
        }
        @keyframes rank-pop {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.6); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/** Pixel explosion particle — bursts from center outward */
function ExplosionPixel({ index }: { index: number }) {
  const angle = (index / 30) * 360 + Math.random() * 20;
  const distance = 200 + Math.random() * 300;
  const size = Math.random() > 0.6 ? 6 : 4;
  const duration = 0.8 + Math.random() * 0.8;
  const delay = Math.random() * 0.3;
  const colors = ["#00ff41", "#00d4ff", "#ff6b00", "#ff0040", "#ffffff", "#00ff41"];
  const color = colors[Math.floor(Math.random() * colors.length)];

  const rad = (angle * Math.PI) / 180;
  const tx = Math.cos(rad) * distance;
  const ty = Math.sin(rad) * distance;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: color,
        imageRendering: "pixelated",
        transform: "translate(-50%, -50%)",
        animation: `explode-${index} ${duration}s ease-out ${delay}s forwards`,
        opacity: 0,
      }}
    >
      <style jsx>{`
        @keyframes explode-${index} {
          0% { opacity: 1; transform: translate(-50%, -50%) scale(2); }
          100% { opacity: 0; transform: translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0); }
        }
      `}</style>
    </div>
  );
}

/** Pixel art sword — because completing quests deserves a weapon */
function PixelSword() {
  return (
    <svg width="56" height="56" viewBox="0 0 16 16" shapeRendering="crispEdges"
      style={{ filter: "drop-shadow(0 0 6px rgba(0, 255, 65, 0.5))" }}>
      {/* Blade */}
      <rect x="12" y="1" width="2" height="1" fill="#e0e0e0" />
      <rect x="11" y="2" width="2" height="1" fill="#c0c0c0" />
      <rect x="10" y="3" width="2" height="1" fill="#e0e0e0" />
      <rect x="9" y="4" width="2" height="1" fill="#c0c0c0" />
      <rect x="8" y="5" width="2" height="1" fill="#e0e0e0" />
      <rect x="7" y="6" width="2" height="1" fill="#c0c0c0" />
      <rect x="6" y="7" width="2" height="1" fill="#e0e0e0" />
      {/* Blade edge highlight */}
      <rect x="13" y="1" width="1" height="1" fill="#ffffff" />
      <rect x="12" y="2" width="1" height="1" fill="#ffffff" />
      <rect x="11" y="3" width="1" height="1" fill="#ffffff" />
      {/* Guard */}
      <rect x="4" y="8" width="6" height="1" fill="#ff6b00" />
      <rect x="4" y="9" width="6" height="1" fill="#cc5500" />
      {/* Handle */}
      <rect x="4" y="10" width="2" height="1" fill="#8b4513" />
      <rect x="3" y="11" width="2" height="1" fill="#a0522d" />
      {/* Pommel */}
      <rect x="2" y="12" width="2" height="1" fill="#ff6b00" />
      <rect x="1" y="13" width="2" height="1" fill="#cc5500" />
      {/* Sparkle on blade */}
      <rect x="10" y="3" width="1" height="1" fill="#ffffff" style={{ animation: "blade-sparkle 1.5s ease-in-out infinite" }} />
      <style>{`
        @keyframes blade-sparkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </svg>
  );
}
