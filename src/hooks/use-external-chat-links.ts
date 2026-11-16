import { useEffect, useState } from "react";
import { openChatLink } from "@/components/chat/ThreadRefs";
import { useShowThreads } from "@/lib/chat/thread-preferences";
import type { Action, AppState } from "@/state/store";

export function useExternalChatLinks(state: AppState, dispatch: (action: Action) => void): void {
  const [link, setLink] = useState<string | null>(null);
  const showThreads = useShowThreads();
  useEffect(() => window.ogb?.onChatLink?.(setLink), []);
  useEffect(() => {
    if (!link || !state.hydrated) return;
    setLink(null);
    if (state.appSettingsOpen) dispatch({ type: "toggleAppSettings", open: false });
    
    openChatLink(dispatch, link, state, showThreads);
  }, [link, state, showThreads, dispatch]);
}
