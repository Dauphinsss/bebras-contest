import { test, expect, request } from "@playwright/test";
import { rmSync, writeFileSync } from "node:fs";
import {
  API,
  E2E_CLOCK_FILE,
  SEEDED_TASK,
  loginAdmin,
  createContest,
  joinContest,
  createScoringTask,
  taskBlock,
} from "./support/helpers";

test.afterEach(() => {
  rmSync(E2E_CLOCK_FILE, { force: true });
});

test("rejects a grade that does not match the contest category", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const contest = await createContest(api, headers);

  const group = await api
    .post(`${API}/api/groups`, {
      headers,
      data: { contestId: contest.id, name: "PW Grade" },
    })
    .then((r) => r.json());

  const wrongGrade = contest.picked.grade === "S6" ? "P1" : "S6";

  const wrong = await api.post(`${API}/api/play/join`, {
    data: {
      accessCode: group.accessCode,
      participationMode: "individual",
      grade: wrongGrade,
      memberOneFirstName: "Curso",
      memberOneLastName: "Invalido",
    },
  });

  expect(wrong.status()).toBe(400);
  expect((await wrong.json()).message).toContain(contest.picked.category);

  await api.dispose();
});

test("uses the 17-18 range and S5-S6 grades for Kuntur", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const suffix = Date.now();
  const taskResponse = await api.post(`${API}/api/tasks`, {
    headers,
    data: {
      title: `PW Kuntur ${suffix}`,
      categories: ["Algoritmos y programación"],
      difficulties: { "17–18": "hard" },
      bodyBlocks: [taskBlock(`kuntur-body-${suffix}`, "Contenido")],
      challengeBlocks: [
        taskBlock(`kuntur-challenge-${suffix}`, "Selecciona B"),
      ],
      answerType: "multiple_choice",
      multipleChoiceOrderMode: "fixed",
      answers: [
        { id: "A", blocks: [taskBlock(`kuntur-a-${suffix}`, "Incorrecta")] },
        { id: "B", blocks: [taskBlock(`kuntur-b-${suffix}`, "Correcta")] },
      ],
      correctAnswerId: "B",
      explanation: "B es correcta.",
      status: "Borrador",
    },
  });
  expect(taskResponse.ok(), await taskResponse.text()).toBe(true);
  const task = await taskResponse.json();
  const contest = await createContest(api, headers, {
    category: "Kuntur",
    tasks: [{ taskId: task.id }],
  });

  expect(contest.category).toBe("Kuntur");
  expect(contest.initialScore).toBe(4);
  expect(contest.tasks[0]).toMatchObject({
    difficulty: "hard",
    minScore: -4,
    noAnswerScore: 0,
    maxScore: 12,
  });

  const group = await api
    .post(`${API}/api/groups`, {
      headers,
      data: { contestId: contest.id, name: "PW Kuntur" },
    })
    .then((response) => response.json());
  const publicGroupResponse = await api.get(
    `${API}/api/play/group/${group.accessCode}`,
  );
  expect(publicGroupResponse.ok(), await publicGroupResponse.text()).toBe(true);
  expect((await publicGroupResponse.json()).grades).toEqual([
    expect.objectContaining({ value: "S5", label: "5.º de secundaria" }),
    expect.objectContaining({ value: "S6", label: "6.º de secundaria" }),
  ]);

  for (const grade of ["S5", "S6"]) {
    const join = await api.post(`${API}/api/play/join`, {
      data: {
        accessCode: group.accessCode,
        participationMode: "individual",
        grade,
        memberOneFirstName: grade,
        memberOneLastName: "Kuntur",
      },
    });
    expect(join.status(), await join.text()).toBe(201);
  }

  const wrongGrade = await api.post(`${API}/api/play/join`, {
    data: {
      accessCode: group.accessCode,
      participationMode: "individual",
      grade: "S4",
      memberOneFirstName: "Curso",
      memberOneLastName: "Incorrecto",
    },
  });
  expect(wrongGrade.status()).toBe(400);
  expect((await wrongGrade.json()).message).toContain("Kuntur");

  await api.dispose();
});

test("creates a contest without tasks and schedules every phase", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const now = Date.now();
  const registrationStartsAt = new Date(now + 2 * 60000);
  const registrationEndsAt = new Date(now + 4 * 60000);
  const startsAt = new Date(now + 6 * 60000);
  const endsAt = new Date(now + 70 * 60000);
  const draft = {
    title: `PW Phases ${now}`,
    category: SEEDED_TASK.category,
    durationMinutes: 60,
    registrationStartsAt: registrationStartsAt.toISOString(),
    registrationEndsAt: registrationEndsAt.toISOString(),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    tasks: [] as Array<{ taskId: string }>,
  };

  const createResponse = await api.post(`${API}/api/contests`, {
    headers,
    data: draft,
  });
  expect(createResponse.status(), await createResponse.text()).toBe(201);
  const contest = await createResponse.json();
  expect(contest.tasks).toEqual([]);
  expect(contest.state).toBe("borrador");

  const emptyPublish = await api.post(
    `${API}/api/contests/${contest.id}/publish`,
    { headers },
  );
  expect(emptyPublish.status()).toBe(400);
  expect((await emptyPublish.json()).message).toContain("al menos una tarea");

  const updateResponse = await api.put(`${API}/api/contests/${contest.id}`, {
    headers,
    data: { ...draft, tasks: [{ taskId: SEEDED_TASK.taskId }] },
  });
  expect(updateResponse.ok(), await updateResponse.text()).toBe(true);

  const publish = await api.post(`${API}/api/contests/${contest.id}/publish`, {
    headers,
  });
  expect(publish.ok(), await publish.text()).toBe(true);

  writeFileSync(
    E2E_CLOCK_FILE,
    new Date(registrationStartsAt.getTime() + 1000).toISOString(),
  );
  const registration = await api
    .get(`${API}/api/contests/${contest.id}`, { headers })
    .then((response) => response.json());
  expect(registration.state).toBe("inscripcion");

  const available = await api
    .get(`${API}/api/published-contests`, { headers })
    .then((response) => response.json());
  expect(available.map((item: { id: string }) => item.id)).toContain(
    contest.id,
  );

  const group = await api.post(`${API}/api/groups`, {
    headers,
    data: { contestId: contest.id, name: "PW Inscripción" },
  });
  expect(group.status(), await group.text()).toBe(201);

  writeFileSync(
    E2E_CLOCK_FILE,
    new Date(registrationEndsAt.getTime() + 1000).toISOString(),
  );
  const preparation = await api
    .get(`${API}/api/contests/${contest.id}`, { headers })
    .then((response) => response.json());
  expect(preparation.state).toBe("preparacion");

  const lateGroup = await api.post(`${API}/api/groups`, {
    headers,
    data: { contestId: contest.id, name: "PW Fuera de fase" },
  });
  expect(lateGroup.status()).toBe(409);
  expect((await lateGroup.json()).message).toContain("inscripción ya terminó");

  writeFileSync(
    E2E_CLOCK_FILE,
    new Date(startsAt.getTime() + 1000).toISOString(),
  );
  const running = await api
    .get(`${API}/api/contests/${contest.id}`, { headers })
    .then((response) => response.json());
  expect(running.state).toBe("abierta");

  await api.dispose();
});

test("allows deleting unused contests, groups, participants and tasks", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const task = await createScoringTask(api, headers, "easy", Date.now());
  const contest = await createContest(api, headers, {
    tasks: [{ taskId: task.taskId }],
  });
  const group = await api
    .post(`${API}/api/groups`, {
      headers,
      data: { contestId: contest.id, name: "PW Delete" },
    })
    .then((response) => response.json());
  const join = await api.post(`${API}/api/play/join`, {
    data: {
      accessCode: group.accessCode,
      participationMode: "individual",
      grade: contest.picked.grade,
      memberOneFirstName: "Eliminar",
      memberOneLastName: "Tester",
    },
  });
  expect(join.ok(), await join.text()).toBe(true);
  const personalCode = (await join.json()).personalCode as string;
  const groupDetails = await api
    .get(`${API}/api/groups/${group.id}`, { headers })
    .then((response) => response.json());
  const team = groupDetails.teams.find(
    (candidate: { personalCode: string }) =>
      candidate.personalCode === personalCode,
  );

  const removeTeam = await api.delete(`${API}/api/teams/${team.id}`, {
    headers,
  });
  expect(removeTeam.status(), await removeTeam.text()).toBe(204);

  const removeGroup = await api.delete(`${API}/api/groups/${group.id}`, {
    headers,
  });
  expect(removeGroup.status(), await removeGroup.text()).toBe(204);

  const removeContest = await api.delete(`${API}/api/contests/${contest.id}`, {
    headers,
  });
  expect(removeContest.status(), await removeContest.text()).toBe(204);

  const removeTask = await api.delete(`${API}/api/tasks/${task.taskId}`, {
    headers,
  });
  expect(removeTask.status(), await removeTask.text()).toBe(204);

  await api.dispose();
});

test("protects tasks and played contest records from deletion", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const task = await createScoringTask(api, headers, "easy", Date.now());
  const contest = await createContest(api, headers, {
    tasks: [{ taskId: task.taskId }],
  });
  const group = await api
    .post(`${API}/api/groups`, {
      headers,
      data: { contestId: contest.id, name: "PW Protected" },
    })
    .then((response) => response.json());
  const join = await api.post(`${API}/api/play/join`, {
    data: {
      accessCode: group.accessCode,
      participationMode: "individual",
      grade: contest.picked.grade,
      memberOneFirstName: "Protegido",
      memberOneLastName: "Tester",
    },
  });
  expect(join.ok(), await join.text()).toBe(true);
  const personalCode = (await join.json()).personalCode as string;

  const removeUsedTask = await api.delete(`${API}/api/tasks/${task.taskId}`, {
    headers,
  });
  expect(removeUsedTask.status()).toBe(409);
  expect((await removeUsedTask.json()).message).toContain("desafío");

  const start = await api.post(`${API}/api/play/start`, {
    data: { personalCode },
  });
  expect(start.ok(), await start.text()).toBe(true);
  const submit = await api.post(`${API}/api/play/submit`, {
    data: { personalCode },
  });
  expect(submit.ok(), await submit.text()).toBe(true);

  const groupDetails = await api
    .get(`${API}/api/groups/${group.id}`, { headers })
    .then((response) => response.json());
  const team = groupDetails.teams.find(
    (candidate: { personalCode: string }) =>
      candidate.personalCode === personalCode,
  );

  const removeTeam = await api.delete(`${API}/api/teams/${team.id}`, {
    headers,
  });
  expect(removeTeam.status()).toBe(409);
  expect((await removeTeam.json()).message).toContain("ya rindió");

  const removeGroup = await api.delete(`${API}/api/groups/${group.id}`, {
    headers,
  });
  expect(removeGroup.status()).toBe(409);
  expect((await removeGroup.json()).message).toContain("ya rindieron");

  const removeContest = await api.delete(`${API}/api/contests/${contest.id}`, {
    headers,
  });
  expect(removeContest.status()).toBe(409);
  expect((await removeContest.json()).message).toContain("ya rindieron");

  await api.dispose();
});

test("enforces contest windows for publication and late starts", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);

  const acceptedContest = await createContest(api, headers, {
    durationMinutes: 2,
    startsAt: new Date(Date.now() - 2 * 60000).toISOString(),
    endsAt: new Date(Date.now() + 3 * 60000).toISOString(),
  });
  const acceptedCode = await joinContest(
    api,
    headers,
    acceptedContest.id,
    acceptedContest.picked.grade,
    "Inicio tardio",
  );
  const acceptedStart = await api.post(`${API}/api/play/start`, {
    data: { personalCode: acceptedCode },
  });
  expect(acceptedStart.ok(), await acceptedStart.text()).toBe(true);
  const acceptedAttempt = await api
    .get(`${API}/api/play/attempt/${acceptedCode}`)
    .then((response) => response.json());
  expect(acceptedAttempt.status).toBe("in_progress");
  expect(
    new Date(acceptedAttempt.endsAt).getTime() -
      new Date(acceptedAttempt.startedAt).getTime(),
  ).toBe(2 * 60000);

  const insufficientRemaining = await createContest(api, headers, {
    durationMinutes: 5,
    startsAt: new Date(Date.now() - 10 * 60000).toISOString(),
    endsAt: new Date(Date.now() + 4 * 60000).toISOString(),
  });
  const rejectedCode = await joinContest(
    api,
    headers,
    insufficientRemaining.id,
    insufficientRemaining.picked.grade,
    "Sin tiempo",
  );
  const rejectedStart = await api.post(`${API}/api/play/start`, {
    data: { personalCode: rejectedCode },
  });
  expect(rejectedStart.status()).toBe(409);
  expect((await rejectedStart.json()).message).toContain(
    "no queda tiempo suficiente",
  );

  const shortWindowResponse = await api.post(`${API}/api/contests`, {
    headers,
    data: {
      title: `PW Short Window ${Date.now()}`,
      category: SEEDED_TASK.category,
      durationMinutes: 10,
      startsAt: new Date(Date.now() + 60000).toISOString(),
      endsAt: new Date(Date.now() + 6 * 60000).toISOString(),
      tasks: [{ taskId: SEEDED_TASK.taskId }],
    },
  });
  expect(shortWindowResponse.ok(), await shortWindowResponse.text()).toBe(true);
  const shortWindow = await shortWindowResponse.json();
  const publish = await api.post(
    `${API}/api/contests/${shortWindow.id}/publish`,
    { headers },
  );
  expect(publish.status()).toBe(400);
  expect((await publish.json()).message).toContain("más corta que la duración");

  await api.dispose();
});

test("freezes a contest once it is running", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const contest = await createContest(api, headers);

  const edit = await api.put(`${API}/api/contests/${contest.id}`, {
    headers,
    data: {
      title: "Editada en vivo",
      category: contest.picked.category,
      durationMinutes: 60,
      startsAt: contest.startsAt,
      endsAt: contest.endsAt,
      tasks: contest.tasks.map((task: { taskId: string }) => ({
        taskId: task.taskId,
      })),
    },
  });

  expect(edit.status()).toBe(409);
  expect((await edit.json()).message).toContain("en curso");

  await api.dispose();
});

test("suspends a running contest and blocks every play action", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const contest = await createContest(api, headers);
  const personalCode = await joinContest(
    api,
    headers,
    contest.id,
    contest.picked.grade,
  );
  const latecomerCode = await joinContest(
    api,
    headers,
    contest.id,
    contest.picked.grade,
    "Latecomer",
  );

  await api.post(`${API}/api/play/start`, { data: { personalCode } });

  const suspended = await api.post(
    `${API}/api/contests/${contest.id}/suspend`,
    { headers },
  );
  expect(suspended.ok(), await suspended.text()).toBe(true);
  expect((await suspended.json()).state).toBe("suspendida");

  const attempt = await api
    .get(`${API}/api/play/attempt/${personalCode}`)
    .then((r) => r.json());
  expect(attempt.state).toBe("suspendida");
  expect(attempt.status).toBe("in_progress");
  expect(attempt.suspendedAt).not.toBeNull();

  const answer = await api.post(`${API}/api/play/answer`, {
    data: {
      personalCode,
      taskId: SEEDED_TASK.taskId,
      payload: { selected: ["A"] },
    },
  });
  expect(answer.status()).toBe(409);
  expect((await answer.json()).message).toContain("suspendido");

  const submit = await api.post(`${API}/api/play/submit`, {
    data: { personalCode },
  });
  expect(submit.status()).toBe(409);

  const latecomer = await api.post(`${API}/api/play/start`, {
    data: { personalCode: latecomerCode },
  });
  expect(latecomer.status()).toBe(409);

  const secondSuspend = await api.post(
    `${API}/api/contests/${contest.id}/suspend`,
    { headers },
  );
  expect(secondSuspend.status()).toBe(409);

  await api.dispose();
});

test("gives the paused time back when the contest resumes", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const contest = await createContest(api, headers);
  const personalCode = await joinContest(
    api,
    headers,
    contest.id,
    contest.picked.grade,
  );

  await api.post(`${API}/api/play/start`, { data: { personalCode } });
  const before = await api
    .get(`${API}/api/play/attempt/${personalCode}`)
    .then((r) => r.json());
  const deadlineBefore = new Date(before.endsAt).getTime();

  await api.post(`${API}/api/contests/${contest.id}/suspend`, { headers });

  const pauseMinutes = 10;
  writeFileSync(
    E2E_CLOCK_FILE,
    new Date(Date.now() + pauseMinutes * 60000).toISOString(),
  );

  const resumed = await api.post(`${API}/api/contests/${contest.id}/resume`, {
    headers,
  });
  expect(resumed.ok(), await resumed.text()).toBe(true);
  const resumedContest = await resumed.json();
  expect(resumedContest.state).toBe("abierta");
  expect(resumedContest.suspendedAt).toBeNull();
  expect(resumedContest.resumedAttempts).toBe(1);

  const after = await api
    .get(`${API}/api/play/attempt/${personalCode}`)
    .then((r) => r.json());
  const shiftedMinutes =
    (new Date(after.endsAt).getTime() - deadlineBefore) / 60000;
  expect(shiftedMinutes).toBeGreaterThan(pauseMinutes - 0.5);
  expect(shiftedMinutes).toBeLessThan(pauseMinutes + 0.5);

  const answer = await api.post(`${API}/api/play/answer`, {
    data: {
      personalCode,
      taskId: SEEDED_TASK.taskId,
      payload: { selected: ["A"] },
    },
  });
  expect(answer.status(), await answer.text()).toBe(204);

  const resumeAgain = await api.post(
    `${API}/api/contests/${contest.id}/resume`,
    {
      headers,
    },
  );
  expect(resumeAgain.status()).toBe(409);

  await api.dispose();
});

test("enrolls a complete roster atomically from a spreadsheet", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const contest = await createContest(api, headers, { allowPairs: true });
  const group = await api
    .post(`${API}/api/groups`, {
      headers,
      data: { contestId: contest.id, name: "Grupo planilla" },
    })
    .then((r) => r.json());

  const template = await api.get(
    `${API}/api/groups/${group.id}/roster-template`,
    { headers },
  );
  expect(template.ok(), await template.text()).toBe(true);
  expect(template.headers()["content-type"]).toContain("spreadsheetml");

  const rows = [
    ["Nombres", "Apellidos", "Curso", "Modalidad"],
    ["Ana", "Quispe", contest.picked.grade, "individual"],
    ["Luis", "Mamani", contest.picked.grade, "individual"],
    ["", "", "", ""],
    ["Sin", "", contest.picked.grade, "individual"],
    ["Mal", "Curso", "S6", "individual"],
    ["Ana", "Quispe", contest.picked.grade, "individual"],
  ];
  const csv = rows.map((row) => row.join(",")).join("\n");

  const imported = await api.post(`${API}/api/groups/${group.id}/roster`, {
    headers,
    multipart: {
      file: {
        name: "participantes.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv, "utf8"),
      },
    },
  });
  expect(imported.status(), await imported.text()).toBe(422);
  const result = await imported.json();

  expect(result.code).toBe("ROSTER_VALIDATION_FAILED");
  expect(result.details).toHaveLength(3);
  expect(result.details.map((item: { row: number }) => item.row)).toEqual([
    5, 6, 7,
  ]);

  const teams = await api
    .get(`${API}/api/groups`, { headers })
    .then((r) => r.json());
  const stored = teams.find((item: { id: string }) => item.id === group.id);
  expect(stored.teams).toHaveLength(0);

  const validCsv = [
    [
      "Nombres",
      "Apellidos",
      "Curso",
      "Modalidad",
      "Nombres del compañero",
      "Apellidos del compañero",
    ],
    ["Ana", "Quispe", contest.picked.grade, "individual", "", ""],
    ["Luis", "Mamani", contest.picked.grade, "pareja", "Marta", "Rojas"],
  ]
    .map((row) => row.join(","))
    .join("\n");
  const validImport = await api.post(`${API}/api/groups/${group.id}/roster`, {
    headers,
    multipart: {
      file: {
        name: "participantes-validos.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(validCsv, "utf8"),
      },
    },
  });
  expect(validImport.status(), await validImport.text()).toBe(201);
  const validResult = await validImport.json();
  expect(validResult.created).toHaveLength(2);
  expect(validResult.created[0].name).toBe("Ana Quispe");
  expect(validResult.created[0].personalCode).toBeTruthy();
  expect(validResult.created[1].name).toBe("Luis Mamani");
  expect(validResult.skipped).toEqual([]);

  const otherContest = await createContest(api, headers, { allowPairs: true });
  const templateGroup = await api
    .post(`${API}/api/groups`, {
      headers,
      data: { contestId: otherContest.id, name: "Grupo plantilla" },
    })
    .then((r) => r.json());
  const otherTemplate = await api.get(
    `${API}/api/groups/${templateGroup.id}/roster-template`,
    { headers },
  );
  expect(otherTemplate.ok(), await otherTemplate.text()).toBe(true);
  const roundTrip = await api.post(
    `${API}/api/groups/${templateGroup.id}/roster`,
    {
      headers,
      multipart: {
        file: {
          name: "plantilla.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: await otherTemplate.body(),
        },
      },
    },
  );
  expect(roundTrip.status(), await roundTrip.text()).toBe(400);
  const roundTripResult = await roundTrip.json();
  expect(roundTripResult.code).toBe("ROSTER_EMPTY");

  const wrong = await api.post(`${API}/api/groups/${group.id}/roster`, {
    headers,
    multipart: {
      file: {
        name: "otra.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("Alumno,Grado\nAna,P3", "utf8"),
      },
    },
  });
  expect(wrong.status()).toBe(400);
  expect((await wrong.json()).code).toBe("ROSTER_SHEET_NOT_FOUND");

  await api.dispose();
});
