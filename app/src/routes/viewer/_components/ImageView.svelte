<script lang="ts">
  // SPEC-0300-0015 R-480~R-483-2 (第9版 R-482 Fit); SPEC-0200-0001 §3.14.4: the image is laid out at its REAL size
  // (width / height in px; never a transform, so the scroll range covers the whole image), centred with
  // `margin: auto` inside a stage at least as large as the body. Fit is a computed scale (fitScale of the display
  // area, which follows window resizes), so it also enlarges past 100%.
  import { fitScale, scaledSize } from "$lib/features/viewer/image-zoom";

  interface Props {
    src: string;
    alt: string;
    mode: "fit" | number;
    img?: HTMLImageElement;
    scale?: number; // the REAL displayed scale, for the header and the next step
  }
  let { src, alt, mode, img = $bindable(), scale = $bindable(1) }: Props = $props();

  let naturalWidth = $state(0);
  let naturalHeight = $state(0);
  let viewW = $state(0);
  let viewH = $state(0);

  // Tracks the display area (the scroll container's inner size; padding is 0 for the image display).
  function trackView(node: HTMLElement): { destroy: () => void } {
    const area = node.parentElement;
    if (area === null) return { destroy() {} };
    const measure = (): void => {
      viewW = area.clientWidth;
      viewH = area.clientHeight;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return { destroy: () => observer.disconnect() };
  }

  // Before the image has loaded there is no natural size: no scale is applied.
  let loaded = $derived(naturalWidth > 0 && naturalHeight > 0);
  let current = $derived(
    mode !== "fit"
      ? mode
      : loaded
        ? fitScale({ width: viewW, height: viewH }, { width: naturalWidth, height: naturalHeight })
        : 1,
  );
  $effect(() => {
    scale = current;
  });

  // Fit sizes are floored so rounding can never make the image overflow (a scroll bar would shrink the area again).
  let sizeStyle = $derived(
    !loaded
      ? ""
      : mode === "fit"
        ? `width: ${Math.floor(scaledSize(naturalWidth, current))}px; height: ${Math.floor(scaledSize(naturalHeight, current))}px;`
        : `width: ${scaledSize(naturalWidth, mode)}px; height: ${scaledSize(naturalHeight, mode)}px;`,
  );
</script>

<div class="image-stage" class:fit={mode === "fit"} use:trackView>
  <img
    bind:this={img}
    bind:naturalWidth
    bind:naturalHeight
    {src}
    {alt}
    draggable="false"
    style={sizeStyle}
  />
</div>

<style>
  .image-stage {
    display: flex;
    min-width: 100%;
    min-height: 100%;
    box-sizing: border-box;
    user-select: none;
  }
  .image-stage.fit {
    height: 100%;
  }
  .image-stage img {
    margin: auto;
    flex: none;
    cursor: grab;
  }
</style>
