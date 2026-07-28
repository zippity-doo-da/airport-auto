import * as THREE from "three";
import {
  FIGHTER_CATALOG,
  FIGHTER_DATA_REFERENCES,
  fighterById,
  fighterCatalogStats,
  type FighterEra,
  type FighterProfile,
  type FighterPropulsion,
} from "./fighterCatalog";
import {
  createFighterVisual,
  updateFighterVisual,
  type FighterVisual,
} from "./fighterVisualFactory";
import "./fighterArchive.css";

type EraFilter = FighterEra | "all";
type PropulsionFilter = FighterPropulsion | "all";

interface ArchiveFilters {
  query: string;
  era: EraFilter;
  nation: string;
  propulsion: PropulsionFilter;
}

const canvas = required<HTMLCanvasElement>("fighter-canvas");
const catalogPanel = required<HTMLElement>("catalog-panel");
const catalogToggle = required<HTMLButtonElement>("catalog-toggle");
const catalogClose = required<HTMLButtonElement>("catalog-close");
const searchInput = required<HTMLInputElement>("fighter-search");
const nationFilter = required<HTMLSelectElement>("nation-filter");
const powerFilter = required<HTMLSelectElement>("power-filter");
const fighterList = required<HTMLElement>("fighter-list");
const resultCount = required<HTMLElement>("result-count");
const clearFilters = required<HTMLButtonElement>("clear-filters");
const randomButton = required<HTMLButtonElement>("random-fighter");
const previousButton = required<HTMLButtonElement>("previous-fighter");
const nextButton = required<HTMLButtonElement>("next-fighter");
const tourToggle = required<HTMLButtonElement>("tour-toggle");
const hint = required<HTMLElement>("interaction-hint");

const selectedElements = {
  era: required<HTMLElement>("selected-era"),
  name: required<HTMLElement>("selected-name"),
  maker: required<HTMLElement>("selected-maker"),
  status: required<HTMLElement>("selected-status"),
  year: required<HTMLElement>("spec-year"),
  length: required<HTMLElement>("spec-length"),
  span: required<HTMLElement>("spec-span"),
  speed: required<HTMLElement>("spec-speed"),
  ceiling: required<HTMLElement>("spec-ceiling"),
  power: required<HTMLElement>("spec-power"),
  summary: required<HTMLElement>("selected-summary"),
  variants: required<HTMLElement>("selected-variants"),
  operators: required<HTMLElement>("selected-operators"),
  sources: required<HTMLElement>("selected-sources"),
  viewerDesign: required<HTMLElement>("viewer-design"),
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const filters: ArchiveFilters = {
  query: "",
  era: "all",
  nation: "all",
  propulsion: "all",
};

let visibleFighters = [...FIGHTER_CATALOG];
let selectedFighter = initialFighter();
let currentVisual: FighterVisual | undefined;
let running = true;
let autoTour = false;
let lastTourChange = performance.now();
let interactionTimeout = 0;
let pointerMoved = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x172724);
scene.fog = new THREE.FogExp2(0x172724, 0.0048);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 700);
const stage = new THREE.Group();
stage.name = "fighter-stage";
scene.add(stage);

const orbit = {
  theta: THREE.MathUtils.degToRad(222),
  phi: THREE.MathUtils.degToRad(62),
  distance: 30,
  targetDistance: 30,
  target: new THREE.Vector3(0, 1.2, 0),
  activeUntil: 0,
};

createArchiveEnvironment();
populateNationFilter();
renderCatalog();
selectFighter(selectedFighter, false);
bindControls();
resizeRenderer();

const clock = new THREE.Clock();
let elapsedSeconds = 0;
renderer.setAnimationLoop(renderFrame);

function createArchiveEnvironment(): void {
  const ambient = new THREE.HemisphereLight(0xdbe3d5, 0x1c2925, 2.35);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffe4b4, 4.8);
  key.position.set(-12, 24, 18);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -35;
  key.shadow.camera.right = 35;
  key.shadow.camera.top = 35;
  key.shadow.camera.bottom = -35;
  key.shadow.bias = -0.0004;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x769ca0, 2.5);
  rim.position.set(22, 9, -18);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({
      color: 0x1b2e2a,
      roughness: 0.96,
      metalness: 0.02,
    }),
  );
  floor.name = "archive-floor";
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(180, 180, 0x8d9b83, 0x40564e);
  grid.name = "meter-grid";
  grid.position.y = 0.012;
  const gridMaterials = Array.isArray(grid.material)
    ? grid.material
    : [grid.material];
  gridMaterials.forEach((material) => {
    material.transparent = true;
    material.opacity = 0.2;
    material.depthWrite = false;
  });
  scene.add(grid);

  for (const radius of [10, 20, 30]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.025, radius + 0.025, 96),
      new THREE.MeshBasicMaterial({
        color: radius === 10 ? 0xb69459 : 0x65786c,
        transparent: true,
        opacity: radius === 10 ? 0.28 : 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.name = "scale-ring";
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    scene.add(ring);
  }
}

function bindControls(): void {
  window.addEventListener("resize", resizeRenderer);
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) clock.getDelta();
  });
  window.addEventListener("hashchange", () => {
    const hashFighter = fighterById(
      decodeURIComponent(window.location.hash.slice(1)),
    );
    if (hashFighter && hashFighter.id !== selectedFighter.id) {
      selectFighter(hashFighter, false);
    }
  });

  searchInput.addEventListener("input", () => {
    filters.query = searchInput.value.trim();
    applyFilters();
  });
  nationFilter.addEventListener("change", () => {
    filters.nation = nationFilter.value;
    applyFilters();
  });
  powerFilter.addEventListener("change", () => {
    filters.propulsion = powerFilter.value as PropulsionFilter;
    applyFilters();
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-era]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const era = button.dataset.era;
        if (!era) return;
        filters.era = era as EraFilter;
        document.querySelectorAll("[data-era]").forEach((candidate) => {
          candidate.classList.toggle("selected", candidate === button);
        });
        applyFilters();
      });
    });
  clearFilters.addEventListener("click", resetFilters);
  randomButton.addEventListener("click", selectRandomFighter);
  previousButton.addEventListener("click", () => selectRelative(-1));
  nextButton.addEventListener("click", () => selectRelative(1));
  tourToggle.addEventListener("click", toggleAutoTour);

  catalogToggle.addEventListener("click", () => setCatalogOpen(true));
  catalogClose.addEventListener("click", () => setCatalogOpen(false));

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const editing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement;
    if (event.key === "/" && !editing) {
      event.preventDefault();
      setCatalogOpen(true);
      searchInput.focus();
      return;
    }
    if (event.key === "Escape") {
      setCatalogOpen(false);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      return;
    }
    if (editing) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectRelative(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      selectRelative(1);
    } else if (event.key.toLowerCase() === "r") {
      selectRandomFighter();
    } else if (event.key.toLowerCase() === "t") {
      toggleAutoTour();
    }
  });

  const pointers = new Map<number, { x: number; y: number }>();
  let previousPinchDistance = 0;

  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pointerMoved = false;
    orbit.activeUntil = performance.now() + 2400;
    dismissHint();
  });
  canvas.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      if (Math.abs(dx) + Math.abs(dy) > 1) pointerMoved = true;
      orbit.theta -= dx * 0.008;
      orbit.phi = THREE.MathUtils.clamp(
        orbit.phi + dy * 0.006,
        THREE.MathUtils.degToRad(20),
        THREE.MathUtils.degToRad(84),
      );
    } else if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      const pinchDistance = Math.hypot(first.x - second.x, first.y - second.y);
      if (previousPinchDistance > 0) {
        zoomBy(previousPinchDistance / pinchDistance);
      }
      previousPinchDistance = pinchDistance;
    }
  });
  const releasePointer = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) previousPinchDistance = 0;
    orbit.activeUntil = performance.now() + 1800;
  };
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoomBy(Math.exp(event.deltaY * 0.001));
      orbit.activeUntil = performance.now() + 1800;
      dismissHint();
    },
    { passive: false },
  );

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    running = false;
    hint.textContent =
      "The 3D viewer paused because the graphics context was lost.";
    hint.classList.remove("dismissed");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    running = true;
    hint.textContent =
      "Viewer restored · drag to orbit · wheel or pinch to zoom";
    resizeRenderer();
  });

  window.addEventListener("beforeunload", () => currentVisual?.dispose());
}

function renderFrame(): void {
  if (!running) return;
  const deltaSeconds = Math.min(clock.getDelta(), 0.05);
  elapsedSeconds += deltaSeconds;
  const now = performance.now();

  if (!reducedMotion.matches && now > orbit.activeUntil) {
    orbit.theta += deltaSeconds * (autoTour ? 0.12 : 0.055);
  }
  orbit.distance = THREE.MathUtils.damp(
    orbit.distance,
    orbit.targetDistance,
    reducedMotion.matches ? 50 : 8,
    deltaSeconds,
  );
  updateCamera();

  if (currentVisual) {
    updateFighterVisual(currentVisual, elapsedSeconds, deltaSeconds);
  }
  if (autoTour && now - lastTourChange > 11000) {
    selectRelative(1);
    lastTourChange = now;
  }

  renderer.render(scene, camera);
}

function updateCamera(): void {
  const sinPhi = Math.sin(orbit.phi);
  camera.position.set(
    orbit.target.x + orbit.distance * sinPhi * Math.cos(orbit.theta),
    orbit.target.y + orbit.distance * Math.cos(orbit.phi),
    orbit.target.z + orbit.distance * sinPhi * Math.sin(orbit.theta),
  );
  camera.lookAt(orbit.target);
}

function resizeRenderer(): void {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const maximumPixelRatio = width < 780 ? 1.45 : 1.75;
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, maximumPixelRatio),
  );
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function renderCatalog(): void {
  const stats = fighterCatalogStats();
  required<HTMLElement>("catalog-total").textContent =
    `${stats.airframes} airframes · ${stats.nations} origins`;
  resultCount.textContent = `${visibleFighters.length} aircraft`;
  fighterList.replaceChildren();

  if (visibleFighters.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-results";
    empty.textContent =
      "No fighters match those filters. Clear one or search by a broader family name.";
    fighterList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const fighter of visibleFighters) {
    const row = document.createElement("button");
    row.className = "fighter-row";
    row.type = "button";
    row.dataset.fighterId = fighter.id;
    row.setAttribute("role", "option");
    row.setAttribute(
      "aria-selected",
      String(fighter.id === selectedFighter.id),
    );
    row.addEventListener("click", () => selectFighter(fighter));

    const year = document.createElement("span");
    year.className = "fighter-year";
    year.textContent = String(fighter.firstFlight);
    const copy = document.createElement("span");
    copy.className = "fighter-row-copy";
    const name = document.createElement("span");
    name.className = "fighter-row-name";
    name.textContent = fighter.name;
    const meta = document.createElement("span");
    meta.className = "fighter-row-meta";
    meta.textContent = `${fighter.designNation} · ${fighter.role}`;
    copy.append(name, meta);
    const power = document.createElement("span");
    power.className = `fighter-power-dot${fighter.propulsion === "piston" ? "" : " jet"}`;
    power.title = fighter.propulsion;
    row.append(year, copy, power);
    fragment.append(row);
  }
  fighterList.append(fragment);
}

function applyFilters(): void {
  const query = normalize(filters.query);
  visibleFighters = FIGHTER_CATALOG.filter((fighter) => {
    if (filters.era !== "all" && fighter.era !== filters.era) return false;
    if (filters.nation !== "all" && fighter.designNation !== filters.nation) {
      return false;
    }
    if (
      filters.propulsion !== "all" &&
      fighter.propulsion !== filters.propulsion
    ) {
      return false;
    }
    if (!query) return true;
    return searchableText(fighter).includes(query);
  });
  renderCatalog();
}

function resetFilters(): void {
  filters.query = "";
  filters.era = "all";
  filters.nation = "all";
  filters.propulsion = "all";
  searchInput.value = "";
  nationFilter.value = "all";
  powerFilter.value = "all";
  document.querySelectorAll<HTMLElement>("[data-era]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.era === "all");
  });
  applyFilters();
}

function populateNationFilter(): void {
  const nations = [
    ...new Set(FIGHTER_CATALOG.map((fighter) => fighter.designNation)),
  ].sort((a, b) => a.localeCompare(b));
  for (const nation of nations) {
    const option = document.createElement("option");
    option.value = nation;
    option.textContent = nation;
    nationFilter.append(option);
  }
}

function selectFighter(fighter: FighterProfile, updateHash = true): void {
  selectedFighter = fighter;
  if (currentVisual) {
    stage.remove(currentVisual.root);
    currentVisual.dispose();
  }
  currentVisual = createFighterVisual(fighter, false);
  stage.add(currentVisual.root);

  const envelope = Math.max(fighter.lengthM, fighter.wingspanM);
  const viewportAspect = THREE.MathUtils.clamp(
    window.innerWidth / Math.max(1, window.innerHeight),
    0.35,
    2.4,
  );
  const narrowViewportFit = Math.max(1, 1.05 / viewportAspect);
  orbit.target.set(0, Math.max(0.9, fighter.lengthM * 0.045), 0);
  orbit.targetDistance = THREE.MathUtils.clamp(
    envelope * 1.42 * narrowViewportFit,
    14,
    92,
  );
  if (!pointerMoved) {
    orbit.theta = THREE.MathUtils.degToRad(222);
    orbit.phi = THREE.MathUtils.degToRad(62);
  }
  orbit.activeUntil = performance.now() + 950;
  lastTourChange = performance.now();

  updateSelectedCard(fighter);
  updateSelectedRows();
  if (updateHash) {
    history.replaceState(null, "", `#${fighter.id}`);
  }
  if (window.matchMedia("(max-width: 780px)").matches) {
    setCatalogOpen(false);
  }
}

function updateSelectedCard(fighter: FighterProfile): void {
  selectedElements.era.textContent = `${fighter.era} · ${fighter.designNation} · ${fighter.role}`;
  selectedElements.name.textContent = fighter.name;
  selectedElements.maker.textContent = `${fighter.manufacturer} · ${fighter.engines} engine${fighter.engines === 1 ? "" : "s"} · ${fighter.crew} crew`;
  selectedElements.status.textContent = fighter.status;
  selectedElements.year.textContent = String(fighter.firstFlight);
  selectedElements.length.textContent = `${fighter.lengthM.toFixed(1)} m · ${metersToFeet(fighter.lengthM)} ft`;
  selectedElements.span.textContent = `${fighter.wingspanM.toFixed(1)} m · ${metersToFeet(fighter.wingspanM)} ft`;
  selectedElements.speed.textContent = speedLabel(fighter.maxSpeedKph);
  selectedElements.ceiling.textContent = `${Math.round(fighter.serviceCeilingM / 100) * 100} m · ${Math.round((fighter.serviceCeilingM * 3.28084) / 100) * 100} ft`;
  selectedElements.power.textContent = `${fighter.engines} × ${fighter.propulsion}`;
  selectedElements.summary.textContent = fighter.summary;
  selectedElements.variants.textContent =
    fighter.variants.length > 0
      ? fighter.variants.join(" · ")
      : "Representative production family";
  selectedElements.operators.textContent = fighter.operators.join(" · ");
  selectedElements.viewerDesign.textContent =
    fighter.id === "f-35"
      ? "aircraft-specific F-35A · trapezoidal wing"
      : fighter.id === "j-20"
        ? "aircraft-specific J-20 · canard delta"
        : fighter.id === "f-22"
          ? "aircraft-specific F-22A · trapezoidal stealth planform"
          : fighter.id === "mig-35"
            ? "aircraft-specific MiG-35 · swept wing and twin nacelles"
            : `${fighter.visual.pusher ? "pusher prop" : fighter.visual.family.replaceAll("-", " ")} · ${fighter.visual.wing} wing`;

  selectedElements.sources.replaceChildren();
  for (const referenceId of fighter.referenceIds) {
    const reference = FIGHTER_DATA_REFERENCES[referenceId];
    if (!reference) continue;
    const link = document.createElement("a");
    link.href = reference.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = reference.publisher;
    link.title = reference.title;
    selectedElements.sources.append(link);
  }
}

function updateSelectedRows(): void {
  fighterList
    .querySelectorAll<HTMLElement>("[data-fighter-id]")
    .forEach((row) => {
      const selected = row.dataset.fighterId === selectedFighter.id;
      row.setAttribute("aria-selected", String(selected));
      if (selected) {
        row.scrollIntoView({ block: "nearest" });
      }
    });
}

function selectRelative(offset: number): void {
  const list =
    visibleFighters.length > 0 ? visibleFighters : [...FIGHTER_CATALOG];
  const currentIndex = list.findIndex(
    (fighter) => fighter.id === selectedFighter.id,
  );
  const baseIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (baseIndex + offset + list.length) % list.length;
  selectFighter(list[nextIndex]);
}

function selectRandomFighter(): void {
  const list =
    visibleFighters.length > 0 ? visibleFighters : [...FIGHTER_CATALOG];
  if (list.length === 1) {
    selectFighter(list[0]);
    return;
  }
  let candidate = selectedFighter;
  while (candidate.id === selectedFighter.id) {
    candidate = list[Math.floor(Math.random() * list.length)];
  }
  selectFighter(candidate);
}

function toggleAutoTour(): void {
  autoTour = !autoTour;
  tourToggle.setAttribute("aria-pressed", String(autoTour));
  lastTourChange = performance.now();
}

function zoomBy(multiplier: number): void {
  orbit.targetDistance = THREE.MathUtils.clamp(
    orbit.targetDistance * multiplier,
    Math.max(
      7,
      Math.max(selectedFighter.lengthM, selectedFighter.wingspanM) * 0.72,
    ),
    92,
  );
}

function setCatalogOpen(open: boolean): void {
  catalogPanel.classList.toggle("open", open);
  catalogToggle.setAttribute("aria-expanded", String(open));
}

function dismissHint(): void {
  window.clearTimeout(interactionTimeout);
  interactionTimeout = window.setTimeout(() => {
    hint.classList.add("dismissed");
  }, 800);
}

function initialFighter(): FighterProfile {
  const id = decodeURIComponent(window.location.hash.slice(1));
  return fighterById(id) ?? fighterById("p-51") ?? FIGHTER_CATALOG[0];
}

function searchableText(fighter: FighterProfile): string {
  return normalize(
    [
      fighter.name,
      fighter.manufacturer,
      fighter.designNation,
      fighter.era,
      fighter.role,
      fighter.propulsion,
      ...fighter.variants,
      ...fighter.operators,
    ].join(" "),
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function metersToFeet(meters: number): number {
  return Math.round(meters * 3.28084);
}

function speedLabel(kph: number): string {
  const mach = kph / 1225;
  if (mach >= 0.92) return `${Math.round(kph)} km/h · M ${mach.toFixed(1)}`;
  return `${Math.round(kph)} km/h · ${Math.round(kph * 0.539957)} kt`;
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing required archive element #${id}`);
  }
  return element as T;
}
