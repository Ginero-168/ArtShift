import { createVectorPath } from "@/lib/engine/factory";
import type { VectorPathElement } from "@/lib/engine/types";
import { parseVTracerSvgToElements } from "@/lib/vectorize/vtracerAdapter";

export type VectorIconCategory =
  | "Interface"
  | "Arrows"
  | "Commerce"
  | "Media"
  | "Communication"
  | "Shapes";

export type VectorIconDefinition = {
  id: string;
  name: string;
  category: VectorIconCategory;
  keywords: string[];
  path: string;
  viewBox?: string;
};

export const VECTOR_ICON_CATEGORIES: VectorIconCategory[] = [
  "Interface",
  "Arrows",
  "Commerce",
  "Media",
  "Communication",
  "Shapes",
];

export const VECTOR_ICONS: VectorIconDefinition[] = [
  // Interface
  {
    id: "star",
    name: "Star (ดาว)",
    category: "Interface",
    keywords: ["star", "ดาว", "favorite", "rating", "point", "badge"],
    path: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  },
  {
    id: "heart",
    name: "Heart (หัวใจ)",
    category: "Interface",
    keywords: ["heart", "หัวใจ", "love", "like", "favorite"],
    path: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  },
  {
    id: "search",
    name: "Search (ค้นหา)",
    category: "Interface",
    keywords: ["search", "ค้นหา", "find", "magnifier", "zoom"],
    path: "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
  },
  {
    id: "home",
    name: "Home (หน้าแรก)",
    category: "Interface",
    keywords: ["home", "บ้าน", "หน้าหลัก", "main", "house"],
    path: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  },
  {
    id: "user",
    name: "User (ผู้ใช้)",
    category: "Interface",
    keywords: ["user", "ผู้ใช้", "profile", "person", "account", "คน"],
    path: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  },
  {
    id: "users",
    name: "Users (กลุ่มคน)",
    category: "Interface",
    keywords: ["users", "กลุ่มคน", "team", "people", "group"],
    path: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  },
  {
    id: "settings",
    name: "Settings (การตั้งค่า)",
    category: "Interface",
    keywords: ["settings", "การตั้งค่า", "gear", "cog", "options", "tools"],
    path: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  },
  {
    id: "bell",
    name: "Notification (แจ้งเตือน)",
    category: "Interface",
    keywords: ["bell", "กระดิ่ง", "แจ้งเตือน", "alarm", "notice"],
    path: "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  },
  {
    id: "trash",
    name: "Trash (ถังขยะ)",
    category: "Interface",
    keywords: ["trash", "ถังขยะ", "delete", "remove", "ลบ"],
    path: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  },
  {
    id: "edit",
    name: "Edit (แก้ไข)",
    category: "Interface",
    keywords: ["edit", "แก้ไข", "pencil", "write", "ดินสอ"],
    path: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  },
  {
    id: "check",
    name: "Check (ถูกต้อง)",
    category: "Interface",
    keywords: ["check", "ถูก", "mark", "done", "yes", "success"],
    path: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  },
  {
    id: "close",
    name: "Close (ปิด/ยกเลิก)",
    category: "Interface",
    keywords: ["close", "ปิด", "cancel", "cross", "x", "กากบาท"],
    path: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  },
  {
    id: "plus",
    name: "Plus (เพิ่ม)",
    category: "Interface",
    keywords: ["plus", "บวก", "เพิ่ม", "add", "create", "new"],
    path: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  },
  {
    id: "minus",
    name: "Minus (ลด)",
    category: "Interface",
    keywords: ["minus", "ลบ", "ลด", "remove", "dash"],
    path: "M19 13H5v-2h14v2z",
  },
  {
    id: "lock",
    name: "Lock (ล็อค)",
    category: "Interface",
    keywords: ["lock", "ล็อค", "security", "password", "private"],
    path: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z",
  },
  {
    id: "unlock",
    name: "Unlock (ปลดล็อค)",
    category: "Interface",
    keywords: ["unlock", "ปลดล็อค", "open", "access"],
    path: "M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5-2.28 0-4.27 1.54-4.84 3.75l1.93.52C8.45 3.84 10.05 2.9 12 2.9c1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z",
  },
  {
    id: "eye",
    name: "Eye (สายตา/ดู)",
    category: "Interface",
    keywords: ["eye", "ตา", "view", "watch", "visible"],
    path: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
  },
  {
    id: "calendar",
    name: "Calendar (ปฏิทิน)",
    category: "Interface",
    keywords: ["calendar", "ปฏิทิน", "date", "day", "month", "วัน"],
    path: "M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z",
  },
  {
    id: "clock",
    name: "Clock (นาฬิกา/เวลา)",
    category: "Interface",
    keywords: ["clock", "เวลา", "time", "watch", "hour"],
    path: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
  },
  {
    id: "bookmark",
    name: "Bookmark (ที่คั่นหน้า)",
    category: "Interface",
    keywords: ["bookmark", "บุ๊กมาร์ก", "save", "ribbon", "favorite"],
    path: "M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z",
  },
  {
    id: "info",
    name: "Info (ข้อมูล)",
    category: "Interface",
    keywords: ["info", "ข้อมูล", "help", "notice", "detail"],
    path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
  },

  // Arrows
  {
    id: "arrow-right",
    name: "Arrow Right (ลูกศรขวา)",
    category: "Arrows",
    keywords: ["arrow", "right", "ขวา", "next", "forward"],
    path: "M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z",
  },
  {
    id: "arrow-left",
    name: "Arrow Left (ลูกศรซ้าย)",
    category: "Arrows",
    keywords: ["arrow", "left", "ซ้าย", "back", "prev"],
    path: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  },
  {
    id: "arrow-up",
    name: "Arrow Up (ลูกศรขึ้น)",
    category: "Arrows",
    keywords: ["arrow", "up", "ขึ้น", "top"],
    path: "M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z",
  },
  {
    id: "arrow-down",
    name: "Arrow Down (ลูกศรลง)",
    category: "Arrows",
    keywords: ["arrow", "down", "ลง", "bottom"],
    path: "M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z",
  },
  {
    id: "chevron-right",
    name: "Chevron Right (หัวลูกศรขวา)",
    category: "Arrows",
    keywords: ["chevron", "right", "ขวา", "next"],
    path: "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
  },
  {
    id: "chevron-left",
    name: "Chevron Left (หัวลูกศรซ้าย)",
    category: "Arrows",
    keywords: ["chevron", "left", "ซ้าย", "prev"],
    path: "M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z",
  },
  {
    id: "refresh",
    name: "Refresh (รีเฟรช)",
    category: "Arrows",
    keywords: ["refresh", "รีเฟรช", "reload", "sync", "rotate"],
    path: "M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
  },
  {
    id: "maximize",
    name: "Maximize (ขยายเต็ม)",
    category: "Arrows",
    keywords: ["maximize", "ขยาย", "fullscreen", "expand"],
    path: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
  },

  // Commerce
  {
    id: "shopping-cart",
    name: "Shopping Cart (รถเข็นช้อปปิ้ง)",
    category: "Commerce",
    keywords: ["shopping", "cart", "รถเข็น", "buy", "shop", "store"],
    path: "M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z",
  },
  {
    id: "shopping-bag",
    name: "Shopping Bag (ถุงช้อปปิ้ง)",
    category: "Commerce",
    keywords: ["bag", "ถุง", "shopping", "store", "retail"],
    path: "M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v12z",
  },
  {
    id: "tag",
    name: "Price Tag (ป้ายราคา)",
    category: "Commerce",
    keywords: ["tag", "ป้ายราคา", "price", "discount", "label", "sale"],
    path: "M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z",
  },
  {
    id: "credit-card",
    name: "Credit Card (บัตรเครดิต)",
    category: "Commerce",
    keywords: ["card", "บัตรเครดิต", "payment", "pay", "money", "เงิน"],
    path: "M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z",
  },
  {
    id: "percent",
    name: "Percent / Sale (ส่วนลด)",
    category: "Commerce",
    keywords: ["percent", "ส่วนลด", "sale", "offer", "promo"],
    path: "M7.5 11C9.43 11 11 9.43 11 7.5S9.43 4 7.5 4 4 5.57 4 7.5 5.57 11 7.5 11zm0-5C8.33 6 9 6.67 9 7.5S8.33 9 7.5 9 6 8.33 6 7.5 6.67 6 7.5 6zm9 7c-1.93 0-3.5 1.57-3.5 3.5s1.57 3.5 3.5 3.5 3.5-1.57 3.5-3.5-1.57-3.5-3.5-3.5zm0 5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm3.21-13.79l-14 14 1.41 1.41 14-14-1.41-1.41z",
  },
  {
    id: "gift",
    name: "Gift (ของขวัญ)",
    category: "Commerce",
    keywords: ["gift", "ของขวัญ", "present", "box", "reward"],
    path: "M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.65-.5-.65C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1h-2.22l.53-.71C13.58 4.57 14.24 4 15 4zM9 4c.76 0 1.42.57 1.69 1.29l.53.71H9c-.55 0-1-.45-1-1s.45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76V14h2V8.76l2.38 3.24L17 10.83 14.92 8H20v6z",
  },
  {
    id: "trophy",
    name: "Trophy (ถ้วยรางวัล)",
    category: "Commerce",
    keywords: ["trophy", "รางวัล", "award", "winner", "champion"],
    path: "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z",
  },
  {
    id: "trending-up",
    name: "Trending Up (เติบโต/ขึ้น)",
    category: "Commerce",
    keywords: ["trending", "เติบโต", "graph", "chart", "up", "stock"],
    path: "M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z",
  },

  // Media
  {
    id: "camera",
    name: "Camera (กล้อง)",
    category: "Media",
    keywords: ["camera", "กล้อง", "photo", "picture", "capture"],
    path: "M12 15c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm0-8c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5 2.24-5 5-5zm8-2h-3.17L15 3H9L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 14H4V7h4.05l1.83-2h4.24l1.83 2H20v12z",
  },
  {
    id: "image",
    name: "Image (รูปภาพ)",
    category: "Media",
    keywords: ["image", "รูปภาพ", "photo", "gallery", "picture"],
    path: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
  },
  {
    id: "video",
    name: "Video (วิดีโอ)",
    category: "Media",
    keywords: ["video", "วิดีโอ", "movie", "film", "camera"],
    path: "M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z",
  },
  {
    id: "music",
    name: "Music (เพลง/ดนตรี)",
    category: "Media",
    keywords: ["music", "เพลง", "sound", "audio", "ดนตรี"],
    path: "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z",
  },
  {
    id: "mic",
    name: "Microphone (ไมโครโฟน)",
    category: "Media",
    keywords: ["mic", "ไมค์", "audio", "record", "voice"],
    path: "M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z",
  },
  {
    id: "volume",
    name: "Volume (เสียง)",
    category: "Media",
    keywords: ["volume", "เสียง", "speaker", "sound", "audio"],
    path: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
  },
  {
    id: "smartphone",
    name: "Smartphone (สมาร์ทโฟน)",
    category: "Media",
    keywords: ["phone", "มือถือ", "smartphone", "mobile", "device"],
    path: "M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z",
  },

  // Communication
  {
    id: "mail",
    name: "Mail (อีเมล)",
    category: "Communication",
    keywords: ["mail", "อีเมล", "email", "envelope", "message", "จดหมาย"],
    path: "M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z",
  },
  {
    id: "chat",
    name: "Chat (แชท/ข้อความ)",
    category: "Communication",
    keywords: ["chat", "แชท", "message", "talk", "comment"],
    path: "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z",
  },
  {
    id: "send",
    name: "Send (ส่ง)",
    category: "Communication",
    keywords: ["send", "ส่ง", "share", "paperplane", "message"],
    path: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z",
  },
  {
    id: "phone",
    name: "Phone (โทรศัพท์)",
    category: "Communication",
    keywords: ["phone", "โทร", "call", "telephone", "contact"],
    path: "M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z",
  },
  {
    id: "globe",
    name: "Globe (เว็บไซต์/โลก)",
    category: "Communication",
    keywords: ["globe", "โลก", "web", "internet", "online", "website"],
    path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  },

  // Shapes & Symbols
  {
    id: "shield",
    name: "Shield (โล่ป้องกัน)",
    category: "Shapes",
    keywords: ["shield", "โล่", "protect", "security", "safe"],
    path: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z",
  },
  {
    id: "zap",
    name: "Lightning (สายฟ้า)",
    category: "Shapes",
    keywords: ["lightning", "สายฟ้า", "flash", "energy", "power", "fast"],
    path: "M7 2v11h3v9l7-12h-4l4-8z",
  },
  {
    id: "flame",
    name: "Flame (ไฟ/ยอดนิยม)",
    category: "Shapes",
    keywords: ["flame", "ไฟ", "fire", "hot", "trending", "popular"],
    path: "M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z",
  },
  {
    id: "sun",
    name: "Sun (พระอาทิตย์)",
    category: "Shapes",
    keywords: ["sun", "พระอาทิตย์", "light", "day", "summer", "warm"],
    path: "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0 0 1.41l1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z",
  },
  {
    id: "crown",
    name: "Crown (มงกุฎ)",
    category: "Shapes",
    keywords: ["crown", "มงกุฎ", "king", "queen", "vip", "premium"],
    path: "M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1v-1h14v1z",
  },
  {
    id: "coffee",
    name: "Coffee (กาแฟ)",
    category: "Shapes",
    keywords: ["coffee", "กาแฟ", "cafe", "cup", "drink"],
    path: "M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z",
  },
  {
    id: "map-pin",
    name: "Map Pin (หมุดสถานที่)",
    category: "Shapes",
    keywords: ["map", "pin", "ปักหมุด", "location", "place"],
    path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
  },
  {
    id: "thumbs-up",
    name: "Thumbs Up (ไลก์/ถูกใจ)",
    category: "Shapes",
    keywords: ["thumb", "like", "ชอบ", "good", "yes", "agree"],
    path: "M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z",
  },
];

export function createVectorPathFromIcon(
  icon: VectorIconDefinition,
  options: {
    x: number;
    y: number;
    size?: number;
    color?: string;
  },
): VectorPathElement {
  const size = options.size ?? 120;
  const vb = icon.viewBox || "0 0 24 24";
  const svg = `<svg viewBox="${vb}"><path d="${icon.path}" fill="${options.color || "#111827"}" /></svg>`;
  const elements = parseVTracerSvgToElements(svg, {
    targetBounds: {
      x: options.x,
      y: options.y,
      width: size,
      height: size,
    },
    sourceWidth: 24,
    sourceHeight: 24,
  });

  if (elements.length > 0) {
    const el = elements[0];
    el.name = icon.name;
    el.backgroundColor = options.color || "#111827";
    el.strokeColor = "transparent";
    el.strokeWidth = 0;
    el.builderKind = "icon";
    return el;
  }

  const fallback = createVectorPath(
    [
      { x: options.x, y: options.y },
      { x: options.x + size, y: options.y },
      { x: options.x + size, y: options.y + size },
      { x: options.x, y: options.y + size },
    ],
    true,
  );
  fallback.name = icon.name;
  fallback.backgroundColor = options.color || "#111827";
  fallback.builderKind = "icon";
  return fallback;
}
