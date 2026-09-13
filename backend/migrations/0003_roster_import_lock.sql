-- A Worker isolate cannot coordinate imports with process-local memory. This
-- lease makes acquisition atomic across every isolate serving the contest.
CREATE TABLE "RosterImportLock" (
    "contestId" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "acquiredAt" DATETIME NOT NULL,
    CONSTRAINT "RosterImportLock_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
