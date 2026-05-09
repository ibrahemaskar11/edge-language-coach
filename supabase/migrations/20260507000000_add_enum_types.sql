-- Replace de-facto string columns with proper Postgres enum types.
-- All existing values are validated by app code before insert, so the USING
-- cast will succeed on any well-formed dataset.

CREATE TYPE "SessionStatus"  AS ENUM ('recording', 'transcribing', 'coaching', 'complete');
CREATE TYPE "MessageRole"    AS ENUM ('ai', 'user');
CREATE TYPE "FeedbackType"   AS ENUM ('mistakes', 'good_points', 'follow_up');
CREATE TYPE "FlashcardType"  AS ENUM ('VOCABULARY', 'GRAMMAR', 'TRANSLATE TO ITALIAN');
CREATE TYPE "CefrLevel"      AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
CREATE TYPE "TopicCategory"  AS ENUM (
  'Politics', 'Economy', 'Society', 'Sports',
  'Daily Life', 'Culture', 'Food', 'Travel', 'Technology'
);

-- sessions.status
ALTER TABLE sessions
  ALTER COLUMN status TYPE "SessionStatus" USING status::"SessionStatus",
  ALTER COLUMN status SET DEFAULT 'recording'::"SessionStatus";

-- messages.role
ALTER TABLE messages
  ALTER COLUMN role TYPE "MessageRole" USING role::"MessageRole";

-- feedback.type
ALTER TABLE feedback
  ALTER COLUMN type TYPE "FeedbackType" USING type::"FeedbackType";

-- flashcards.type
ALTER TABLE flashcards
  ALTER COLUMN type TYPE "FlashcardType" USING type::"FlashcardType";

-- topics.level + topics.category
ALTER TABLE topics
  ALTER COLUMN level    TYPE "CefrLevel"     USING level::"CefrLevel",
  ALTER COLUMN level    SET DEFAULT 'B2'::"CefrLevel",
  ALTER COLUMN category TYPE "TopicCategory" USING category::"TopicCategory";

-- placement_questions.level
ALTER TABLE placement_questions
  ALTER COLUMN level TYPE "CefrLevel" USING level::"CefrLevel";

-- profiles.italian_level (nullable — NULL values pass through safely)
ALTER TABLE profiles
  ALTER COLUMN italian_level TYPE "CefrLevel" USING italian_level::"CefrLevel";
