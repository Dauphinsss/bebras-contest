-- Additive patch for existing SQLite databases. New databases use prisma:push.
-- Back up the database before applying. Apply once, or use prisma:push instead.
ALTER TABLE "TaskDraft" ADD COLUMN "answerConfig" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "TaskDraft" ADD COLUMN "answerKey" TEXT NOT NULL DEFAULT '{}';
