import {
  buildDailyChallengeLink,
  dailyChallengePlan,
  type DailyChallengePlan,
} from "../simulation/dailyChallenge";

export interface CommunityPanelOptions {
  currentUrl: string;
  now?: Date;
  plan?: DailyChallengePlan;
  loadDailyChallenge: (plan: DailyChallengePlan) => boolean;
  announce: (label: string, detail: string, warning?: boolean) => void;
  writeClipboard?: (value: string) => Promise<void>;
}

export interface CommunityPanelSnapshot {
  daily: DailyChallengePlan;
  classroomLink: string;
  sharing: {
    independentClassroomBoards: true;
    authenticatedSharedStations: true;
    accountsRequiredForDailyChallenge: false;
    uploadsScores: false;
    publicLeaderboard: "deferred-by-product-decision";
  };
}

export interface CommunityPanel {
  snapshot(): CommunityPanelSnapshot;
  loadDailyChallenge(): boolean;
  copyClassroomLink(): Promise<boolean>;
  dispose(): void;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing community control ${selector}`);
  return element;
}

export function createCommunityPanel(
  root: HTMLElement,
  options: CommunityPanelOptions,
): CommunityPanel {
  const plan = options.plan ?? dailyChallengePlan(options.now ?? new Date());
  const classroomLink = buildDailyChallengeLink(options.currentUrl, plan, {
    classroom: true,
  });
  const title = required<HTMLElement>(root, "[data-daily-title]");
  const detail = required<HTMLElement>(root, "[data-daily-detail]");
  const load = required<HTMLButtonElement>(root, "[data-daily-load]");
  const copy = required<HTMLButtonElement>(root, "[data-daily-copy]");
  const open = required<HTMLAnchorElement>(root, "[data-daily-open]");
  const status = required<HTMLElement>(root, "[data-daily-status]");
  const writeClipboard =
    options.writeClipboard ??
    ((value: string) => {
      if (!navigator.clipboard?.writeText) {
        return Promise.reject(
          new Error("Clipboard access is unavailable in this browser."),
        );
      }
      return navigator.clipboard.writeText(value);
    });

  title.textContent = `${plan.airportCode} · ${plan.challengeTitle}`;
  detail.textContent = `${plan.date} UTC · seed ${plan.seed.toLocaleString()} · Assisted Supervisor`;
  open.href = classroomLink;
  status.textContent =
    "Everyone opening the link receives the same board. No account, identity, or score upload.";

  const loadDailyChallenge = (): boolean => {
    const accepted = options.loadDailyChallenge(plan);
    options.announce(
      accepted ? "Daily shift loaded" : "Daily shift unavailable",
      accepted
        ? `${plan.airportCode} · ${plan.challengeTitle} · ${plan.date} UTC. Review the briefing before starting.`
        : "The current operation could not be replaced with the daily challenge.",
      !accepted,
    );
    return accepted;
  };

  const copyClassroomLink = async (): Promise<boolean> => {
    try {
      await writeClipboard(classroomLink);
      status.textContent =
        "Classroom link copied. It contains only the date, airport, seed, rules, station, and challenge.";
      options.announce(
        "Classroom link copied",
        "No credentials, identity, score, or replay data were included.",
      );
      return true;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Clipboard access failed.";
      status.textContent = `${reason} Use “Open share link” and copy it from the browser.`;
      options.announce("Classroom link not copied", status.textContent, true);
      return false;
    }
  };

  const onLoad = (): void => {
    loadDailyChallenge();
  };
  const onCopy = (): void => {
    void copyClassroomLink();
  };
  load.addEventListener("click", onLoad);
  copy.addEventListener("click", onCopy);

  return {
    snapshot: () => ({
      daily: { ...plan },
      classroomLink,
      sharing: {
        independentClassroomBoards: true,
        authenticatedSharedStations: true,
        accountsRequiredForDailyChallenge: false,
        uploadsScores: false,
        publicLeaderboard: "deferred-by-product-decision",
      },
    }),
    loadDailyChallenge,
    copyClassroomLink,
    dispose() {
      load.removeEventListener("click", onLoad);
      copy.removeEventListener("click", onCopy);
    },
  };
}
