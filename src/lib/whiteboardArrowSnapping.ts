import { CaptureUpdateAction, mutateElement } from '@excalidraw/excalidraw';
import type { ExcalidrawArrowElement, ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';

type Shape = Extract<ExcalidrawElement, { type: 'rectangle' | 'ellipse' | 'diamond' }>;
type Point = [number, number];
type Anchor = { elementId: string; side: number };
type Anchors = { start?: Anchor; end?: Anchor };
const RATIOS: Point[] = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
const DATA_KEY = 'whiteboardMidpointBindings';
const SNAP_DISTANCE = 28;

function isShape(element: ExcalidrawElement): element is Shape {
  return !element.isDeleted && ['rectangle', 'ellipse', 'diamond'].includes(element.type);
}

function midpoint(shape: Shape, side: number, gap = 0): Point {
  const [rx, ry] = RATIOS[side];
  const dx = (rx - 0.5) * shape.width + (rx - 0.5) * 2 * gap;
  const dy = (ry - 0.5) * shape.height + (ry - 0.5) * 2 * gap;
  return [shape.x + shape.width / 2 + dx * Math.cos(shape.angle) - dy * Math.sin(shape.angle),
    shape.y + shape.height / 2 + dx * Math.sin(shape.angle) + dy * Math.cos(shape.angle)];
}

function globalPoints(arrow: ExcalidrawArrowElement): Point[] {
  const cx = (Math.min(...arrow.points.map((p) => p[0])) + Math.max(...arrow.points.map((p) => p[0]))) / 2;
  const cy = (Math.min(...arrow.points.map((p) => p[1])) + Math.max(...arrow.points.map((p) => p[1]))) / 2;
  return arrow.points.map(([x, y]) => [arrow.x + cx + (x - cx) * Math.cos(arrow.angle) - (y - cy) * Math.sin(arrow.angle),
    arrow.y + cy + (x - cx) * Math.sin(arrow.angle) + (y - cy) * Math.cos(arrow.angle)]);
}

function nearestAnchor(shapes: Shape[], point: Point, zoom: number, opposite?: Anchor): Anchor | undefined {
  let closest: Anchor | undefined;
  let distance = (SNAP_DISTANCE / zoom) ** 2;
  for (const shape of [...shapes].reverse()) {
    for (let side = 0; side < RATIOS.length; side++) {
      if (shape.id === opposite?.elementId && side === opposite.side) continue;
      const [x, y] = midpoint(shape, side);
      const next = (point[0] - x) ** 2 + (point[1] - y) ** 2;
      if (next < distance) { distance = next; closest = { elementId: shape.id, side }; }
    }
  }
  return closest;
}

function readAnchors(arrow: ExcalidrawArrowElement): Anchors {
  const data = arrow.customData?.[DATA_KEY];
  const valid = (value: unknown): value is Anchor => Boolean(value && typeof value === 'object'
    && typeof (value as Anchor).elementId === 'string' && Number.isInteger((value as Anchor).side)
    && (value as Anchor).side >= 0 && (value as Anchor).side < RATIOS.length);
  return { start: valid(data?.start) ? data.start : undefined, end: valid(data?.end) ? data.end : undefined };
}

/** Adds midpoint snapping to the native arrow tool and native endpoint handles. */
export function installArrowMidpointSnapping(api: ExcalidrawImperativeAPI) {
  let applying = false;
  const normalize = (elements: readonly ExcalidrawElement[], appState: AppState) => {
    if (applying || appState.isLoading) return;
    const shapes = elements.filter(isShape);
    const shapeMap = new Map(shapes.map((shape) => [shape.id, shape]));
    const changedArrows = new Set<string>();
    for (const element of elements) {
      if (element.type !== 'arrow' || element.isDeleted || element.points.length < 2) continue;
      const arrow = element as ExcalidrawArrowElement;
      const points = globalPoints(arrow);
      const anchors = readAnchors(arrow);
      const editor = appState.editingLinearElement ?? appState.selectedLinearElement;
      const drawing = appState.newElement?.id === arrow.id;
      const editing = editor?.elementId === arrow.id && editor.isDragging;
      const movingArrow = appState.selectedElementsAreBeingDragged && appState.selectedElementIds[arrow.id] && !editing;
      const before = JSON.stringify(anchors);
      for (const [name, index] of [['start', 0], ['end', points.length - 1]] as const) {
        const draggingEndpoint = editing && editor.selectedPointsIndices?.includes(index);
        // A new arrow's start is snapped once, then kept fixed while its end is drawn.
        if (appState.isBindingEnabled && (draggingEndpoint || drawing && (name === 'end' || !anchors.start))) {
          anchors[name] = nearestAnchor(shapes, points[index], appState.zoom.value, anchors[name === 'start' ? 'end' : 'start']);
        } else if (movingArrow || !appState.isBindingEnabled && (drawing || draggingEndpoint)) {
          delete anchors[name];
        }
        const anchor = anchors[name];
        const shape = anchor && shapeMap.get(anchor.elementId);
        if (shape) points[index] = midpoint(shape, anchor!.side, arrow.elbowed ? 5 : 0);
        else delete anchors[name];
      }
      const oldPoints = globalPoints(arrow);
      const moved = !arrow.elbowed && points.some((point, index) => Math.hypot(point[0] - oldPoints[index][0], point[1] - oldPoints[index][1]) > 0.01);
      const binding = (name: 'start' | 'end') => {
        const anchor = anchors[name];
        const old = arrow[name === 'start' ? 'startBinding' : 'endBinding'];
        if (!anchor) return before !== JSON.stringify(anchors) && readAnchors(arrow)[name] ? null : old;
        const shape = shapeMap.get(anchor.elementId)!;
        const [rx, ry] = RATIOS[anchor.side];
        // Excalidraw's elbow router requires its native 5-unit outline gap.
        const fixedPoint = [rx + (rx - 0.5) * 10 / Math.max(shape.width, 1),
          ry + (ry - 0.5) * 10 / Math.max(shape.height, 1)];
        return { elementId: anchor.elementId, focus: 0, gap: arrow.elbowed ? 5 : 0,
          ...(arrow.elbowed ? { fixedPoint } : {}) };
      };
      const startBinding = binding('start');
      const endBinding = binding('end');
      if (!moved && before === JSON.stringify(anchors)
        && JSON.stringify(startBinding) === JSON.stringify(arrow.startBinding)
        && JSON.stringify(endBinding) === JSON.stringify(arrow.endBinding)) continue;
      const customData = { ...arrow.customData };
      if (anchors.start || anchors.end) customData[DATA_KEY] = anchors;
      else delete customData[DATA_KEY];
      // Preserve the element identity used by Excalidraw's live drawing/editor state.
      mutateElement(arrow, {
        ...(arrow.elbowed ? { points: [points[0], points[points.length - 1]]
          .map(([x, y]) => [x - arrow.x, y - arrow.y]) as ExcalidrawArrowElement['points'] } : {}),
        ...(moved && !arrow.elbowed ? { x: points[0][0], y: points[0][1], angle: 0,
          points: points.map(([x, y]) => [x - points[0][0], y - points[0][1]]) as ExcalidrawArrowElement['points'] } : {}),
        startBinding, endBinding, customData,
      }, false);
      changedArrows.add(arrow.id);
    }
    if (!changedArrows.size) return;
    for (const shape of shapes) {
      const boundElements = (shape.boundElements ?? []).filter((bound) => !changedArrows.has(bound.id));
      for (const element of elements) {
        if (element.type === 'arrow' && changedArrows.has(element.id)
          && (element.startBinding?.elementId === shape.id || element.endBinding?.elementId === shape.id)) {
          boundElements.push({ id: element.id, type: 'arrow' });
        }
      }
      if (JSON.stringify(boundElements) !== JSON.stringify(shape.boundElements ?? [])) mutateElement(shape, { boundElements }, false);
    }
    applying = true;
    try { api.updateScene({ elements, captureUpdate: CaptureUpdateAction.EVENTUALLY }); }
    finally { applying = false; }
  };
  // A quick drag can finish before React emits an intermediate onChange.
  // Pointer-up still exposes the native new element/endpoint editor state.
  const stopPointerUp = api.onPointerUp(() => normalize(api.getSceneElementsIncludingDeleted(), api.getAppState()));
  normalize(api.getSceneElementsIncludingDeleted(), api.getAppState());
  return { normalize, dispose: stopPointerUp };
}
