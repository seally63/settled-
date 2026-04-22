# Settled

> Copyright (c) 2025 Ronan Seally. All rights reserved. This repository is publicly visible for portfolio and review purposes only. Redistribution, commercial use, or derivative works require written permission. See [`LICENSE`](./LICENSE).

Settled is an invite-only platform connecting UK homeowners with hand-picked, verified tradespeople. No bidding wars, no lead fees, no auction dynamics. Homeowners browse a curated set of trades and send a direct enquiry to the one they want. Trades receive qualified leads they can accept or decline.

## Tech Stack

- **React Native** with **Expo (SDK 54)** and **Expo Router v4** for navigation
- **Supabase** for the backend:
  - PostgreSQL with extensive Row Level Security policies
  - Auth (email + OTP)
  - `SECURITY DEFINER` RPCs for privacy-aware reads and guarded writes
  - Storage buckets for photo attachments with signed URLs
  - Edge Functions for server-side logic
- **postcodes.io** for UK postcode validation and latitude/longitude geocoding
- **Expo Push Notifications** for appointment and quote updates
- **expo-image** with memory and disk caching for attachment viewers

## Key Features

- **Three-tier trade verification**: photo ID, public liability insurance, and trade credentials including a live Gas Safe API lookup for gas engineers
- **Real-time messaging** with photo attachments, party-grouped threads, and unread indicators
- **Quote creation** with line item breakdowns, VAT toggle, validity windows, and draft support
- **Appointment scheduling** with typed kinds (survey, design consultation, start job, follow-up, final inspection), a calendar bottom sheet for both parties, and a reschedule flow gated by 24-hour rules
- **Client review system** with 1 to 5 star ratings, optional photos, and profile aggregation
- **Admin panel** for verification review and content moderation
- **Role-based access** with RLS policies on every client-facing table and RPC, ensuring trades only see their own pipeline and clients only see their own projects
- **Postcode-based proximity matching** using the Haversine formula against each trade's configured service radius

## Project Structure

```
app/                                  Expo Router routes
  (auth)/                             Sign-in, OTP, registration wizard
  (dashboard)/
    _layout.jsx                       Floating tab bar, role-based tab visibility
    client/                           Client-only screens (home, find-business, profile)
    quotes/                           Trade Projects tab (list, request detail, quote builder, schedule)
    myquotes/                         Client Projects tab (list, request detail, quote detail)
    messages/                         Unified messaging tab
    trades/                           Trade home dashboard
    profile/                          Shared profile screens
lib/
  api/                                Typed wrappers for every Supabase RPC and table read
  supabase.js                         Client singleton
components/
  design/                             Shared primitives (Panel, StripeRow, ProjectRow, etc.)
  client/, trades/                    Role-specific home-panel components
constants/                            Colors, Typography, canonical project states
supabase/migrations/                  All database migrations, numbered by date
```

## My Role

I built Settled end to end. Product design, full-stack implementation, database schema, RLS policy design, RPC authoring, native build toolchain setup, and the verification pipeline are all mine. The codebase currently stands at roughly 80 application screens, 60 database migrations, and 30 RPC helpers across two distinct user roles. Recent work includes a party-grouped conversation restructure, a Start Work state machine tied to appointment kinds, a memoised attachment cache backed by expo-image, and a client-side calendar modal driving the Active Job home panel.
