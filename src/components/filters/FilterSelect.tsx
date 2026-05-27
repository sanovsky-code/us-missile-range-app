"use client";

import { ChevronDown } from "lucide-react";

interface FilterSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function FilterSelect({ label, options, selected, onChange }: FilterSelectProps) {
  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <details className="relative group">
        <summary className="flex items-center justify-between w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 list-none">
          <span className="text-gray-700 truncate">
            {selected.length === 0 ? "הכל" : `${selected.length} נבחרו`}
          </span>
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        </summary>
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto">
          {options.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggleOption(option)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-700 truncate">{option}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
