import type { DigitalClearanceSnapshot } from "../simulation/digitalClearances";

export interface DigitalClearancePanelElements {
  count: HTMLElement;
  list: HTMLElement;
  views: HTMLElement;
}

export type DigitalClearancePanelView = "action" | "history" | "all";

export function isDigitalClearancePanelView(
  value: string,
): value is DigitalClearancePanelView {
  return value === "action" || value === "history" || value === "all";
}

export function digitalClearancePanelKey(
  snapshot: DigitalClearanceSnapshot,
  view: DigitalClearancePanelView,
): string {
  return `${view}|${snapshot.messages
    .map((message) =>
      [
        message.id,
        message.status,
        message.detail,
        message.deliveredAtSeconds,
        message.responseDueSeconds,
      ].join(":"),
    )
    .join("|")}`;
}

export function renderDigitalClearancePanel(
  elements: DigitalClearancePanelElements,
  snapshot: DigitalClearanceSnapshot,
  view: DigitalClearancePanelView,
): void {
  const actionable = messagesForView(snapshot, "action").length;
  elements.count.textContent = actionable
    ? `${actionable} need action`
    : "No action messages";
  for (const button of elements.views.querySelectorAll<HTMLButtonElement>(
    "[data-digital-clearance-view]",
  )) {
    const active = button.dataset.digitalClearanceView === view;
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("is-active", active);
  }
  const messages = messagesForView(snapshot, view);
  if (!messages.length) {
    const empty = document.createElement("p");
    empty.className = "digital-clearance__empty";
    empty.textContent =
      view === "action"
        ? "No digital messages need controller action."
        : view === "history"
          ? "No completed clearance history in this shift."
          : "No digital-clearance messages in this shift.";
    elements.list.replaceChildren(empty);
    return;
  }
  elements.list.replaceChildren(
    ...messages.map((message) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "digital-clearance__message";
      row.dataset.status = message.status;
      row.dataset.clearanceFlightId = String(message.flightId);
      row.dataset.clearanceCommandId = message.commandId;
      row.setAttribute(
        "aria-label",
        `Focus ${message.callsign} ${message.status} ${message.kind.replace("-", " ")} message. ${message.detail}`,
      );
      const heading = document.createElement("div");
      const title = document.createElement("b");
      title.textContent = `${message.callsign} · ${message.kind.replace("-", " ").toUpperCase()}`;
      const status = document.createElement("span");
      status.textContent =
        message.kind === "revision"
          ? "RECORDED"
          : message.status.replace("-", " ").toUpperCase();
      heading.append(title, status);
      const route = document.createElement("p");
      route.textContent = message.route.length
        ? message.route.join(" › ")
        : Object.entries(message.parameters)
            .map(([key, value]) => `${key} ${value}`)
            .join(" · ") || "No additional parameters";
      const detail = document.createElement("small");
      detail.textContent = `${elapsedLabel(message.createdAtSeconds)} · ${message.authority.toUpperCase()} · R${message.revision} · ${message.detail}`;
      row.append(heading, route, detail);
      return row;
    }),
  );
}

export function messagesForView(
  snapshot: DigitalClearanceSnapshot,
  view: DigitalClearancePanelView,
) {
  if (view === "all") return snapshot.messages;
  if (view === "action")
    return snapshot.messages.filter((message) =>
      ["draft", "sent", "delivered", "standby", "unable", "timed-out"].includes(
        message.status,
      ),
    );
  return snapshot.messages.filter(
    (message) =>
      message.kind === "revision" ||
      ["wilco", "unable", "superseded", "timed-out", "cancelled"].includes(
        message.status,
      ),
  );
}

function elapsedLabel(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `T+${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
