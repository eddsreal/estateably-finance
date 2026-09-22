-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('bank', 'cash', 'card');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('expense', 'income');

-- CreateEnum
CREATE TYPE "SystemAccountKind" AS ENUM ('category', 'equity');

-- CreateEnum
CREATE TYPE "TransactionKind" AS ENUM ('expense', 'income', 'transfer', 'opening');

-- CreateEnum
CREATE TYPE "ScheduledItemKind" AS ENUM ('bill', 'income');

-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('once', 'weekly', 'monthly');

-- CreateEnum
CREATE TYPE "ScheduledItemStatus" AS ENUM ('active', 'completed');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'closed');

-- CreateTable
CREATE TABLE "accounts" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "opening_date" DATE NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "type" "CategoryType" NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_accounts" (
    "id" BIGSERIAL NOT NULL,
    "kind" "SystemAccountKind" NOT NULL,
    "category_id" BIGINT,

    CONSTRAINT "system_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" BIGSERIAL NOT NULL,
    "kind" "TransactionKind" NOT NULL,
    "date" DATE NOT NULL,
    "description" VARCHAR(120) NOT NULL,
    "project_id" BIGINT,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entries" (
    "id" BIGSERIAL NOT NULL,
    "transaction_id" BIGINT NOT NULL,
    "account_id" BIGINT,
    "system_account_id" BIGINT,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_items" (
    "id" BIGSERIAL NOT NULL,
    "kind" "ScheduledItemKind" NOT NULL,
    "description" VARCHAR(120) NOT NULL,
    "amount" BIGINT NOT NULL,
    "account_id" BIGINT NOT NULL,
    "category_id" BIGINT NOT NULL,
    "next_due_date" DATE NOT NULL,
    "recurrence" "Recurrence" NOT NULL,
    "end_date" DATE,
    "status" "ScheduledItemStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "scheduled_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "budget" BIGINT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_snapshots" (
    "account_id" BIGINT NOT NULL,
    "balance" BIGINT NOT NULL,

    CONSTRAINT "balance_snapshots_pkey" PRIMARY KEY ("account_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_accounts_category_id_key" ON "system_accounts"("category_id");

-- CreateIndex
CREATE INDEX "transactions_date_id_idx" ON "transactions"("date", "id");

-- CreateIndex
CREATE INDEX "transactions_project_id_idx" ON "transactions"("project_id");

-- CreateIndex
CREATE INDEX "transactions_deleted_at_idx" ON "transactions"("deleted_at");

-- CreateIndex
CREATE INDEX "entries_transaction_id_idx" ON "entries"("transaction_id");

-- CreateIndex
CREATE INDEX "entries_account_id_idx" ON "entries"("account_id");

-- CreateIndex
CREATE INDEX "entries_system_account_id_idx" ON "entries"("system_account_id");

-- CreateIndex
CREATE INDEX "scheduled_items_status_next_due_date_idx" ON "scheduled_items"("status", "next_due_date");

-- AddForeignKey
ALTER TABLE "system_accounts" ADD CONSTRAINT "system_accounts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_system_account_id_fkey" FOREIGN KEY ("system_account_id") REFERENCES "system_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_items" ADD CONSTRAINT "scheduled_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_items" ADD CONSTRAINT "scheduled_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Sum-to-zero, enforced at commit inside the same interactive transaction as the domain check
CREATE FUNCTION entries_sum_to_zero() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tx_id BIGINT := COALESCE(NEW.transaction_id, OLD.transaction_id);
  s BIGINT;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO s FROM entries WHERE transaction_id = tx_id;
  IF s <> 0 THEN
    RAISE EXCEPTION 'entries of transaction % sum to %, not zero', tx_id, s;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER entries_sum_to_zero
  AFTER INSERT OR UPDATE OR DELETE ON entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION entries_sum_to_zero();

-- Case- and whitespace-insensitive unique names, archived/closed rows included (FR-030)
CREATE UNIQUE INDEX accounts_name_unique   ON accounts   (lower(trim(name)));
CREATE UNIQUE INDEX categories_name_unique ON categories (lower(trim(name)));
CREATE UNIQUE INDEX projects_name_unique   ON projects   (lower(trim(name)));

-- Entry shape: exactly one side, never a zero amount
ALTER TABLE entries
  ADD CONSTRAINT entries_one_side CHECK (num_nonnulls(account_id, system_account_id) = 1),
  ADD CONSTRAINT entries_nonzero  CHECK (amount <> 0);

-- System account shape + the equity row the ledger cannot exist without
ALTER TABLE system_accounts
  ADD CONSTRAINT system_account_shape CHECK ((kind = 'category') = (category_id IS NOT NULL));
INSERT INTO system_accounts (kind) VALUES ('equity');
