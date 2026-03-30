import { useEffect, useMemo, useRef, useState } from "react";
import type {
  RemoteContentKind,
  RemoteDataFormat,
  RemoteOmeResolution,
  RemoteRenderMode,
} from "./layerTypes";
import {
  addCustomExternalSource,
  deleteCustomExternalSource,
  getCustomExternalSources,
  renameCustomExternalSource,
} from "./customSourceStore";

type LayerCreationMode = "drawing" | "external" | "custom";

type ExternalSourceItem = {
  id: string;
  name: string;
  url: string;
  icon: "generic" | "custom";
  builtIn?: boolean;
  remoteFormat?: RemoteDataFormat;
  remoteContentKind?: RemoteContentKind;
  renderMode?: RemoteRenderMode;
  remoteResolution?: RemoteOmeResolution;
};

type ExternalSourceGroup = {
  kind: "single" | "group";
  id: string;
  name: string;
  icon: "generic" | "custom";
  builtIn?: boolean;
  items: ExternalSourceItem[];
};

function PencilIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 007.07 0l2.83-2.83a5 5 0 10-7.07-7.07L11 4" />
      <path d="M14 11a5 5 0 00-7.07 0L4.1 13.83a5 5 0 107.07 7.07L13 20" />
    </svg>
  );
}

function DataIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function AddSourceIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 007.07 0l2.12-2.12a5 5 0 10-7.07-7.07L10 6" />
      <path d="M14 11a5 5 0 00-7.07 0L4.81 13.12a5 5 0 107.07 7.07L14 18" />
      <path d="M19 17v6" />
      <path d="M16 20h6" />
    </svg>
  );
}

function SourceGenericIcon() {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <DataIcon />
    </div>
  );
}

function SourceCustomIcon() {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(120,190,255,0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 5v14" />
        <path d="M5 12h14" />
        <path d="M19 16.5V19a1 1 0 01-1 1h-2.5" />
        <path d="M5 7.5V5a1 1 0 011-1h2.5" />
        <path d="M16.5 5H19a1 1 0 011 1v2.5" />
        <path d="M7.5 19H5a1 1 0 01-1-1v-2.5" />
      </svg>
    </div>
  );
}

function TabButton({
  active,
  title,
  subtitle,
  icon,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 14,
        border: active
          ? "1px solid rgba(160,220,255,0.75)"
          : "1px solid rgba(255,255,255,0.10)",
        background: active
          ? "rgba(120,190,255,0.16)"
          : "rgba(255,255,255,0.04)",
        color: "white",
        textAlign: "left",
        padding: 12,
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 9,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 11, opacity: 0.72, marginTop: 4 }}>
            {subtitle}
          </div>
        </div>
      </div>
    </button>
  );
}

const ALLEN_URL =
  "https://storage.googleapis.com/sbh-assistant-data/allen_average_template.ome.zarr/";

const ALLEN_BRAIN_SKELETON_URL =
  "https://storage.googleapis.com/sbh-assistant-data/allen_structure_meshes/obj/997.obj";

const ALLEN_ANNOTATION_URL =
  "https://storage.googleapis.com/sbh-assistant-data/allen_annotation.ome.zarr/";

const BUILT_IN_EXTERNAL_SOURCES: ExternalSourceItem[] = [
  {
    id: "allen-brain-skeleton-mesh",
    name: "Allen Mouse Brain Skeleton Mesh",
    url: ALLEN_BRAIN_SKELETON_URL,
    icon: "generic",
    builtIn: true,
    remoteFormat: "mesh-obj",
  },
  {
    id: "allen-average-brain-volume-25um",
    name: "Allen Average Mouse Brain (Volume · 25 µm)",
    url: ALLEN_URL,
    icon: "generic",
    builtIn: true,
    renderMode: "volume",
    remoteResolution: "25um",
  },
  {
    id: "allen-average-brain-volume-50um",
    name: "Allen Average Mouse Brain (Volume · 50 µm)",
    url: ALLEN_URL,
    icon: "generic",
    builtIn: true,
    renderMode: "volume",
    remoteResolution: "50um",
  },
  {
    id: "allen-average-brain-volume-100um",
    name: "Allen Average Mouse Brain (Volume · 100 µm)",
    url: ALLEN_URL,
    icon: "generic",
    builtIn: true,
    renderMode: "volume",
    remoteResolution: "100um",
  },
  {
    id: "allen-annotation-volume-25um",
    name: "Allen Annotation (Overlay · 25 µm)",
    url: ALLEN_ANNOTATION_URL,
    icon: "generic",
    builtIn: true,
    remoteFormat: "ome-zarr",
    remoteContentKind: "annotation",
    renderMode: "volume",
    remoteResolution: "25um",
  },
  {
    id: "allen-annotation-volume-50um",
    name: "Allen Annotation (Overlay · 50 µm)",
    url: ALLEN_ANNOTATION_URL,
    icon: "generic",
    builtIn: true,
    remoteFormat: "ome-zarr",
    remoteContentKind: "annotation",
    renderMode: "volume",
    remoteResolution: "50um",
  },
  {
    id: "allen-annotation-volume-100um",
    name: "Allen Annotation (Overlay · 100 µm)",
    url: ALLEN_ANNOTATION_URL,
    icon: "generic",
    builtIn: true,
    remoteFormat: "ome-zarr",
    remoteContentKind: "annotation",
    renderMode: "volume",
    remoteResolution: "100um",
  },
  {
    id: "allen-average-brain-slices-25um",
    name: "Allen Average Mouse Brain (Slices · 25 µm)",
    url: ALLEN_URL,
    icon: "generic",
    builtIn: true,
    renderMode: "slices",
    remoteResolution: "25um",
  },
  {
    id: "allen-average-brain-slices-50um",
    name: "Allen Average Mouse Brain (Slices · 50 µm)",
    url: ALLEN_URL,
    icon: "generic",
    builtIn: true,
    renderMode: "slices",
    remoteResolution: "50um",
  },
  {
    id: "allen-average-brain-slices-100um",
    name: "Allen Average Mouse Brain (Slices · 100 µm)",
    url: ALLEN_URL,
    icon: "generic",
    builtIn: true,
    renderMode: "slices",
    remoteResolution: "100um",
  },
];

function stripResolutionSuffix(name: string) {
  return name.replace(
    /\s*\(([^()]*)\s*·\s*(10|25|50|100)\s*µm\)\s*$/i,
    (_match, label: string) => ` (${label.trim()})`
  );
}

function getResolutionLabel(resolution?: RemoteOmeResolution): string {
  if (!resolution) return "";
  return resolution.replace("um", " µm");
}

function getDefaultGroupItem(items: ExternalSourceItem[]) {
  return items.find((item) => item.remoteResolution === "25um") ?? items[0];
}

function getGroupKey(item: ExternalSourceItem) {
  if (!item.remoteResolution) return null;
  if (!item.builtIn) return null;

  return JSON.stringify({
    url: item.url,
    icon: item.icon,
    builtIn: item.builtIn ?? false,
    remoteFormat: item.remoteFormat ?? null,
    remoteContentKind: item.remoteContentKind ?? null,
    renderMode: item.renderMode ?? null,
    baseName: stripResolutionSuffix(item.name),
  });
}

export default function ImportDataPanel({
  open,
  onClose,
  onAddDrawingLayer,
  onAddExternalSources,
  onAddFiles,
}: {
  open: boolean;
  onClose: () => void;
  onAddDrawingLayer: (name?: string) => void;
  onAddExternalSources: (
    sources: Array<{
      id: string;
      name: string;
      url: string;
      icon?: "generic" | "custom";
      remoteFormat?: RemoteDataFormat;
      remoteContentKind?: RemoteContentKind;
      renderMode?: RemoteRenderMode;
      remoteResolution?: RemoteOmeResolution;
    }>
  ) => void;
  onAddFiles: (files: FileList | null) => void;
}) {
  const [mode, setMode] = useState<LayerCreationMode>("external");
  const [drawingName, setDrawingName] = useState("Drawing Layer");
  const [isDragging, setIsDragging] = useState(false);

  const [externalSources, setExternalSources] = useState<ExternalSourceItem[]>([]);
  const [selectedExternalIds, setSelectedExternalIds] = useState<string[]>([]);
  const [showAddExternalForm, setShowAddExternalForm] = useState(false);
  const [newExternalName, setNewExternalName] = useState("");
  const [newExternalUrl, setNewExternalUrl] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [editingCustomSourceId, setEditingCustomSourceId] = useState<string | null>(null);
  const [editingCustomSourceName, setEditingCustomSourceName] = useState("");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const addSourceNameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const customSources = getCustomExternalSources();
    setExternalSources([...BUILT_IN_EXTERNAL_SOURCES, ...customSources]);
  }, []);

  useEffect(() => {
    if (!open) {
      setMode("external");
      setDrawingName("Drawing Layer");
      setIsDragging(false);
      setSelectedExternalIds([]);
      setShowAddExternalForm(false);
      setNewExternalName("");
      setNewExternalUrl("");
      setShowSearch(false);
      setSearchQuery("");
      setEditingCustomSourceId(null);
      setEditingCustomSourceName("");
    }
  }, [open]);

  useEffect(() => {
    if (showSearch) {
      const id = window.setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [showSearch]);

  useEffect(() => {
    if (showAddExternalForm) {
      const id = window.setTimeout(() => {
        addSourceNameInputRef.current?.focus();
      }, 180);
      return () => window.clearTimeout(id);
    }
  }, [showAddExternalForm]);

  const groupedExternalSources = useMemo<ExternalSourceGroup[]>(() => {
    const groups = new Map<string, ExternalSourceItem[]>();
    const singles: ExternalSourceGroup[] = [];

    for (const item of externalSources) {
      const key = getGroupKey(item);

      if (!key) {
        singles.push({
          kind: "single",
          id: item.id,
          name: item.name,
          icon: item.icon,
          builtIn: item.builtIn,
          items: [item],
        });
        continue;
      }

      const existing = groups.get(key);
      if (existing) {
        existing.push(item);
      } else {
        groups.set(key, [item]);
      }
    }

    const grouped: ExternalSourceGroup[] = Array.from(groups.values()).map((items) => {
      const sortedItems = [...items].sort((a, b) => {
        const order: Record<string, number> = {
          "10um": 10,
          "25um": 25,
          "50um": 50,
          "100um": 100,
        };
        return (order[a.remoteResolution ?? ""] ?? 999) - (order[b.remoteResolution ?? ""] ?? 999);
      });

      const defaultItem = getDefaultGroupItem(sortedItems);

      return {
        kind: "group",
        id: `group-${defaultItem.id}`,
        name: stripResolutionSuffix(defaultItem.name),
        icon: defaultItem.icon,
        builtIn: defaultItem.builtIn,
        items: sortedItems,
      };
    });

    return [...singles, ...grouped].sort((a, b) => a.name.localeCompare(b.name));
  }, [externalSources]);

  const filteredGroupedExternalSources = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return groupedExternalSources;

    return groupedExternalSources.filter((group) => {
      const groupNameMatches = group.name.toLowerCase().includes(query);
      const itemNameMatches = group.items.some((item) =>
        item.name.toLowerCase().includes(query)
      );
      const resolutionMatches = group.items.some((item) =>
        getResolutionLabel(item.remoteResolution).toLowerCase().includes(query)
      );
      return groupNameMatches || itemNameMatches || resolutionMatches;
    });
  }, [groupedExternalSources, searchQuery]);

  const selectedExternalSources = useMemo(
    () => externalSources.filter((item) => selectedExternalIds.includes(item.id)),
    [externalSources, selectedExternalIds]
  );

  if (!open) return null;

  function toggleExternalSelection(id: string) {
    setSelectedExternalIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleGroupedExternalDefault(group: ExternalSourceGroup) {
    const selectedItem = group.items.find((item) => selectedExternalIds.includes(item.id));

    setSelectedExternalIds((prev) => {
      const withoutGroupItems = prev.filter(
        (id) => !group.items.some((item) => item.id === id)
      );

      if (selectedItem) {
        return withoutGroupItems;
      }

      const defaultItem = getDefaultGroupItem(group.items);
      return [...withoutGroupItems, defaultItem.id];
    });
  }

  function toggleGroupedExternalResolution(group: ExternalSourceGroup, itemId: string) {
    const isAlreadySelected = selectedExternalIds.includes(itemId);

    setSelectedExternalIds((prev) => {
      const withoutGroupItems = prev.filter(
        (id) => !group.items.some((item) => item.id === id)
      );

      if (isAlreadySelected) {
        return withoutGroupItems;
      }

      return [...withoutGroupItems, itemId];
    });
  }

  function handleAddCustomExternalSource() {
    const name = newExternalName.trim();
    const url = newExternalUrl.trim();
    if (!name || !url) return;

    const newSource = addCustomExternalSource({
      name,
      url,
      remoteContentKind: "intensity",
      renderMode: "auto",
    });

    setExternalSources((prev) => [...prev, newSource]);
    setSelectedExternalIds((prev) => [...prev, newSource.id]);
    setShowAddExternalForm(false);
    setNewExternalName("");
    setNewExternalUrl("");
    setSearchQuery("");
  }

  function handleStartRenameCustomSource(item: ExternalSourceItem) {
    setEditingCustomSourceId(item.id);
    setEditingCustomSourceName(item.name);
  }

  function handleConfirmRenameCustomSource(itemId: string) {
    const renamed = renameCustomExternalSource(itemId, editingCustomSourceName);
    if (!renamed) {
      setEditingCustomSourceId(null);
      setEditingCustomSourceName("");
      return;
    }

    setExternalSources((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, name: renamed.name } : item))
    );
    setEditingCustomSourceId(null);
    setEditingCustomSourceName("");
  }

  function handleDeleteCustomSource(itemId: string) {
    deleteCustomExternalSource(itemId);

    setExternalSources((prev) => prev.filter((item) => item.id !== itemId));
    setSelectedExternalIds((prev) => prev.filter((id) => id !== itemId));

    if (editingCustomSourceId === itemId) {
      setEditingCustomSourceId(null);
      setEditingCustomSourceName("");
    }
  }

  function handleSubmit() {
    if (mode === "drawing") {
      onAddDrawingLayer(drawingName);
      return;
    }

    if (mode === "external") {
      if (!selectedExternalSources.length) return;

      onAddExternalSources(
        selectedExternalSources.map((item) => ({
          id: item.id,
          name: item.name,
          url: item.url,
          icon: item.icon,
          remoteFormat: item.remoteFormat,
          remoteContentKind: item.remoteContentKind,
          renderMode: item.renderMode,
          remoteResolution: item.remoteResolution,
        }))
      );
      return;
    }
  }

  function handleDrop(files: FileList | null) {
    if (!files || files.length === 0) return;
    onAddFiles(files);
  }

  function handleSearchBlur() {
    if (!searchQuery.trim()) {
      setShowSearch(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        data-theme-surface="panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(860px, calc(100vw - 32px))",
          maxHeight: "min(88vh, 920px)",
          overflowY: "auto",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(12,14,18,0.96)",
          backdropFilter: "blur(14px)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          color: "white",
          fontFamily: "sans-serif",
          padding: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 18,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Add layer</div>
            <div data-theme-text="muted" style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>
              Choose the type of layer you want to add to the viewer.
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              color: "white",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <TabButton
            active={mode === "drawing"}
            title="Drawing layer"
            subtitle="Create a user annotation layer"
            icon={<PencilIcon />}
            onClick={() => setMode("drawing")}
          />
          <TabButton
            active={mode === "external"}
            title="External source"
            subtitle="Select one or more hosted sources"
            icon={<LinkIcon />}
            onClick={() => setMode("external")}
          />
          <TabButton
            active={mode === "custom"}
            title="Custom data"
            subtitle="Upload your own files"
            icon={<DataIcon />}
            onClick={() => setMode("custom")}
          />
        </div>

        {mode === "drawing" && (
          <div
            data-theme-surface="soft"
            style={{
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              padding: 16,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
              Create drawing layer
            </div>

            <label style={{ display: "block", fontSize: 12, opacity: 0.78, marginBottom: 6 }}>
              Layer name
            </label>
            <input
              value={drawingName}
              onChange={(e) => setDrawingName(e.target.value)}
              placeholder="Drawing Layer"
              style={{
                width: "100%",
                height: 40,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.05)",
                color: "white",
                padding: "0 12px",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>
        )}

        {mode === "external" && (
          <div
            data-theme-surface="soft"
            style={{
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              padding: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Select external sources
                </div>
                <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>
                  You can select multiple sources and add them all at once.
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    height: 38,
                    borderRadius: 10,
                    border: showSearch
                      ? "1px solid rgba(160,220,255,0.28)"
                      : "1px solid rgba(255,255,255,0.10)",
                    background: showSearch
                      ? "rgba(120,190,255,0.08)"
                      : "rgba(255,255,255,0.05)",
                    overflow: "hidden",
                    width: showSearch ? 220 : 38,
                    transition: "width 180ms ease, background 180ms ease, border-color 180ms ease",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (showSearch && searchQuery) {
                        setSearchQuery("");
                        searchInputRef.current?.focus();
                        return;
                      }
                      setShowSearch(true);
                    }}
                    title="Search sources"
                    style={{
                      width: 38,
                      minWidth: 38,
                      height: 38,
                      border: "none",
                      background: "transparent",
                      color: "white",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <SearchIcon />
                  </button>

                  {showSearch && (
                    <>
                      <input
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onBlur={handleSearchBlur}
                        placeholder="Search sources..."
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: 38,
                          border: "none",
                          background: "transparent",
                          color: "white",
                          outline: "none",
                          padding: "0 8px 0 0",
                          fontSize: 12,
                        }}
                      />
                      {(searchQuery || showSearch) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (searchQuery.trim()) {
                              setSearchQuery("");
                              searchInputRef.current?.focus();
                            } else {
                              setShowSearch(false);
                            }
                          }}
                          title="Clear search"
                          style={{
                            width: 30,
                            minWidth: 30,
                            height: 38,
                            border: "none",
                            background: "transparent",
                            color: "rgba(255,255,255,0.7)",
                            cursor: "pointer",
                            fontSize: 16,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                            flexShrink: 0,
                          }}
                        >
                          ×
                        </button>
                      )}
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddExternalForm((prev) => !prev)}
                  title={showAddExternalForm ? "Close custom source form" : "Add custom source"}
                  style={{
                    height: 38,
                    minWidth: 38,
                    padding: "0 11px",
                    borderRadius: 10,
                    border: showAddExternalForm
                      ? "1px solid rgba(160,220,255,0.28)"
                      : "1px solid rgba(255,255,255,0.10)",
                    background: showAddExternalForm
                      ? "rgba(120,190,255,0.10)"
                      : "rgba(255,255,255,0.05)",
                    color: "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition:
                      "background 180ms ease, border-color 180ms ease, transform 180ms ease",
                  }}
                >
                  <AddSourceIcon />
                </button>
              </div>
            </div>

            <div
              style={{
                marginBottom: showAddExternalForm ? 14 : 0,
                maxHeight: showAddExternalForm ? 180 : 0,
                opacity: showAddExternalForm ? 1 : 0,
                transform: showAddExternalForm ? "translateY(0)" : "translateY(-6px)",
                overflow: "hidden",
                pointerEvents: showAddExternalForm ? "auto" : "none",
                transition:
                  "max-height 240ms ease, opacity 180ms ease, transform 180ms ease, margin-bottom 240ms ease",
              }}
            >
              <div
                data-theme-surface="soft"
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  padding: 14,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                  Add custom external source
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1.4fr auto",
                    gap: 10,
                  }}
                >
                  <input
                    ref={addSourceNameInputRef}
                    value={newExternalName}
                    onChange={(e) => setNewExternalName(e.target.value)}
                    placeholder="Source name"
                    style={{
                      width: "100%",
                      height: 40,
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.05)",
                      color: "white",
                      padding: "0 12px",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />

                  <input
                    value={newExternalUrl}
                    onChange={(e) => setNewExternalUrl(e.target.value)}
                    placeholder="https://..."
                    style={{
                      width: "100%",
                      height: 40,
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.05)",
                      color: "white",
                      padding: "0 12px",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />

                  <button
                    type="button"
                    onClick={handleAddCustomExternalSource}
                    disabled={!newExternalName.trim() || !newExternalUrl.trim()}
                    style={{
                      height: 40,
                      padding: "0 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(160,220,255,0.35)",
                      background: "rgba(120,190,255,0.18)",
                      color: "white",
                      cursor: "pointer",
                      opacity: !newExternalName.trim() || !newExternalUrl.trim() ? 0.5 : 1,
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div
              style={{
                maxHeight: 430,
                overflowY: "auto",
                paddingRight: 4,
                scrollbarWidth: "thin",
                scrollbarColor:
                  "rgba(140, 190, 255, 0.45) rgba(255,255,255,0.06)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 12,
                  alignItems: "stretch",
                }}
              >
                {filteredGroupedExternalSources.map((group) => {
                  const selectedItem = group.items.find((item) =>
                    selectedExternalIds.includes(item.id)
                  );
                  const groupSelected = !!selectedItem;

                  if (group.kind === "single") {
                    const item = group.items[0];
                    const selected = selectedExternalIds.includes(item.id);
                    const isCustom = item.icon === "custom" && item.builtIn === false;
                    const isEditing = editingCustomSourceId === item.id;

                    return (
                      <div
                        key={item.id}
                        style={{
                          minHeight: 180,
                          height: "100%",
                          borderRadius: 16,
                          border: selected
                            ? "1px solid rgba(160,220,255,0.85)"
                            : "1px solid rgba(255,255,255,0.10)",
                          background: selected
                            ? "rgba(92,149,230,0.18)"
                            : "rgba(255,255,255,0.04)",
                          color: "white",
                          padding: 14,
                          textAlign: "left",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleExternalSelection(item.id)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "inherit",
                            padding: 0,
                            margin: 0,
                            cursor: "pointer",
                            textAlign: "left",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            {item.icon === "custom" ? <SourceCustomIcon /> : <SourceGenericIcon />}

                            <div
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: 999,
                                border: selected
                                  ? "1px solid rgba(160,220,255,0.95)"
                                  : "1px solid rgba(255,255,255,0.24)",
                                background: selected ? "rgba(92,149,230,0.92)" : "transparent",
                                flexShrink: 0,
                                marginTop: 2,
                              }}
                            />
                          </div>

                          <div>
                            {isEditing ? (
                              <input
                                autoFocus
                                value={editingCustomSourceName}
                                onChange={(e) => setEditingCustomSourceName(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={() => handleConfirmRenameCustomSource(item.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleConfirmRenameCustomSource(item.id);
                                  if (e.key === "Escape") {
                                    setEditingCustomSourceId(null);
                                    setEditingCustomSourceName("");
                                  }
                                }}
                                style={{
                                  width: "100%",
                                  height: 34,
                                  borderRadius: 8,
                                  border: "1px solid rgba(160,220,255,0.45)",
                                  background: "rgba(255,255,255,0.07)",
                                  color: "white",
                                  padding: "0 10px",
                                  boxSizing: "border-box",
                                  outline: "none",
                                }}
                              />
                            ) : (
                              <>
                                <div data-theme-text="strong" style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
                                  {item.name}
                                </div>
                                <div
                                  data-theme-text="muted"
                                  style={{
                                    fontSize: 11,
                                    opacity: 0.6,
                                    marginTop: 6,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {item.builtIn ? "Built-in source" : "Custom external source"}
                                </div>
                              </>
                            )}
                          </div>
                        </button>

                        <div style={{ minHeight: 30, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {isCustom ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartRenameCustomSource(item)}
                                style={{
                                  height: 30,
                                  padding: "0 10px",
                                  borderRadius: 999,
                                  border: "1px solid rgba(255,255,255,0.14)",
                                  background: "rgba(255,255,255,0.05)",
                                  color: "white",
                                  cursor: "pointer",
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomSource(item.id)}
                                style={{
                                  height: 30,
                                  padding: "0 10px",
                                  borderRadius: 999,
                                  border: "1px solid rgba(255,120,120,0.22)",
                                  background: "rgba(255,80,80,0.10)",
                                  color: "white",
                                  cursor: "pointer",
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={group.id}
                      style={{
                        minHeight: 180,
                        height: "100%",
                        borderRadius: 16,
                        border: groupSelected
                          ? "1px solid rgba(160,220,255,0.85)"
                          : "1px solid rgba(255,255,255,0.10)",
                        background: groupSelected
                          ? "rgba(92,149,230,0.18)"
                          : "rgba(255,255,255,0.04)",
                        color: "white",
                        padding: 14,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroupedExternalDefault(group)}
                        style={{
                          border: "1px solid transparent",
                          background: groupSelected ? "rgba(92,149,230,0.08)" : "transparent",
                          color: "inherit",
                          padding: 10,
                          margin: 0,
                          borderRadius: 12,
                          cursor: "pointer",
                          textAlign: "left",
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                          boxSizing: "border-box",
                          width: "100%",
                          transition: "background 160ms ease, border-color 160ms ease",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          {group.icon === "custom" ? <SourceCustomIcon /> : <SourceGenericIcon />}

                          <div
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 999,
                              border: groupSelected
                                ? "1px solid rgba(160,220,255,0.95)"
                                : "1px solid rgba(255,255,255,0.24)",
                              background: groupSelected ? "rgba(92,149,230,0.92)" : "transparent",
                              flexShrink: 0,
                              marginTop: 2,
                            }}
                          />
                        </div>

                        <div>
                          <div data-theme-text="strong" style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
                            {group.name}
                          </div>
                          <div
                            data-theme-text="muted"
                            style={{
                              fontSize: 11,
                              opacity: 0.6,
                              marginTop: 6,
                            }}
                          >
                            {group.builtIn ? "Built-in source" : "Custom external source"}
                            {selectedItem?.remoteResolution
                              ? ` · Selected ${getResolutionLabel(selectedItem.remoteResolution)}`
                              : ""}
                          </div>
                        </div>
                      </button>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          minHeight: 30,
                          alignItems: "flex-end",
                        }}
                      >
                        {group.items.map((item) => {
                          const resolutionSelected = selectedExternalIds.includes(item.id);

                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleGroupedExternalResolution(group, item.id);
                              }}
                              style={{
                                height: 30,
                                padding: "0 10px",
                                borderRadius: 999,
                                border: resolutionSelected
                                  ? "1px solid rgba(92,149,230,0.88)"
                                  : "1px solid rgba(255,255,255,0.14)",
                                background: resolutionSelected
                                  ? "rgba(92,149,230,0.26)"
                                  : "rgba(255,255,255,0.05)",
                                boxShadow: resolutionSelected
                                  ? "inset 0 0 0 1px rgba(255,255,255,0.12)"
                                  : "none",
                                color: "white",
                                cursor: "pointer",
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {getResolutionLabel(item.remoteResolution)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredGroupedExternalSources.length === 0 && (
                <div
                  data-theme-surface="soft"
                  style={{
                    minHeight: 120,
                    borderRadius: 14,
                    border: "1px dashed rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.02)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    padding: 20,
                    marginTop: 2,
                    color: "rgba(255,255,255,0.72)",
                    fontSize: 13,
                  }}
                >
                  No external source matches "{searchQuery}".
                </div>
              )}
            </div>
          </div>
        )}

        {mode === "custom" && (
          <div
            data-theme-surface="soft"
            style={{
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              padding: 16,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
              Upload custom data
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleDrop(e.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              style={{
                minHeight: 180,
                borderRadius: 16,
                border: isDragging
                  ? "1px solid rgba(130,240,190,0.85)"
                  : "1px dashed rgba(255,255,255,0.20)",
                background: isDragging
                  ? "rgba(90,210,160,0.12)"
                  : "rgba(255,255,255,0.02)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                textAlign: "center",
                padding: 24,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                Drag and drop files here
              </div>
              <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.68, marginTop: 8 }}>
                or click to browse and add one or more files
              </div>
            </div>

            <input
              ref={inputRef}
              type="file"
              multiple
              onChange={(e) => {
                handleDrop(e.target.files);
                e.currentTarget.value = "";
              }}
              style={{ display: "none" }}
            />
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginTop: 18,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.62 }}>
            {mode === "external" && selectedExternalSources.length > 0
              ? `${selectedExternalSources.length} source${selectedExternalSources.length > 1 ? "s" : ""} selected`
              : "\u00A0"}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                height: 40,
                padding: "0 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
                color: "white",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>

            {mode !== "custom" && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  (mode === "drawing" && !drawingName.trim()) ||
                  (mode === "external" && selectedExternalSources.length === 0)
                }
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(160,220,255,0.35)",
                  background: "rgba(120,190,255,0.18)",
                  color: "white",
                  cursor: "pointer",
                  opacity:
                    (mode === "drawing" && !drawingName.trim()) ||
                    (mode === "external" && selectedExternalSources.length === 0)
                      ? 0.5
                      : 1,
                }}
              >
                Add layer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
