import { expect, test } from "@playwright/test";

test.describe("mission control", () => {
  test("shows the crew, its pipeline and what waits on you", async ({
    page,
  }) => {
    await page.goto("/?crew=ENG-412");
    await expect(
      page.getByText("Saved replies for the shared inbox").first(),
    ).toBeVisible();
    await expect(page.getByText("waiting on you").first()).toBeVisible();
    await expect(page.getByText("Needs input").first()).toBeVisible();
    for (const seat of [
      "Manager",
      "Tech lead",
      "Designer",
      "Backend",
      "Frontend",
      "AI dev",
    ]) {
      await expect(page.getByText(seat, { exact: true }).first()).toBeVisible();
    }
    // Phase and gate labels come from the skill's SKILL.md.
    await expect(page.getByText("Gate B · start development")).toBeVisible();
  });

  test("marks the runs the ticker keeps alive as running", async ({ page }) => {
    await page.goto("/?crew=ENG-412");
    await expect(page.getByText("Implement ENG-415").first()).toBeVisible();
    await expect(page.getByText("Running").first()).toBeVisible();
  });

  test("shows an initiative paused at its gate with the open question", async ({
    page,
  }) => {
    await page.goto("/?crew=ENG-398");
    await expect(page.getByText("Paused at Gate A")).toBeVisible();
    await expect(
      page.getByText("Question waiting for your answer").first(),
    ).toBeVisible();
  });

  test("opens the orchestrator as a chat", async ({ page }) => {
    await page.goto("/?crew=ENG-412&chat=1");
    await expect(page.getByPlaceholder("Read-only")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
  });

  test("lays a hand-back out by field instead of as raw text", async ({
    page,
  }) => {
    await page.goto("/?crew=ENG-412&chat=1");
    const card = page
      .getByTestId("report-card")
      .filter({ hasText: "top three as chips" })
      .first();
    await expect(card).toBeVisible();
    await expect(card.getByText("Question", { exact: true })).toBeVisible();
    // The raw block stays one click away, folded.
    await expect(card.getByText("STATUS: NEEDS_INPUT")).toBeHidden();
    await expect(
      page
        .getByTestId("report-card")
        .getByRole("link", { name: /#88/ })
        .first(),
    ).toBeVisible();
  });

  test("keeps every seat on one row when the chat narrows the graph", async ({
    page,
  }) => {
    await page.goto("/?crew=ENG-412&chat=1");
    await expect(page.locator('[data-node="seat:tech-lead"]')).toBeVisible();
    // Layout position, not the painted one: seats rise in with a transform.
    const tops = await page
      .locator('[data-node^="seat:"]')
      .evaluateAll((seats) => [
        ...new Set(seats.map((seat) => (seat as HTMLElement).offsetTop)),
      ]);
    expect(tops).toHaveLength(1);
  });
});

test("initiatives lists the active ones and folds the finished one away", async ({
  page,
}) => {
  await page.goto("/initiatives");
  await expect(
    page.getByText("ENG-412 · Saved replies for the shared inbox"),
  ).toBeVisible();
  await expect(
    page.getByText("ENG-398 · Bulk export of contacts"),
  ).toBeVisible();
  await expect(
    page.getByText("ENG-371 · Audit log for workspace settings"),
  ).toBeHidden();
});

test("all sessions shows the swim lanes and the plain session", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  await page.goto("/live");
  await expect(page.getByText("Agents at work")).toBeVisible();
  await expect(
    page.getByText("Fix the flaky date picker test").first(),
  ).toBeVisible();
  // The clocks on this page once made the server and browser renders disagree.
  expect(errors.filter((text) => /hydrat/i.test(text))).toEqual([]);
});

test("costs adds up per initiative and per role", async ({ page }) => {
  await page.goto("/costs");
  await expect(page.getByTestId("total-cost")).toHaveText(/^\$\d+\.\d{2}$/);
  const cards = page.getByTestId("crew-cost");
  await expect(cards.first()).toContainText("ENG-412");
  expect(await cards.count()).toBeGreaterThanOrEqual(2);
  await expect(cards.first().getByText("Tech lead")).toBeVisible();
  await expect(cards.first().getByText("ENG-414")).toBeVisible();
});

test("an agent page shows its report and its stream", async ({ page }) => {
  await page.goto("/agents/a000000000000000c");
  await expect(page.getByText("ENG-416").first()).toBeVisible();
  await expect(page.getByText(/top three/).first()).toBeVisible();
});

test.describe("write paths in demo mode", () => {
  test("starting a session is refused", async ({ request, baseURL }) => {
    const response = await request.post("/api/sessions", {
      headers: { origin: baseURL ?? "", "content-type": "application/json" },
      data: { kind: "session", target: "api", prompt: "hi", preview: true },
    });
    expect(response.status()).toBe(403);
  });

  test("a request from another origin is refused before anything else", async ({
    request,
  }) => {
    const response = await request.post("/api/sessions", {
      headers: {
        origin: "https://example.com",
        "content-type": "application/json",
      },
      data: {},
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error).toContain("own pages");
  });
});
