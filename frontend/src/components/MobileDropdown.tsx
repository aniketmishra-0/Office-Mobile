"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export interface DropdownOption {
  value: string;
  label: string;
}

interface MobileDropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: "default" | "sm";
}

export default function MobileDropdown({
  value,
  options,
  onChange,
  placeholder = "Select an option",
  disabled = false,
  size = "default",
}: MobileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const selectedOption = options.find((o) => o.value === value);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className={`w-full flex items-center justify-between bg-white border border-gray-200 rounded-lg shadow-sm appearance-none transition-colors ${
          size === "sm" ? "px-2.5 py-2 text-xs min-h-[36px]" : "px-3 py-2.5 text-[15px] min-h-[48px]"
        } ${
          disabled ? "opacity-50 cursor-not-allowed bg-gray-50" : "hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
        }`}
      >
        <span className={selectedOption ? "text-gray-900" : "text-gray-400"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isMounted &&
        isOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
              onClick={() => setIsOpen(false)}
            />
            <div
              className="relative w-full max-w-[480px] sm:max-w-md bg-white sm:rounded-xl rounded-t-2xl shadow-2xl overflow-hidden animate-slide-up sm:animate-fade-in"
              style={{ maxHeight: "85vh" }}
            >
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
                <h3 className="text-sm font-semibold text-gray-700">{placeholder}</h3>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: "calc(85vh - 50px)" }}>
                <ul className="py-2">
                  {options.length === 0 ? (
                    <li className="px-4 py-8 text-center text-sm text-gray-500">No options available</li>
                  ) : (
                    options.map((option) => (
                      <li key={option.value}>
                        <button
                          type="button"
                          onClick={() => handleSelect(option.value)}
                          className="w-full text-left px-4 py-3 text-[15px] hover:bg-gray-50 flex items-center justify-between transition-colors"
                        >
                          <span className={option.value === value ? "text-accent-600 font-medium" : "text-gray-700"}>
                            {option.label}
                          </span>
                          {option.value === value && (
                            <svg className="w-5 h-5 text-accent-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
