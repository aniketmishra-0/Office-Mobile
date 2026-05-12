"use client";

import React, { useEffect, useState } from "react";
import Logo from "@/components/Logo";

interface Props {
  formTitle: string;
  onSubmitAnother: () => void;
}

export default function SuccessScreen({ formTitle, onSubmitAnother }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      {/* Checkmark */}
      <div
        className={`transition-all duration-500 ease-out ${
          show ? "opacity-100 scale-100" : "opacity-0 scale-75"
        }`}
      >
        <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center border-2 border-emerald-100">
          <svg
            className="w-10 h-10 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
              style={{
                strokeDasharray: 24,
                strokeDashoffset: show ? 0 : 24,
                transition: "stroke-dashoffset 0.5s ease-out 0.2s",
              }}
            />
          </svg>
        </div>
      </div>

      {/* Text */}
      <div
        className={`text-center mt-6 transition-all duration-400 delay-150 ${
          show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        }`}
      >
        <h1 className="text-xl font-bold text-gray-900">Response recorded</h1>
        <p className="text-gray-500 mt-2 text-sm max-w-[260px]">
          Your data has been saved to{" "}
          <span className="font-medium text-gray-700">{formTitle}</span>
        </p>
      </div>

      {/* CTA */}
      <div
        className={`w-full max-w-[280px] mt-8 transition-all duration-400 delay-300 ${
          show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        }`}
      >
        <button
          type="button"
          onClick={onSubmitAnother}
          className="w-full bg-gray-900 hover:bg-gray-800 text-white h-12 rounded-xl text-sm font-semibold transition-colors"
        >
          Submit another response
        </button>
      </div>

      {/* Footer */}
      <div
        className={`mt-8 transition-all duration-400 delay-500 ${
          show ? "opacity-100" : "opacity-0"
        }`}
      >
        <Logo size="sm" showText={true} />
      </div>
    </div>
  );
}
