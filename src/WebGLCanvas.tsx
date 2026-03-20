import { useEffect, useMemo, useRef } from "react";
import { mat4, vec3 } from "gl-matrix";
import type { ToolId } from "./BottomToolbar";
import type { LayerTreeNode } from "./layerTypes";
import {
  collectLayerIdsInSubtree,
  collectVisibleLayerItems,
  findNodeById,
} from "./layerTypes";

type CameraState = {
  position: vec3;
  yaw: number;
  pitch: number;
  fovDeg: number;
};

function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Failed to create shader");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }

  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();
  if (!program) {
    throw new Error("Failed to create program");
  }

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }

  return program;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function WebGLCanvas({
  activeTool,
  layerTree,
  selectedNodeId,
}: {
  activeTool: ToolId;
  layerTree: LayerTreeNode[];
  selectedNodeId: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeToolRef = useRef<ToolId>(activeTool);
  const layerTreeRef = useRef<LayerTreeNode[]>(layerTree);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    layerTreeRef.current = layerTree;
  }, [layerTree]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? findNodeById(layerTree, selectedNodeId) : null),
    [layerTree, selectedNodeId]
  );

  const selectedNodeName = selectedNode?.name ?? "None";

  const highlightedLayerIds = useMemo(() => {
    if (!selectedNodeId || !selectedNode) return new Set<string>();
    return new Set(collectLayerIdsInSubtree(selectedNode));
  }, [selectedNode, selectedNodeId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) {
      throw new Error("WebGL not supported");
    }

    const vertexShaderSource = `
      attribute vec3 aPosition;
      uniform mat4 uMVP;
      void main() {
        gl_Position = uMVP * vec4(aPosition, 1.0);
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      uniform vec4 uColor;
      void main() {
        gl_FragColor = uColor;
      }
    `;

    const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);

    const aPosition = gl.getAttribLocation(program, "aPosition");
    const uMVP = gl.getUniformLocation(program, "uMVP");
    const uColor = gl.getUniformLocation(program, "uColor");

    if (aPosition < 0 || !uMVP || !uColor) {
      throw new Error("Failed to get shader locations");
    }

    const vertices = new Float32Array([
      -1, -1, 0,
       1, -1, 0,
       1,  1, 0,
      -1,  1, 0,
    ]);

    const indices = new Uint16Array([
      0, 1, 2,
      0, 2, 3,
    ]);

    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!vertexBuffer || !indexBuffer) {
      throw new Error("Failed to create buffers");
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    const camera: CameraState = {
      position: vec3.fromValues(0, 0, 5),
      yaw: -90,
      pitch: 0,
      fovDeg: 60,
    };

    let targetFovDeg = 60;
    const keys = new Set<string>();
    let dragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let animationFrameId = 0;
    let lastTime = performance.now();

    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.floor(canvas.clientWidth * dpr);
      const height = Math.floor(canvas.clientHeight * dpr);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function getForward(): vec3 {
      const yawRad = (camera.yaw * Math.PI) / 180;
      const pitchRad = (camera.pitch * Math.PI) / 180;

      const forward = vec3.fromValues(
        Math.cos(yawRad) * Math.cos(pitchRad),
        Math.sin(pitchRad),
        Math.sin(yawRad) * Math.cos(pitchRad)
      );

      vec3.normalize(forward, forward);
      return forward;
    }

    function updateCamera(dt: number) {
      const speed = 3.0;
      const velocity = speed * dt;

      const forward = getForward();
      const worldUp = vec3.fromValues(0, 1, 0);
      const right = vec3.create();
      vec3.cross(right, forward, worldUp);
      vec3.normalize(right, right);

      if (keys.has("w")) vec3.scaleAndAdd(camera.position, camera.position, forward, velocity);
      if (keys.has("s")) vec3.scaleAndAdd(camera.position, camera.position, forward, -velocity);
      if (keys.has("a")) vec3.scaleAndAdd(camera.position, camera.position, right, -velocity);
      if (keys.has("d")) vec3.scaleAndAdd(camera.position, camera.position, right, velocity);
      if (keys.has("q")) camera.position[1] -= velocity;
      if (keys.has("e")) camera.position[1] += velocity;
    }

    function render(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;

      resizeCanvas();

      if (activeToolRef.current === "mouse") {
        updateCamera(dt);
      }

      const zoomSharpness = 10;
      const zoomAlpha = 1 - Math.exp(-zoomSharpness * dt);
      camera.fovDeg += (targetFovDeg - camera.fovDeg) * zoomAlpha;

      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0.05, 0.06, 0.08, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const aspect = canvas.width / canvas.height;
      const projection = mat4.create();
      mat4.perspective(
        projection,
        (camera.fovDeg * Math.PI) / 180,
        aspect,
        0.1,
        100.0
      );

      const forward = getForward();
      const target = vec3.create();
      vec3.add(target, camera.position, forward);

      const view = mat4.create();
      mat4.lookAt(view, camera.position, target, [0, 1, 0]);

      const visibleLayers = collectVisibleLayerItems(layerTreeRef.current, true);

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

      for (let i = 0; i < visibleLayers.length; i += 1) {
        const layer = visibleLayers[i];

        const model = mat4.create();
        mat4.translate(model, model, [i * 0.15, i * 0.15, -i * 0.05]);

        const mv = mat4.create();
        const mvp = mat4.create();

        mat4.multiply(mv, view, model);
        mat4.multiply(mvp, projection, mv);

        gl.uniformMatrix4fv(uMVP, false, mvp);

        const isHighlighted = highlightedLayerIds.has(layer.id);

        if (activeToolRef.current === "pencil" && isHighlighted) {
          gl.uniform4f(uColor, 1.0, 0.84, 0.22, 1.0);
        } else if (isHighlighted) {
          gl.uniform4f(uColor, 0.72, 0.96, 1.0, 1.0);
        } else {
          gl.uniform4f(uColor, 0.18, 0.45, 0.58, 0.72);
        }

        gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
      }

      animationFrameId = requestAnimationFrame(render);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (activeToolRef.current !== "mouse") return;
      keys.add(e.key.toLowerCase());
    }

    function onKeyUp(e: KeyboardEvent) {
      keys.delete(e.key.toLowerCase());
    }

    function onMouseDown(e: MouseEvent) {
      if (activeToolRef.current === "mouse") {
        dragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        return;
      }

      if (activeToolRef.current === "pencil") {
        console.log("Start drawing on:", selectedNodeId);
      }
    }

    function onMouseUp() {
      dragging = false;
    }

    function onMouseMove(e: MouseEvent) {
      if (activeToolRef.current !== "mouse") return;
      if (!dragging) return;

      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

      const sensitivity = 0.2;
      camera.yaw += dx * sensitivity;
      camera.pitch -= dy * sensitivity;
      camera.pitch = clamp(camera.pitch, -89, 89);
    }

    function onWheel(e: WheelEvent) {
      if (activeToolRef.current !== "mouse") return;
      e.preventDefault();
      targetFovDeg = clamp(targetFovDeg + e.deltaY * 0.02, 20, 90);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", resizeCanvas);

    resizeCanvas();
    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", resizeCanvas);

      gl.deleteBuffer(vertexBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteProgram(program);
    };
  }, [selectedNodeId, highlightedLayerIds]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />

      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          padding: "8px 10px",
          background: "rgba(0,0,0,0.45)",
          color: "white",
          fontFamily: "sans-serif",
          fontSize: 13,
          borderRadius: 8,
          lineHeight: 1.5,
          zIndex: 10,
        }}
      >
        <div>Active tool: {activeTool}</div>
        <div>Selected node: {selectedNodeName}</div>
        <div>Mouse tool: move in 3D</div>
        <div>Pencil tool: annotation mode placeholder</div>
      </div>
    </div>
  );
}