const base = "http://localhost:3000";
const j = (r) => r.json();

function correctSelection(correctAnswerId) {
  const raw = String(correctAnswerId || "").trim();
  if (raw.startsWith("any:")) return [raw.slice(4).split(",")[0].trim()];
  if (raw.startsWith("all:"))
    return raw.slice(4).split(",").map((s) => s.trim()).filter(Boolean);
  return [raw];
}

const login = await fetch(base + "/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "marko@bebras.bo", password: "bebras2026" }),
}).then(j);
const auth = {
  authorization: "Bearer " + login.token,
  "content-type": "application/json",
};

const tasks = await fetch(base + "/api/tasks", { headers: auth }).then(j);
const tid = tasks[0].id;
const task = await fetch(base + "/api/tasks/" + tid, { headers: auth }).then(j);
console.log("task", tid, task.answerType, "correct:", task.correctAnswerId);

const starts = new Date(Date.now() - 3600000).toISOString();
const ends = new Date(Date.now() + 7200000).toISOString();
const contest = await fetch(base + "/api/contests", {
  method: "POST",
  headers: auth,
  body: JSON.stringify({
    title: "Eval Test",
    category: "Capibara",
    durationMinutes: 60,
    startsAt: starts,
    endsAt: ends,
    allowPairs: false,
    showFeedback: true,
    showSolutions: true,
    showTotalScore: true,
    tasks: [{ taskId: tid, minScore: -2, noAnswerScore: 0, maxScore: 6 }],
  }),
}).then(j);
await fetch(base + "/api/contests/" + contest.id + "/publish", {
  method: "POST",
  headers: auth,
});
const cstate = await fetch(base + "/api/contests/" + contest.id, {
  headers: auth,
}).then(j);
console.log("contest", contest.id, "state", cstate.state);

const group = await fetch(base + "/api/groups", {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ contestId: contest.id, name: "Eval G" }),
}).then(j);
const join = await fetch(base + "/api/play/join", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    accessCode: group.accessCode,
    participationMode: "individual",
    memberOneFirstName: "Eva",
    memberOneLastName: "Luna",
  }),
}).then(j);
const pc = join.personalCode;
console.log("group", group.accessCode, "personalCode", pc);

const start = await fetch(base + "/api/play/start", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ personalCode: pc }),
});
console.log("start", start.status);

let st = await fetch(base + "/api/play/attempt/" + pc).then(j);
console.log("attempt status", st.status, "tasks", st.tasks.length);

let payload;
if (task.answerType === "multiple_choice")
  payload = { selected: correctSelection(task.correctAnswerId) };
else if (task.answerType === "short_text") payload = { text: task.shortAnswer };
else if (task.answerType === "range")
  payload = { value: task.rangeAnswers?.[0]?.min ?? 0 };
else payload = {};
console.log("answering", JSON.stringify(payload));

const ans = await fetch(base + "/api/play/answer", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ personalCode: pc, taskId: tid, payload }),
});
console.log("answer", ans.status);

const sub = await fetch(base + "/api/play/submit", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ personalCode: pc }),
});
console.log("submit", sub.status);

st = await fetch(base + "/api/play/attempt/" + pc).then(j);
console.log(
  "RESULT status=" +
    st.status +
    " score=" +
    st.result?.totalScore +
    " correct=" +
    st.result?.correctCount +
    " answered=" +
    st.result?.answeredCount +
    " rank=" +
    st.result?.rankPosition,
);

const results = await fetch(base + "/api/contests/" + contest.id + "/results", {
  headers: auth,
}).then(j);
console.log(
  "RANKING",
  results.rows
    .map((r) => "#" + r.rankPosition + " " + r.memberOneFirstName + "=" + r.totalScore)
    .join(" | "),
);
