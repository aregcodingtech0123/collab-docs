// Shared button primitive. TODO: variants (primary / secondary / ghost) and sizes.

import type { ButtonHTMLAttributes } from "react";

export default function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} />;
}
