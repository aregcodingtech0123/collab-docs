// Shared button primitive.

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-700 disabled:hover:bg-zinc-900",
  secondary: "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 disabled:hover:bg-white",
  ghost: "text-zinc-700 hover:bg-zinc-100 disabled:hover:bg-transparent",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:hover:bg-red-600",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export default function Button({ variant = "secondary", className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}
