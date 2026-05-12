"use client";

import React, { useEffect, useState } from "react";

interface Props {
  message: string | null;
  onDismiss: () => void;
}

export default function ErrorToast({ message, onDismiss }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 200);
    }, 8000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (message === null) return null;

  return (
    <div
      className={`fixed bottom-20 left-4 right-4 max-w-[448px] mx-auto z-50 transition-all duration-200 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <div className="bg-gray-900 text-white rounded-xl px-4 py-3.5 flex items-start gap-3 shadow-medium">
        <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="flex-1 text-sm leading-snug">{message}</p>
        <button
          type="button"
          onClick={() => {
            setVisible(false);
            setTimeout(onDismiss, 200);
          }}
          aria-label="Dismiss error"
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
