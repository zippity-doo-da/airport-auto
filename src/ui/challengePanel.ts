import type { AirportSimulation } from '../simulation/airportSimulation';

export type ChallengeSnapshot = ReturnType<AirportSimulation['challengeSnapshot']>;

interface ObjectiveNodes {
  item: HTMLElement;
  value: HTMLElement;
  target: HTMLElement;
  bar: HTMLElement;
}

export interface ChallengePanelElements {
  setup: HTMLDetailsElement;
  select: HTMLSelectElement;
  setupNote: HTMLElement;
  startButton: HTMLButtonElement;
  lockedControls: Array<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>;
  hud: HTMLElement;
  title: HTMLElement;
  clock: HTMLElement;
  grade: HTMLElement;
  status: HTMLElement;
  conditions: HTMLElement;
  objectiveDetails: HTMLDetailsElement;
  objectiveList: HTMLElement;
  primaryButton: HTMLButtonElement;
  endButton: HTMLButtonElement;
  results: HTMLElement;
  resultEyebrow: HTMLElement;
  resultTitle: HTMLElement;
  resultGrade: HTMLElement;
  resultScore: HTMLElement;
  resultReason: HTMLElement;
  resultThroughput: HTMLElement;
  resultDelay: HTMLElement;
  resultFuel: HTMLElement;
  resultSafety: HTMLElement;
  resultOperations: HTMLElement;
  resultEmergencies: HTMLElement;
  resultObjectives: HTMLElement;
}

export interface ChallengePanel {
  render(snapshot: ChallengeSnapshot, force?: boolean): void;
  renderResults(snapshot: ChallengeSnapshot): void;
  reset(): void;
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

function formatWeight(weight: number): string {
  return `${Math.round(weight * 100)}%`;
}

function reconcileObjectives(
  container: HTMLElement,
  nodes: Map<string, ObjectiveNodes>,
  objectives: ChallengeSnapshot['objectives'],
): void {
  const nextKey = objectives.map((objective) => objective.id).join('|');
  if (container.dataset.objectiveKey !== nextKey) {
    container.dataset.objectiveKey = nextKey;
    nodes.clear();
    const fragment = document.createDocumentFragment();
    for (const objective of objectives) {
      const item = document.createElement('article');
      item.className = 'challenge-objective';

      const header = document.createElement('header');
      const identity = document.createElement('span');
      const label = document.createElement('b');
      const detail = document.createElement('small');
      const result = document.createElement('span');
      const value = document.createElement('b');
      const target = document.createElement('small');
      label.textContent = objective.label;
      detail.textContent = objective.detail;
      identity.append(label, detail);
      result.append(value, target);
      header.append(identity, result);

      const track = document.createElement('span');
      track.className = 'challenge-objective__track';
      const bar = document.createElement('i');
      track.append(bar);

      const weight = document.createElement('small');
      weight.className = 'challenge-objective__weight';
      weight.textContent = `${formatWeight(objective.weight)} of grade`;
      item.append(header, track, weight);
      nodes.set(objective.id, { item, value, target, bar });
      fragment.append(item);
    }
    container.replaceChildren(fragment);
  }

  for (const objective of objectives) {
    const node = nodes.get(objective.id);
    if (!node) continue;
    node.item.dataset.status = objective.status;
    node.value.textContent = objective.displayValue;
    node.target.textContent = `Target ${objective.target}`;
    node.bar.style.setProperty('--challenge-progress', `${Math.round(objective.progress * 100)}%`);
  }
}

export function createChallengePanel(elements: ChallengePanelElements): ChallengePanel {
  const liveObjectives = new Map<string, ObjectiveNodes>();
  const resultObjectives = new Map<string, ObjectiveNodes>();
  let renderKey = '';
  let previousStatus: ChallengeSnapshot['status'] = 'inactive';

  function selectedDefinition(snapshot: ChallengeSnapshot) {
    return snapshot.availableChallenges.find((challenge) => challenge.id === elements.select.value)
      ?? snapshot.availableChallenges[0];
  }

  function syncCatalog(snapshot: ChallengeSnapshot): void {
    const catalogKey = snapshot.availableChallenges.map((challenge) => challenge.id).join('|');
    if (elements.select.dataset.catalogKey !== catalogKey) {
      const selected = elements.select.value;
      elements.select.replaceChildren(...snapshot.availableChallenges.map((challenge) => {
        const option = document.createElement('option');
        option.value = challenge.id;
        option.textContent = `${challenge.shortTitle} · ${Math.round(challenge.durationSeconds / 60)} min`;
        return option;
      }));
      elements.select.dataset.catalogKey = catalogKey;
      if (snapshot.availableChallenges.some((challenge) => challenge.id === selected)) elements.select.value = selected;
    }
    const selected = selectedDefinition(snapshot);
    elements.setupNote.textContent = selected
      ? `${selected.summary} ${selected.objectives.length} graded objectives; conditions lock when opened.`
      : 'Choose a deterministic controller challenge.';
  }

  function render(snapshot: ChallengeSnapshot, force = false): void {
    syncCatalog(snapshot);
    const live = snapshot.status === 'briefing' || snapshot.status === 'active';
    const definition = snapshot.definition;
    const key = JSON.stringify({
      status: snapshot.status,
      challengeId: snapshot.challengeId,
      seconds: Math.ceil(snapshot.summary.remainingSeconds),
      score: snapshot.score,
      grade: snapshot.grade,
      objectives: snapshot.objectives.map((objective) => [objective.id, objective.status, objective.displayValue, objective.progress]),
    });
    if (!force && renderKey === key) return;
    renderKey = key;

    elements.hud.hidden = !live;
    elements.startButton.disabled = snapshot.conditionsLocked;
    elements.select.disabled = snapshot.conditionsLocked;
    for (const control of elements.lockedControls) control.disabled = snapshot.conditionsLocked;
    elements.startButton.textContent = snapshot.conditionsLocked ? 'Challenge in progress' : 'Open challenge briefing';
    if (!live || !definition) return;

    elements.hud.dataset.status = snapshot.status;
    elements.title.textContent = definition.title;
    elements.clock.textContent = snapshot.status === 'briefing' ? formatClock(definition.durationSeconds) : formatClock(snapshot.summary.remainingSeconds);
    elements.grade.textContent = snapshot.status === 'briefing' ? 'Briefing' : `Live ${snapshot.grade} · ${snapshot.score}`;
    elements.status.textContent = snapshot.status === 'briefing'
      ? definition.briefing
      : `${snapshot.summary.operations} movements · ${snapshot.summary.throughputPerHour.toFixed(1)} ops/hr · ${snapshot.summary.delayPerOperationSeconds.toFixed(0)} sec delay/op`;
    elements.conditions.textContent = `${definition.scenario} scenario · ${definition.density} traffic · ${definition.separationRuleset} separation · ${definition.weather.condition}, ${definition.weather.windSpeedKts} kt wind`;
    elements.primaryButton.hidden = snapshot.status !== 'briefing';
    elements.primaryButton.textContent = 'Begin timed shift';
    elements.endButton.textContent = snapshot.status === 'briefing' ? 'Leave challenge' : 'End shift';
    if (snapshot.status === 'briefing' && previousStatus !== 'briefing') elements.objectiveDetails.open = true;
    if (snapshot.status === 'active' && previousStatus === 'briefing') elements.objectiveDetails.open = false;
    reconcileObjectives(elements.objectiveList, liveObjectives, snapshot.objectives);
    previousStatus = snapshot.status;
  }

  function renderResults(snapshot: ChallengeSnapshot): void {
    const definition = snapshot.definition;
    if (!definition) return;
    const completed = snapshot.status === 'complete';
    const failed = snapshot.status === 'failed';
    elements.results.dataset.status = snapshot.status;
    elements.resultEyebrow.textContent = completed ? 'Shift complete' : failed ? 'Safety review' : 'Shift ended early';
    elements.resultTitle.textContent = definition.title;
    elements.resultGrade.textContent = snapshot.grade;
    elements.resultScore.textContent = `${snapshot.score} / 100`;
    elements.resultReason.textContent = snapshot.completionReason ?? 'Challenge debrief ready.';
    elements.resultThroughput.textContent = `${snapshot.summary.throughputPerHour.toFixed(1)} ops/hr`;
    elements.resultDelay.textContent = `${snapshot.summary.delayPerOperationSeconds.toFixed(0)} sec/op`;
    elements.resultFuel.textContent = `${snapshot.summary.holdingFuelBurnKg.toFixed(0)} kg held · ${snapshot.summary.holdingFuelPercent.toFixed(1)}%`;
    elements.resultSafety.textContent = `${snapshot.summary.safety.score} / 100`;
    elements.resultOperations.textContent = `${snapshot.summary.arrivals} in · ${snapshot.summary.departures} out`;
    elements.resultEmergencies.textContent = `${snapshot.summary.emergencyResolutions} resolved · ${snapshot.summary.goArounds} go-arounds`;
    reconcileObjectives(elements.resultObjectives, resultObjectives, snapshot.objectives);
  }

  function reset(): void {
    renderKey = '';
    previousStatus = 'inactive';
    elements.hud.hidden = true;
    elements.select.disabled = false;
    elements.startButton.disabled = false;
    elements.startButton.textContent = 'Open challenge briefing';
    for (const control of elements.lockedControls) control.disabled = false;
  }

  elements.select.addEventListener('change', () => {
    renderKey = '';
  });

  return { render, renderResults, reset };
}
