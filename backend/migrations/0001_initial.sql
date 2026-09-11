-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "passwordHash" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'admin',
    "status" TEXT NOT NULL DEFAULT 'approved',
    "schoolCodUe" TEXT,
    "schoolName" TEXT,
    "institutionType" TEXT,
    "phone" TEXT,
    "letterFilename" TEXT,
    "idFrontFilename" TEXT,
    "idBackFilename" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TeacherSchool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "schoolCodUe" TEXT,
    "schoolName" TEXT NOT NULL,
    "letterFilename" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeacherSchool_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "School" (
    "codUe" TEXT NOT NULL PRIMARY KEY,
    "codLe" TEXT,
    "name" TEXT NOT NULL,
    "dep" TEXT NOT NULL,
    "pro" TEXT NOT NULL,
    "sec" TEXT NOT NULL,
    "dis" TEXT NOT NULL,
    "depend" TEXT,
    "nivel" TEXT,
    "area" TEXT,
    "latitud" REAL,
    "longitud" REAL,
    "matricula" INTEGER
);

-- CreateTable
CREATE TABLE "TaskDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "country" TEXT,
    "year" INTEGER,
    "sourceTaskCode" TEXT,
    "category" TEXT NOT NULL,
    "difficulties" TEXT NOT NULL,
    "bodyBlocks" TEXT NOT NULL,
    "challengeBlocks" TEXT NOT NULL,
    "answerType" TEXT NOT NULL DEFAULT 'multiple_choice',
    "answerConfig" TEXT NOT NULL DEFAULT '{}',
    "answerKey" TEXT NOT NULL DEFAULT '{}',
    "multipleChoiceOrderMode" TEXT NOT NULL DEFAULT 'fixed',
    "answers" TEXT NOT NULL,
    "correctAnswerId" TEXT NOT NULL,
    "shortAnswer" TEXT NOT NULL DEFAULT '',
    "dragDropBackground" TEXT NOT NULL DEFAULT 'null',
    "dragDropItems" TEXT NOT NULL DEFAULT '[]',
    "explanationBlocks" TEXT NOT NULL DEFAULT '[]',
    "isPractice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Contest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "registrationStartsAt" DATETIME,
    "registrationEndsAt" DATETIME,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "initialScore" INTEGER NOT NULL,
    "scoring" TEXT,
    "questionDisplayMode" TEXT NOT NULL DEFAULT 'one_by_one',
    "allowPairs" BOOLEAN NOT NULL DEFAULT false,
    "showFeedback" BOOLEAN NOT NULL DEFAULT false,
    "showSolutions" BOOLEAN NOT NULL DEFAULT false,
    "showTotalScore" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "suspendedAt" DATETIME,
    "consolidatedAt" DATETIME,
    "resultsPublishedAt" DATETIME,
    "isPractice" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContestTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contestId" TEXT NOT NULL,
    "taskDraftId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "difficulty" TEXT NOT NULL,
    "minScore" INTEGER NOT NULL,
    "noAnswerScore" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "options" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContestTask_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContestTask_taskDraftId_fkey" FOREIGN KEY ("taskDraftId") REFERENCES "TaskDraft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContestGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contestId" TEXT NOT NULL,
    "createdById" INTEGER,
    "name" TEXT NOT NULL,
    "accessCode" TEXT NOT NULL,
    "recoveryCode" TEXT NOT NULL,
    "firstUsedAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContestGroup_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "participationMode" TEXT NOT NULL DEFAULT 'individual',
    "grade" TEXT,
    "memberOneFirstName" TEXT NOT NULL,
    "memberOneLastName" TEXT NOT NULL,
    "memberTwoFirstName" TEXT,
    "memberTwoLastName" TEXT,
    "personalCode" TEXT NOT NULL,
    "sessionToken" TEXT,
    "sessionSeenAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'registered',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Team_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ContestGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "startedAt" DATETIME,
    "endsAt" DATETIME,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Attempt_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AttemptAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "taskDraftId" TEXT NOT NULL,
    "responsePayload" TEXT NOT NULL,
    "isCorrect" BOOLEAN,
    "score" INTEGER NOT NULL DEFAULT 0,
    "answeredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AttemptAnswer_taskDraftId_fkey" FOREIGN KEY ("taskDraftId") REFERENCES "TaskDraft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "answeredCount" INTEGER NOT NULL DEFAULT 0,
    "rankPosition" INTEGER,
    "calculatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Result_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "TeacherSchool_userId_idx" ON "TeacherSchool"("userId");

-- CreateIndex
CREATE INDEX "School_name_idx" ON "School"("name");

-- CreateIndex
CREATE INDEX "School_dep_idx" ON "School"("dep");

-- CreateIndex
CREATE INDEX "Contest_createdById_idx" ON "Contest"("createdById");

-- CreateIndex
CREATE INDEX "ContestTask_contestId_position_idx" ON "ContestTask"("contestId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ContestTask_contestId_taskDraftId_key" ON "ContestTask"("contestId", "taskDraftId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestTask_contestId_position_key" ON "ContestTask"("contestId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ContestGroup_accessCode_key" ON "ContestGroup"("accessCode");

-- CreateIndex
CREATE INDEX "ContestGroup_contestId_idx" ON "ContestGroup"("contestId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_personalCode_key" ON "Team"("personalCode");

-- CreateIndex
CREATE UNIQUE INDEX "Team_sessionToken_key" ON "Team"("sessionToken");

-- CreateIndex
CREATE INDEX "Team_groupId_idx" ON "Team"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_teamId_key" ON "Attempt"("teamId");

-- CreateIndex
CREATE INDEX "AttemptAnswer_attemptId_idx" ON "AttemptAnswer"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptAnswer_attemptId_taskDraftId_key" ON "AttemptAnswer"("attemptId", "taskDraftId");

-- CreateIndex
CREATE UNIQUE INDEX "Result_attemptId_key" ON "Result"("attemptId");
