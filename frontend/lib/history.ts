"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type JobHistoryItem = {
  id: string;
  title?: string | null;
  subject?: string | null;
  professor?: string | null;
  cardCount?: number | null;
  createdAt: string;
};

type State = {
  items: JobHistoryItem[];
  push: (item: JobHistoryItem) => void;
  clear: () => void;
};

export const useJobHistory = create<State>()(
  persist(
    (set) => ({
      items: [],
      push: (item) =>
        set((state) => {
          const filtered = state.items.filter((i) => i.id !== item.id);
          return {
            items: [item, ...filtered].slice(0, 10)
          };
        }),
      clear: () => set({ items: [] })
    }),
    { name: "ankidude-job-history" }
  )
);
