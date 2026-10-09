"use client";

import { useEffect } from "react";

export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const beforeNavigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? (event.target.closest("a[href]") as HTMLAnchorElement | null)
          : null;
      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        link.pathname === window.location.pathname
      )
        return;
      if (
        !window.confirm(
          "저장하지 않은 변경 내용이 있어요. 저장하지 않고 이동할까요?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigate, true);
    };
  }, [dirty]);
}
