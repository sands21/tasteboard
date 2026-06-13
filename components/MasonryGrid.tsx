"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  onItemOpen: (item: Inspiration, origin: { x: number; y: number }) => void;
}

export function MasonryGrid({ items, onItemOpen }: MasonryGridProps) {
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

  // Stable column assignment. Once a card has a column it keeps it, so removing
  // one card never reshuffles the survivors across columns — without this, a
  // single delete would make every card after it hop columns, firing spurious
  // AnimatePresence exit/enter (a mass flicker). New cards balance into the
  // currently shortest column; a column-count change (resize) clears the map
  // for a full rebalance. CSS `columns` would scramble chronology — this keeps
  // it readable left-to-right, top-to-bottom-ish.
  const assignment = useRef<Map<string, number>>(new Map());
  const prevColumnCount = useRef(columnCount);
  if (prevColumnCount.current !== columnCount) {
    assignment.current.clear();
    prevColumnCount.current = columnCount;
  }

  const columns = useMemo(() => {
    const assign = assignment.current;
    const present = new Set(items.map((i) => i.id));
    for (const id of [...assign.keys()]) if (!present.has(id)) assign.delete(id);

    // Heights from already-assigned cards (shared column width, so an item's
    // contribution is just its aspect ratio).
    const heights = new Array<number>(columnCount).fill(0);
    for (const item of items) {
      const c = assign.get(item.id);
      if (c !== undefined) heights[c] += item.height / item.width;
    }
    // Place any not-yet-assigned cards into the currently shortest column.
    for (const item of items) {
      if (assign.has(item.id)) continue;
      let shortest = 0;
      for (let c = 1; c < columnCount; c++)
        if (heights[c] < heights[shortest]) shortest = c;
      assign.set(item.id, shortest);
      heights[shortest] += item.height / item.width;
    }

    const cols: Inspiration[][] = Array.from({ length: columnCount }, () => []);
    for (const item of items) cols[assign.get(item.id)!].push(item);
    return cols;
  }, [items, columnCount]);

  return (
    <div className="flex gap-6">
      {columns.map((column, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-6">
          {/* initial={false} suppresses enter on the first paint; per-item
              `isNew` then animates only cards added while mounted. exit fades
              removed cards out (delete, clear demo) — symmetric to the settle.
              popLayout pops exiting cards out of flow so the column collapses to
              its final height immediately instead of after the fade. */}
          <AnimatePresence initial={false} mode="popLayout">
            {column.map((item) => (
              <motion.div
                key={item.id}
                initial={
                  isNew(item.id) ? { opacity: 0, scale: 0.96, y: 12 } : false
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <InspirationCard item={item} onOpen={onItemOpen} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
