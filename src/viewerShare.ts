import LZString from "lz-string";
import { parseViewerState, type ViewerStateV1 } from "./viewerState";

const SHARE_HASH_KEY = "vs";

export function encodeViewerStateForShare(state: ViewerStateV1): string {
    return LZString.compressToEncodedURIComponent(JSON.stringify(state));
}

export function decodeViewerStateFromShare(encoded: string): ViewerStateV1 {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) {
        throw new Error("Invalid shared viewer state.");
    }
    return parseViewerState(json);
}

export function buildViewerShareUrl(state: ViewerStateV1): string {
    if (typeof window === "undefined") {
        throw new Error("Cannot create a share URL outside the browser.");
    }

    const encoded = encodeViewerStateForShare(state);
    const url = new URL(window.location.href);
    url.searchParams.delete("viewerState");
    url.searchParams.delete("viewerState64");
    url.hash = `${SHARE_HASH_KEY}=${encoded}`;
    return url.toString();
}

export function readViewerStateFromHash(): ViewerStateV1 | null {
    if (typeof window === "undefined") return null;

    const rawHash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;

    if (!rawHash) return null;

    const params = new URLSearchParams(rawHash);
    const encoded = params.get(SHARE_HASH_KEY);
    if (!encoded) return null;

    return decodeViewerStateFromShare(encoded);
}
