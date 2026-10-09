import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CaptureUpdateAction, convertToExcalidrawElements, newElementWith, sceneCoordsToViewportCoords } from '@excalidraw/excalidraw';
import type { ExcalidrawElement, ExcalidrawElbowArrowElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform';

type Shape = Extract<ExcalidrawElement, { type: 'rectangle' | 'ellipse' | 'diamond' }>;
type Side = 'top' | 'right' | 'bottom' | 'left';
type Port = { shapeId: string; side: Side; x: number; y: number; clientX: number; clientY: number };
type Drag = { source: Port; pointerX: number; pointerY: number; target: Port | null };

const SIDES: ReadonlyArray<{ side: Side; ratio: [number, number]; label: string }> = [
  { side: 'top', ratio: [0.5, 0], label: '上' },
  { side: 'right', ratio: [1, 0.5], label: '右' },
  { side: 'bottom', ratio: [0.5, 1], label: '下' },
  { side: 'left', ratio: [0, 0.5], label: '左' },
];

const isShape = (element: ExcalidrawElement): element is Shape =>
  !element.isDeleted && (element.type === 'rectangle' || element.type === 'ellipse' || element.type === 'diamond');

function scenePoint(shape: Pick<ExcalidrawElement, 'x' | 'y' | 'width' | 'height' | 'angle'>, side: Side): { x: number; y: number } {
  const ratio = SIDES.find((item) => item.side === side)!.ratio;
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const dx = (ratio[0] - 0.5) * shape.width;
  const dy = (ratio[1] - 0.5) * shape.height;
  const cos = Math.cos(shape.angle);
  const sin = Math.sin(shape.angle);
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

function getPorts(api: ExcalidrawImperativeAPI): Port[] {
  const appState = api.getAppState();
  return api.getSceneElements().filter(isShape).flatMap((shape) => SIDES.map(({ side }) => {
    const point = scenePoint(shape, side);
    const viewport = sceneCoordsToViewportCoords({ sceneX: point.x, sceneY: point.y }, appState);
    return { shapeId: shape.id, side, ...point, clientX: viewport.x, clientY: viewport.y };
  }));
}

function closestPort(ports: Port[], source: Port, x: number, y: number): Port | null {
  let closest: Port | null = null;
  let distance = 28 ** 2;
  for (const port of ports) {
    if (port.shapeId === source.shapeId) continue;
    const next = (port.clientX - x) ** 2 + (port.clientY - y) ** 2;
    if (next < distance) { closest = port; distance = next; }
  }
  return closest;
}

function makeElbowPoints(start: Port, end: Port, source: Shape, target: Shape): Array<[number, number]> {
  const horizontal = start.side === 'left' || start.side === 'right';
  const endHorizontal = end.side === 'left' || end.side === 'right';
  const gap = 32;
  const left = Math.min(source.x, target.x);
  const right = Math.max(source.x + source.width, target.x + target.width);
  const top = Math.min(source.y, target.y);
  const bottom = Math.max(source.y + source.height, target.y + target.height);
  const points: Array<[number, number]> = [[start.x, start.y]];
  if (horizontal && endHorizontal) {
    const forward = start.side === 'right' && end.side === 'left' && start.x < end.x
      || start.side === 'left' && end.side === 'right' && start.x > end.x;
    if (forward) {
      const middle = (start.x + end.x) / 2;
      points.push([middle, start.y], [middle, end.y]);
    } else if (start.side === end.side) {
      const outside = start.side === 'right' ? right + gap : left - gap;
      points.push([outside, start.y], [outside, end.y]);
    } else {
      const sourceOutside = start.side === 'right' ? right + gap : left - gap;
      const targetOutside = end.side === 'right' ? right + gap : left - gap;
      const detour = end.y >= start.y ? bottom + gap : top - gap;
      points.push([sourceOutside, start.y], [sourceOutside, detour], [targetOutside, detour], [targetOutside, end.y]);
    }
  } else if (!horizontal && !endHorizontal) {
    const forward = start.side === 'bottom' && end.side === 'top' && start.y < end.y
      || start.side === 'top' && end.side === 'bottom' && start.y > end.y;
    if (forward) {
      const middle = (start.y + end.y) / 2;
      points.push([start.x, middle], [end.x, middle]);
    } else if (start.side === end.side) {
      const outside = start.side === 'bottom' ? bottom + gap : top - gap;
      points.push([start.x, outside], [end.x, outside]);
    } else {
      const sourceOutside = start.side === 'bottom' ? bottom + gap : top - gap;
      const targetOutside = end.side === 'bottom' ? bottom + gap : top - gap;
      const detour = end.x >= start.x ? right + gap : left - gap;
      points.push([start.x, sourceOutside], [detour, sourceOutside], [detour, targetOutside], [end.x, targetOutside]);
    }
  } else if (horizontal) {
    points.push([end.x, start.y]);
  } else {
    points.push([start.x, end.y]);
  }
  points.push([end.x, end.y]);
  const compact = points.filter((point, index) => index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]);
  return compact.filter((point, index) => index === 0 || index === compact.length - 1
    || !((compact[index - 1][0] === point[0] && point[0] === compact[index + 1][0])
      || (compact[index - 1][1] === point[1] && point[1] === compact[index + 1][1])))
    .map(([x, y]) => [x - start.x, y - start.y]);
}

function connect(api: ExcalidrawImperativeAPI, source: Port, target: Port) {
  const elements = api.getSceneElementsIncludingDeleted();
  const sourceShape = elements.find((element) => element.id === source.shapeId);
  const targetShape = elements.find((element) => element.id === target.shapeId);
  if (!sourceShape || !targetShape || !isShape(sourceShape) || !isShape(targetShape)) return;
  const start = { ...source, ...scenePoint(sourceShape, source.side) };
  const end = { ...target, ...scenePoint(targetShape, target.side) };
  const points = makeElbowPoints(start, end, sourceShape, targetShape);
  const base = convertToExcalidrawElements([{ type: 'arrow', x: start.x, y: start.y, width: Math.abs(end.x - start.x) || 1, height: Math.abs(end.y - start.y) || 1, elbowed: true } as ExcalidrawElementSkeleton])[0] as ExcalidrawElbowArrowElement;
  const fixedPoint = (side: Side) => SIDES.find((item) => item.side === side)!.ratio;
  const arrow = newElementWith(base, {
    points: points as ExcalidrawElbowArrowElement['points'],
    width: Math.max(...points.map((point) => point[0])) - Math.min(...points.map((point) => point[0])),
    height: Math.max(...points.map((point) => point[1])) - Math.min(...points.map((point) => point[1])),
    startBinding: { elementId: sourceShape.id, focus: 0, gap: 0, fixedPoint: fixedPoint(source.side) },
    endBinding: { elementId: targetShape.id, focus: 0, gap: 0, fixedPoint: fixedPoint(target.side) },
  });
  api.updateScene({
    elements: [...elements.map((element) => {
      if (element.id !== sourceShape.id && element.id !== targetShape.id) return element;
      return newElementWith(element, { boundElements: [...(element.boundElements ?? []), { id: arrow.id, type: 'arrow' }] });
    }), arrow],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

export default function WhiteboardPorts({ api }: { api: ExcalidrawImperativeAPI | null }) {
  const root = useRef<HTMLDivElement>(null);
  const [ports, setPorts] = useState<Port[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    if (!api) return;
    const refresh = () => {
      setPorts(getPorts(api));
      setSelectedIds(Object.keys(api.getAppState().selectedElementIds));
    };
    refresh();
    const stopChange = api.onChange(refresh);
    const stopScroll = api.onScrollChange(refresh);
    window.addEventListener('resize', refresh);
    return () => { stopChange(); stopScroll(); window.removeEventListener('resize', refresh); };
  }, [api]);

  useEffect(() => {
    if (!api) return;
    const move = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const target = closestPort(getPorts(api), current.source, event.clientX, event.clientY);
      const next = { ...current, pointerX: event.clientX, pointerY: event.clientY, target };
      dragRef.current = next;
      setDrag(next);
    };
    const finish = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const target = closestPort(getPorts(api), current.source, event.clientX, event.clientY);
      dragRef.current = null;
      setDrag(null);
      if (target) connect(api, current.source, target);
    };
    const cancel = () => { dragRef.current = null; setDrag(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [api]);

  const begin = (event: ReactPointerEvent<HTMLButtonElement>, port: Port) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = { source: port, pointerX: event.clientX, pointerY: event.clientY, target: null };
    dragRef.current = next;
    setDrag(next);
  };

  const rect = root.current?.getBoundingClientRect();
  const visible = drag ? ports : ports.filter((port) => selectedIds.includes(port.shapeId));
  return <div ref={root} className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-label="白板连接点">
    {drag && rect && <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      <line x1={drag.source.clientX - rect.left} y1={drag.source.clientY - rect.top}
        x2={(drag.target?.clientX ?? drag.pointerX) - rect.left} y2={(drag.target?.clientY ?? drag.pointerY) - rect.top}
        stroke="#6366f1" strokeWidth="2" strokeDasharray="5 5" />
    </svg>}
    {rect && visible.map((port) => {
      const selected = drag?.target?.shapeId === port.shapeId && drag.target.side === port.side;
      const label = SIDES.find((item) => item.side === port.side)!.label;
      return <button key={`${port.shapeId}-${port.side}`} type="button" aria-label={`从图形${label}侧连接点拖出箭头`}
        title={drag ? '拖到另一图形的连接点' : '拖出箭头'} onPointerDown={(event) => begin(event, port)}
        className={`pointer-events-auto absolute h-3.5 w-3.5 rounded-full border-2 shadow-sm transition-colors ${selected ? 'border-emerald-600 bg-emerald-300' : 'border-indigo-600 bg-white hover:bg-indigo-100 dark:bg-slate-900'}`}
        style={{ left: port.clientX - rect.left - 7, top: port.clientY - rect.top - 7 }} />;
    })}
  </div>;
}
