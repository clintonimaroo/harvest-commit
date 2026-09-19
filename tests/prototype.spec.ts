import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Today's harvest." }),
  ).toBeVisible();
});

test("review, adjust, approve, export, and record an actual harvest", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", {
      name: "Harvest 108 boxes. Start with Field B.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page.getByLabel("Boxes to harvest").fill("90");
  await expect(page.locator(".edit-preview")).toContainText("18 boxes");
  await page
    .getByLabel("A note for the crew")
    .fill("Leave the upper rows for tomorrow.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Harvest 90 boxes. 18 boxes still needed.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve plan", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "18 boxes of customer demand are not covered",
  );
  await page
    .getByRole("button", { name: "Approve with shortfall", exact: true })
    .click();
  await expect(page.locator(".badge")).toContainText("Approved");
  await page
    .getByRole("button", { name: "View crew sheet", exact: true })
    .click();
  await expect(page.locator(".crew-sheet")).toContainText("APPROVED PLAN");
  await expect(page.locator(".crew-sheet")).toContainText(
    "Leave the upper rows for tomorrow.",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  expect((await download).suggestedFilename()).toBe(
    "Harvest Commit - September 19 Crew Sheet.txt",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Harvest log", exact: true }).click();
  await page
    .getByRole("button", { name: "Record actual harvest", exact: true })
    .click();
  await page.getByLabel("Boxes harvested").fill("88");
  await page.getByLabel("End-of-day note").fill("Finished before the rain.");
  await page.getByRole("button", { name: "Save actual harvest" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Today, Sep 19" }),
  ).toContainText("88 boxes");
  await expect(
    page.getByRole("row").filter({ hasText: "Today, Sep 19" }),
  ).toContainText("-2");
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Harvest 90 boxes. 18 boxes still needed.",
    }),
  ).toBeVisible();
  await expect(page.locator(".badge")).toContainText("Approved");
});

test("pasted orders are reviewed before they change demand, then can be filtered and removed", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Orders 6", exact: true }).click();
  await page.getByRole("button", { name: "Add order", exact: true }).click();
  await page
    .getByRole("button", { name: "Paste a message", exact: true })
    .click();
  await page
    .getByLabel("Customer message")
    .fill("Corner Cafe: 24 boxes of tomatoes for today, please.");
  await page.getByRole("button", { name: "Review order details" }).click();
  await expect(page.getByLabel("Customer name")).toHaveValue("Corner Cafe");
  await expect(page.getByLabel("Tomato boxes")).toHaveValue("24");
  await page
    .getByRole("button", { name: "Add to today’s orders", exact: true })
    .click();
  await page.getByLabel("Find a customer").fill("Corner");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("24");
  await page.getByLabel("Filter by order source").selectOption("Spreadsheet");
  await expect(
    page.getByRole("heading", { name: "No orders found" }),
  ).toBeVisible();
  await page.getByLabel("Filter by order source").selectOption("All sources");
  await page.getByRole("button", { name: "Edit Corner Cafe" }).click();
  await page.getByRole("button", { name: "Remove order", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm removal", exact: true })
    .click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Harvest 108 boxes. Start with Field B.",
    }),
  ).toBeVisible();
});

test("lower field yields change the plan and reject inverted yield ranges", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Fields", exact: true }).click();
  await page
    .getByRole("button", { name: "Update", exact: true })
    .first()
    .click();
  await page.getByLabel("Expected usable boxes").fill("40");
  await page
    .getByRole("button", { name: "Save observation", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "between the low and high estimates",
  );
  await page.getByLabel("Low estimate").fill("35");
  await page.getByLabel("High estimate").fill("45");
  await page.getByLabel("Field note").fill("Lower yield after the field walk.");
  await page
    .getByRole("button", { name: "Save observation", exact: true })
    .click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Harvest 79 boxes. 29 boxes still needed.",
    }),
  ).toBeVisible();
  await expect(page.locator(".field-note-card")).toContainText(
    "Lower yield after the field walk.",
  );
});

test("crew availability and the harvest cutoff cap the plan and invalidate prior approval", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Approve plan", exact: true }).click();
  await page
    .getByRole("button", { name: "Approve commitment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Update inputs", exact: true })
    .click();
  await page.getByLabel("People on harvest").fill("2");
  await page.getByLabel("Harvest cutoff").selectOption("10");
  await page
    .getByRole("button", { name: "Update the plan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Harvest 16 boxes. 92 boxes still needed.",
    }),
  ).toBeVisible();
  await expect(page.locator(".badge")).toContainText("Ready for review");
  await expect(page.locator(".weather-cutoff")).toContainText(
    "Harvest cutoff 10 AM",
  );
});

test("installed app reloads and edits orders with the network offline", async ({
  page,
  context,
}) => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Harvest 108 boxes. Start with Field B.",
    }),
  ).toBeVisible();
  await expect(page.locator(".save-status")).toContainText("Offline");
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page.getByLabel("Boxes to harvest").fill("100");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Harvest 100 boxes. 8 boxes still needed.",
    }),
  ).toBeVisible();
});

test("mobile navigation, dialogs and all screens fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", {
      name: "Harvest 108 boxes. Start with Field B.",
    }),
  ).toBeVisible();
  for (const name of ["Orders 6", "Fields", "Harvest log", "Today"]) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  const dialog = await page.getByRole("dialog").boundingBox();
  expect(dialog!.x).toBeGreaterThanOrEqual(0);
  expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("recorded actual harvest survives a later change to the plan", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Approve plan", exact: true }).click();
  await page
    .getByRole("button", { name: "Approve commitment", exact: true })
    .click();
  await page.getByRole("button", { name: "Harvest log", exact: true }).click();
  await page
    .getByRole("button", { name: "Record actual harvest", exact: true })
    .click();
  await page.getByLabel("Boxes harvested").fill("106");
  await page
    .getByLabel("End-of-day note")
    .fill("Saved count from the first crew.");
  await page.getByRole("button", { name: "Save actual harvest" }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page.getByLabel("Boxes to harvest").fill("100");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Harvest log", exact: true }).click();
  const oldRecord = page
    .getByRole("row")
    .filter({ hasText: "Earlier commitment" });
  await expect(oldRecord).toContainText("106 boxes");
  await expect(oldRecord).toContainText("Saved count from the first crew.");
});

test("source review replaces an amended order once and preserves the original message", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Riverbend Kitchen", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Tomato boxes", { exact: true })).toHaveValue(
    "36",
  );
  await expect(page.locator(".review-impact")).toContainText("130");
  await page.screenshot({
    path: "work/messages-final-desktop.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "Confirm replacement" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm replacement" }).click();
  await expect(
    page.getByRole("heading", { name: "This source has been reviewed." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Orders 6", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Riverbend Kitchen", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("instead of 32");
  await expect(page.getByLabel("Tomato boxes", { exact: true })).toHaveValue(
    "36",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "This source has been reviewed." }),
  ).toBeVisible();
});

test("demo SMS reply approves the matching plan and an input change needs a new SMS", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: /Put the plan in the farmer/ })
    .click();
  await page.screenshot({ path: "work/sms-final-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Send to demo phone" }).click();
  await expect(page.getByLabel("Farmer reply")).toHaveValue(
    /^APPROVE [A-F0-9]{6}$/,
  );
  await page.getByRole("button", { name: "Send demo reply" }).click();
  await expect(
    page.getByText("Farmer approved", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.locator(".badge")).toContainText("Approved");
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page.getByLabel("Boxes to harvest").fill("100");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".badge")).toContainText("Ready for review");
  await page
    .getByRole("button", { name: /Put the plan in the farmer/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Send to demo phone" }),
  ).toBeVisible();
  await expect(page.locator(".notification-title")).toContainText(
    "100 tomato boxes",
  );
});

test("SMS edit request is reviewed before sending a revised commitment", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: /Put the plan in the farmer/ })
    .click();
  await page.getByRole("button", { name: "Send to demo phone" }).click();
  await expect(page.getByLabel("Farmer reply")).toHaveValue(
    /^APPROVE [A-F0-9]{6}$/,
  );
  const code = (await page.getByLabel("Farmer reply").inputValue()).split(
    " ",
  )[1];
  await page.getByLabel("Farmer reply").fill(`EDIT ${code} 100`);
  await page.getByRole("button", { name: "Send demo reply" }).click();
  await page.getByRole("button", { name: "Apply 100-box request" }).click();
  await expect(page.locator(".notification-title")).toContainText(
    "100 tomato boxes",
  );
  await expect(
    page.getByRole("button", { name: "Send to demo phone" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.locator(".badge")).toContainText("Ready for review");
});

test("source review and lock-screen preview fit a narrow phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: /Put the plan in the farmer/ })
    .click();
  await expect(page.locator(".lock-clock")).toContainText("6:00");
  const phone = await page.locator(".sms-phone").boundingBox();
  expect(phone!.x).toBeGreaterThanOrEqual(0);
  expect(phone!.x + phone!.width).toBeLessThanOrEqual(390);
  await page.getByRole("tab", { name: /Order inbox/ }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "work/sms-mobile-review.png", fullPage: true });
  await page.getByRole("tab", { name: "Farmer SMS" }).click();
  await page.screenshot({ path: "work/sms-mobile-phone.png", fullPage: true });
});

test("message composer is a dialog and saving a source does not change demand", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  await page
    .getByRole("button", { name: "Paste a message", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel("Message to review")
    .fill("Hilltop Cafe: 9 boxes of tomatoes for today.");
  await page.screenshot({
    path: "work/messages-final-compose.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open for review" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue(
    "Hilltop Cafe",
  );
  await expect(page.getByLabel("Tomato boxes", { exact: true })).toHaveValue(
    "9",
  );
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Harvest 108 boxes. Start with Field B.",
    }),
  ).toBeVisible();
});
