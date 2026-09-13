const emulator = "http://127.0.0.1:9099";
const projectId = "bebras-bo-staging";

export default async function globalSetup() {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Faltan las credenciales del admin E2E.");
  }

  const response = await fetch(
    `${emulator}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer owner",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        localId: "bebras-e2e-admin",
        email,
        emailVerified: true,
        password,
        displayName: "Bebras E2E Admin",
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `No se pudo crear el admin en Firebase Auth Emulator (${response.status}).`,
    );
  }
}
