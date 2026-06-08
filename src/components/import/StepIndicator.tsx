"use client";

import { Check } from "lucide-react";

export type Step = {
  id: string;
  label: string;
};

export default function StepIndicator({
  steps,
  current,
}: {
  steps: Step[];
  current: number;
}) {
  return (
    <ol className="flex items-center gap-2 mb-6 flex-wrap">
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "active" : "pending";
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={
                "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold " +
                (state === "done"
                  ? "bg-green-600 text-white"
                  : state === "active"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-500")
              }
            >
              {state === "done" ? <Check className="w-4 h-4" /> : i + 1}
            </span>
            <span
              className={
                "text-sm " +
                (state === "active"
                  ? "font-semibold text-gray-900"
                  : state === "done"
                  ? "text-gray-600"
                  : "text-gray-400")
              }
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="text-gray-300 mx-1">›</span>}
          </li>
        );
      })}
    </ol>
  );
}
