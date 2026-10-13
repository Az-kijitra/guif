// SPEC-0300-0015 R-481-1/R-481-2/R-483/R-483-1, SPEC-0200-0001 §3.14.4 and §3.14.12-2: the viewer body's image
// interactions -- Ctrl+wheel zoom (keeps the point under the pointer), drag pan -- and the scroll correction after
// every zoom change. The arithmetic is in features/viewer/image-zoom; this file only reads / writes the DOM.

import { tick } from "svelte";
import {
  anchoredScroll,
  canPan,
  currentScale,
  maxScroll,
  nextZoom,
  panScroll,
} from "$lib/features/viewer/image-zoom";

export type ZoomMode = "fit" | number;
export type ZoomOp = "in" | "out" | "reset" | "fit" | "200";

export interface ImageInteractionDeps {
  body: HTMLElement;
  // True only while an image is displayed: the wheel zoom and the drag pan are image-only (text keeps drag = select).
  isActive: () => boolean;
  getImage: () => HTMLImageElement | undefined;
  getMode: () => ZoomMode;
  setMode: (mode: ZoomMode) => void;
}

export interface ImageInteraction {
  // Keys / buttons: the viewport centre is kept (R-481-2).
  applyOp: (op: ZoomOp) => Promise<void>;
  dispose: () => void;
}

export function attachImageInteraction(deps: ImageInteractionDeps): ImageInteraction {
  const { body } = deps;

  function baseScale(): number {
    const img = deps.getImage();
    return currentScale(deps.getMode(), { clientWidth: img?.clientWidth ?? 0, naturalWidth: img?.naturalWidth ?? 0 });
  }

  // Change the mode, wait for the layout, then put the scroll so that the point under `pointer` stays (per axis).
  async function changeMode(mode: ZoomMode, pointer: { x: number; y: number }): Promise<void> {
    const prevW = body.scrollWidth;
    const prevH = body.scrollHeight;
    const left = body.scrollLeft;
    const top = body.scrollTop;
    deps.setMode(mode);
    await tick();
    body.scrollLeft = anchoredScroll({
      scroll: left,
      prevContent: prevW,
      nextContent: body.scrollWidth,
      viewport: body.clientWidth,
      pointer: pointer.x,
    });
    body.scrollTop = anchoredScroll({
      scroll: top,
      prevContent: prevH,
      nextContent: body.scrollHeight,
      viewport: body.clientHeight,
      pointer: pointer.y,
    });
  }

  const centre = (): { x: number; y: number } => ({ x: body.clientWidth / 2, y: body.clientHeight / 2 });

  async function applyOp(op: ZoomOp): Promise<void> {
    if (op === "fit") return changeMode("fit", centre());
    if (op === "reset") return changeMode(1, centre());
    if (op === "200") return changeMode(2, centre());
    return changeMode(nextZoom(baseScale(), op), centre());
  }

  // R-481-1: Ctrl + wheel. Registered as non-passive (Svelte's onwheel is passive and cannot preventDefault).
  function onWheel(event: WheelEvent): void {
    if (!event.ctrlKey || !deps.isActive()) return;
    event.preventDefault();
    if (event.deltaY === 0) return;
    const rect = body.getBoundingClientRect();
    void changeMode(nextZoom(baseScale(), event.deltaY < 0 ? "in" : "out"), {
      x: event.clientX - rect.left - body.clientLeft,
      y: event.clientY - rect.top - body.clientTop,
    });
  }
  body.addEventListener("wheel", onWheel, { passive: false });

  // R-483: drag pan with pointer events (left button, on the image or the stage -- a click on the scroll bar has the
  // body itself as its target and is left alone).
  let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;

  function onPointerDown(event: PointerEvent): void {
    if (!deps.isActive() || event.button !== 0 || drag !== null) return;
    if (event.target === body || !canPan(body)) return;
    event.preventDefault(); // no browser image drag / text selection
    body.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: body.scrollLeft, top: body.scrollTop };
    body.style.cursor = "grabbing";
  }

  function onPointerMove(event: PointerEvent): void {
    if (drag === null || event.pointerId !== drag.id) return;
    body.scrollLeft = panScroll({
      startScroll: drag.left,
      startPointer: drag.x,
      pointer: event.clientX,
      max: maxScroll(body.scrollWidth, body.clientWidth),
    });
    body.scrollTop = panScroll({
      startScroll: drag.top,
      startPointer: drag.y,
      pointer: event.clientY,
      max: maxScroll(body.scrollHeight, body.clientHeight),
    });
  }

  function endDrag(event: PointerEvent): void {
    if (drag === null || event.pointerId !== drag.id) return;
    if (body.hasPointerCapture(drag.id)) body.releasePointerCapture(drag.id);
    drag = null;
    body.style.cursor = "";
  }

  body.addEventListener("pointerdown", onPointerDown);
  body.addEventListener("pointermove", onPointerMove);
  body.addEventListener("pointerup", endDrag);
  body.addEventListener("pointercancel", endDrag);

  return {
    applyOp,
    dispose() {
      body.removeEventListener("wheel", onWheel);
      body.removeEventListener("pointerdown", onPointerDown);
      body.removeEventListener("pointermove", onPointerMove);
      body.removeEventListener("pointerup", endDrag);
      body.removeEventListener("pointercancel", endDrag);
    },
  };
}
