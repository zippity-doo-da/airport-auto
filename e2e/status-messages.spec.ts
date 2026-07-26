import { expect, test } from "@playwright/test";

test("busy 3x traffic keeps transient notices readable", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Desktop covers the shared wall-clock status coordinator.",
  );
  test.setTimeout(45_000);
  await page.goto(
    "/?airport=ORD&mode=auto&scenario=rush&density=extreme&speed=3&autostart=1&detail=low&renderFps=2",
  );
  await page.waitForFunction(() => window.airportControl?.version === "2.39.0");
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>(".status")?.dataset.messageId,
  );

  const transitions = await page.evaluate(async () => {
    const status = document.querySelector<HTMLElement>(".status");
    if (!status) throw new Error("Status surface is missing.");
    const observed: Array<{
      id: number;
      label: string;
      priority: string;
      shownAt: number;
      minimumVisibleUntil: number;
    }> = [];
    const collect = () => {
      const id = Number(status.dataset.messageId);
      if (!Number.isFinite(id) || observed.at(-1)?.id === id) return;
      observed.push({
        id,
        label: document.querySelector("#status-label")?.textContent ?? "",
        priority: status.dataset.priority ?? "",
        shownAt: Number(status.dataset.shownAt),
        minimumVisibleUntil: Number(status.dataset.minimumVisibleUntil),
      });
    };
    collect();
    await new Promise<void>((resolve) => {
      const interval = window.setInterval(collect, 50);
      window.setTimeout(() => {
        window.clearInterval(interval);
        collect();
        resolve();
      }, 12_000);
    });
    return observed;
  });

  expect(transitions.length).toBeGreaterThan(1);
  for (let index = 1; index < transitions.length; index += 1) {
    const previous = transitions[index - 1];
    const next = transitions[index];
    expect(next.id).not.toBe(previous.id);
    if (next.priority !== "critical") {
      expect(next.shownAt).toBeGreaterThanOrEqual(
        previous.minimumVisibleUntil - 1,
      );
    }
  }
  expect(new Set(transitions.map((transition) => transition.id)).size).toBe(
    transitions.length,
  );
  expect(
    transitions.every((transition) => transition.label.length > 0),
  ).toBeTruthy();
});
