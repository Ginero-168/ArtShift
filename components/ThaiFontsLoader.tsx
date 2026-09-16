"use client";

import { useEffect } from "react";
import { loadThaiFonts } from "@/lib/fonts";

/** Eagerly inject the full Thai Google Fonts catalog on first client mount. */
export default function ThaiFontsLoader() {
  useEffect(() => {
    loadThaiFonts();
  }, []);
  return null;
}
