"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Inspiration } from "@/lib/db";
import { InspirationCard } from "@/components/InspirationCard";

// 3 columns default, 4 on wide screens, 2 on small ones so cards stay legible.
function useColumnCount(): number {
  const [count, setCount] = useState(3);
  useEffect(() => {
    const small = window.matchMedia("(max-width: 767px)");
    const wide = window.matchMedia("(min-width: 1536px)");
    const update = () => setCount(small.matches ? 2 : wide.matches ? 4 : 3);
    update();
    small.addEventListener("change", update);
    wide.addEventListener("change", update);
    return () => {
      small.removeEventListener("change", update);
      wide.removeEventListener("change", update);
    };
  }, []);
  return count;
}

interface MasonryGridProps {
  items: Inspiration[]; // newest first — data arrives as props, never from Dexie
}

export function MasonryGrid({ items }: MasonryGridProps) {
  const columnCount = useColumnCount();

  // Ids present on first render skip the settle animation — only items saved
  // while the grid is on screen animate in.
  const seenIds = useRef<Set<string> | null>(null);
  if (seenIds.current === null) {
    seenIds.current = new Set(items.map((i) => i.id));
  }
  const isNew = (id: string) => !seenIds.current!.has(id);
  useEffect(() => {
    for (const item of items) seenIds.current!.add(item.id);
  }, [items]);

  // JS column balancing: walk items in order (newest first), always appending
  // to the currently shortest column. Columns share one width, so "height" is
  // just the running sum of aspect ratios. CSS `columns` would scramble the
  // chronology — this keeps it readable left-to-right, top-to-bottom-ish.
  const columns = useMemo(() => {
    const cols = Array.from({ length: columnCount }, () => ({
      items: [] as Inspiration[],
      height: 0,
    }));
    for (const item of items) {
      const shortest = cols.reduce((a, b) => (b.height < a.height ? b : a));
      shortest.items.push(item);
      shortest.height += item.height / item.width;
    }
    return cols.map((c) => c.items);
  }, [items, columnCount]);

  return (
    <div className="flex gap-6">
      {columns.map((column, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-6">
          {column.map((item) => (
            <motion.div
              key={item.id}
              initial={isNew(item.id) ? { opacity: 0, scale: 0.96, y: 12 } : false}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <InspirationCard item={item} />
            </motion.div>
          ))}
        </div>
      ))}
    </div>
  );
}
