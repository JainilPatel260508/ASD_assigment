-- Fresh database migration: intentionally fails if legacy posts need backfilling.
-- Never invent authors or delete existing rows. See README for upgrade strategy.
ALTER TABLE "Post" ADD COLUMN "authorId" INTEGER NOT NULL;
CREATE INDEX "Post_authorId_idx" ON "Post"("authorId");
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
