# Settled — Backend Reference

A handoff document for a separate Claude Code session building the Settled
**web directory** project against the same Supabase backend as the React
Native mobile app at `~/settled-`.

Everything below is verbatim what the mobile app does today: bucket names,
column names, RPC signatures, RLS rules, form fields. If a column name
looks unfamiliar from the public schema docs, trust this doc — it reflects
what the production database actually has after every applied migration
(some of which were applied via the Supabase SQL editor, not the
`supabase/migrations/` tree).

> **Important context for the directory build:** Settled is **invite-only,
> browse-and-choose**. Trades on the platform are pre-vetted by Settled
> (verification submissions, approval gate, etc.). The directory should
> assume `profiles.approval_status = 'approved'` for any trade it surfaces
> to the public. Reviews exist to help homeowners pick a fit, not to gate
> trust.

---

## 1. Photo / Media Uploads

There are **four storage buckets** in use. Each has a different visibility
model and a different object-key convention. The table below + the per-
bucket sections that follow are the source of truth.

| Bucket               | Public | Object-key shape                              | What lives here                          |
| -------------------- | ------ | --------------------------------------------- | ---------------------------------------- |
| `avatars`            | ✅     | `{userId}/avatar.{ext}`                       | Profile photos (one per user, upserted)  |
| `request-attachments`| ❌     | `{requestId}/{uuid}.{ext}` + `tmp/{sessionId}/{uuid}.{ext}` | Quote-request photos (private, signed URLs) |
| `review-photos`      | ✅     | `reviews/{quoteId}/{uuid}.{ext}`              | Review photos (post-completion)          |
| `trade-media`        | ✅     | `{tradeId}/{...}`                             | V2 trade content (intro videos, portfolio) |

### 1a. `avatars` bucket — profile photos

**Source:** `app/(dashboard)/profile/photo.jsx`

```js
// Path: <userId>/avatar.<ext>
const fileName = `${user.id}/avatar.${ext}`;

const arrayBuffer = await new Response(blob).arrayBuffer();

await supabase.storage
  .from("avatars")
  .upload(fileName, arrayBuffer, {
    contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
    upsert: true,                  // single avatar slot, overwrite
  });

const { data: urlData } = supabase.storage
  .from("avatars")
  .getPublicUrl(fileName);

await updateMyProfile({ photo_url: urlData.publicUrl });
```

- **Public bucket.** The URL is stored verbatim in `profiles.photo_url`
  and rendered via `<img src={...}>`. No signed-URL fetch is needed.
- **One file per user**: same path, `upsert: true`. Removing a photo lists
  the user's folder and `remove()`s every file in it (legacy + current).
- The directory should read `profiles.photo_url` and render it directly.

### 1b. `request-attachments` bucket — quote-request photos

**Source:** `lib/api/attachments.js` (full implementation)

This is the most opinionated of the four buckets. Two flows:

#### Progressive (preferred) — for forms that need uploads to start before the parent row exists

```js
import {
  generateUploadSessionId,   // sessionId = `${userId}_${Date.now()}`
  uploadTempImage,           // uploads to tmp/{sessionId}/{uuid}.{ext}
  moveTempToRequest,         // moves tmp/... → {requestId}/{uuid}.{ext}, then attachRequestImages
} from "lib/api/attachments";

// 1. On mount: const sessionId = generateUploadSessionId(user.id);
// 2. On each photo pick:
const result = await uploadTempImage(sessionId, { uri }, (progress) => {
  // progress is 0..100 (milestones at 10, 30, 100)
});
// result: { success, tempPath, error }

// 3. After the request row is created:
const tempPaths = uploadedPhotos.map((p) => p.tempPath);
const moveResult = await moveTempToRequest(String(requestId), tempPaths);
// move + attachRequestImages happen inside this helper.
```

#### One-shot — when you already have a `requestId`

```js
import { uploadRequestImages } from "lib/api/attachments";

const uploadedPaths = await uploadRequestImages(
  requestId,
  localItems,             // array of { uri, base64? } or string uri
  (done, total) => { /* per-photo progress */ }
);
// Side-effect: also calls attachRequestImages(requestId, uploadedPaths)
```

#### Reading photos back (signed URLs with cache)

```js
import { getRequestAttachmentUrlsCached } from "lib/api/attachments";

const { paths, urls } = await getRequestAttachmentUrlsCached(requestId);
// urls: signed, valid for 1h, in-process memo cache (TTL 58 min)
// paths: raw object keys (pass back to viewer for re-signing)
```

**Underlying primitives** (in `lib/api/attachments.js`):

- `normaliseLocalItem(item)` — handles `string | { uri, base64?, mimeType? }`,
  derives `{ uri, ext, mime, base64 }`.
- `toArrayBuffer(meta)` — RN-safe: prefers `meta.base64` (decoded via
  `base64-arraybuffer`), falls back to `expo-file-system`
  `readAsStringAsync` then decode.
- `makeObjectPath(requestId, ext)` → `{requestId}/{uuid}.{ext}`
- `makeTempObjectPath(sessionId, ext)` → `tmp/{sessionId}/{uuid}.{ext}`
- `getSignedUrls(paths, expires=3600)` — bulk via
  `storage.createSignedUrls()` if available, single-loop fallback.
- Cache: `requestAttachmentsCache` Map, TTL `3500 * 1000` ms.

**RPCs used (must exist in Supabase, not in committed migrations):**

| RPC                          | Args                                  | Returns                |
| ---------------------------- | ------------------------------------- | ---------------------- |
| `rpc_attach_request_images`  | `p_request_id UUID`, `p_paths TEXT[]` | `INTEGER` (rows inserted) |
| `rpc_list_request_images`    | `p_request_id UUID`                   | `TEXT[]` (object paths) |

Both apply RLS internally — the directory project will need read access via
`rpc_list_request_images` if it surfaces request photos.

**Storage policies (`supabase/migrations/20260401000000_audit_cleanup.sql`):**

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('request-attachments', 'request-attachments', false)  -- PRIVATE
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload request attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'request-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can view request attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'request-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can move request attachments"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'request-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own temp attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'request-attachments' AND auth.uid() IS NOT NULL
         AND name LIKE 'tmp/%');
```

Policies are intentionally broad ("any authenticated user can list"); the
practical access gate is `rpc_list_request_images`, which scopes by
participant.

### 1c. `review-photos` bucket — review photos

**Source:** `lib/api/attachments.js` (helpers added in this branch),
`app/(dashboard)/client/myquotes/leave-review.jsx`

```js
import {
  uploadReviewImages,         // batch
  uploadSingleReviewImage,    // single, milestone progress (10/30/100)
} from "lib/api/attachments";

// One-shot batch (returns both raw paths and public URLs):
const { paths, urls } = await uploadReviewImages(quoteId, items, onProgress);

// Progressive single upload (mirror of uploadTempImage):
const r = await uploadSingleReviewImage(quoteId, { uri }, (progress) => { /*...*/ });
// r: { success, path, url, error }
```

- Object key: `reviews/{quoteId}/{uuid}.{ext}` — the **`reviews/` prefix is
  required** by the existing storage INSERT policy.
- **Public bucket.** The current `rpc_submit_review` stores the URLs in
  `reviews.photos TEXT[]` (not paths). Display sites just render the URL
  directly. The path list is also returned by the helper in case the
  schema later moves to private + signed URLs.

**Storage policies (`20260416000000_reviews_schema_unify.sql`):**

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-photos', 'review-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Authenticated can upload review photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'review-photos'
    AND (storage.foldername(name))[1] = 'reviews'   -- gate the `reviews/` prefix
  );

CREATE POLICY "Anyone can view review photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-photos');

CREATE POLICY "Authenticated can delete own review photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'review-photos' AND owner = auth.uid());
```

### 1d. `trade-media` bucket — V2 portfolio media

**Source:** `supabase/migrations/20260331000000_v2_tables.sql`

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('trade-media', 'trade-media', true);

-- Trade can only write under a folder named for their UID
CREATE POLICY "Trades can upload media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'trade-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Anyone can view trade media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trade-media');

CREATE POLICY "Trades can delete own media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'trade-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

URLs are stored in `trade_posts.media_urls TEXT[]` and
`trade_posts.thumbnail_url TEXT`. Public bucket → render the URL
directly.

---

## 2. UK Postcode Validation + Geocoding

**Source:** `lib/api/places.js`. **No API key required**, all endpoints
are public + free. Two providers in use:

- **postcodes.io** (`https://api.postcodes.io`) — UK postcodes only
- **Photon** (`https://photon.komoot.io`) — town/city autocomplete (OSM-backed)

### 2a. Postcode geocode (the main one)

```js
import { geocodeUKPostcode } from "lib/api/places";

const result = await geocodeUKPostcode("SW1A 1AA");
// {
//   postcode: "SW1A 1AA",
//   latitude: 51.501009,
//   longitude: -0.141588,
//   region: "London",
//   country: "England",
//   admin_district: "Westminster",
//   parish: "Westminster, unparished area",
//   outcode: "SW1A",
//   incode: "1AA",
//   isApproximate: false,
// }
```

**Outcode fallback** is built in: if the full postcode 404s, the function
re-tries with just the outcode (e.g. `SW1A`) and returns
`isApproximate: true`. The directory should treat `isApproximate: true`
as "centroid only — don't render a precise pin."

### 2b. Other helpers

| Function | Endpoint | Notes |
| --- | --- | --- |
| `validateUKPostcode(postcode)` | `/postcodes/{p}/validate` | Returns `Promise<boolean>`. |
| `autocompleteUKPostcode(partial, limit=10)` | `/postcodes/{p}/autocomplete` | Returns array of postcodes. |
| `bulkGeocodeUKPostcodes(arr)` | `POST /postcodes` | Up to 100 at a time. |
| `searchPlaces(input, { countryCode='GB', limit=10 })` | Photon `/api?q=...` | Autocomplete towns/cities. UK-filtered + place-type filtered. Returns `{ placeId, description, mainText, secondaryText, latitude, longitude, properties }`. |
| `getPlaceDetails(prediction)` | (no fetch) | Photon already returns full details; this just reshapes. |

**Form-side normalisation** before insert (clienthome.jsx):

```js
const normalizedPostcode = postcode.trim().toUpperCase().replace(/\s+/g, " ");
const geocoded = await geocodeUKPostcode(normalizedPostcode);
// store: postcode = normalizedPostcode, location_lat = geocoded.latitude, location_lon = geocoded.longitude
```

**Distance/service-area logic** is computed client-side using these
coords + the trade's `base_lat`/`base_lon` + `service_radius_km`. The
directory will need to do the same (or call `rpc_get_trades_in_area`-style
RPCs if you write them).

---

## 3. `quote_requests` Schema

The base schema lives in
`supabase/migrations/20250101000000_initial_schema.sql`. Several columns
have been **added or renamed** by later migrations applied directly via
the Supabase SQL editor (not in the committed tree). What follows is the
**actual current production schema** — verified by what the mobile
app's insert in `clienthome.jsx` writes to.

| Column              | Type                | Notes |
| ------------------- | ------------------- | ----- |
| `id`                | `UUID PK`           | `gen_random_uuid()` default |
| `requester_id`      | `UUID FK → profiles(id)` | The client. `ON DELETE CASCADE` |
| `category_id`       | `UUID FK → service_categories(id)` | ⚠️ Note: initial migration calls this `service_category_id` but production uses **`category_id`**. The mobile app inserts into `category_id`. |
| `service_type_id`   | `UUID FK → service_types(id)` | |
| `property_type_id`  | `UUID FK → property_types(id)` | Nullable |
| `timing_option_id`  | `UUID FK → timing_options(id)` | Nullable. Mobile app writes timing into the `details` text instead — this column may be unused now. |
| `status`            | `TEXT`              | Default `'open'`. CHECK: `('open', 'claimed', 'completed', 'cancelled', 'expired')` |
| `suggested_title`   | `TEXT`              | Format: `"{Category} - {Service Type}"` (e.g. `"Plumbing - Boiler repair"`) |
| `details`           | `TEXT`              | Multi-line rendering of every form field (Category, Service, Description, Property, Postcode, Budget, Timing, Emergency). See §6 for format. |
| `postcode`          | `TEXT`              | Already normalised + uppercased on insert |
| `location_lat`      | `NUMERIC(10,6)` / `DOUBLE PRECISION` | ⚠️ Initial migration calls these `lat` / `lon`; production uses **`location_lat`** / **`location_lon`** |
| `location_lon`      | `NUMERIC(10,6)` / `DOUBLE PRECISION` | |
| `budget_band`       | `TEXT`              | Form value strings, e.g. `"£0-£500"`, `"£500-£1500"`, `"£1500+"` |
| `photo_urls`        | `TEXT[]`            | Legacy / unused — actual photo linkage goes via `request_attachments` storage + the `rpc_attach_request_images` RPC |
| `is_direct`         | `BOOLEAN`           | `true` when client picks a specific trade. Added by `20260124100000_add_is_direct_column.sql` |
| `created_at`        | `TIMESTAMPTZ`       | `NOW()` default |
| `updated_at`        | `TIMESTAMPTZ`       | `NOW()` default |

**Indexes:** `idx_quote_requests_requester (requester_id)`,
`idx_quote_requests_status (status)`,
`idx_quote_requests_service_type (service_type_id)`.

### Companion table — `request_targets`

Each `quote_request` fans out to one or more rows in `request_targets`,
one per trade invited.

| Column                  | Type      | Notes |
| ----------------------- | --------- | ----- |
| `id`                    | `UUID PK` | |
| `request_id`            | `UUID FK → quote_requests(id)` | `CASCADE` |
| `trade_id`              | `UUID FK → profiles(id)`       | `CASCADE` |
| `invited_by`            | `TEXT`    | `'system'` \| `'client'` \| `'trade'`. Default `'system'`. For Settled-as-directory the inserts always use `'client'` (browse-and-choose). |
| `state`                 | `TEXT`    | `'invited'` \| `'accepted'` \| `'declined'` \| `'client_accepted'` \| `'expired'`. Default `'invited'`. |
| `outside_service_area`  | `BOOLEAN` | `true` if client is outside the trade's `service_radius_km` |
| `distance_miles`        | `NUMERIC(8,2)` | Computed client-side at insert time |
| `extended_match`        | `BOOLEAN` | Trade matched only via their extended-radius-for-bigger-budgets setting |
| `first_action_at`       | `TIMESTAMPTZ` | |
| `first_action_type`     | `TEXT`    | |
| `created_at`/`updated_at` | `TIMESTAMPTZ` | |
| **UNIQUE**              | `(request_id, trade_id)` | |

---

## 4. `enquiries` Schema (V2 — Browse-and-Choose)

**Source:** `supabase/migrations/20260331000000_v2_tables.sql`,
`supabase/migrations/20260510000000_web_directory_token_auth.sql`

This is the V2 replacement for broadcast `quote_requests` — direct
client-to-trade enquiry the directory should probably use.

| Column                | Type | Notes |
| --------------------- | ---- | ----- |
| `id`                  | `UUID PK` | |
| `client_id`           | `UUID FK → profiles(id)` | `CASCADE`. NOT NULL. |
| `trade_id`            | `UUID FK → profiles(id)` | `CASCADE`. NOT NULL. |
| `message`             | `TEXT` | NOT NULL |
| `photos`              | `TEXT[]` | Default `'{}'`. Stores **URLs** (same convention as `reviews.photos`). |
| `service_category_id` | `UUID FK → service_categories(id)` | Nullable |
| `postcode`            | `TEXT` | NOT NULL |
| `lat`                 | `NUMERIC(10,6)` | |
| `lon`                 | `NUMERIC(10,6)` | |
| `property_type_id`    | `UUID FK → property_types(id)` | |
| `status`              | `TEXT` | Default `'open'`. CHECK: `('open', 'responded', 'quoted', 'hired', 'completed', 'cancelled')` |
| `budget_range`        | `TEXT` | Free-form budget label submitted alongside the enquiry. Added by `20260510000000_web_directory_token_auth.sql`. |
| `conversation_token`  | `UUID` | NOT NULL, default `gen_random_uuid()`, unique. Per-conversation secret used for token-based RLS access from the web directory (visitors who don't sign in via Supabase Auth). Added by `20260510000000_web_directory_token_auth.sql`. **Never log or emit to analytics.** |
| `created_at`          | `TIMESTAMPTZ` | |
| `updated_at`          | `TIMESTAMPTZ` | |

**Indexes:** `idx_enquiries_client_id`, `idx_enquiries_trade_id`,
`idx_enquiries_status`, `idx_enquiries_service_category`,
`idx_enquiries_conversation_token` (UNIQUE).

**Note on photos:** the V1 quote-request flow uses the
`request-attachments` bucket + `rpc_attach_request_images` indirection.
The V2 enquiries table stores URLs directly in `photos TEXT[]`. The
mobile app does **not yet** wire enquiry photo upload — if the directory
ships it first, mirror the review-photo pattern (public bucket, store
URLs).

### Related V2 tables (same migration)

- `trade_posts` — intro videos + portfolio posts. Has
  `moderation_status` CHECK on `('pending','approved','rejected','flagged')`.
  Enforce `moderation_status = 'approved'` on the public directory.
- `content_moderation_queue` — admin queue for trade-uploaded content.
- `client_interests` — `(client_id, service_category_id)` UNIQUE pairs
  driving feed personalisation.
- `pricing_benchmarks` — market price ranges, public read.

---

## 5. `profiles` Schema (Trade-Relevant Fields)

The base table lives in the initial schema; **9 ALTER TABLE migrations**
have added columns since. Combined view of every column the directory
might care about:

### Identity
| Column            | Type | Notes |
| ----------------- | ---- | ----- |
| `id`              | `UUID PK FK → auth.users(id)` | `CASCADE` |
| `role`            | `TEXT` | NOT NULL. CHECK: `('client', 'trades', 'admin')`. **Directory should filter `role = 'trades'`.** |
| `full_name`       | `TEXT` | |
| `email`           | `TEXT` | |
| `phone`           | `TEXT` | |
| `photo_url`       | `TEXT` | Public URL into `avatars` bucket. Render directly. |
| `is_admin`        | `BOOLEAN` | Default `false`. Added by `20260401000000_audit_cleanup.sql`. |

### Business / public profile
| Column         | Type | Notes |
| -------------- | ---- | ----- |
| `business_name`| `TEXT` | Preferred display name for trades on directory; fall back to `full_name`. |
| `trade_title` | `TEXT` | e.g. "Plumber", "Electrician". |
| `bio`         | `TEXT` | Free-text about-me. Max 1000 chars (enforced in app, not DB). |
| `service_type_ids` | `UUID[]` | Default `'{}'`. The trade's offered services — array of `service_types.id` UUIDs. |
| `job_titles`  | `TEXT[]` | Free-text job titles the trade self-categorises with. |

### Location / service area
| Column                       | Type | Notes |
| ---------------------------- | ---- | ----- |
| `base_postcode`              | `TEXT` | Their primary postcode |
| `base_lat`                   | `NUMERIC(10,6)` | |
| `base_lon`                   | `NUMERIC(10,6)` | |
| `town_city`                  | `TEXT` | |
| `service_radius_km`          | `NUMERIC(6,2)` | Default `25.00` |
| `extended_radius_km`         | `INTEGER` | Nullable. Trade willing to travel further if budget meets `extended_radius_min_budget`. Added by `20260123100000_extended_travel_radius.sql`. |
| `extended_radius_min_budget` | `TEXT` | Nullable. Same enum strings as `quote_requests.budget_band`. |
| `home_postcode`              | `TEXT` | **Client only**. Added by `20260429000000_client_home_postcode.sql`. |
| `home_lat`                   | `DOUBLE PRECISION` | |
| `home_lon`                   | `DOUBLE PRECISION` | |

### Onboarding / approval gate
| Column                          | Type | Notes |
| ------------------------------- | ---- | ----- |
| `approval_status`               | `TEXT` | Default `'pending'`. CHECK: `('pending', 'approved', 'rejected')`. **Directory must filter `approval_status = 'approved'`.** Added by `20260413000000_trade_approval_gate.sql`. |
| `profile_completion_percentage` | `INTEGER` | Default `0`. |
| `intro_video_post_id`           | `UUID FK → trade_posts(id)` | V2. Pinned intro video. |
| `intro_video_deadline`          | `TIMESTAMPTZ` | V2. When their intro video expires. |
| `has_approved_intro_video`      | `BOOLEAN` | Default `false`. V2. |

### Limits / system
| Column                | Type | Notes |
| --------------------- | ---- | ----- |
| `max_open_requests`   | `INTEGER` | Nullable. Per-account override on the system default. |
| `max_direct_requests` | `INTEGER` | Nullable. |
| `is_test_account`     | `BOOLEAN` | Default `false`. **Directory should filter `is_test_account = false`** (or NULL) to exclude demo accounts. |
| `typical_project_minimum` | `INTEGER` | Nullable (whole pounds; NULL = no minimum). Surfaced on directory trade cards so visitors self-qualify before sending an enquiry. Added by `20260510000000_web_directory_token_auth.sql`. |
| `created_at`/`updated_at` | `TIMESTAMPTZ` | |

### Cached performance stats — separate table

Don't bake stats onto `profiles`. They live in `trade_performance_stats`,
keyed by `profile_id` (1:1 with the trade's profile id):

| Column                       | Type | Notes |
| ---------------------------- | ---- | ----- |
| `profile_id`                 | `UUID PK FK → profiles(id)` | |
| `avg_response_time_hours`    | `NUMERIC(10,2)` | |
| `median_response_time_hours` | `NUMERIC(10,2)` | |
| `response_time_percentile`   | `INTEGER` | |
| `requests_received_count`    | `INTEGER` | |
| `requests_accepted_count`    | `INTEGER` | |
| `quotes_sent_count`          | `INTEGER` | |
| `quote_rate`                 | `NUMERIC(5,2)` | 0–100 |
| `jobs_completed_count`       | `INTEGER` | |
| `completion_rate`            | `NUMERIC(5,2)` | 0–100 |
| `review_count`               | `INTEGER` | |
| `average_rating`             | `NUMERIC(3,2)` | 0–5 |
| `period_start`/`period_end`  | `DATE` | |
| `updated_at`                 | `TIMESTAMPTZ` | |

This table is kept fresh by the `reviews_refresh_stats` trigger
(`20260416010000_review_stats_trigger.sql`) on review insert/update/delete,
plus a `refresh_trade_performance_stats(profile_id UUID)` function.

There's also a public read view: `v_trade_metrics_90d` (granted to
`authenticated` in `20260416020000_public_trade_stats_read.sql`) — use
this view, not direct table reads, for surfacing stats on a trade card.

---

## 6. RLS Policy Patterns

**Source of truth:** `supabase/migrations/20260122_security_rls_policies.sql.applied`
(yes, the `.applied` extension means it was run via the SQL editor, not
the migrations CLI — but it is applied in production). Plus the V2
policies in `20260331000000_v2_tables.sql`.

### Helper functions (referenced by policies)

```sql
-- 1) Admin gate
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM profiles
                 WHERE id = auth.uid() AND is_admin = true);
END;
$$;

-- 2) Conversation participant gate
CREATE OR REPLACE FUNCTION is_request_participant(p_request_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM quote_requests
                 WHERE id = p_request_id AND requester_id = auth.uid())
      OR EXISTS (SELECT 1 FROM request_targets
                 WHERE request_id = p_request_id AND trade_id = auth.uid());
END;
$$;
```

Both are SECURITY DEFINER + GRANTed to `authenticated`.

### `profiles`

| Op | Policy | Rule |
| --- | --- | --- |
| `SELECT` | "Users can view own profile" | `id = auth.uid()` |
| `SELECT` | "Users can view trade public info" | `role = 'trades' AND id != auth.uid()` |
| `UPDATE` | "Users can update own profile" | `id = auth.uid()` (USING + WITH CHECK) |
| `ALL` | "Service role full access to profiles" | service_role |

**Practical effect for the directory:** authenticated clients can read
every trade profile. Anonymous users cannot read profiles directly — the
directory should either (a) authenticate users before showing trade
detail pages, or (b) build server-side / RLS-bypassing read endpoints
via SECURITY DEFINER RPCs.

### `quote_requests`

| Op | Policy | Rule |
| --- | --- | --- |
| `SELECT` | "Clients can view own requests" | `requester_id = auth.uid()` |
| `SELECT` | "Trades can view targeted requests" | `EXISTS request_targets WHERE request_id = id AND trade_id = auth.uid()` |
| `INSERT` | "Clients can create requests" | WITH CHECK `requester_id = auth.uid()` |
| `UPDATE` | "Clients can update own requests" | USING + WITH CHECK `requester_id = auth.uid()` |
| `ALL` | "Service role full access to requests" | service_role |

### `request_targets`

| Op | Policy | Rule |
| --- | --- | --- |
| `SELECT` | "Trades can view own targets" | `trade_id = auth.uid()` |
| `SELECT` | "Clients can view targets for own requests" | `EXISTS quote_requests WHERE id = request_id AND requester_id = auth.uid()` |
| `UPDATE` | "Trades can update own targets" | `trade_id = auth.uid()` |
| `ALL` | "Service role full access to targets" | service_role |

There is **no INSERT policy** for `request_targets` for authenticated
users — inserts go through service_role / SECURITY DEFINER RPCs. The
directory will need to either use one of those RPCs or write a new one.

### `enquiries` (V2)

| Op | Policy | Rule |
| --- | --- | --- |
| `SELECT` | "Clients can view own enquiries" | `auth.uid() = client_id` |
| `SELECT` | "Trades can view received enquiries" | `auth.uid() = trade_id` |
| `INSERT` | "Clients can create enquiries" | WITH CHECK `auth.uid() = client_id` |
| `UPDATE` | "Participants can update enquiries" | `auth.uid() = client_id OR auth.uid() = trade_id` |
| `SELECT` | "Token holders can view enquiries" | `conversation_token = current_conversation_token()` (added 2026-05-10) |
| `UPDATE` | "Token holders can update enquiries" | USING + WITH CHECK same condition (added 2026-05-10) |

### `tradify_native_app_db` (quotes — yes, that's actually the table name)

| Op | Policy | Rule |
| --- | --- | --- |
| `SELECT` | "Trades can view own quotes" | `trade_id = auth.uid()` |
| `SELECT` | "Clients can view quotes for their requests" | `client_id = auth.uid()` |
| `INSERT` | "Trades can create quotes" | WITH CHECK `trade_id = auth.uid()` |
| `UPDATE` | "Trades can update own quotes" | USING + WITH CHECK `trade_id = auth.uid()` |
| `ALL` | service_role | |

### `reviews`

| Op | Policy | Rule |
| --- | --- | --- |
| `SELECT` | "Authenticated users can view all reviews" | `true` (any authed user) |
| `INSERT` | "Users can create their own reviews" | WITH CHECK `reviewer_id = auth.uid()` |
| `UPDATE` | "Users can update own reviews" | `reviewer_id = auth.uid()` |

In practice review inserts go through `rpc_submit_review` (SECURITY
DEFINER, see `supabase/migrations/20260430000000_rpc_submit_review.sql`)
because it needs to derive `reviewee_id` from the quote and reject
duplicates.

### `messages`

The `messages` table now carries an optional `enquiry_id UUID REFERENCES
enquiries(id) ON DELETE CASCADE` (added by
`20260510000000_web_directory_token_auth.sql`). Existing rows have
`enquiry_id = NULL` and continue to flow through the v1 `request_id`-based
policies untouched.

| Op | Policy | Rule |
| --- | --- | --- |
| `SELECT` | "Users can view messages in their conversations" | `sender_id = auth.uid() OR is_request_participant(request_id)` |
| `INSERT` | "Users can send messages in their conversations" | `sender_id = auth.uid() AND is_request_participant(request_id)` |
| `SELECT` | "Token holders can view enquiry messages" | `enquiry_id IS NOT NULL AND EXISTS enquiry WHERE conversation_token = current_conversation_token()` |
| `INSERT` | "Token holders can send enquiry messages" | WITH CHECK same condition |

### Service-tier policies

`service_categories`, `service_types` — policy `"Everyone can view ..."`
to roles **`authenticated, anon`** with `USING (true)`. The directory's
public pages can read these without auth.

### Reference table: full RLS policy text on the V2 tables

```sql
-- enquiries
CREATE POLICY "Clients can view own enquiries"
  ON enquiries FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "Trades can view received enquiries"
  ON enquiries FOR SELECT USING (auth.uid() = trade_id);
CREATE POLICY "Clients can create enquiries"
  ON enquiries FOR INSERT WITH CHECK (auth.uid() = client_id);
CREATE POLICY "Participants can update enquiries"
  ON enquiries FOR UPDATE USING (auth.uid() = client_id OR auth.uid() = trade_id);

-- trade_posts (used to filter for moderation_status='approved')
CREATE POLICY "Anyone can view approved posts"
  ON trade_posts FOR SELECT
  USING (
    moderation_status = 'approved'
    OR trade_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );
```

---

## 7. Quote-Request Form Fields

**Source:** `app/(dashboard)/client/clienthome.jsx`, lines ~100-650.

The form is a multi-step wizard (`step` state tracks position). Fields,
in order of collection:

### Step 1 — Service category

| Field | Source | Persisted as |
| --- | --- | --- |
| `selectedCategory` | `service_categories` table (loaded via `getServiceCategories()`) | `quote_requests.category_id` |

### Step 2 — Service type

| Field | Source | Persisted as |
| --- | --- | --- |
| `selectedServiceType` | `service_types` filtered to chosen `category_id` | `quote_requests.service_type_id` |

### Step 3 — Description (free text)

| Field | Source | Persisted as |
| --- | --- | --- |
| `description` | TextInput (multiline, max length unconstrained in form) | Embedded in `quote_requests.details` as `Description: {text}` line |

### Step 4 — Location (postcode + property type)

| Field | Source | Persisted as |
| --- | --- | --- |
| `postcode` | TextInput, auto-uppercased on input. Pre-filled from `profiles.home_postcode` if set. | `quote_requests.postcode` (normalised: trimmed + UPPER + collapsed whitespace) |
| `selectedPropertyType` | `property_types` table | `quote_requests.property_type_id` |
| (derived) `location_lat`, `location_lon` | `geocodeUKPostcode(postcode)` | `quote_requests.location_lat`, `quote_requests.location_lon` |

### Step 5 — Photos (optional, up to 5)

| Field | Source | Persisted as |
| --- | --- | --- |
| `photos` | `expo-image-picker`, multi-select, processed via `expo-image-manipulator`, **progressive upload** to `request-attachments/tmp/{sessionId}/`. | After request insert: `moveTempToRequest(requestId, tempPaths)` → final paths attached via `rpc_attach_request_images` RPC. **Not** stored in `quote_requests.photo_urls` (legacy, unused). |

### Step 6 — Budget band (job-profile based)

| Field | Source | Persisted as |
| --- | --- | --- |
| `selectedBudget` | Static array per service-type job profile (small_job, medium_job, large_job). Each option: `{ value: "£0-£500", label: "Under £500" }` etc. | `quote_requests.budget_band` (the `value` string) |

### Step 7 — Timing

| Field | Source | Persisted as |
| --- | --- | --- |
| `selectedTiming` | Static array per job profile. Each option: `{ id: "asap", name: "ASAP", is_emergency: true }` etc. | `quote_requests.timing_option_id` is **not** populated by the form — timing is appended to `details` text instead. |

### Final insert (after all steps)

```js
const { data: created, error: reqError } = await supabase
  .from("quote_requests")
  .insert({
    requester_id: user.id,
    details,                     // multi-line summary, see below
    status: "open",
    suggested_title,             // "{Category} - {Service Type}"
    category_id: selectedCategory.id,
    service_type_id: selectedServiceType.id,
    property_type_id: selectedPropertyType?.id || null,
    postcode: normalizedPostcode,
    location_lat: locationLat,
    location_lon: locationLon,
    is_direct: prefillTradeId ? true : false,
    budget_band: selectedBudget?.value || null,
  })
  .select("id")
  .single();
```

### `details` text format

```
Category: {category.name}
Service: {service.name}
Description: {trimmed description}        // omitted if empty
Property: {property.name}                  // omitted if not chosen
Postcode: {normalized postcode}
Budget: {budget.label}                     // omitted if not chosen
Timing: {timing.name}
Emergency: Yes                             // only if timing.is_emergency
```

Lines joined with `\n`, falsy entries filtered out.

### Direct vs broadcast

The mobile app is now **direct-only**: every request targets the specific
trade the client picked from a search/find-business flow
(`prefillTradeId`). The legacy broadcast `match-trades` edge function is
intentionally not called any more — see the comment in `clienthome.jsx`
around line 663. The directory should follow the same pattern: insert
the `quote_request`, then insert exactly one `request_targets` row
referencing the chosen trade with `invited_by: 'client'`.

```js
await supabase.from("request_targets").insert({
  request_id: created.id,
  trade_id: prefillTradeId,
  invited_by: "client",
  state: "invited",
  distance_miles: areaCheck?.distanceMiles,
  outside_service_area: areaCheck?.outsideServiceArea ?? false,
});
```

---

## 8. RPCs Worth Knowing About

Most of the heavy lifting on the mobile app goes through `SECURITY DEFINER`
RPCs rather than direct table writes, so RLS stays simple. Notable ones
the directory may want to reuse:

| RPC | Args | Notes |
| --- | --- | --- |
| `rpc_attach_request_images` | `p_request_id UUID, p_paths TEXT[]` | After uploading to `request-attachments`, links paths to the request. Defined outside the migrations tree. |
| `rpc_list_request_images` | `p_request_id UUID` | Returns `TEXT[]` of object paths. Auth-scoped internally. |
| `rpc_submit_review` | `p_quote_id UUID, p_rating INTEGER, p_content TEXT, p_reviewer_type TEXT, p_photos TEXT[]` | See `supabase/migrations/20260430000000_rpc_submit_review.sql`. Returns the new review's UUID. |
| `rpc_client_decide_quote` | `p_quote_id UUID, p_decision TEXT` | `'accepted'` or `'declined'`. Backfills `client_id` if NULL. |
| `rpc_trade_mark_complete` | `p_quote_id, p_payment_received, p_payment_method, p_notes` | Trade-side. Moves quote to `awaiting_completion`. |
| `rpc_client_confirm_complete` | `p_quote_id UUID` | Client confirms. Moves quote to `completed`. |
| `refresh_trade_performance_stats` | `p_profile_id UUID` | Recomputes the cached metrics. Auto-called by the reviews trigger. |

There are dozens more — see `lib/api/*.js` (especially `trust.js`,
`profile.js`, `requests.js`, `quotes.js`, `attachments.js`) for which
RPC each function calls.

---

## 9. Token-Based Auth for Web Visitors (no Supabase Auth session)

**Source:** `supabase/migrations/20260510000000_web_directory_token_auth.sql`

The web directory is expected to host enquiry conversations for visitors
who don't sign in. Those visitors get RLS access via a per-conversation
**`conversation_token UUID`** that lives on `enquiries`.

### How it works

1. An enquiry row carries `conversation_token UUID NOT NULL DEFAULT
   gen_random_uuid()` with a unique index. The token is generated server-
   side at row creation.
2. The directory hands the token to the visitor (via the URL on a "view
   your enquiry" link, or via the response of whatever `INSERT` /
   SECURITY DEFINER RPC the directory uses to create the row).
3. The visitor's web client sends the token on every subsequent request
   as a custom header: **`X-Conversation-Token: <uuid>`**. With
   `@supabase/supabase-js`:

   ```js
   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
     global: { headers: { "X-Conversation-Token": token } },
   });
   ```

4. PostgREST forwards request headers to the SQL session as
   `current_setting('request.headers', true)` (JSON, lowercased keys).
5. A helper function `current_conversation_token()` (STABLE, GRANTed to
   `anon` and `authenticated`) extracts and parses the header into a
   `UUID`, returning `NULL` if the header is absent / empty / malformed.

### What the token unlocks

| Surface | Operation | Policy condition |
| --- | --- | --- |
| `enquiries` | SELECT | `conversation_token = current_conversation_token()` |
| `enquiries` | UPDATE (USING + WITH CHECK) | same condition |
| `messages` | SELECT (rows where `enquiry_id IS NOT NULL`) | `EXISTS enquiry WHERE conversation_token = current_conversation_token()` |
| `messages` | INSERT (rows where `enquiry_id IS NOT NULL`) | WITH CHECK same condition |

The token policies are **additive** — they coexist with the existing
`auth.uid()`-based policies via OR semantics. A signed-in client / trade
sees their enquiries the same way as before; a visitor on the directory
sees only the enquiries whose token they hold. Two layers, one row.

### Things the token does NOT unlock

- **INSERT into `enquiries`** is intentionally NOT covered by token
  policy (chicken-and-egg — creating the row mints the token). The
  directory should INSERT either via the existing "Clients can create
  enquiries" auth path, or via a SECURITY DEFINER RPC that handles
  captcha + rate-limit for anonymous submission.
- **UPDATE on `messages`** — messages are append-only on this surface.
  No `read_at` updates from token holders by default.
- **Anything else.** Profiles, reviews, trade media, etc. continue to
  use the existing auth paths only.

### Operational guidance

- **Treat the token like a session cookie.** Anyone holding it has full
  read+update on the conversation. Send it over HTTPS only, store it in
  HttpOnly / SameSite cookies if possible, never log it.
- **Rotation:** if a token leaks, set a fresh one on the row
  (`UPDATE enquiries SET conversation_token = gen_random_uuid() WHERE id = $1`)
  and re-deliver the new link to the visitor. The unique index prevents
  collisions.
- **Linking messages to enquiries:** populate `messages.enquiry_id` on
  every new message tied to an enquiry conversation. Legacy messages
  (request_id-based) keep `enquiry_id` NULL and are unaffected by the
  token policies.
- **The helper is fail-closed.** Any error (missing GUC, bad JSON,
  invalid UUID) returns NULL, which means the token policies don't
  match, which means the row is hidden. Safe by default.

---

## 10. Quick-Start Checklist for the Directory Project

When you start the web directory build, for each of these you have
either a code reference or an SQL migration to copy:

- [ ] Use `@supabase/supabase-js` v2 with the **anon key** for public
      pages, **service role key** only on server (never client) for
      admin / aggregation reads.
- [ ] Filter trade lists by `role = 'trades' AND approval_status = 'approved' AND COALESCE(is_test_account, false) = false`.
- [ ] Render `photo_url` directly (public bucket).
- [ ] For request photos → use `getRequestAttachmentUrlsCached(requestId)`
      pattern (signed URLs with 58-min memo cache).
- [ ] Use `geocodeUKPostcode(postcode)` for any new client-side postcode
      handling — same outcode-fallback semantics.
- [ ] Use the `enquiries` table (V2) for new direct contacts, not
      `quote_requests` (V1, legacy + complex `request_targets` fan-out).
- [ ] If you need new RPCs, write them as `SECURITY DEFINER` with
      `SET search_path = public`, validate `auth.uid()` first, use the
      same exception pattern as `rpc_submit_review` / `rpc_client_decide_quote`.
- [ ] Avoid storing PII (`email`, `phone`) on the public-facing pages —
      RLS allows reading them but the directory should treat trade
      profiles as **business-name-only** unless the user is authed and
      has an active enquiry / quote.
- [ ] Reviews are aggregated via `trade_performance_stats` and the
      `v_trade_metrics_90d` view — read those, not raw `reviews` rows,
      for displaying ratings on cards.

---

*This document was generated by a Claude Code session against the
`feature/post-project-completion-reviews` branch (merged to `main` at
commit `850384e`). Re-generate any time the schema diverges by running
`grep -rn "ALTER TABLE profiles\|ALTER TABLE quote_requests\|ALTER TABLE
enquiries" supabase/migrations/` and checking the diff against this doc.*
