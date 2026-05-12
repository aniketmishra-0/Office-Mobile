"use client";

import React from "react";

interface Props {
  message?: string;
}

export default function LoadingOverlay({ message }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm">
      {/* Spinner */}
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-gray-100" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent-600 animate-spin" />
      </div>

      {/* Message */}
      {message && (
        <p className="text-gray-600 mt-4 text-sm font-medium animate-pulse-soft">
          {message}
        </p>
      )}
    </div>
  );
}
