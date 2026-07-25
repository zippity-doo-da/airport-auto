import {
  FOCUS_TARGET_KINDS,
  focusTargetKey,
  type FocusTargetCatalog,
  type FocusTargetDescriptor,
  type FocusTargetKind,
  type FocusTargetRef,
} from '../presentation/focusTargets';

export interface FocusNavigatorElements {
  panel: HTMLElement;
  toggle: HTMLButtonElement;
  close: HTMLButtonElement;
  count: HTMLElement;
  kind: HTMLSelectElement;
  target: HTMLSelectElement;
  detail: HTMLElement;
  previous: HTMLButtonElement;
  apply: HTMLButtonElement;
  next: HTMLButtonElement;
  release: HTMLButtonElement;
  status: HTMLElement;
  statusLabel: HTMLElement;
  statusDetail: HTMLElement;
  statusRelease: HTMLButtonElement;
}

export interface FocusNavigatorCallbacks {
  onVisibilityChange(visible: boolean): void;
  onFocus(ref: FocusTargetRef): void;
  onRelease(): void;
}

export interface FocusNavigator {
  visible(): boolean;
  setVisible(visible: boolean, preferredKind?: FocusTargetKind): void;
  render(catalog: FocusTargetCatalog, current: FocusTargetDescriptor | null): void;
  selectedRef(): FocusTargetRef | null;
  reset(): void;
}

export function createFocusNavigator(
  elements: FocusNavigatorElements,
  callbacks: FocusNavigatorCallbacks,
): FocusNavigator {
  let catalog: FocusTargetCatalog = emptyCatalog();
  let current: FocusTargetDescriptor | null = null;
  let selectedKind: FocusTargetKind = 'flight';
  let selectedKey = '';
  let optionsKey = '';

  const targetsForKind = (): FocusTargetDescriptor[] => catalog.targets.filter((target) => target.kind === selectedKind);
  const selectedTarget = (): FocusTargetDescriptor | null => {
    const targets = targetsForKind();
    return targets.find((target) => target.key === selectedKey) ?? targets[0] ?? null;
  };

  const updateTargetDetails = (): void => {
    const target = selectedTarget();
    selectedKey = target?.key ?? '';
    if (elements.target.value !== selectedKey) elements.target.value = selectedKey;
    elements.detail.textContent = target?.detail ?? `No active ${categoryLabel(selectedKind).toLocaleLowerCase()} to follow.`;
    elements.apply.disabled = target === null;
    elements.previous.disabled = target === null;
    elements.next.disabled = target === null;
    elements.apply.textContent = current?.key === target?.key ? 'Following' : 'Focus';
    elements.apply.setAttribute('aria-pressed', String(current?.key === target?.key));
  };

  const renderOptions = (): void => {
    const nextOptionsKey = [
      selectedKind,
      ...catalog.categories.map((category) => `${category.kind}:${category.count}`),
      ...targetsForKind().map((target) => `${target.key}:${target.label}`),
    ].join('|');
    if (nextOptionsKey === optionsKey) {
      updateTargetDetails();
      return;
    }
    optionsKey = nextOptionsKey;
    const categoriesByKind = new Map(catalog.categories.map((category) => [category.kind, category]));
    syncSelectOptions(elements.kind, FOCUS_TARGET_KINDS.map((kind) => {
      const category = categoriesByKind.get(kind);
      return {
        value: kind,
        label: `${category?.label ?? categoryLabel(kind)} (${category?.count ?? 0})`,
        disabled: (category?.count ?? 0) === 0,
      };
    }));
    elements.kind.value = selectedKind;

    const targets = targetsForKind();
    syncSelectOptions(elements.target, targets.map((target) => ({
      value: target.key,
      label: target.label,
      disabled: false,
    })));
    if (!targets.some((target) => target.key === selectedKey)) selectedKey = targets[0]?.key ?? '';
    elements.target.value = selectedKey;
    updateTargetDetails();
  };

  const setVisible = (visible: boolean, preferredKind?: FocusTargetKind): void => {
    if (preferredKind && catalog.categories.some((category) => category.kind === preferredKind && category.count > 0)) {
      selectedKind = preferredKind;
      selectedKey = current?.kind === preferredKind ? current.key : '';
      optionsKey = '';
    } else if (visible && current) {
      selectedKind = current.kind;
      selectedKey = current.key;
      optionsKey = '';
    }
    elements.panel.hidden = !visible;
    elements.toggle.setAttribute('aria-expanded', String(visible));
    elements.toggle.setAttribute('aria-pressed', String(visible));
    elements.toggle.setAttribute('aria-label', visible ? 'Close observer focus navigator' : 'Open observer focus navigator');
    elements.toggle.classList.toggle('camera-tools__focus--active', visible);
    document.body.classList.toggle('focus-navigator-visible', visible);
    if (visible) {
      renderOptions();
      elements.kind.focus({ preventScroll: true });
    }
    callbacks.onVisibilityChange(visible);
  };

  elements.toggle.addEventListener('click', () => setVisible(elements.panel.hidden));
  elements.close.addEventListener('click', () => setVisible(false));
  elements.kind.addEventListener('change', () => {
    const nextKind = elements.kind.value as FocusTargetKind;
    if (!FOCUS_TARGET_KINDS.includes(nextKind)) return;
    selectedKind = nextKind;
    selectedKey = '';
    optionsKey = '';
    renderOptions();
  });
  elements.target.addEventListener('change', () => {
    selectedKey = elements.target.value;
    updateTargetDetails();
  });
  const move = (direction: -1 | 1): void => {
    const targets = targetsForKind();
    if (!targets.length) return;
    const currentIndex = Math.max(0, targets.findIndex((target) => target.key === selectedKey));
    selectedKey = targets[(currentIndex + direction + targets.length) % targets.length].key;
    updateTargetDetails();
  };
  elements.previous.addEventListener('click', () => move(-1));
  elements.next.addEventListener('click', () => move(1));
  elements.apply.addEventListener('click', () => {
    const target = selectedTarget();
    if (target) callbacks.onFocus({ kind: target.kind, id: target.id });
  });
  elements.release.addEventListener('click', callbacks.onRelease);
  elements.statusRelease.addEventListener('click', callbacks.onRelease);

  return {
    visible: () => !elements.panel.hidden,
    setVisible,
    render(nextCatalog, nextCurrent) {
      catalog = nextCatalog;
      current = nextCurrent;
      elements.count.textContent = `${catalog.total} targets`;
      elements.status.hidden = current === null;
      if (current) {
        elements.status.dataset.tone = current.tone;
        elements.statusLabel.textContent = `Following ${current.label}`;
        elements.statusDetail.textContent = `${categoryLabel(current.kind)} · ${followLabel(current)}`;
      } else {
        delete elements.status.dataset.tone;
      }
      renderOptions();
    },
    selectedRef() {
      const target = selectedTarget();
      return target ? { kind: target.kind, id: target.id } : null;
    },
    reset() {
      current = null;
      selectedKind = 'flight';
      selectedKey = '';
      optionsKey = '';
      elements.status.hidden = true;
      setVisible(false);
    },
  };
}

function emptyCatalog(): FocusTargetCatalog {
  return {
    schemaVersion: 1,
    generatedAtSeconds: 0,
    categories: FOCUS_TARGET_KINDS.map((kind) => ({ kind, label: categoryLabel(kind), count: 0 })),
    targets: [],
    total: 0,
  };
}

function categoryLabel(kind: FocusTargetKind): string {
  const labels: Record<FocusTargetKind, string> = {
    flight: 'Aircraft',
    runway: 'Runways',
    taxiway: 'Taxiways',
    gate: 'Gates',
    queue: 'Queues',
    conflict: 'Conflicts',
  };
  return labels[kind];
}

function followLabel(target: FocusTargetDescriptor): string {
  if (target.follow === 'flight') return 'live aircraft track';
  if (target.follow === 'vehicle') return 'live service movement';
  if (target.follow === 'group') return `${target.flightIds.length} moving tracks`;
  return 'fixed airport location';
}

function syncSelectOptions(
  select: HTMLSelectElement,
  values: Array<{ value: string; label: string; disabled: boolean }>,
): void {
  const existing = new Map([...select.options].map((option) => [option.value, option]));
  const live = new Set(values.map((value) => value.value));
  for (const option of [...select.options]) {
    if (!live.has(option.value)) option.remove();
  }
  for (const value of values) {
    const option = existing.get(value.value) ?? document.createElement('option');
    option.value = value.value;
    option.textContent = value.label;
    option.disabled = value.disabled;
    select.append(option);
  }
}

export function focusNavigatorRenderKey(
  catalog: FocusTargetCatalog,
  current: FocusTargetDescriptor | null,
): string {
  return [
    catalog.generatedAtSeconds,
    current ? focusTargetKey(current) : 'free',
    ...catalog.targets.map((target) => `${target.key}:${target.label}:${target.detail}`),
  ].join('|');
}
