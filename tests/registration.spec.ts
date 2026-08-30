import { test, expect, request } from "@playwright/test";
import {
  API,
  loginAdmin,
  uploadedDocuments,
  removeNewUploads,
  registrationFields,
  VALID_PDF,
  VALID_JPG,
  VALID_PNG,
} from "./support/helpers";

test("rejects documents whose content does not match the extension", async () => {
  const api = await request.newContext();
  const response = await api.post(`${API}/api/auth/register`, {
    multipart: {
      firstName: "Archivo",
      lastName: "Disfrazado",
      email: `archivo-${Date.now()}@example.com`,
      password: "segura123",
      schoolName: "Colegio manual",
      institutionType: "school",
      phone: "70000000",
      letter: {
        name: "carta.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("esto no es un documento PDF"),
      },
    },
  });

  expect(response.status()).toBe(400);
  expect((await response.json()).message).toContain("contenido del documento");
  await api.dispose();
});

test("registers school and homeschool teachers with valid documents", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const previousUploads = uploadedDocuments();
  const schoolEmail = `colegio-${Date.now()}@example.com`;
  const homeschoolEmail = `casa-${Date.now()}@example.com`;

  try {
    const school = await api.post(`${API}/api/auth/register`, {
      multipart: {
        ...registrationFields(schoolEmail, "school"),
        letter: VALID_PDF,
      },
    });
    expect(school.status(), await school.text()).toBe(201);

    const homeschool = await api.post(`${API}/api/auth/register`, {
      multipart: {
        ...registrationFields(homeschoolEmail, "homeschool"),
        idFront: VALID_JPG,
        idBack: VALID_PNG,
      },
    });
    expect(homeschool.status(), await homeschool.text()).toBe(201);

    const teachersResponse = await api.get(`${API}/api/users/maestros`, {
      headers,
    });
    expect(teachersResponse.ok(), await teachersResponse.text()).toBe(true);
    const teachers = await teachersResponse.json();
    expect(teachers).toContainEqual(
      expect.objectContaining({
        email: schoolEmail,
        institutionType: "school",
        hasLetter: true,
        hasIdFront: false,
        hasIdBack: false,
      }),
    );
    expect(teachers).toContainEqual(
      expect.objectContaining({
        email: homeschoolEmail,
        institutionType: "homeschool",
        hasLetter: false,
        hasIdFront: true,
        hasIdBack: true,
      }),
    );
  } finally {
    removeNewUploads(previousUploads);
    await api.dispose();
  }
});

test("rejects incomplete, unsupported and oversized document uploads cleanly", async () => {
  const api = await request.newContext();
  const previousUploads = uploadedDocuments();

  const assertRejectedWithoutUploads = async (
    multipart: Record<string, string | typeof VALID_PDF>,
    expectedMessage: string,
  ) => {
    const response = await api.post(`${API}/api/auth/register`, { multipart });
    expect(response.status()).toBe(400);
    expect((await response.json()).message).toContain(expectedMessage);
    expect(uploadedDocuments()).toEqual(previousUploads);
  };

  try {
    await assertRejectedWithoutUploads(
      registrationFields(`sin-carta-${Date.now()}@example.com`, "school"),
      "carta de autorización",
    );
    await assertRejectedWithoutUploads(
      {
        ...registrationFields(`carnet-${Date.now()}@example.com`, "homeschool"),
        idFront: VALID_JPG,
      },
      "anverso y el reverso",
    );
    await assertRejectedWithoutUploads(
      {
        ...registrationFields(`tipo-${Date.now()}@example.com`, "school"),
        letter: {
          name: "carta.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("documento"),
        },
      },
      "PDF o una imagen",
    );
    await assertRejectedWithoutUploads(
      {
        ...registrationFields(`grande-${Date.now()}@example.com`, "school"),
        letter: {
          name: "carta.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 0x25),
        },
      },
      "5 MB",
    );
    await assertRejectedWithoutUploads(
      {
        ...registrationFields(`campos-${Date.now()}@example.com`, "school"),
        firstName: "",
        letter: VALID_PDF,
      },
      "son obligatorios",
    );
    await assertRejectedWithoutUploads(
      {
        ...registrationFields(`parcial-${Date.now()}@example.com`, "school"),
        letter: VALID_PDF,
        idFront: {
          name: "carnet.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("documento"),
        },
      },
      "PDF o una imagen",
    );
  } finally {
    removeNewUploads(previousUploads);
    await api.dispose();
  }
});
