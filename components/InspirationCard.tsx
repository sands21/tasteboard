"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";
import type { Inspiration } from "@/lib/db";

interface InspirationCardProps {
  item: Inspiration;
  onOpen: (item: Inspiration, origin: { x: number; y: number }) => void;
}

/**
 * A pure-image card: no chrome, no metadata. The aspect ratio is reserved from
 * the stored thumb dimensions so the column never shifts when the image loads.
 * The thumb blob is only turned into an object URL once the card nears the
 * viewport (IntersectionObserver via useInView).
 */
export function InspirationCard({ item, onOpen }: InspirationCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "200px 0px" });
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!inView) return;
    const url = URL.createObjectURL(item.thumb);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [inView, item.thumb]);

  // The lightbox scales in from the card's position, so opening passes the
  // card's current viewport center along.
  function open() {
    const rect = ref.current?.getBoundingClientRect();
    onOpen(
      item,
      rect
        ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    );
  }

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className="group relative cursor-pointer overflow-hidden rounded-card bg-hairline/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-ink"
      style={{ aspectRatio: `${item.width} / ${item.height}` }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- blob URL; next/image can't optimize these
        <img
          src={src}
          alt={item.title ?? ""}
          className="block h-full w-full object-cover"
        />
      )}

      {/* 1px hairline appears on hover only — keeps near-white screenshots
          from melting into the page without bordering everything always. */}
      <div className="pointer-events-none absolute inset-0 rounded-card border border-hairline opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100" />

      {/* Hover reveals the note (the "why"), never the title. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-surface/90 px-3.5 py-2.5 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100">
        <p className="line-clamp-3 font-serif text-[15px] italic text-ink">
          {item.note}
        </p>
      </div>
    </div>
  );
}
