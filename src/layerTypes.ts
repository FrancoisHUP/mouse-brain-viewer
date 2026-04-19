export type LayerKind = "group" | "layer";

export type SlicePlane = "xy" | "xz" | "yz";

export type AxisSliceLayerParams = {
  mode?: "axis";
  plane: SlicePlane;
  index: number;
  opacity?: number;
};

export type ObliqueSliceLayerParams = {
  mode: "oblique";
  normal: {
    x: number;
    y: number;
    z: number;
  };
  offset?: number;
  width?: number;
  height?: number;
  opacity?: number;
};

export type SliceLayerParams =
  | AxisSliceLayerParams
  | ObliqueSliceLayerParams;

export type CustomSliceSource = {
  volumeLayerId: string;
};

export type AnnotationShape =
  | "point"
  | "line"
  | "rectangle"
  | "circle"
  | "freehand"
  | "eraser";

export type FreehandStroke = {
  points: [number, number, number][];
  normals?: [number, number, number][];
  attachedLayerId?: string;
  attachedLayerName?: string;
};

export type AnnotationData = {
  shape: AnnotationShape;
  color: string;
  opacity: number;
  size: number;
  brushDepth?: number;
  metadata?: string;
  points?: [number, number, number][];
  normal?: [number, number, number];
  attachedLayerId?: string;
  attachedLayerName?: string;
  freehandStrokes?: FreehandStroke[];
};

export type LayerRenderType =
  | "primitive"
  | "file"
  | "remote"
  | "annotation"
  | "custom-slice";

export type LayerSourceKind =
  | "built-in"
  | "external"
  | "custom-upload"
  | "drawing";

export type RemoteDataFormat =
  | "generic"
  | "ome-zarr"
  | "mesh-obj";

export type RemoteRenderMode =
  | "auto"
  | "slices"
  | "volume";

export type RemoteOmeResolution = string;

export type RemoteContentKind =
  | "intensity"
  | "annotation";

export type LocalDataFormat = "nrrd" | "nii" | "tiff" | "obj" | "ome-zarr" | "zarr" | "unknown";

export type LocalDataKind = "volume" | "mesh" | "unknown";

export type LocalDatasetScale = {
  datasetIndex: number;
  datasetPath: string;
  resolutionUm: number | null;
  resolutionLabel: string;
  voxelSizeUm: { z: number | null; y: number | null; x: number | null };
  rawShape: number[];
  dims: { z: number; y: number; x: number };
  estimatedBytes: number;
  estimatedMemoryBytes: number;
  canLoad: boolean;
  unsupportedReason?: string | null;
};

export type LocalDatasetInfo = {
  datasetId?: string;
  shareable: false;
  format: LocalDataFormat;
  kind: LocalDataKind;
  fileName: string;
  mimeType?: string;
  fileSizeBytes: number;
  dims?: { z: number; y: number; x: number } | null;
  rawShape?: number[] | null;
  voxelSizeUm?: { z: number | null; y: number | null; x: number | null } | null;
  warning?: string | null;
  availableScales?: LocalDatasetScale[] | null;
  recommendedResolution?: string | null;
  selectedResolution?: string | null;
  selectedDatasetPath?: string | null;
  treeRootPath?: string | null;
};

export type NodeTransformVector3 = [number, number, number];

export type NodeTransform = {
  translation?: NodeTransformVector3;
  rotation?: NodeTransformVector3;
  scale?: NodeTransformVector3;
};

export const DEFAULT_NODE_OPACITY = 1;
export const DEFAULT_NODE_TRANSLATION: NodeTransformVector3 = [0, 0, 0];
export const DEFAULT_NODE_ROTATION: NodeTransformVector3 = [0, 0, 0];
export const DEFAULT_NODE_SCALE: NodeTransformVector3 = [1, 1, 1];
export const DEFAULT_NODE_TRANSFORM: Required<NodeTransform> = {
  translation: [...DEFAULT_NODE_TRANSLATION],
  rotation: [...DEFAULT_NODE_ROTATION],
  scale: [...DEFAULT_NODE_SCALE],
};

type BaseNode = {
  id: string;
  name: string;
  visible: boolean;
  opacity?: number;
  transform?: NodeTransform;
};

export type LayerGroupNode = BaseNode & {
  kind: "group";
  expanded: boolean;
  children: LayerTreeNode[];
};

export type LayerItemNode = BaseNode & {
  kind: "layer";
  type: LayerRenderType;
  source: string | File | CustomSliceSource;
  sourceKind?: LayerSourceKind;
  mimeType?: string;
  description?: string;

  // For remote layers
  remoteFormat?: RemoteDataFormat;
  renderMode?: RemoteRenderMode;
  remoteResolution?: RemoteOmeResolution;
  remoteContentKind?: RemoteContentKind;

  // For custom slices
  sliceParams?: SliceLayerParams;

  // For browser-hosted local uploads
  localOnly?: boolean;
  localDataFormat?: LocalDataFormat;
  localDataKind?: LocalDataKind;
  localDatasetInfo?: LocalDatasetInfo | null;

  // For drawing annotations
  annotation?: AnnotationData;
};

export type LayerTreeNode = LayerGroupNode | LayerItemNode;

export type FlatTreeRow = {
  id: string;
  name: string;
  kind: "group" | "layer";
  visible: boolean;
  effectiveVisible: boolean;
  depth: number;
  parentId: string | null;
  ancestorIds: string[];
  node: LayerTreeNode;
};

export function isGroupNode(node: LayerTreeNode): node is LayerGroupNode {
  return node.kind === "group";
}

export function isLayerNode(node: LayerTreeNode): node is LayerItemNode {
  return node.kind === "layer";
}

export function isCustomSliceLayer(
  node: LayerTreeNode | null | undefined
): node is LayerItemNode {
  return !!node && node.kind === "layer" && node.type === "custom-slice";
}

export function isRemoteOmeLayer(
  node: LayerTreeNode | null | undefined
): node is LayerItemNode {
  return (
    !!node &&
    node.kind === "layer" &&
    node.type === "remote" &&
    typeof node.source === "string" &&
    node.remoteFormat === "ome-zarr"
  );
}

export function isRemoteMeshLayer(
  node: LayerTreeNode | null | undefined
): node is LayerItemNode {
  return (
    !!node &&
    node.kind === "layer" &&
    node.type === "remote" &&
    typeof node.source === "string" &&
    node.remoteFormat === "mesh-obj"
  );
}

export function isRemoteAnnotationLayer(
  node: LayerTreeNode | null | undefined
): node is LayerItemNode {
  return (
    !!node &&
    node.kind === "layer" &&
    node.type === "remote" &&
    typeof node.source === "string" &&
    node.remoteFormat === "ome-zarr" &&
    node.remoteContentKind === "annotation"
  );
}

export function findNodeById(
  nodes: LayerTreeNode[],
  id: string
): LayerTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (isGroupNode(node)) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function findParentId(
  nodes: LayerTreeNode[],
  id: string,
  parentId: string | null = null
): string | null | undefined {
  for (const node of nodes) {
    if (node.id === id) return parentId;
    if (isGroupNode(node)) {
      const found = findParentId(node.children, id, node.id);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function updateNodeById(
  nodes: LayerTreeNode[],
  id: string,
  updater: (node: LayerTreeNode) => LayerTreeNode
): LayerTreeNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return updater(node);
    }

    if (isGroupNode(node)) {
      return {
        ...node,
        children: updateNodeById(node.children, id, updater),
      };
    }

    return node;
  });
}

export function renameNodeById(
  nodes: LayerTreeNode[],
  id: string,
  newName: string
): LayerTreeNode[] {
  return updateNodeById(nodes, id, (node) => ({
    ...node,
    name: newName,
  }));
}

export function toggleGroupExpandedById(
  nodes: LayerTreeNode[],
  id: string
): LayerTreeNode[] {
  return updateNodeById(nodes, id, (node) => {
    if (!isGroupNode(node)) return node;
    return { ...node, expanded: !node.expanded };
  });
}

export function setGroupExpandedById(
  nodes: LayerTreeNode[],
  id: string,
  expanded: boolean
): LayerTreeNode[] {
  return updateNodeById(nodes, id, (node) => {
    if (!isGroupNode(node)) return node;
    return { ...node, expanded };
  });
}

export function removeNodeById(
  nodes: LayerTreeNode[],
  id: string
): { tree: LayerTreeNode[]; removed: LayerTreeNode | null } {
  let removed: LayerTreeNode | null = null;

  function walk(current: LayerTreeNode[]): LayerTreeNode[] {
    const out: LayerTreeNode[] = [];

    for (const node of current) {
      if (node.id === id) {
        removed = node;
        continue;
      }

      if (isGroupNode(node)) {
        out.push({
          ...node,
          children: walk(node.children),
        });
      } else {
        out.push(node);
      }
    }

    return out;
  }

  return { tree: walk(nodes), removed };
}

export function deleteNodeById(
  nodes: LayerTreeNode[],
  id: string
): LayerTreeNode[] {
  return removeNodeById(nodes, id).tree;
}

export function collectGroups(nodes: LayerTreeNode[]): LayerGroupNode[] {
  const groups: LayerGroupNode[] = [];

  for (const node of nodes) {
    if (isGroupNode(node)) {
      groups.push(node);
      groups.push(...collectGroups(node.children));
    }
  }

  return groups;
}

export function collectDescendantIds(node: LayerTreeNode): string[] {
  const ids: string[] = [];

  if (isGroupNode(node)) {
    for (const child of node.children) {
      ids.push(child.id);
      ids.push(...collectDescendantIds(child));
    }
  }

  return ids;
}

export function collectLayerIdsInSubtree(node: LayerTreeNode): string[] {
  if (isLayerNode(node)) {
    return [node.id];
  }

  const out: string[] = [];
  for (const child of node.children) {
    out.push(...collectLayerIdsInSubtree(child));
  }
  return out;
}

export function collectAllLayerItems(nodes: LayerTreeNode[]): LayerItemNode[] {
  const result: LayerItemNode[] = [];

  for (const node of nodes) {
    if (isGroupNode(node)) {
      result.push(...collectAllLayerItems(node.children));
    } else {
      result.push(node);
    }
  }

  return result;
}

export function insertIntoGroup(
  nodes: LayerTreeNode[],
  groupId: string,
  newNode: LayerTreeNode
): LayerTreeNode[] {
  return nodes.map((node) => {
    if (!isGroupNode(node)) {
      return node;
    }

    if (node.id === groupId) {
      return {
        ...node,
        children: [...node.children, newNode],
      };
    }

    return {
      ...node,
      children: insertIntoGroup(node.children, groupId, newNode),
    };
  });
}

export function getFirstLayerId(nodes: LayerTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.kind === "layer") return node.id;
    if (node.kind === "group") {
      const found = getFirstLayerId(node.children);
      if (found) return found;
    }
  }
  return null;
}

export function flattenTree(
  nodes: LayerTreeNode[],
  depth = 0,
  parentId: string | null = null,
  inheritedVisible = true,
  ancestorIds: string[] = []
): FlatTreeRow[] {
  const rows: FlatTreeRow[] = [];

  for (const node of nodes) {
    const effectiveVisible = inheritedVisible && node.visible;

    rows.push({
      id: node.id,
      name: node.name,
      kind: node.kind,
      visible: node.visible,
      effectiveVisible,
      depth,
      parentId,
      ancestorIds,
      node,
    });

    if (isGroupNode(node) && node.expanded) {
      rows.push(
        ...flattenTree(
          node.children,
          depth + 1,
          node.id,
          effectiveVisible,
          [...ancestorIds, node.id]
        )
      );
    }
  }

  return rows;
}

export function collectVisibleLayerItems(
  nodes: LayerTreeNode[],
  parentVisible = true
): LayerItemNode[] {
  const result: LayerItemNode[] = [];

  for (const node of nodes) {
    const effectiveVisible = parentVisible && node.visible;

    if (isGroupNode(node)) {
      result.push(...collectVisibleLayerItems(node.children, effectiveVisible));
    } else if (effectiveVisible) {
      result.push(node);
    }
  }

  return result;
}

export function setNodeVisibleState(
  nodes: LayerTreeNode[],
  id: string,
  visible: boolean
): LayerTreeNode[] {
  return updateNodeById(nodes, id, (node) => ({
    ...node,
    visible,
  }));
}


export function removeNodesByIds(
  nodes: LayerTreeNode[],
  ids: string[]
): { tree: LayerTreeNode[]; removed: LayerTreeNode[] } {
  let tree = nodes;
  const removed: LayerTreeNode[] = [];

  for (const id of ids) {
    const result = removeNodeById(tree, id);
    tree = result.tree;
    if (result.removed) {
      removed.push(result.removed);
    }
  }

  return { tree, removed };
}

export function insertNodesIntoGroup(
  nodes: LayerTreeNode[],
  groupId: string | null,
  newNodes: LayerTreeNode[]
): LayerTreeNode[] {
  if (!newNodes.length) return nodes;
  if (groupId === null) {
    return [...nodes, ...newNodes];
  }

  let next = nodes;
  for (const node of newNodes) {
    next = insertIntoGroup(next, groupId, node);
  }
  return next;
}

export function insertNodesBeforeNode(
  nodes: LayerTreeNode[],
  beforeId: string,
  newNodes: LayerTreeNode[]
): LayerTreeNode[] {
  let next = nodes;
  for (const node of newNodes) {
    next = insertBeforeId(next, beforeId, node);
  }
  return next;
}

export function moveNodeToGroup(
  nodes: LayerTreeNode[],
  nodeId: string,
  targetGroupId: string | null
): LayerTreeNode[] {
  if (nodeId === targetGroupId) return nodes;

  const sourceNode = findNodeById(nodes, nodeId);
  if (!sourceNode) return nodes;

  if (targetGroupId) {
    const targetNode = findNodeById(nodes, targetGroupId);
    if (!targetNode || !isGroupNode(targetNode)) return nodes;

    const descendants = collectDescendantIds(sourceNode);
    if (descendants.includes(targetGroupId)) {
      return nodes;
    }
  }

  const { tree: withoutNode, removed } = removeNodeById(nodes, nodeId);
  if (!removed) return nodes;

  if (targetGroupId === null) {
    return [...withoutNode, removed];
  }

  return insertIntoGroup(withoutNode, targetGroupId, removed);
}

function insertBeforeIdInList(
  list: LayerTreeNode[],
  beforeId: string,
  nodeToInsert: LayerTreeNode
): LayerTreeNode[] {
  const index = list.findIndex((n) => n.id === beforeId);
  if (index < 0) return [...list, nodeToInsert];

  const next = [...list];
  next.splice(index, 0, nodeToInsert);
  return next;
}

function insertBeforeId(
  nodes: LayerTreeNode[],
  beforeId: string,
  nodeToInsert: LayerTreeNode
): LayerTreeNode[] {
  const directIndex = nodes.findIndex((n) => n.id === beforeId);
  if (directIndex >= 0) {
    return insertBeforeIdInList(nodes, beforeId, nodeToInsert);
  }

  return nodes.map((node) => {
    if (isGroupNode(node)) {
      return {
        ...node,
        children: insertBeforeId(node.children, beforeId, nodeToInsert),
      };
    }

    return node;
  });
}

export function moveNodeBeforeNode(
  nodes: LayerTreeNode[],
  nodeId: string,
  beforeId: string
): LayerTreeNode[] {
  if (nodeId === beforeId) return nodes;

  const sourceNode = findNodeById(nodes, nodeId);
  if (!sourceNode) return nodes;

  const descendants = collectDescendantIds(sourceNode);
  if (descendants.includes(beforeId)) {
    return nodes;
  }

  const { tree: withoutNode, removed } = removeNodeById(nodes, nodeId);
  if (!removed) return nodes;

  return insertBeforeId(withoutNode, beforeId, removed);
}

export function isLocalOnlyFileLayer(
  node: LayerTreeNode | null | undefined
): node is LayerItemNode {
  return (
    !!node &&
    node.kind === "layer" &&
    node.type === "file" &&
    node.sourceKind === "custom-upload" &&
    !!node.localOnly
  );
}
