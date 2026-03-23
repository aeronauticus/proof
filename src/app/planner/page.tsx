"use client";

import { useState, useEffect } from "react";
import AppShell from "@/components/ui/AppShell";
import Lightbox from "@/components/ui/Lightbox";

interface PlannerPhoto {
  id: number;
  date: string;
  photoPath: string;
  uploadedAt: string;
}

function PlannerGalleryContent() {
  const [photos, setPhotos] = useState<PlannerPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    fetch("/api/planner?all=true")
      .then((r) => r.json())
      .then((data) => {
        setPhotos(data.photos || []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-900">Planner Photos</h2>
        <div className="text-center py-12 text-gray-400">
          No planner photos uploaded yet.
        </div>
      </div>
    );
  }

  // Group photos by month
  const grouped: Record<string, PlannerPhoto[]> = {};
  for (const photo of photos) {
    const d = new Date(photo.date + "T12:00:00");
    const key = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(photo);
  }

  const allPaths = photos.map((p) => p.photoPath);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Planner Photos</h2>

      {Object.entries(grouped).map(([month, monthPhotos]) => (
        <div key={month}>
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">
            {month}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {monthPhotos.map((photo) => {
              const globalIndex = photos.indexOf(photo);
              const d = new Date(photo.date + "T12:00:00");
              const dayLabel = d.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              });

              return (
                <button
                  key={photo.id}
                  onClick={() => {
                    setLightboxIndex(globalIndex);
                    setLightboxOpen(true);
                  }}
                  className="relative aspect-[3/4] rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors group"
                >
                  <img
                    src={photo.photoPath}
                    alt={`Planner ${photo.date}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                    <span className="text-[11px] text-white font-medium">
                      {dayLabel}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {lightboxOpen && (
        <Lightbox
          photos={allPaths}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}

export default function PlannerPage() {
  return (
    <AppShell>
      <PlannerGalleryContent />
    </AppShell>
  );
}
