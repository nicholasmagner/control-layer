-- CreateTable
CREATE TABLE "AnswerLibraryEntry" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "builtinKey" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnswerLibraryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Questionnaire" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customer" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "fileName" TEXT,
    "fileData" BYTEA,
    "sheetName" TEXT,
    "headerRow" INTEGER,
    "questionCol" INTEGER,
    "answerCol" INTEGER,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Questionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionnaireItem" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "row" INTEGER,
    "section" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'needs_input',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" JSONB,
    "approvedBy" TEXT,

    CONSTRAINT "QuestionnaireItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnswerLibraryEntry_builtinKey_key" ON "AnswerLibraryEntry"("builtinKey");

-- CreateIndex
CREATE INDEX "QuestionnaireItem_questionnaireId_position_idx" ON "QuestionnaireItem"("questionnaireId", "position");

-- AddForeignKey
ALTER TABLE "QuestionnaireItem" ADD CONSTRAINT "QuestionnaireItem_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

