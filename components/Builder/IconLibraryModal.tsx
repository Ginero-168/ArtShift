"use client";

import { useMemo, useState } from "react";
import { IconBulb, IconClose, IconSearch, IconSparkles } from "@/components/icons";
import {
  VECTOR_ICON_CATEGORIES,
  VECTOR_ICONS,
  type VectorIconCategory,
  type VectorIconDefinition,
} from "@/lib/builder/vectorIconLibrary";

interface IconLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectIcon: (icon: VectorIconDefinition) => void;
}

export default function IconLibraryModal({ isOpen, onClose, onSelectIcon }: IconLibraryModalProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<VectorIconCategory | "All">("All");

  const filteredIcons = useMemo(() => {
    const query = search.trim().toLowerCase();
    return VECTOR_ICONS.filter((icon) => {
      const matchesCategory = selectedCategory === "All" || icon.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!query) return true;
      return (
        icon.name.toLowerCase().includes(query) ||
        icon.id.toLowerCase().includes(query) ||
        icon.category.toLowerCase().includes(query) ||
        icon.keywords.some((k) => k.toLowerCase().includes(query))
      );
    });
  }, [search, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="icon-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(26, 23, 20, 0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "90%",
          maxWidth: 680,
          maxHeight: "85vh",
          backgroundColor: "#ffffff",
          borderRadius: 14,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid #ece7e0",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px 12px",
            borderBottom: "1px solid #f8f4ef",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2
              id="icon-modal-title"
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: "#1a1714",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <IconSparkles size={18} color="#b52c00" />
              Vector Icons (ไอคอนเวกเตอร์)
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12.5,
                color: "#78726a",
              }}
            >
              คลิกไอคอนเพื่อวางบน Canvas เป็น Vector Path เปลี่ยนสี Fill และ Stroke ได้อิสระ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "none",
              backgroundColor: "#f8f4ef",
              color: "#78726a",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
            }}
            title="Close (ปิด)"
            aria-label="Close"
          >
            <IconClose size={15} color="#78726a" />
          </button>
        </div>

        {/* Filter Controls */}
        <div
          style={{
            padding: "12px 20px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            borderBottom: "1px solid #f8f4ef",
            backgroundColor: "#fcf9f5",
          }}
        >
          {/* Search Input */}
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
                color: "#a7a198",
                pointerEvents: "none",
              }}
            >
              <IconSearch size={14} color="#a7a198" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาไอคอน (เช่น star, heart, user, search, cart...)"
              style={{
                width: "100%",
                padding: "8px 36px 8px 34px",
                fontSize: 13,
                borderRadius: 8,
                border: "1px solid #d9d3cc",
                backgroundColor: "#ffffff",
                color: "#1a1714",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  color: "#a7a198",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 2,
                }}
              >
                <IconClose size={12} color="#a7a198" />
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              overflowX: "auto",
              paddingBottom: 2,
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedCategory("All")}
              style={{
                padding: "4px 10px",
                fontSize: 11.5,
                fontWeight: 500,
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.12s ease",
                backgroundColor: selectedCategory === "All" ? "#b52c00" : "#ece7e0",
                color: selectedCategory === "All" ? "#ffffff" : "#58534c",
              }}
            >
              All ({VECTOR_ICONS.length})
            </button>
            {VECTOR_ICON_CATEGORIES.map((cat) => {
              const count = VECTOR_ICONS.filter((i) => i.category === cat).length;
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 11.5,
                    fontWeight: 500,
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.12s ease",
                    backgroundColor: isSelected ? "#b52c00" : "#ece7e0",
                    color: isSelected ? "#ffffff" : "#58534c",
                  }}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Icon Grid */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
            gap: 10,
            alignContent: "start",
          }}
        >
          {filteredIcons.length === 0 ? (
            <div
              style={{
                gridColumn: "1 / -1",
                padding: "40px 0",
                textAlign: "center",
                color: "#a7a198",
                fontSize: 13,
              }}
            >
              ไม่พบไอคอนที่ตรงกับคำค้นหา &ldquo;{search}&rdquo;
            </div>
          ) : (
            filteredIcons.map((icon) => (
              <button
                key={icon.id}
                type="button"
                onClick={() => onSelectIcon(icon)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "12px 6px",
                  borderRadius: 10,
                  border: "1px solid #f8f4ef",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  color: "#443f39",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#d64418";
                  e.currentTarget.style.backgroundColor = "#fcfaf6";
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(214, 68, 24, 0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#f8f4ef";
                  e.currentTarget.style.backgroundColor = "#ffffff";
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "none";
                }}
                title={`เพิ่ม ${icon.name}`}
              >
                <svg
                  viewBox={icon.viewBox || "0 0 24 24"}
                  style={{
                    width: 28,
                    height: 28,
                    fill: "currentColor",
                    display: "block",
                  }}
                  aria-hidden="true"
                >
                  <path d={icon.path} />
                </svg>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 500,
                    color: "#58534c",
                    textAlign: "center",
                    lineHeight: 1.2,
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {icon.name.split(" ")[0]}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid #f8f4ef",
            backgroundColor: "#fcf9f5",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: 11.5,
              color: "#78726a",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <IconBulb size={14} color="#f59e0b" fill="#f59e0b" fillOpacity={0.25} />
            <span>เวกเตอร์ไอคอนสามารถเปลี่ยนสี Fill, Stroke และปรับขนาดได้อิสระที่ Property Panel</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 6,
              border: "1px solid #d9d3cc",
              backgroundColor: "#ffffff",
              color: "#58534c",
              cursor: "pointer",
            }}
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
