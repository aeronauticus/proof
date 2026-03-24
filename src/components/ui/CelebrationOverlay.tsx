"use client";

import { useEffect, useState, useRef } from "react";

/**
 * Retro arcade celebration overlay. Canvas-rendered pixel effects
 * with a CRT-style main card. Fires on quest completion.
 */
export default function CelebrationOverlay({ onDismiss }: { onDismiss: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState(0);
  const [score, setScore] = useState(0);
  const [showRank, setShowRank] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const [flash, setFlash] = useState(true);
  const [shake, setShake] = useState(true);
  const [typedText, setTypedText] = useState("");
  const fullText = "ALL OBJECTIVES CLEARED";

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    setTimeout(() => setPhase(1), 80);

    // White flash
    setTimeout(() => setFlash(false), 150);

    // Screen shake
    setTimeout(() => setShake(false), 500);

    // Typewriter
    let ti = 0;
    const typeInterval = setInterval(() => {
      ti++;
      setTypedText(fullText.slice(0, ti));
      if (ti >= fullText.length) clearInterval(typeInterval);
    }, 40);

    // Score counter
    let s = 0;
    const scoreInterval = setInterval(() => {
      s += Math.floor(Math.random() * 50) + 20;
      if (s > 9999) { s = 9999; clearInterval(scoreInterval); }
      setScore(s);
    }, 30);
    setTimeout(() => clearInterval(scoreInterval), 2000);

    // Bar fill
    setTimeout(() => setBarWidth(100), 300);

    // Rank reveal
    setTimeout(() => setShowRank(true), 1800);

    // Auto-dismiss
    const dismiss = setTimeout(() => {
      setPhase(2);
      setTimeout(onDismiss, 600);
    }, 6000);

    return () => {
      clearTimeout(dismiss);
      clearInterval(typeInterval);
      clearInterval(scoreInterval);
    };
  }, [onDismiss]);

  // Canvas particle system
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf: number;
    let t = 0;

    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    // Explosion particles
    const particles: Array<{
      x: number; y: number; vx: number; vy: number;
      size: number; color: string; life: number; maxLife: number;
      type: "explosion" | "rain" | "ember";
    }> = [];

    const colors = ["#00ff41", "#00d4ff", "#ff3366", "#ffaa00", "#ff00ff", "#ffffff"];
    const cx = W / 2;
    const cy = H / 2;

    // Initial explosion burst
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 12;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: Math.random() > 0.7 ? 4 : 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0, maxLife: 40 + Math.random() * 40,
        type: "explosion",
      });
    }

    // Secondary ring burst (delayed via life offset)
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      const speed = 8 + Math.random() * 4;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3,
        color: i % 2 === 0 ? "#00ff41" : "#00d4ff",
        life: -15, maxLife: 30,
        type: "explosion",
      });
    }

    function spawnEmber() {
      particles.push({
        x: Math.random() * W,
        y: H + 4,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -(1 + Math.random() * 2),
        size: Math.random() > 0.5 ? 3 : 2,
        color: Math.random() > 0.5 ? "#ff3366" : "#ffaa00",
        life: 0, maxLife: 80 + Math.random() * 60,
        type: "ember",
      });
    }

    function spawnRain() {
      particles.push({
        x: Math.random() * W,
        y: -4,
        vx: 0,
        vy: 3 + Math.random() * 3,
        size: 2,
        color: `rgba(0, 212, 255, ${0.3 + Math.random() * 0.4})`,
        life: 0, maxLife: 60 + Math.random() * 40,
        type: "rain",
      });
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      t++;

      // Spawn ongoing particles
      if (t > 20 && t % 3 === 0) spawnEmber();
      if (t > 30 && t % 2 === 0) spawnRain();

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;

        if (p.life < 0) continue; // delayed start
        if (p.life > p.maxLife) { particles.splice(i, 1); continue; }

        p.x += p.vx;
        p.y += p.vy;

        if (p.type === "explosion") {
          p.vx *= 0.96;
          p.vy *= 0.96;
          p.vy += 0.08; // gravity
        }

        const alpha = 1 - p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;

        // Pixel-perfect rendering
        const x = Math.round(p.x);
        const y = Math.round(p.y);
        ctx.fillRect(x, y, p.size, p.size);

        // Glow for explosion particles
        if (p.type === "explosion" && p.life < 20) {
          ctx.globalAlpha = alpha * 0.3;
          ctx.fillRect(x - 1, y - 1, p.size + 2, p.size + 2);
        }
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={() => { setPhase(2); setTimeout(onDismiss, 400); }}
      style={{
        cursor: "pointer",
        ...(shake ? { animation: "crt-shake 0.06s linear infinite" } : {}),
      }}
    >
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background: phase === 2
            ? "transparent"
            : "radial-gradient(ellipse at center, rgba(0,20,40,0.9) 0%, rgba(0,0,0,0.95) 100%)",
          transition: "opacity 0.5s ease",
          opacity: phase === 2 ? 0 : 1,
        }}
      />

      {/* White flash */}
      {flash && (
        <div className="absolute inset-0 bg-white z-10" style={{ animation: "flash-out 0.15s ease-out forwards" }} />
      )}

      {/* Canvas particles */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ imageRendering: "pixelated", opacity: phase === 2 ? 0 : 1, transition: "opacity 0.4s" }}
      />

      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
          opacity: phase === 2 ? 0 : 0.4,
          transition: "opacity 0.3s",
        }}
      />

      {/* Horizontal glitch bar */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: 0, right: 0,
          height: "3px",
          background: "rgba(0, 255, 65, 0.15)",
          top: `${30 + Math.sin(Date.now() / 200) * 20}%`,
          animation: "scan-line 3s linear infinite",
        }}
      />

      {/* Main card */}
      <div
        className="relative z-20 text-center"
        style={{
          padding: "32px 40px",
          background: "linear-gradient(180deg, rgba(10,10,30,0.95) 0%, rgba(5,5,20,0.98) 100%)",
          border: "2px solid #00ff41",
          boxShadow: `
            0 0 30px rgba(0,255,65,0.2),
            0 0 60px rgba(0,255,65,0.1),
            inset 0 1px 0 rgba(0,255,65,0.1),
            inset 0 0 40px rgba(0,212,255,0.03)
          `,
          transform: visible && phase < 2 ? "scale(1) translateY(0)" : phase === 2 ? "scale(0.95) translateY(10px)" : "scale(0.5) translateY(20px)",
          opacity: visible && phase < 2 ? 1 : 0,
          transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease",
          imageRendering: "auto",
          minWidth: "300px",
        }}
      >
        {/* Corner decorations */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#00d4ff]" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#00d4ff]" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#00d4ff]" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#00d4ff]" />

        {/* Pixel sword */}
        <div className="flex justify-center mb-5" style={{ animation: "float-sword 2s ease-in-out infinite" }}>
          <PixelSword />
        </div>

        {/* Main title with glitch */}
        <div className="relative inline-block">
          <div
            style={{
              fontFamily: "var(--font-pixel), 'Courier New', monospace",
              fontSize: "20px",
              fontWeight: "bold",
              color: "#00ff41",
              textShadow: "0 0 10px #00ff41, 0 0 30px rgba(0,255,65,0.4)",
              letterSpacing: "4px",
              animation: "glitch-main 4s ease-in-out infinite",
            }}
          >
            QUEST COMPLETE
          </div>
          <div
            className="absolute inset-0"
            style={{
              fontFamily: "var(--font-pixel), 'Courier New', monospace",
              fontSize: "20px",
              fontWeight: "bold",
              color: "#ff3366",
              letterSpacing: "4px",
              opacity: 0.6,
              animation: "glitch-r 0.15s steps(2) infinite alternate",
              clipPath: "inset(15% 0 50% 0)",
            }}
          >
            QUEST COMPLETE
          </div>
          <div
            className="absolute inset-0"
            style={{
              fontFamily: "var(--font-pixel), 'Courier New', monospace",
              fontSize: "20px",
              fontWeight: "bold",
              color: "#00d4ff",
              letterSpacing: "4px",
              opacity: 0.6,
              animation: "glitch-b 0.15s steps(2) infinite alternate-reverse",
              clipPath: "inset(55% 0 10% 0)",
            }}
          >
            QUEST COMPLETE
          </div>
        </div>

        {/* Typewriter subtitle */}
        <div className="mt-2 h-4">
          <span
            style={{
              fontFamily: "var(--font-pixel), 'Courier New', monospace",
              fontSize: "8px",
              color: "#4a6670",
              letterSpacing: "2px",
            }}
          >
            {typedText}
            <span style={{ animation: "blink-cursor 0.6s step-end infinite" }}>_</span>
          </span>
        </div>

        {/* Divider */}
        <div className="my-5 h-px" style={{ background: "linear-gradient(90deg, transparent, #00ff41, transparent)" }} />

        {/* Stats row */}
        <div className="flex items-stretch justify-center gap-4">
          {/* Score */}
          <div
            className="px-5 py-3 flex-1"
            style={{
              border: "1px solid rgba(0,255,65,0.2)",
              background: "rgba(0,255,65,0.03)",
            }}
          >
            <div style={{ fontFamily: "var(--font-pixel), monospace", fontSize: "7px", color: "#00ff41", opacity: 0.5, letterSpacing: "2px", marginBottom: "4px" }}>
              SCORE
            </div>
            <div style={{
              fontFamily: "var(--font-pixel), monospace",
              fontSize: "24px",
              fontWeight: "bold",
              color: "#00ff41",
              textShadow: "0 0 12px rgba(0,255,65,0.6)",
              lineHeight: 1,
            }}>
              {String(score).padStart(4, "0")}
            </div>
          </div>

          {/* Rank */}
          <div
            className="px-5 py-3 flex-1 relative overflow-hidden"
            style={{
              border: "1px solid rgba(255,170,0,0.2)",
              background: "rgba(255,170,0,0.03)",
            }}
          >
            <div style={{ fontFamily: "var(--font-pixel), monospace", fontSize: "7px", color: "#ffaa00", opacity: 0.5, letterSpacing: "2px", marginBottom: "4px" }}>
              RANK
            </div>
            {showRank ? (
              <div style={{
                fontFamily: "var(--font-pixel), monospace",
                fontSize: "24px",
                fontWeight: "bold",
                color: "#ffaa00",
                textShadow: "0 0 12px rgba(255,170,0,0.6), 0 0 30px rgba(255,170,0,0.3)",
                lineHeight: 1,
                animation: "rank-slam 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
              }}>
                S+
              </div>
            ) : (
              <div style={{ fontFamily: "var(--font-pixel), monospace", fontSize: "24px", color: "#333", lineHeight: 1 }}>--</div>
            )}
            {/* Rank flash */}
            {showRank && (
              <div className="absolute inset-0" style={{ background: "rgba(255,170,0,0.15)", animation: "rank-flash 0.4s ease-out forwards" }} />
            )}
          </div>
        </div>

        {/* Power bar */}
        <div className="mt-5 mx-auto" style={{ maxWidth: "240px" }}>
          <div className="flex justify-between mb-1" style={{ fontFamily: "var(--font-pixel), monospace", fontSize: "7px", letterSpacing: "1px" }}>
            <span style={{ color: "#00d4ff", opacity: 0.6 }}>POWER</span>
            <span style={{ color: "#00d4ff", opacity: 0.6 }}>MAX</span>
          </div>
          <div style={{ height: "6px", background: "#0a0a1a", border: "1px solid rgba(0,212,255,0.2)" }}>
            <div style={{
              height: "100%",
              width: `${barWidth}%`,
              background: "linear-gradient(90deg, #00d4ff, #00ff41, #ffaa00)",
              transition: "width 1.8s cubic-bezier(0.22, 1, 0.36, 1)",
              boxShadow: barWidth > 50 ? "0 0 8px rgba(0,212,255,0.5)" : "none",
            }} />
          </div>
        </div>

        {/* Dismiss hint */}
        <div className="mt-5" style={{ fontFamily: "var(--font-pixel), monospace", fontSize: "7px", color: "#2a3a40", letterSpacing: "2px", animation: "blink-slow 2s ease-in-out infinite" }}>
          PRESS ANY KEY
        </div>
      </div>

      <style jsx>{`
        @keyframes crt-shake {
          0% { transform: translate(0, 0); }
          25% { transform: translate(-2px, 1px); }
          50% { transform: translate(2px, -1px); }
          75% { transform: translate(-1px, -2px); }
          100% { transform: translate(1px, 2px); }
        }
        @keyframes flash-out {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes glitch-main {
          0%, 85%, 100% { transform: translateX(0); }
          87% { transform: translateX(-3px) skewX(-2deg); }
          89% { transform: translateX(3px) skewX(1deg); }
          91% { transform: translateX(-1px); }
          93% { transform: translateX(0); }
        }
        @keyframes glitch-r {
          0% { transform: translateX(-2px); }
          100% { transform: translateX(3px); }
        }
        @keyframes glitch-b {
          0% { transform: translateX(2px); }
          100% { transform: translateX(-3px); }
        }
        @keyframes float-sword {
          0%, 100% { transform: translateY(0) rotate(-45deg); }
          50% { transform: translateY(-6px) rotate(-45deg); }
        }
        @keyframes rank-slam {
          0% { transform: scale(3); opacity: 0; }
          60% { transform: scale(0.9); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes rank-flash {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes blink-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes blink-slow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        @keyframes scan-line {
          0% { top: -5%; }
          100% { top: 105%; }
        }
      `}</style>
    </div>
  );
}

/** Pixel art sword with glow */
function PixelSword() {
  return (
    <svg width="64" height="64" viewBox="0 0 16 16" shapeRendering="crispEdges"
      style={{ filter: "drop-shadow(0 0 8px rgba(0,212,255,0.6)) drop-shadow(0 0 16px rgba(0,212,255,0.3))" }}>
      {/* Blade tip */}
      <rect x="13" y="0" width="1" height="1" fill="#ffffff" />
      <rect x="12" y="1" width="2" height="1" fill="#e8f4ff" />
      {/* Blade */}
      <rect x="11" y="2" width="2" height="1" fill="#c0deff" />
      <rect x="10" y="3" width="2" height="1" fill="#a0c8ff" />
      <rect x="9" y="4" width="2" height="1" fill="#c0deff" />
      <rect x="8" y="5" width="2" height="1" fill="#a0c8ff" />
      <rect x="7" y="6" width="2" height="1" fill="#c0deff" />
      <rect x="6" y="7" width="2" height="1" fill="#a0c8ff" />
      {/* Blade edge highlight */}
      <rect x="13" y="1" width="1" height="1" fill="#ffffff" />
      <rect x="12" y="2" width="1" height="1" fill="#ffffff" opacity="0.8" />
      <rect x="11" y="3" width="1" height="1" fill="#ffffff" opacity="0.6" />
      {/* Guard */}
      <rect x="4" y="8" width="6" height="1" fill="#ffaa00" />
      <rect x="3" y="8" width="1" height="1" fill="#ff6600" />
      <rect x="10" y="8" width="1" height="1" fill="#ff6600" />
      <rect x="4" y="9" width="6" height="1" fill="#cc7700" />
      {/* Gem in guard */}
      <rect x="6" y="8" width="2" height="1" fill="#ff3366" />
      {/* Handle wrap */}
      <rect x="4" y="10" width="2" height="1" fill="#5c3a1e" />
      <rect x="3" y="11" width="2" height="1" fill="#7a4f2e" />
      <rect x="4" y="11" width="1" height="1" fill="#5c3a1e" />
      <rect x="2" y="12" width="2" height="1" fill="#5c3a1e" />
      {/* Pommel */}
      <rect x="1" y="13" width="2" height="1" fill="#ffaa00" />
      <rect x="0" y="14" width="2" height="1" fill="#cc7700" />
      {/* Blade sparkle */}
      <rect x="11" y="2" width="1" height="1" fill="#ffffff">
        <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" repeatCount="indefinite" />
      </rect>
      <rect x="9" y="4" width="1" height="1" fill="#ffffff">
        <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}
