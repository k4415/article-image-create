"use client";

import { useRef } from "react";
import { Check, SlidersHorizontal, X } from "lucide-react";

type Option = {
  value: string;
  label: string;
  count?: number;
};

type Props = {
  label: string;
  options: Option[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
};

export function MultiSelectFilter({ label, options, selectedValues, onChange }: Props) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const selected = new Set(selectedValues);
  const summary = selectedValues.length === 0 ? `${label}すべて` : `${label} ${selectedValues.length}件選択`;

  function closeAfterSelection() {
    window.setTimeout(() => {
      detailsRef.current?.removeAttribute("open");
    }, 0);
  }

  function toggle(value: string) {
    if (selected.has(value)) {
      onChange(selectedValues.filter((item) => item !== value));
      closeAfterSelection();
      return;
    }
    onChange([...selectedValues, value]);
    closeAfterSelection();
  }

  return (
    <details ref={detailsRef} className="group relative">
      <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none hover:border-slate-400 group-open:border-emerald-600">
        <SlidersHorizontal size={16} className="text-slate-400" />
        <span className="truncate">{summary}</span>
      </summary>
      <div className="absolute z-20 mt-2 max-h-80 w-[min(360px,calc(100vw-32px))] overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-100 px-2 py-2">
          <span className="text-xs font-semibold text-slate-500">{label}</span>
          {selectedValues.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                onChange([]);
                closeAfterSelection();
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              <X size={13} />
              クリア
            </button>
          ) : null}
        </div>
        <div className="py-1">
          {options.map((option) => {
            const active = selected.has(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                      active ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-transparent"
                    }`}
                  >
                    <Check size={12} />
                  </span>
                  <span className="truncate">{option.label}</span>
                </span>
                {typeof option.count === "number" ? <span className="shrink-0 text-xs text-slate-400">{option.count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </details>
  );
}
