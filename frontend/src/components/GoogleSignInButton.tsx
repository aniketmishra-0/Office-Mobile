"use client";

import React from "react";

interface Props {
  onClick: () => void;
  loading?: boolean;
  connected?: boolean;
  compact?: boolean;
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export default function GoogleSignInButton({ onClick, loading, connected, compact }: Props) {
  if (connected) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs font-medium text-green-700">Connected</span>
      </div>
    );
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <GoogleIcon size={14} />
        <span className="text-xs font-medium text-gray-700">Sign in</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 h-12 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100 transition-all disabled:opacity-50 shadow-soft"
    >
      {loading ? (
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      ) : (
        <>
          <GoogleIcon size={18} />
          <span className="text-sm font-medium text-gray-700">Sign in with Google</span>
        </>
      )}
    </button>
  );
}

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export { GoogleIcon };
