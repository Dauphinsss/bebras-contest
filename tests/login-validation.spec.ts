import { test, expect } from "@playwright/test";

import { ADMIN } from "./support/helpers";

test("associates login errors and focuses the first invalid field", async ({
  page,
}) => {
  await page.goto("/login");
  await page.waitForFunction(
    () => {
      const island = document.querySelector(
        'astro-island[component-url*="login-form"]',
      );
      return island !== null && !island.hasAttribute("ssr");
    },
    null,
    { timeout: 30000 },
  );

  const email = page.getByRole("textbox", { name: "Correo", exact: true });
  const password = page.getByLabel("Contraseña", { exact: true });
  const submit = page.getByRole("button", { name: "Entrar", exact: true });

  await submit.click();

  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAttribute("aria-describedby", "login-email-error");
  await expect(page.locator("#login-email-error")).toHaveText(
    "Ingresa tu correo.",
  );
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAttribute(
    "aria-describedby",
    "login-password-error",
  );
  await expect(page.locator("#login-password-error")).toHaveText(
    "Ingresa tu contraseña.",
  );

  await email.fill(ADMIN.email);
  await expect(email).toHaveAttribute("aria-invalid", "false");
  await expect(email).not.toHaveAttribute("aria-describedby", /.+/);
  await expect(page.locator("#login-email-error")).toHaveCount(0);

  await submit.click();
  await expect(password).toBeFocused();

  await password.fill("contraseña-incorrecta");
  await submit.click();

  const credentialsError = page
    .getByRole("alert")
    .filter({ hasText: "Credenciales inválidas." });
  await expect(credentialsError).toBeVisible();
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("aria-invalid", "false");
  await expect(password).toHaveAttribute("aria-invalid", "false");

  await password.fill(ADMIN.password);
  await expect(credentialsError).toHaveCount(0);
  await submit.click();

  await expect(page).toHaveURL(/\/competencias\/?$/, { timeout: 15000 });
});
