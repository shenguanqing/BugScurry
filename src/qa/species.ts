import { createBug } from "../core/bug";
import { DEFAULT_SETTINGS } from "../core/config";
import { drawBug } from "../core/renderer";
import { Rng } from "../core/rng";
import { getSpecies } from "../species/index";
import { CENTER_BIAS } from "../settings/speciesPreviewLayout";

export function initSpeciesQa() {
  const IDS = [
    "fly",
    "butterfly",
    "ant",
    "caterpillar",
    "bee",
    "ladybug",
    "mosquito",
    "cockroach",
    "spider",
  ] as const;
  type SpeciesId = (typeof IDS)[number];

  const SIDE_VIEW = new Set(["ant", "bee", "caterpillar", "mosquito"]);
  /** Visual weight of the two centering cells — keep Emoji ≈ Canvas. */
  const PREVIEW_SIZE = 36;
  const EMOJI_FONT = 64;
  const BOX = 96;
  /** Logical layout height (CSS px in canvas space). */
  const W = 360;
  const H = 920;

  const bugs = IDS.map(
    (species, i) =>
      ({
        ...createBug(
          { width: 1080, height: 690, dpr: 2 },
          { ...DEFAULT_SETTINGS, species },
          new Rng(42 + i),
        ),
        x: 0,
        y: 0,
        size: 15,
        maxHp: 1,
        hp: 1,
        satisfiedTimer: 0,
      }) as Parameters<typeof drawBug>[1],
  );

  const canvas = document.querySelector<HTMLCanvasElement>("#compare-canvas")!;
  const ctx = canvas.getContext("2d")!;
  const phaseEl = document.querySelector<HTMLInputElement>("#phase")!;
  const deathEl = document.querySelector<HTMLInputElement>("#death")!;
  const animateEl = document.querySelector<HTMLInputElement>("#animate")!;
  const statusEl = document.querySelector<HTMLElement>("#status")!;
  const requestedGroup = Number(new URLSearchParams(location.search).get("group") || 0);
  let group = Number.isInteger(requestedGroup) ? Math.max(0, Math.min(IDS.length - 1, requestedGroup)) : 0;
  /** Pointer over the right centering box → force gait playback. */
  let hoverCanvasBox = false;
  let hoverPhase = 0;

  // Centering boxes: two 96px cells side by side, centered on W/2.
  const BOX_GAP = 12;
  const BOXES_TOTAL = BOX * 2 + BOX_GAP;
  const EMOJI_CX = W / 2 - BOXES_TOTAL / 2 + BOX / 2;
  const CANVAS_CX = W / 2 + BOXES_TOTAL / 2 - BOX / 2;
  const CENTER_CY = 360;

  function phaseFor(): number {
    return hoverCanvasBox ? hoverPhase : Number(phaseEl.value);
  }

  function bugAt(
    id: SpeciesId,
    x: number,
    y: number,
    size: number,
    dead = false,
    usePreviewBias = false,
    legPhase?: number,
  ): void {
    const b = bugs[IDS.indexOf(id)];
    b.size = size;
    b.heading = SIDE_VIEW.has(id) ? 0 : -Math.PI / 2;
    b.legPhase = legPhase ?? phaseFor();
    b.state = dead
      ? Number(deathEl.value) > 1
        ? "dying"
        : "squishing"
      : "crawling";
    b.deathProgress = dead
      ? Number(deathEl.value) > 1
        ? Number(deathEl.value) - 1
        : Number(deathEl.value)
      : 0;
    const bias = usePreviewBias ? (CENTER_BIAS[id] ?? [0, 0]) : ([0, 0] as const);
    ctx.save();
    ctx.translate(x + bias[0] * size, y + bias[1] * size);
    if (SIDE_VIEW.has(id)) ctx.scale(-1, 1);
    drawBug(ctx, b);
    ctx.restore();
  }

  function drawCrosshairBox(
    cx: number,
    cy: number,
    fill: string,
    stroke: string,
    cross: string,
  ): void {
    const left = cx - BOX / 2;
    const top = cy - BOX / 2;
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(left, top, BOX, BOX, 12);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = cross;
    ctx.beginPath();
    ctx.moveTo(left, cy + 0.5);
    ctx.lineTo(left + BOX, cy + 0.5);
    ctx.moveTo(cx + 0.5, top);
    ctx.lineTo(cx + 0.5, top + BOX);
    ctx.stroke();
    ctx.restore();
  }

  function drawCompare(): void {
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = "#f1eee8";
    ctx.fillRect(0, 0, W, 500);
    ctx.fillStyle = "#242930";
    ctx.fillRect(0, 500, W, H - 500);

    const id = IDS[group];
    const s = getSpecies(id)!;
    const x = W / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = "#35332e";
    ctx.font = "18px system-ui";
    ctx.fillText(s.label, x, 26);
    ctx.font = "13px system-ui";
    ctx.fillText("Emoji                          Canvas · 54", x, 48);
    ctx.font = "95px system-ui";
    ctx.fillText(s.emoji, x - 88, 148);
    bugAt(id, x + 82, 110, 54);

    ctx.font = "13px system-ui";
    ctx.fillStyle = "#35332e";
    ctx.fillText("实际尺寸 9 / 15 / 27", x, 210);
    ([9, 15, 27] as const).forEach((size, j) => {
      bugAt(id, x - 80 + j * 80, 248, size);
    });

    ctx.fillText("居中 96×96 · Emoji vs Canvas（悬停右格播步态）", x, 300);
    drawCrosshairBox(EMOJI_CX, CENTER_CY, "#ffffff", "#c8c2b8", "#d0d0d0");
    drawCrosshairBox(
      CANVAS_CX,
      CENTER_CY,
      hoverCanvasBox ? "#eef5ff" : "#ffffff",
      hoverCanvasBox ? "#7aa7d4" : "#c8c2b8",
      "#d0d0d0",
    );
    ctx.font = `${EMOJI_FONT}px system-ui`;
    ctx.fillText(s.emoji, EMOJI_CX, CENTER_CY + EMOJI_FONT * 0.36);
    // Same origin / bias / heading as SpeciesPreview in the settings popover.
    bugAt(id, CANVAS_CX, CENTER_CY, PREVIEW_SIZE, false, true);
    ctx.font = "11px system-ui";
    ctx.fillStyle = "#6b6560";
    ctx.fillText("Emoji", EMOJI_CX, CENTER_CY + BOX / 2 + 16);
    ctx.fillText(hoverCanvasBox ? "Canvas · 步态" : "Canvas", CANVAS_CX, CENTER_CY + BOX / 2 + 16);

    ctx.fillStyle = "#dde2e6";
    ctx.font = "13px system-ui";
    ctx.fillText("深色背景 · 大 / 默认", x, 540);
    bugAt(id, x - 70, 620, 42);
    bugAt(id, x + 65, 620, 15);

    ctx.fillText("捏扁 / 淡出", x, 710);
    bugAt(id, x - 70, 820, 42, true);
    bugAt(id, x + 65, 820, 15, true);

    statusEl.textContent = `${group + 1}/${IDS.length} · ${s.label}`;
  }

  function canvasPoint(ev: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * W,
      y: ((ev.clientY - rect.top) / rect.height) * H,
    };
  }

  function overCanvasBox(p: { x: number; y: number }): boolean {
    return (
      p.x >= CANVAS_CX - BOX / 2 &&
      p.x <= CANVAS_CX + BOX / 2 &&
      p.y >= CENTER_CY - BOX / 2 &&
      p.y <= CENTER_CY + BOX / 2
    );
  }

  canvas.addEventListener("pointermove", (ev) => {
    const p = canvasPoint(ev);
    const next = overCanvasBox(p);
    if (next !== hoverCanvasBox) {
      hoverCanvasBox = next;
      if (next) hoverPhase = Number(phaseEl.value);
      drawCompare();
    }
  });
  canvas.addEventListener("pointerleave", () => {
    if (hoverCanvasBox) {
      hoverCanvasBox = false;
      drawCompare();
    }
  });

  function stepGroup(delta: number): void {
    group = (group + delta + IDS.length) % IDS.length;
    drawCompare();
  }
  document.querySelector<HTMLButtonElement>("#prev")!.onclick = () => stepGroup(-1);
  document.querySelector<HTMLButtonElement>("#next")!.onclick = () => stepGroup(1);
  phaseEl.oninput = deathEl.oninput = () => drawCompare();
  window.addEventListener("keydown", (e) => {
    if (document.querySelector<HTMLElement>("#species-panel")!.hidden ||
        (e.target instanceof HTMLElement && e.target.closest("input, select, button"))) return;
    if (e.key === "ArrowLeft") stepGroup(-1);
    if (e.key === "ArrowRight") stepGroup(1);
  });

  function frame(t: number): void {
    if (hoverCanvasBox) {
      hoverPhase = (t / 1400) % 1;
      drawCompare();
    } else if (animateEl.checked) {
      phaseEl.value = String((t / 1400) % 1);
      drawCompare();
    }

  }
  drawCompare();


  /* ── 冒烟 ─────────────────────────────────────────────── */
  const smokeSurface = document.createElement("canvas");
  smokeSurface.width = smokeSurface.height = 256;
  const probe = smokeSurface.getContext("2d", { willReadFrequently: true })!;
  const results: string[] = [];
  for (const base of bugs) {
    let valid = true;
    let changes = 0;
    let lastPixels: Uint8ClampedArray | undefined;
    for (const legPhase of [0, 0.25, 0.5, 0.75]) {
      probe.clearRect(0, 0, 256, 256);
      drawBug(probe, {
        ...base,
        x: 128,
        y: 128,
        size: 36,
        heading: 0.4,
        legPhase,
        state: "crawling",
      });
      const pixels = probe.getImageData(0, 0, 256, 256).data;
      valid &&= pixels.some((v, i) => i % 4 === 3 && v > 0);
      if (lastPixels && pixels.some((v, i) => v !== lastPixels![i])) changes++;
      lastPixels = pixels;
    }
    for (const state of ["squishing", "dying"] as const) {
      for (const deathProgress of [0, 0.2, 0.6, 1]) {
        probe.clearRect(0, 0, 256, 256);
        drawBug(probe, {
          ...base,
          x: 128,
          y: 128,
          size: 36,
          heading: 1.7,
          state,
          deathProgress,
        });
        if (state === "dying" && deathProgress === 1) {
          valid &&= !probe
            .getImageData(0, 0, 256, 256)
            .data.some((v, i) => i % 4 === 3 && v > 0);
        }
      }
    }
    const tr = probe.getTransform();
    valid &&=
      tr.a === 1 && tr.b === 0 && tr.c === 0 && tr.d === 1 && probe.globalAlpha === 1;
    const ok = valid && changes === 3;
    results.push(
      `${ok ? "PASS" : "FAIL"}  ${base.species}  · 4 gait / 8 death / clear final / ctx restored`,
    );
  }
  const checksEl = document.querySelector("#checks")!;
  checksEl.innerHTML = results
    .map((line) =>
      line.startsWith("PASS")
        ? `<span class="pass">${line}</span>`
        : `<span class="fail">${line}</span>`,
    )
    .join("\n");

  return { frame, draw: drawCompare };
}
