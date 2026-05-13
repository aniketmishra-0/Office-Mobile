"use client";

import React, { useEffect, useRef, useState } from "react";

export default function InstallPrompt() {
  const deferredPrompt = useRef<any>(null);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("install_dismissed")) return;

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(ios);

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e;
    };

    window.addEventListener("beforeinstallprompt", handler);

    const timer = setTimeout(() => {
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
      if (deferredPrompt.current || (ios && !isStandalone)) {
        setShow(true);
      }
    }, 5000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearTimeout(timer);
    };
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("install_dismissed", "1");
  };

  const handleInstall = () => {
    deferredPrompt.current?.prompt();
  };

  if (!show || dismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 max-w-[560px] mx-auto bg-white rounded-t-lg border-t border-zinc-200 shadow-medium px-5 py-5 z-40 animate-slide-up">
      <p className="font-semibold text-zinc-950 text-sm mb-1">
        Add to home screen
      </p>
      <p className="text-xs text-zinc-500 mb-4">
        Install Office Mobile for quick access.
      </p>

      {isIOS ? (
        <div>
          <p className="text-xs text-zinc-600 mb-3">
            Tap Share, then &quot;Add to Home Screen&quot;.
          </p>
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full bg-zinc-100 text-zinc-700 font-medium rounded-lg h-11 text-sm"
          >
            Got it
          </button>
        </div>
      ) : (
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-1 bg-zinc-100 text-zinc-600 font-medium rounded-lg h-11 text-sm"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleInstall}
            className="flex-1 bg-zinc-950 text-white font-medium rounded-lg h-11 text-sm"
          >
            Install
          </button>
        </div>
      )}
    </div>
  );
}
