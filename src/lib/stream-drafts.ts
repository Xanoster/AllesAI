"use client";

import { create } from "zustand";

export function streamDraftKey(convId: string, modelId: string, msgId: string): string {
  return `${convId}:${modelId}:${msgId}`;
}

type StreamDraftState = {
  drafts: Record<string, string>;
  setDraft: (key: string, content: string) => void;
  clearDraft: (key: string) => void;
};

export const useStreamDrafts = create<StreamDraftState>()((set) => ({
  drafts: {},
  setDraft: (key, content) =>
    set((state) => {
      if (state.drafts[key] === content) return state;
      return { drafts: { ...state.drafts, [key]: content } };
    }),
  clearDraft: (key) =>
    set((state) => {
      if (!(key in state.drafts)) return state;
      const next = { ...state.drafts };
      delete next[key];
      return { drafts: next };
    }),
}));
