CREATE TYPE "public"."acquired_precision" AS ENUM('day', 'year', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('tops', 'sweaters', 'bottoms', 'jeans', 'dresses', 'outerwear', 'shoes', 'accessories');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."wear_source" AS ENUM('import', 'app');--> statement-breakpoint
CREATE TABLE "item_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"alias_key" text NOT NULL,
	CONSTRAINT "item_aliases_alias_key_unique" UNIQUE("alias_key")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"brand" text,
	"category" "category" NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"cost_cents" integer,
	"acquired_on" date,
	"acquired_precision" "acquired_precision" DEFAULT 'unknown' NOT NULL,
	"notes" text,
	"image_path" text,
	"product_url" text,
	"status" "item_status" DEFAULT 'active' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"import_conflicts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_name_key_unique" UNIQUE("name_key")
);
--> statement-breakpoint
CREATE TABLE "wears" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"worn_on" date NOT NULL,
	"slot" text,
	"source" "wear_source" DEFAULT 'app' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wears_item_day_unique" UNIQUE("item_id","worn_on")
);
--> statement-breakpoint
ALTER TABLE "item_aliases" ADD CONSTRAINT "item_aliases_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wears" ADD CONSTRAINT "wears_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_category_idx" ON "items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "items_needs_review_idx" ON "items" USING btree ("needs_review");--> statement-breakpoint
CREATE INDEX "wears_worn_on_idx" ON "wears" USING btree ("worn_on");--> statement-breakpoint
CREATE INDEX "wears_item_id_idx" ON "wears" USING btree ("item_id");