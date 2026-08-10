import type { DigitalClearanceSnapshot } from "../simulation/digitalClearances";

export interface DigitalClearancePanelElements {
  count: HTMLElement;
  list: HTMLElement;
}

export function digitalClearancePanelKey(
  snapshot: DigitalClearanceSnapshot,
): string {
  return snapshot.messages
    .map((message) =>
      [
        message.id,
        message.status,
        message.detail,
        message.deliveredAtSeconds,
        message.responseDueSeconds,
      ].join(":"),
    )
    .join("|");
}

export function renderDigitalClearancePanel(
  elements: DigitalClearancePanelElements,
  snapshot: DigitalClearanceSnapshot,
): void {
  const open = snapshot.messages.filter(
    (message) =>
      message.status === "draft" ||
      message.status === "sent" ||
      message.status === "delivered",
  ).length;
  elements.count.textContent = open ? `${open} active` : "No active messages";
  if (!snapshot.messages.length) {
    const empty = document.createElement("p");
    empty.className = "digital-clearance__empty";
    empty.textContent = "No route-clearance messages in this shift.";
    elements.list.replaceChildren(empty);
    return;
  }
  elements.list.replaceChildren(
    ...snapshot.messages.slice(0, 12).map((message) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "digital-clearance__message";
      row.dataset.status = message.status;
      row.dataset.clearanceFlightId = String(message.flightId);
      row.setAttribute(
        "aria-label",
        `Focus ${message.callsign} ${message.status} ${message.kind.replace("-", " ")} message. ${message.detail}`,
      );
      const heading = document.createElement("div");
      const title = document.createElement("b");
      title.textContent = `${message.callsign} · ${message.kind.replace("-", " ").toUpperCase()}`;
      const status = document.createElement("span");
      status.textContent = message.status.replace("-", " ").toUpperCase();
      heading.append(title, status);
      const route = document.createElement("p");
      route.textContent = message.route.length
        ? message.route.join(" › ")
        : Object.entries(message.parameters)
            .map(([key, value]) => `${key} ${value}`)
            .join(" · ") || "No additional parameters";
      const detail = document.createElement("small");
      detail.textContent = `${message.authority.toUpperCase()} · R${message.revision} · ${message.detail}`;
      row.append(heading, route, detail);
      return row;
    }),
  );
}
