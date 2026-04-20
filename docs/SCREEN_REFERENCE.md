# Settled — Screen-by-Screen Reference

A complete reference for every screen in the Settled React Native Expo app, organized by user journey. Use this as the source of truth when redesigning the UI.

**Generated**: 2026-04-19 against the `main` branch.

---

## Table of contents

1. [How the app is structured](#how-the-app-is-structured)
2. [Auth & onboarding flow](#auth--onboarding-flow) (entry, login, register, role-select)
3. [Client flow](#client-flow) (discovery → request → manage → complete → review)
4. [Trade flow](#trade-flow) (dashboard → respond → quote → schedule → complete)
5. [Shared screens — Messages](#shared-screens--messages)
6. [Shared screens — Profile](#shared-screens--profile)
7. [Admin flow](#admin-flow)
8. [Hidden / utility routes](#hidden--utility-routes)
9. [Data sources reference](#data-sources-reference) (tables, RPCs, helper APIs)

---

## How the app is structured

**Routing**: Expo Router (file-based). The app has three top-level groups:

| Group | Purpose | Auth required |
|---|---|---|
| `(auth)` | Login, register, role-select | No (`<GuestOnly>` wrapper) |
| `(dashboard)` | Tab navigation for logged-in users | Yes |
| `(admin)` | Admin queue (verification + trade approvals) | Yes + `is_admin = true` |
| `(public)` | Public trade profile (e.g. shareable link) | No |

**Tabs in `(dashboard)`** (different per role):

| Tab name | Trade label | Client label | Visible to |
|---|---|---|---|
| `trades` | Home | — | Trades only |
| `client` | — | Home | Clients only |
| `quotes` | Projects | — | Trades only |
| `myquotes` | — | Projects | Clients only |
| `messages` | Messages | Messages | Both |
| `profile` | Profile | Profile | Both |
| `sales` | (hidden) | (hidden) | Trades only, no tab — accessed by route |

**Role gate**: Set on `profiles.role` (`'trades'` or `'client'`). Layout components in `(dashboard)/trades/` and `(dashboard)/client/` redirect the wrong role to their correct home.

**Approval gate** (trades only): `profiles.approval_status` must be `'approved'`. Otherwise the trades layout renders `pending-approval.jsx` instead of the dashboard.

---

## Auth & onboarding flow

### App root layout — `app/_layout.jsx`
- **What user sees**: Not user-facing. Provides theme, auth context, and navigation root.
- **Data shown**: None.
- **Actions**: None — routes traffic.
- **Conditional UI**: Light/dark theme via `useColorScheme()`.

### Splash / landing — `app/index.jsx`
- **What user sees**: Tradify-branded landing card with tagline "The UK's no.1 trades app" and three navigation links.
- **Data shown**: None.
- **Actions**:
  - "Login Page" → `/login`
  - "Register Page" → `/register`
  - "Profile Page" → `/profile`
- **Conditional UI**: None.

### Auth layout — `app/(auth)/_layout.jsx`
- **What user sees**: Loading spinner while checking auth status, otherwise renders the nested auth screens.
- **Data shown**: Reads `useUser()` context. Wrapped in `<GuestOnly>` so signed-in users get redirected.
- **Actions**: Routing only.

### Login — `app/(auth)/login.jsx`
- **What user sees**: Email + password fields, Login button, error box, "Register instead" link. In dev builds: a "Quick Login" row with three avatar buttons (Trade 1, Trade 2, Client).
- **Data shown**: None directly. Login flows through Supabase Auth (`auth.users`).
- **Actions**:
  - Email/password inputs → local state.
  - Login button → `useUser().login(email, password)`.
  - Quick-login avatar → same login call with hardcoded demo credentials. **Hidden in production builds via `__DEV__`**.
  - "Register instead" → `/register`.
- **Conditional UI**: Quick-login section only renders when `__DEV__ === true`. Error message only shown when login fails.

### Role select — `app/(auth)/role-select.jsx`
- **What user sees**: SETTLED logo, "Join Settled" heading, two large tappable cards ("I'm a Homeowner", "I'm a Tradesperson"), and "Already have an account? Log in" link.
- **Data shown**: None.
- **Actions**:
  - "I'm a Homeowner" → `/register?role=client`.
  - "I'm a Tradesperson" → `/register?role=trades`.
  - "Log in" → `/login`.
- **Conditional UI**: None.

### Register (multi-step) — `app/(auth)/register.jsx`
- **What user sees**: 8-step (trade) or 7-step (client) wizard with a top progress bar. Steps:
  1. Name (first + last)
  2. Email entry
  3. Email OTP verification (4-digit)
  4. Phone entry (+44 prefix)
  5. Phone OTP verification (4-digit)
  6. **Trades only**: business name + job titles dropdown (max 3 from a 17-trade list) + business postcode + travel radius (5–50 mi)
  7. Password + confirm
  8. Welcome screen
- **Data shown**:
  - Job titles list (hardcoded 17 trades).
  - Travel radius options (5, 10, 15, 20, 25, 50 mi).
  - Postcode validation hits `geocodeUKPostcode()` (postcodes.io).
  - On account creation, writes to `profiles`: `role`, `full_name`, `phone`, `email_verified`, `phone_verified`. For trades adds `business_name`, `job_titles[]`, `base_postcode`, `travel_radius_miles`.
- **Actions**:
  - Per-step inputs → local form state.
  - "Continue" → next step (or sends OTP for email/phone steps).
  - "Resend" link on OTP screens (60s countdown).
  - "Verify" on OTP screens.
  - "Create Account" on password step → Supabase Auth signup + profile insert.
  - Welcome step (trades): "Start verification" → `/profile`, or "I'll do this later" → `/(dashboard)`.
  - Welcome step (client): "Get started" → `/(dashboard)`.
  - Back button on any step returns to previous step.
- **Conditional UI**:
  - Business details step only shown when `role === 'trades'`.
  - OTP dev bypass: code `0000`, emails ending `@test.settled.com` or `@ninja.dev`, phone `+447700900000` skip verification.
  - Postcode field shows live spinner / green check / red X.

### Pending approval — `app/(dashboard)/trades/pending-approval.jsx`
- **What user sees**: Centered hourglass icon, title ("Application Under Review" or "Application Not Approved"), descriptive body text, and an info card explaining the review process.
- **Data shown**: None — receives `status` prop from layout.
- **Actions**: None — read-only state screen.
- **Conditional UI**: Different icon + copy when `status === 'rejected'` vs `'pending'`.

---

## Client flow

The client journey: open the app → browse trades → request a quote from one specific trade → manage the project → confirm completion → leave a review.

### Client layout — `app/(dashboard)/client/_layout.jsx`
- **What user sees**: Loading spinner while reading role, then a Stack navigator. If a trade lands here, redirects to `/quotes`.
- **Data shown**: `profiles.role`.

### Client home (alias) — `app/(dashboard)/client/index.jsx`
- Re-export of `home.jsx`. Acts as the default screen for the `/client` tab.

### Client home — trade discovery feed — `app/(dashboard)/client/home.jsx`
- **What user sees**: Greeting header, search bar, popular services grid (6 category icons), "Trades near you" horizontal carousel, "Willing to travel" carousel (if any). On first visit (no postcode set), a postcode prompt modal appears.
- **Data shown**:
  - `profiles.full_name` via `getUserFirstName()`.
  - `profiles.base_lat, base_lon, base_postcode, town_city` via `getMyProfile()`.
  - Trade cards via `getClosestTrades(lat, lon, limit:10)` and `getWillingToTravel(lat, lon, limit:10)` (joins `profiles` with `trade_performance_stats`).
- **Actions**:
  - Search bar tap → `/client/search-modal`.
  - Category card tap → `/client/find-business?category=<name>`.
  - Trade card tap → `/client/trade-profile?tradeId=<id>`.
  - Pull to refresh → reloads data.
- **Conditional UI**: Postcode prompt only shown if user has no `base_lat`. "Willing to travel" hidden when empty.

### Search modal — `app/(dashboard)/client/search-modal.jsx`
- **What user sees**: Full-screen overlay with a search input. Empty state shows recent searches + "All services" categories. With a query: "Services" results + "Trades" results, or a "Describe your problem instead" fallback.
- **Data shown**:
  - Recent searches via `getRecentSearches()` (local SecureStore).
  - Static service catalog from `CATEGORIES` constant.
  - Trade matches via `searchTrades(query, 5)` (queries `profiles` filtered by `approval_status='approved'`).
- **Actions**:
  - Type in search → debounced (200ms) search.
  - Tap a service result → `/client/find-business?category=...&service=...`.
  - Tap a category row → `/client/find-business?category=...`.
  - Tap a trade result → `/client/trade-profile?tradeId=...`.
  - Tap a recent search → re-runs the query.
  - Recent search "X" → removes from history.
  - "Describe your problem instead" → `/client/describe-problem` (route exists but isn't documented here).
  - Cancel → closes modal.

### Trade profile (client view) — `app/(dashboard)/client/trade-profile.jsx`
- **What user sees**: Trade's full profile — avatar/initials, business name + owner name, verification badges (Photo ID / Insurance / Credentials), location and service radius, job titles, performance stats (response time, follow-through rate, rating with star), bio, scrollable reviews (with photos), large "Request a Quote" button, "Report this trade" link.
- **Data shown**:
  - `profiles.*` for the trade via `getTradePublicById(tradeId)`.
  - `reviews.*` via `getTradeReviews(tradeId, limit:20)` joined with `reviewer:reviewer_id(full_name, photo_url)`.
  - `request_targets.state` and `tradify_native_app_db.status` for follow-through % calculation.
- **Actions**:
  - Back chevron → `router.back()` (or `/client` fallback).
  - ⓘ next to performance → opens "Performance Metrics" modal.
  - "Show all reviews" → opens full-screen reviews modal.
  - Tap a review photo → full-screen photo viewer.
  - "Request a Quote" → `/client/clienthome?prefillTradeId=<id>&prefillTradeName=<name>`.
  - "Report this trade" → currently no-op.
- **Conditional UI**: "Request a Quote" + "Report" only when viewing someone else's profile (public view). Performance message and stats only when data exists.

### Find business (browse + filter) — `app/(dashboard)/client/find-business/index.jsx`
- **What user sees**: White header with back chevron + title (either "Find a business" or `<Category> trades`). If a category was passed in, a read-only filter chip shows below the header. Search input. Then either "Discover businesses" (ranked: verified → recent) or "Search results" (filtered by query).
- **Data shown**:
  - All approved trades via `listPublicTrades(limit:50)`.
  - Verification counts via `v_business_verification_public` (batch query).
- **Actions**:
  - Back chevron → `router.back()` or `/client`.
  - Search input → live filter on `business_name | full_name | trade_title`.
  - Tap a trade row → `/client/trade-profile?tradeId=<id>`.
  - Pull to refresh → reload.
- **Conditional UI**: Non-clients see "Not available for your role". Filter chip is read-only — to change category the user goes back, then picks a different one. Subtitle line ("for <service>") shown only when service param exists.

### Find business detail — `app/(dashboard)/client/find-business/[id].jsx`
- **What user sees**: Older "second" version of the trade profile detail screen, very similar to `trade-profile.jsx` but with the legacy direct-quote request form embedded.
- **Note**: This route is no longer the primary path from home (we now route trade taps to `/client/trade-profile`). Kept reachable for backwards-compatible search-modal navigation. Worth deleting in a future cleanup pass.

### Request creation form (multi-step) — `app/(dashboard)/client/clienthome.jsx`
- **What user sees**: 6-step wizard:
  1. Category — 6 cards (Plumbing, Electrical, Bathroom, Kitchen, Cleaning, Handyman).
  2. Service type — list of specific issues (e.g. "Leak or drip", "Lighting problem").
  3. Details — postcode, description, property type dropdown, timing.
  4. Budget — radio list of budget bands.
  5. Photos + timing — gallery picker (max 5), timing radio.
  6. Review — all fields summarized with "Edit" links per row, "Submit Request" CTA.
- **Data shown** (write-mostly):
  - Categories via `getServiceCategories()` (`service_categories.*`).
  - Service types via `getServiceTypes(categoryId)` (`service_types.*`).
  - Property types via `getPropertyTypes()` (`property_types.*`).
  - Budget + timing options derived from job profile config.
  - Postcode geocoded via `geocodeUKPostcode()`.
- **Actions**:
  - Each step's "Continue" advances to next.
  - Photo "Add" → ImagePicker → resize via ImageManipulator → upload to `request-attachments` bucket as temp.
  - "Submit Request" → inserts into `quote_requests` (with `is_direct=true` since the form is direct-only) → finalizes photos via `moveTempToRequest()` → inserts into `request_targets` (one row, the prefilled trade).
  - Service area warning modal: if client postcode is outside trade's `service_radius_km`, shows "Outside Service Area" → user can confirm or cancel.
- **Conditional UI**:
  - **Direct-only guard**: if no `prefillTradeId` param is passed, the screen redirects back to `/client`. The broadcast (match-trades) path has been removed.
  - Service area warning only shows if `checkServiceAreaDistance()` reports outside-area.

### Client projects list — `app/(dashboard)/client/myquotes/index.jsx`
- **What user sees**: "Active" / "Done" tabs. Each card shows service title, status badge with color/icon (e.g. "Awaiting quotes", "In progress", "Issue reported"), and a 4-stage progress bar (Posted → Quotes → Hired → Settled).
- **Data shown**:
  - `quote_requests.*` joined with their `tradify_native_app_db` (quotes) rows.
  - Client-side state machine derives `statusType`, `statusText`, `statusDetail`, and progress bar position.
- **Actions**:
  - Card tap → `/client/myquotes/[id]` (quote detail) or `/client/myquotes/request/[id]` if no quote yet.
  - Pull to refresh → reload.
  - Tab switch (Active / Done) → filters list.
- **Conditional UI**: Action indicator (orange dot) when `actions.length > 0`. "Direct request" pill on direct requests.

### Client request detail (own request, read-only) — `app/(dashboard)/client/myquotes/request/[id].jsx`
- **What user sees**: Full request: parsed details (category, service, description, property, timing, budget, postcode, emergency flag), attachment thumbnails, list of received quotes, list of appointments. "Direct request to: <Trade>" chip if applicable.
- **Data shown**:
  - `quote_requests.*` (parsed `details` text).
  - `tradify_native_app_db.*` filtered by `request_id`.
  - `appointments.*` filtered by `request_id`.
  - Attachment paths via `listRequestImagePaths()` + signed URLs.
- **Actions**:
  - Back chevron → `router.back()`.
  - Attachment thumbnail tap → full-screen photo viewer.
  - Quote card tap → `/client/myquotes/[id]?id=<quoteId>`.
  - Appointment card tap → `/client/myquotes/appointment-response`.
- **Conditional UI**: Sections hidden when empty.

### Client quote detail / project detail — `app/(dashboard)/client/myquotes/[id].jsx`
- **What user sees**: Quote overview — trade name + photo, quote breakdown (line items expandable), "Your request" expandable, attachments thumbnails, appointments list (each expandable with "Accept" / "Reschedule" / "Request cancellation"), client review section if review exists.
- **Data shown**:
  - `tradify_native_app_db.*` (quote).
  - `profiles.*` (the trade).
  - `quote_requests.*` (associated request).
  - `appointments.*` (filtered by quote).
  - Review row if any.
  - Attachment paths via `listRequestImagePaths()` + signed URLs.
- **Actions**:
  - Expand/collapse: quote breakdown, request, each appointment.
  - "Accept appointment" → RPC `rpc_confirm_appointment()`.
  - "Reschedule" → opens date/time picker modal.
  - "Request cancellation" → status update RPC.
  - Attachment thumbnail tap → full-screen viewer.

### Client respond to appointment proposal — `app/(dashboard)/client/myquotes/appointment-response.jsx`
- **What user sees**: Trade's avatar + name, appointment card (title, date, time, location), buttons: "Yes, confirm" (green) and "Suggest another time" (outlined).
- **Data shown**:
  - `appointments.*` (id, scheduled_at, title, status, location, notes).
  - `tradify_native_app_db.*` (for project_title via quote).
  - `profiles.*` (trade: business_name, full_name, photo_url).
- **Actions**:
  - "Yes, confirm" → RPC `rpc_confirm_appointment()` or direct update `appointments.status='confirmed'`. Alert + redirect to quote detail.
  - "Suggest another time" → toggle inline form with date + time picker → "Send suggestion" updates appointment + sends a chat message to the trade.

### Client confirm completion — `app/(dashboard)/client/myquotes/completion-response.jsx`
- **What user sees**: "<Trade> marked this job complete." Card shows trade avatar + name, job title, quote amount, amount paid, payment method, date marked. Buttons: "Confirm Job Complete" (green) and "There is an issue" (outlined).
- **Data shown**:
  - `tradify_native_app_db.*` (quote info).
  - `quote_requests.*` (for service info).
  - `profiles.*` (trade).
- **Actions**:
  - "Confirm Job Complete" → RPC `rpc_client_confirm_complete(quote_id)` → `/client/myquotes/completion-success`.
  - "There is an issue" → `/client/myquotes/report-issue`.

### Completion success → review prompt — `app/(dashboard)/client/myquotes/completion-success.jsx`
- **What user sees**: Big green checkmark, "Job complete" title, trade card, "How was your experience?" prompt with two buttons: "Leave a review" and "Maybe later".
- **Data shown**: Params from previous screen (no DB read).
- **Actions**:
  - "Leave a review" → `/client/myquotes/leave-review` with `quoteId`, `revieweeName`, `revieweeType='trade'`, `tradePhotoUrl`, `jobTitle`.
  - "Maybe later" → `/client/myquotes` (dismiss).

### Leave a review — `app/(dashboard)/client/myquotes/leave-review.jsx`
- **What user sees**: Trade card at top, "How would you rate your experience?" question, 5-star rating selector, free-text review input, photo gallery (up to 5 — pick from library, resized + previewed), "Submit review" button. Loading overlay during photo prep + upload.
- **Data shown**: Params from previous screen (no DB read on load).
- **Actions**:
  - Tap stars → set rating.
  - Type → review text.
  - "Add" photo → ImagePicker → ImageManipulator (resize/compress).
  - Tap photo → full-screen viewer with delete option.
  - Submit → uploads photos to `review-photos` storage bucket via `FileSystem.readAsStringAsync` + `decode(base64)` → calls `rpc_submit_review(p_quote_id, p_rating, p_content, p_reviewer_type, p_photos)` → `/client/myquotes/review-success`.
- **Conditional UI**: Submit disabled until rating selected. Loading overlay during upload.

### Review success — `app/(dashboard)/client/myquotes/review-success.jsx`
- **What user sees**: Green check, "Thanks for your review", "Your feedback helps build trust in the Settled community", and a "Done" button.
- **Actions**: "Done" → dismisses to `/client`.

### Report an issue — `app/(dashboard)/client/myquotes/report-issue.jsx`
- **What user sees**: "What's the problem?" question, 4 radio options (Work isn't finished, Quality isn't right, Price changed, Other issue), free-text "Tell us more" input, Submit button.
- **Actions**: Submit → `rpc_client_report_issue(quote_id, reason, details)` → alerts + redirects back to quote detail.

### About `app/(dashboard)/myquotes/`
A parallel directory of re-export shims (`index.jsx`, `[id].jsx`, `request/`, etc.) that delegate to the corresponding `client/myquotes/` screens. Lets some routes work from the top-level tab name (`/myquotes`) instead of the nested `/client/myquotes/`. Identical behavior — just different URL.

---

## Trade flow

The trade journey: open the app → see what needs attention → respond to client requests → send quote → schedule appointment → mark complete → get reviewed.

### Trade layout (with approval gate) — `app/(dashboard)/trades/_layout.jsx`
- **What user sees**: Loading spinner while role + approval status load. If role is `client`, redirect to `/client`. If `approval_status !== 'approved'`, render the `pending-approval` screen instead of the dashboard stack.
- **Data shown**: `profiles.role`, `profiles.approval_status`.

### Trade home dashboard — `app/(dashboard)/trades/index.jsx`
- **What user sees**: (Recently redesigned.)
  1. **Header**: Time-aware greeting + today's date.
  2. **Glance strip**: One-line summary ("3 appointments today · 2 items need attention · 5 quotes awaiting").
  3. **TODAY**: Appointment rows (time / type / client / location) with [Directions] [Message] chips. Tomorrow shown smaller below.
  4. **NEEDS YOUR ATTENTION**: Up to 3 prioritized cards — issue, direct request, send quote, awaiting reply, schedule work. Each shows status dot, label, service type name, client name, meta (budget / days).
  5. **PIPELINE**: 4 clickable rows (Active jobs, Quotes awaiting, Scheduled, Completed this month).
  6. **THIS MONTH**: Earnings + Active job value (hidden if both zero).
  7. **YOUR HEALTH**: Compact strip of Response · Follow-through · Rating with ⓘ.
  8. **Profile footer**: Slim banner if profile <100% complete.
- **Data shown**:
  - `profiles.full_name` for greeting.
  - `request_targets.*` filtered by `trade_id` (inbox).
  - `tradify_native_app_db.*` filtered by `trade_id` (sent quotes).
  - `quote_requests.*` joined with `service_types(name)` for service name on cards.
  - `appointments.*` via `rpc_trade_list_appointments`.
  - Conversations via `rpc_list_conversations` to map `request_id → conversation_id` and pull privacy-aware client names.
  - Client contact unlock state via `rpc_get_client_contact_for_request`.
  - Reviews count + rating via `getTradeReviews()` (and `trade_performance_stats` cache).
- **Actions**:
  - Glance + section labels are display only.
  - "View calendar" link → opens `CalendarModal`.
  - Appointment row tap → `/trades/quote/<id>` or `/trades/request/<id>`.
  - [Directions] chip → opens Maps app.
  - [Message] chip → `/messages/<conversationId>`.
  - Attention card tap → routes into trades stack: `/trades/quote/<id>` (with quote) or `/trades/request/<id>` (no quote yet).
  - Pipeline rows tap → `/quotes?filter=active|sent|completed` or open Calendar.
  - Profile footer tap → `/profile/settings`.
  - ⓘ on Health → opens "Performance Metrics" modal.
- **Conditional UI**:
  - "Welcome" greeting + special empty state for new trades (no inbox/sent yet).
  - Tomorrow group only when there are tomorrow appointments.
  - Pipeline + Month + Health sections always render.
  - Profile footer hidden when 100% complete.

### Trade detail (browse) — `app/(dashboard)/trades/[id].jsx`
- **What user sees**: Trade profile card (avatar/initials, name, rating, business name, trade title, bio, service areas). For clients only: a "Request a quote" CTA.
- **Data shown**: `profiles.*` via `getTradeById(id)`. Role check via `getMyRole()`.
- **Actions**:
  - Back → pop.
  - "Request a quote" (client only) → calls `requestDirectQuote(id)`, shows confirmation alert.
- **Note**: Older route. Most client traffic now goes through `/client/trade-profile`.

### Pipeline — `app/(dashboard)/trades/pipeline.jsx`
- **What user sees**: "Pipeline" header, summary cards (active value, completed value), filter tabs (All / Accepted / In Progress / Completed), list of cards each showing client name, postcode, quote total inc. VAT, status badge, and next appointment date.
- **Data shown**:
  - `tradify_native_app_db` filtered by `trade_id`.
  - Joined `quote_requests.suggested_title, postcode`.
  - `rpc_list_conversations`, `rpc_get_client_contact_for_request`, `rpc_trade_list_appointments` for client + appointment context.
- **Actions**: Filter tab tap → filters list. Card tap → `/trades/quote/<id>`. Pull to refresh → reload.

### Pipeline quote detail (re-export) — `app/(dashboard)/trades/quote/[id].jsx`
- One-line re-export of `quotes/[id].jsx`. Lets pipeline navigation stay in the trades tab stack.

### Pipeline request detail (re-export) — `app/(dashboard)/trades/request/[id].jsx`
- One-line re-export of `quotes/request/[id].jsx`. Lets request navigation from trade home stay in the trades tab stack so the X button returns to home, not Projects.

### Quotes overview (sales) — `app/(dashboard)/trades/quotes-overview.jsx`
- **What user sees**: Purple header with "Quotes" + back. Tabs: Draft | Sent (with sub-counts Acc/Dec/Exp) | Status. List of quote rows with quote ID, dates, amount, status, contextual buttons ("Schedule Job" if accepted no job, "Mark Completed" if job exists).
- **Data shown**: `v_trades_sales` view filtered by `kind='quote'`.
- **Actions**: Tab tap → filter. "Schedule Job" → `createJobFromQuote()`. "Mark Completed" → `markJobCompleted()`. Pull to refresh.

### Trade Projects tab (quotes index) — `app/(dashboard)/quotes/index.jsx`
- **What user sees**: Filter pills (All / New / Active / Past). Project cards each showing service title, client name, postcode, status icon+text, snippet, budget, badges (extended-travel, outside-service-area), quote amount, contextual action buttons ("Accept Request" / "Decline Request" for new, "Schedule" / "Issue Resolved" for in-progress). Progress bar across each card (Request → Quote → Work → Settled).
- **Data shown**:
  - `request_targets.*` filtered by `trade_id`.
  - `tradify_native_app_db.*` filtered by `trade_id`.
  - `quote_requests.*` joined.
  - `rpc_list_conversations`, `rpc_get_client_contact_for_request`, `rpc_trade_list_appointments`, `profiles.full_name` fallback.
- **Actions**:
  - Filter pill tap → filter list.
  - Card tap → `/quotes/request/<id>` (new) or quote detail.
  - "Accept Request" / "Decline Request" → RPCs.
  - "Schedule" → `/quotes/schedule?requestId=...&quoteId=...`.
  - "Issue Resolved" → status update.
  - Pull to refresh.

### Quote detail (dual role) — `app/(dashboard)/quotes/[id].jsx`
- **What user sees**: Used by both trade and client.
  - Trade view: project title, client name (privacy-aware), quote ID, total inc. VAT breakdown, valid-until date, line items, notes, attachments carousel, status-dependent actions (Reschedule / Issue Resolved / Mark Complete).
  - Client view: same overview but shows trade business name; status-dependent actions (Accept Quote / Decline / Reschedule).
- **Data shown**:
  - `tradify_native_app_db.*`.
  - `quote_requests.*` joined.
  - `property_types.name`, `timing_options.name`.
  - `appointments.*` via RPC.
  - `profiles.*` (trade) on client view.
  - Attachments via `listRequestImagePaths` + signed URLs.
- **Actions**: Many — see role-based bullets above. Image carousel tap → full-screen viewer.
- **Conditional UI**: Role-gated buttons. Attachments hidden if none.

### Quote builder — `app/(dashboard)/quotes/create.jsx`
- **What user sees**: Two-step form.
  - **Step 1**: project info (title, category, service, postcode, client name).
  - **Step 2**: line items list (each with name, description, unit price, qty), VAT toggle + rate, totals (subtotal / tax / grand total). Bottom CTA: "Save Draft" or "Send Quote".
- **Data shown**: On load reads `quote_requests.*` (and joined `service_categories.name`, `service_types.name`) if `requestId` param. Existing draft loaded by `quoteId` param. Client name via `rpc_get_client_contact_for_request`.
- **Actions**:
  - All fields editable.
  - "+ Add line item" → appends row.
  - "Continue to Review" → step 2.
  - "Save Draft" → `createQuote()` or `updateQuote()`.
  - "Send Quote" → status `sent`, navigates back.
- **Conditional UI**: Title field locked if passed in. VAT section only when toggle on. "Send Quote" requires at least one line item.

### Trade view of client request — `app/(dashboard)/quotes/request/[id].jsx`
- **What user sees**: Client info card (initials, name, contact-unlocked badge, budget), request details (title, category, service, description, property, timing, budget, emergency flag), attachments carousel, quotes section (any existing drafts/sent quotes for this request). Status-dependent CTAs:
  - Unclaimed: "Accept Request", "Decline Request", "View Similar Jobs".
  - Quoted: "Create Quote" (if none), Edit/Send (on drafts), "Schedule Work" (on accepted).
- **Data shown**:
  - `quote_requests.*` joined with `property_types.name`, `timing_options.name`.
  - `tradify_native_app_db.*` (quotes for this request).
  - `rpc_get_client_contact_for_request` for privacy-aware contact.
  - Attachments via `listRequestImagePaths` + signed URLs.
- **Actions**:
  - X (top right) → `router.back()` (or `/quotes` fallback).
  - "Accept Request" → `acceptRequest()`.
  - "Decline Request" → `declineRequest()`.
  - Image tap → full-screen viewer.
  - "Create Quote" → `/quotes/create?requestId=...&title=...`.
  - Draft Edit/Send → `/quotes/create?quoteId=...`.
  - "Schedule Work" → `/quotes/schedule?requestId=...&quoteId=...`.
  - Pull to refresh.
- **Conditional UI**: Buttons gated by quote/request status. Contact badge varies (unlocked vs locked).

### Appointment scheduling — `app/(dashboard)/quotes/schedule.jsx`
- **What user sees**: 6 appointment-type cards (Survey, Design, Start work, Follow-up, Final inspection, +1), optional note, date picker row, time picker row, "Schedule Appointment" CTA.
- **Data shown**: `quote_requests.suggested_title, postcode, requester_id, details` (if requestId param). Client name via RPCs.
- **Actions**:
  - Type card tap → select.
  - Date picker → modal (future-only validation).
  - Time picker → modal (requires date first).
  - "Schedule Appointment" → `rpc_send_appointment_message()` → confirmation alert.

---

## Shared screens — Messages

### Messages layout — `app/(dashboard)/messages/_layout.jsx`
Stack navigator only.

### Conversations list — `app/(dashboard)/messages/index.jsx`
- **What user sees**: "Messages" header. List of conversation cards: avatar (48px, color fallback), other party name, last-message snippet (≤50 chars), timestamp (time today, date otherwise), unread blue dot + bold font for unread. Empty state when none.
- **Data shown**: `rpc_list_conversations()` → `conversation_id, request_id, quote_id, other_party_id, other_party_name, other_party_role, other_party_photo_url, last_message_body, last_message_at, has_unread`. Filtered to those with at least one message.
- **Actions**: Card tap → `/messages/<id>` with params (id is request_id, plus name, quoteId, avatar). Pull to refresh.

### Message thread — `app/(dashboard)/messages/[id].jsx`
- **What user sees**: Header with back + other party avatar + name. Reversed chronological message list. Message bubbles left-aligned (other) or right-aligned (mine). Image attachments use a WhatsApp-style grid (1 = full-width, 2 = side-by-side, 3 = mixed, 4+ = 2×2 with overflow chip). Appointment cards (calendar icon + title + status badge + date/time/location). Bottom: text input + attachment button + send.
- **Data shown**: `messages.*` (body, created_at, attachment_paths). `appointments.*` for inline cards.
- **Actions**:
  - Image tap → full-screen viewer with pagination dots.
  - Attachment button → image picker.
  - Send → inserts message + uploads attachments.
  - Appointment Accept/Decline (client side, when proposed) → updates appointment.
  - Appointment Edit (trade side) → opens edit modal.

---

## Shared screens — Profile

### Profile layout — `app/(dashboard)/profile/_layout.jsx`
Stack navigator.

### Profile home (role-based) — `app/(dashboard)/profile/index.jsx`
- **What user sees**:
  - **Trade**: 2-column profile card (avatar, business name, verification badges; job titles + location), 3-column performance metrics (rating + count, response time, follow-through), bio, horizontal-scrolling reviews carousel. Top-right hamburger menu opens settings.
  - **Client**: simplified card (avatar, name, project count).
- **Data shown**: `profiles.*` (full_name, business_name, photo_url, job_titles, town_city, base_postcode, service_radius_km, bio, review_count, average_rating, project_count, verification.{photo_id,insurance,credentials}). Reviews via `getTradeReviews()`. Quote rate from `request_targets.state` + `tradify_native_app_db.status`.
- **Actions**:
  - Top-right menu → `/profile/settings`.
  - Review card tap → opens "Show all reviews" modal.
  - ⓘ on metrics → "Performance Metrics" modal.
- **Conditional UI**: Trade-only sections (perf, bio, reviews). Client-only project count. Verification badges show solid (verified) or dashed outline (not started). "—" when metrics not yet calculated.

### Settings menu — `app/(dashboard)/profile/settings.jsx`
- **What user sees**: Sectioned menu (Verification for trades, Personal Details, Business for trades, Account, app version). Top of screen: colored verification banner ("Almost done", "Under review", "Verified", "Action needed", "Expiring soon").
- **Data shown**: `profiles` (full_name, email, phone, business_name, base_postcode). Verification status via `getMyVerificationStatus()`. `isCurrentUserAdmin()`.
- **Actions** (each row):
  - Photo ID → `/profile/photo-id`
  - Insurance → `/profile/insurance`
  - Credentials → `/profile/credentials`
  - Email → `/profile/change-email`
  - Phone → `/profile/change-phone`
  - Business → `/profile/business`
  - Service areas → `/profile/service-areas`
  - Address (client) → `/profile/address`
  - Admin (admins only) → `/(admin)/reviews`
  - Developer Settings (dev builds only) → `/profile/developer-settings`
  - Notifications → `/profile/notifications`
  - Help & support → `/profile/help` (route does not exist — broken link to fix)
  - Sign out → `/profile/signout`
- **Conditional UI**: Verification + Business sections trade-only. Address client-only. Admin row + Dev Settings gated by their respective checks.

### Profile edit (generic) — `app/(dashboard)/profile/edit.jsx`
- **What user sees**:
  - **Client**: Email (disabled) + Full name + Phone + Save.
  - **Trade**: Business name, Trade title, Bio (multiline), Photo URL with preview, Save Public Info button. Then Base Address section (becomes locked after first save), Service Radius pills (5/10/15/25/35/50 km).
- **Data shown**: `profiles.*` (most fields).
- **Actions**:
  - "Save Public Info" → `updateMyProfile()`.
  - "Set Base Address" → `setBaseAddressOnce()` + `geocodeUkPostcode()`.
  - Radius pill tap → `updateServiceRadius()`.
- **Conditional UI**: Trade-only sections. Address fields disabled once locked.

### Trade profile (self + public) — `app/(dashboard)/profile/trade-profile.jsx`
- Identical layout to `index.jsx` but supports `tradeId` param for public viewing. Adds "Request a Quote" button + "Report this trade" link in public mode.

### Client profile — `app/(dashboard)/profile/client-profile.jsx`
- **What user sees**: Back button, large 96px avatar, display name, email, project count row, member-since date, "Edit Photo" button.
- **Data shown**: `profiles.full_name, email, photo_url, project_count, created_at`.
- **Actions**: "Edit Photo" → `/profile/photo`.

### Verification screens
- `photo.jsx` — profile photo upload.
- `photo-id.jsx` — submit photo ID for verification.
- `insurance.jsx` — submit insurance certificate (policy_provider, policy_number, coverage, document).
- `credentials.jsx` — submit credentials (Gas Safe, NICEIC, NAPIT, OFTEC, CSCS, etc.).
- `business.jsx` — edit business name + trade title.
- `service-areas.jsx` — postcode-based service area selector with radius.
- `address.jsx` — client's address fields.
- `change-email.jsx`, `change-phone.jsx` — change contact details.
- `notifications.jsx` — toggle push notification preferences.
- `signout.jsx` — confirmation modal that calls `useUser().logout()`.

### Developer settings — `app/(dashboard)/profile/developer-settings.jsx`
- **What user sees**: Current Status card (Environment badge, fallback warning, retry count). Environment selector with two cards (Production, Local) each with "Test" button. Fallback toggle. Local Setup instructions card with code snippets.
- **Data shown**: Local config from `lib/supabase.js` (`getEnvironmentStatus()`). Connection test results via `testConnection()`.
- **Actions**:
  - Environment radio → confirmation alert → `switchEnvironment()`.
  - "Test" → `testConnection()` → shows latency or error.
  - Auto-fallback toggle → `setFallbackEnabled()`.
  - "Reset to Primary" (when on fallback) → `resetToPrimary()`.
- **Conditional UI**: **Hidden in production builds** via the `__DEV__` wrap on its row in `settings.jsx`. The screen file itself isn't gated — only its entry point.

---

## Admin flow

### Admin layout (auth gate) — `app/(admin)/_layout.jsx`
- **What user sees**: Loading spinner ("Checking access…") while verifying admin via `isCurrentUserAdmin()`. Non-admins are redirected to `/profile`.

### Review queue — `app/(admin)/reviews.jsx`
- **What user sees**: Header with back + refresh. Horizontal filter tabs: All | Photo ID | Insurance | Credentials | Applications. List of cards with type badge, priority badge (if priority > 1), date, user info, type-specific details. Action buttons: View Document, Verify Online (links to Gas Safe / NICEIC / NAPIT / OFTEC / CSCS), Reject (red), Approve (green). Reject modal collects a reason. Pull to refresh.
- **Data shown**:
  - `getPendingReviews(filter)` → joins `verification_review_queue` with `profiles` and the relevant submission table (`photo_id_submissions`, `insurance_submissions`, `credential_submissions`).
  - `getPendingTradeApprovals()` → `profiles` rows with `approval_status='pending'`.
- **Actions**:
  - Filter tab → reload.
  - View Document → `getDocumentSignedUrl()` → `Linking.openURL()`.
  - Verify Online → opens external registry URL.
  - Approve → `approveSubmission()` (verification) or `approveTradeProfile()` (trade application).
  - Reject → modal → `rejectSubmission()` or `rejectTradeProfile()`.
  - Copy registration number → `Clipboard.setStringAsync()`.

---

## Hidden / utility routes

- `app/(dashboard)/sales.jsx` — Trade sales hub (Quotes card + Invoices card with counts). Hidden from tabs (`href: null`). Reachable via direct nav from quotes-overview etc.
- `app/(public)/trades/[id].jsx` — Public-facing trade profile (no login required). Used for shareable links. Shows verification badges + 90-day metrics. Owner viewing own profile sees an "Edit my public info" button.

---

## Data sources reference

### Supabase tables (most-used)
| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | All users (clients + trades) | `id`, `role`, `approval_status`, `is_admin`, `full_name`, `business_name`, `trade_title`, `photo_url`, `bio`, `base_postcode`, `base_lat`, `base_lon`, `town_city`, `service_radius_km`, `extended_radius_km`, `job_titles[]`, `service_type_ids[]`, `verification` (computed) |
| `quote_requests` | Client requests | `id`, `requester_id`, `service_type_id`, `service_category_id`, `property_type_id`, `postcode`, `lat`, `lon`, `details`, `suggested_title`, `budget_band`, `is_direct`, `status` |
| `request_targets` | Which trades got which requests | `request_id`, `trade_id`, `state`, `outside_service_area`, `distance_miles`, `extended_match`, `invited_by`, `created_at`, `first_action_at` |
| `tradify_native_app_db` | Quotes (legacy table name) | `id`, `request_id`, `trade_id`, `client_id`, `status`, `line_items`, `subtotal`, `tax_total`, `grand_total`, `valid_until`, `issued_at` |
| `appointments` | Scheduled visits | `id`, `request_id`, `quote_id`, `trade_id`, `scheduled_at`, `title`, `type`, `status`, `location`, `notes` |
| `reviews` | Client reviews of trades | `id`, `quote_id`, `reviewer_id`, `reviewee_id`, `reviewer_type`, `rating`, `content`, `photos[]`, `created_at` |
| `messages` | Conversation messages | `id`, `conversation_id`, `sender_id`, `body`, `attachment_paths[]`, `created_at` |
| `service_categories`, `service_types`, `property_types`, `timing_options` | Lookup tables | `id`, `name`, `display_order` |
| `trade_performance_stats` | Cached metrics | `profile_id`, `average_rating`, `review_count`, `quote_rate`, `avg_response_time_hours`, `jobs_completed_count` |
| `verification_review_queue`, `photo_id_submissions`, `insurance_submissions`, `credential_submissions`, `trade_verifications` | Verification pipeline | various — see `lib/api/admin.js` |
| `client_interests` | Saved category preferences | `client_id`, `service_category_id` |
| Storage buckets | `request-attachments` (private, signed URLs), `review-photos` (public), `verification-documents` (private) | |

### Views
- `v_business_verification_public` — public-safe verification flags per trade.
- `trade_public_metrics_90d` — 90-day public KPIs (sent, accepted, declined, expired, acceptance rate, response time p50).
- `v_trade_metrics_90d` — private metrics view.
- `v_trades_sales` — quote + invoice rollup for sales dashboard.

### Key RPCs
| RPC | Used by | Purpose |
|---|---|---|
| `rpc_list_conversations` | Trade home, messages list | All conversations for current user with last message + unread state |
| `rpc_get_client_contact_for_request` | Trade pipeline / request detail | Privacy-aware client name (masks until contact unlocked) |
| `rpc_trade_list_appointments` | Trade home, calendar | All appointments for current trade |
| `rpc_send_appointment_message` | Schedule screen | Creates appointment + posts to messages |
| `rpc_confirm_appointment` | Client appointment-response | Marks appointment confirmed |
| `rpc_create_quote_from_request` | Quote builder | Creates skeleton quote from a request |
| `rpc_trade_accept_request`, `rpc_trade_decline_request` | Quotes index, request detail | Trade accepts/declines a request invitation |
| `rpc_get_client_request_usage` | (legacy) request creation | Daily/weekly request limits |
| `rpc_client_list_requests` | (legacy) | List client's open requests |
| `rpc_client_confirm_complete` | Client completion-response | Marks job complete from client side |
| `rpc_client_report_issue` | Client report-issue | Flags an issue on a quote |
| `rpc_submit_review` | Client leave-review | Inserts a review row + photos |
| `rpc_create_job_from_quote`, `rpc_mark_job_completed` | Trade quotes-overview | Job lifecycle |
| `refresh_trade_performance_stats` | Trigger on `reviews` insert/update/delete | Recomputes cached `trade_performance_stats` |
| `rpc_register_push_token` | App init | Registers Expo push token |

### Key helper API modules (in `lib/api/`)
- `profile.js` — `getMyProfile`, `updateMyProfile`, `getMyRole`, `getTradeById`/`getTradePublicById`, `listPublicTrades`, `searchTrades`, `setBaseAddressOnce`, `updateServiceRadius`, `setClientLocation`, `getMyVerificationStatus`.
- `feed.js` — `getClosestTrades`, `getHighestRatedNearby`, `getWillingToTravel`, `setClientInterests`, `getMyInterests`. Includes a live `backfillLiveReviewStats()` safety net.
- `trust.js` — `getBusinessVerificationPublic`, `getTradePublicMetrics90d`, `getTradeMetrics90d`, `getTradeReviews`.
- `admin.js` — `isCurrentUserAdmin`, `getPendingReviews`, `approveSubmission`, `rejectSubmission`, `getPendingTradeApprovals`, `approveTradeProfile`, `rejectTradeProfile`, `getDocumentSignedUrl`.
- `attachments.js` — `uploadTempImage`, `moveTempToRequest`, `listRequestImagePaths`, `getSignedUrls`, `attachRequestImages`, `deleteTempImages`.
- `quotes.js` — `listMyTradeQuotes`, `updateQuoteStatus`, `getQuoteById`, `createQuoteFromRequest`.
- `requests.js` — `acceptRequest`, `declineRequest`.
- `directRequest.js` — `requestDirectQuote`, `checkServiceAreaDistance`.
- `homeScreen.js` — `getRecentCompletions`, `getClientActiveRequests`, `getUserFirstName`, `getRecentSearches`, `saveRecentSearch`, `removeRecentSearch`.
- `places.js` — `geocodeUKPostcode`, `searchPlaces`, `validateUKPostcode`, `autocompleteUKPostcode`.
- `services.js` — `getServiceCategories`, `getServiceTypes`, `getPropertyTypes`, `getTimingOptions`.

---

## Notes for redesign

- **Color usage**: Settled purple `#6849a7` is the only primary accent. Status colors are red `#EF4444` (issue), orange `#F59E0B` (attention), blue `#3B82F6` (new/info), green `#10B981` (success/scheduled), gray `#6B7280` (waiting).
- **Typography**: Section labels are 11px uppercase 600-weight, letter-spaced 0.6px, color `#6B7280`. Body text 14–15px. Big numbers (Pipeline / Health) 18–22px 600-weight `#111827`.
- **Surface**: White backgrounds, hairline `#F3F4F6` borders. Avoid drop shadows.
- **Already-redesigned screens** (use as the reference style): Trade home (`trades/index.jsx`), Find business list (`find-business/index.jsx`), Trade Approval flow.
- **Screens worth a redesign pass next**:
  - Client home — design system not yet aligned with trade home.
  - Quote builder (`quotes/create.jsx`) — long form, dense.
  - Quote detail (`quotes/[id].jsx`) — dual-role complexity.
  - Settings + verification screens — visual style is older.
  - Messages thread — the WhatsApp-style image grid is custom and could be cleaner.
- **Known dead code / cleanup candidates**:
  - `app/(dashboard)/client/find-business/[id].jsx` — duplicate of trade-profile flow with embedded request form. Probably deletable now that `/client/trade-profile` is the primary route.
  - `app/(dashboard)/myquotes/` — re-export shims that mostly duplicate `/client/myquotes/`. Could be consolidated.
  - `supabase/functions/match-trades` — edge function, no longer invoked after the broadcast→direct migration.
  - `app/index.jsx` — debug landing page; should redirect straight to login if not authenticated.
  - `app/(dashboard)/profile/settings.jsx:438` — `Help & support` row routes to `/profile/help` which doesn't exist.

---

*End of reference. Update this file when adding new screens or significantly changing existing ones.*
