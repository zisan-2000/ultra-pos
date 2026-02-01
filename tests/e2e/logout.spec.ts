import { test, expect } from "@playwright/test";

test("logout blocks dashboard access", async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  test.skip(!email || !password, "TEST_EMAIL/TEST_PASSWORD not set");

  await page.goto("/login");
  await page.getByPlaceholder("আপনার ইমেইল").fill(email!);
  await page.getByPlaceholder("পাসওয়ার্ড").fill(password!);
  await page.getByRole("button", { name: "লগইন করি" }).click();

  await page.waitForURL("**/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("button", { name: "Open user menu" }).click();
  await page.getByTestId("logout-button").click();

  await page.waitForURL("**/login");
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/dashboard");
  await page.waitForURL("**/login");
  await expect(page).toHaveURL(/\/login/);
});
