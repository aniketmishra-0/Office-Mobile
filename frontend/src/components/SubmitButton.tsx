"use client";

import React from "react";

interface Props {
  label?: string;
  submitting: boolean;
  onClick?: () => void;
  form?: string;
  disabled?: boolean;
}

export default function SubmitButton({
  label,
  submitting,
  onClick,
  form,
  disabled,
}: Props) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 max-w-[560px] mx-auto px-5 pt-3 pb-3 bg-white border-t border-zinc-200 shadow-sticky z-40"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
    >
      <button
        type={onClick ? "button" : "submit"}
        form={form}
        disabled={submitting || disabled}
        onClick={onClick}
        className="w-full bg-zinc-950 hover:bg-zinc-800 active:bg-black disabled:bg-zinc-200 disabled:text-zinc-500 text-white font-semibold text-[15px] rounded-lg h-[52px] flex items-center justify-center gap-2 transition-all duration-150"
      >
        {submitting ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Working...</span>
          </>
        ) : (
          <span>{label ?? "Submit Response"}</span>
        )}
      </button>
    </div>
  );
}
