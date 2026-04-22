// components/client/home/ActiveJobPanel.jsx
// Active Job panel on the redesigned client home.
//
// Shows up to 3 upcoming appointments as cards with:
//   • Kind-aware icon (Survey / Start Job / Follow-up / Final / Design)
//   • Title:    "{Type label} for {Service or project}"
//   • Subtitle: "{Business name} · DD MMM, HH:MM"
//
// Tapping a card opens the client's Your Request screen for that
// appointment's request. The Panel's header chevron opens a calendar
// bottom-sheet modal (ClientCalendarModal) showing every appointment
// for the signed-in client across the current + future months.
//
// Data:
//   • rpc_client_list_appointments({ p_only_upcoming: false })
//       — all appointments scoped to this client via RLS
//   • rpc_trade_public_names({ trade_ids })
//       — business names for each unique tradesperson_id
//
// Kind is backfilled from the appointment's title string when the
// `kind` column isn't returned (legacy rows / RPC predates the
// 2026-04-28 migration).

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { supabase } from "../../../lib/supabase";
import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";

import { Panel } from "../../design";
import ThemedText from "../../ThemedText";
import { Colors } from "../../../constants/Colors";
import { FontFamily, Radius, TypeVariants } from "../../../constants/Typography";

import ClientCalendarModal from "./ClientCalendarModal";

const APPT_KIND_META = {
  survey:    { label: "Survey",              icon: "search-outline",        color: "#5BB3FF" },
  design:    { label: "Design consultation", icon: "color-palette-outline", color: "#7C5CFF" },
  start_job: { label: "Start Job",           icon: "hammer-outline",        color: "#F4B740" },
  followup:  { label: "Follow-up",           icon: "refresh-outline",       color: "#14B8A6" },
  final:     { label: "Final inspection",    icon: "checkmark-done-outline",color: "#3DCF89" },
};

function inferKindFromTitle(title) {
  const t = String(title || "").toLowerCase();
  if (t.includes("start job") || t.includes("start work")) return "start_job";
  if (t.includes("final inspection") || t.includes("final")) return "final";
  if (t.includes("follow-up") || t.includes("follow up") || t.includes("followup")) return "followup";
  if (t.includes("design consultation") || t.includes("design")) return "design";
  if (t.includes("survey") || t.includes("assessment")) return "survey";
  return null;
}

function apptMeta(a) {
  const k = a?.kind || inferKindFromTitle(a?.title);
  // Deliberate: fallback label is the generic "Appointment" (not the
  // row's raw title). Some legacy appointments stored the request's
  // project title ("Ronan's kitchen refit…") in the title column,
  // which leaked into the card headline when inference missed. The
  // card is semantically about the TYPE of visit, so an unknown
  // type should still read as a type-shaped noun, not as a project.
  return (
    APPT_KIND_META[k] || {
      label: "Appointment",
      icon: "calendar-outline",
      color: "#8A8A94",
    }
  );
}

function fmtDay(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MAX_CARDS = 3;

export default function ActiveJobPanel() {
  const router = useRouter();
  const { user } = useUser();
  const { colors: c } = useTheme();

  // All appointments, enriched with trade names. Used both by the
  // inline card strip (filtered to upcoming) and the calendar modal
  // (shows everything).
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const loadAppointments = useCallback(async () => {
    if (!user?.id) {
      setAppointments([]);
      setLoading(false);
      return;
    }
    try {
      // 1) Primary fetch: `.from("appointments").select("*")` scoped
      //    by client_id. This gives us every column we need —
      //    especially `kind` and `tradesperson_id` — without hoping
      //    `rpc_client_list_appointments` got bumped to return them
      //    after the 2026-04-28 migration. RLS on appointments
      //    restricts rows to the signed-in client.
      let rows = [];
      let primaryOk = false;
      try {
        const { data: direct, error: directErr } = await supabase
          .from("appointments")
          .select("*")
          .eq("client_id", user.id)
          .order("scheduled_at", { ascending: true });
        if (!directErr && Array.isArray(direct)) {
          rows = direct;
          primaryOk = true;
        }
      } catch {
        /* fall through */
      }

      // 2) Fallback: the RPC — in case RLS blocks the direct read on
      //    a particular build, or the client_id column is missing on
      //    legacy rows. The RPC scopes to this user too but often
      //    returns a narrower column set.
      if (!primaryOk) {
        const { data: raw, error } = await supabase.rpc(
          "rpc_client_list_appointments",
          { p_only_upcoming: false }
        );
        if (error) throw error;
        rows = Array.isArray(raw) ? raw : [];
      }

      // 2) Resolve business names. The RPC response varies between
      //    builds — sometimes `tradesperson_id`, sometimes `trade_id`,
      //    occasionally a denormalised `trade_name`/`business_name`.
      //    Collect every id we can find and fetch names in one go.
      //    Primary path: direct read of `profiles` (clients have RLS
      //    to read trade profiles — that's how the Projects tab
      //    hydrates business names today). Fallback:
      //    `rpc_trade_public_names` for builds where the profile read
      //    is blocked.
      const tradeIds = Array.from(
        new Set(
          rows
            .map((r) => r.tradesperson_id || r.trade_id || null)
            .filter(Boolean)
        )
      );
      const nameMap = {};
      if (tradeIds.length > 0) {
        try {
          const { data: profs, error: profErr } = await supabase
            .from("profiles")
            .select("id, business_name, full_name")
            .in("id", tradeIds);
          if (!profErr && Array.isArray(profs)) {
            profs.forEach((p) => {
              nameMap[p.id] = p.business_name || p.full_name || null;
            });
          }
        } catch {
          /* fall through to the RPC below */
        }

        // Gap-fill anything the direct read missed.
        const missing = tradeIds.filter((id) => !nameMap[id]);
        if (missing.length > 0) {
          try {
            const { data: names, error: nameErr } = await supabase.rpc(
              "rpc_trade_public_names",
              { trade_ids: missing }
            );
            if (!nameErr && Array.isArray(names)) {
              names.forEach((n) => {
                nameMap[n.profile_id] =
                  n.business_name || n.full_name || nameMap[n.profile_id] || null;
              });
            }
          } catch {
            /* leave whatever we have */
          }
        }
      }

      // 3) Normalise to a stable shape regardless of which columns
      //    the RPC returned.
      const normalised = rows.map((a) => {
        const rawTitle = a.title || a.project_title || a.request_title || "";
        const tradeIdRef = a.tradesperson_id || a.trade_id || null;
        const resolvedName =
          (tradeIdRef ? nameMap[tradeIdRef] : null) ||
          a.trade_business_name ||
          a.business_name ||
          a.trade_name ||
          a.full_name ||
          null;
        return {
          id: a.appointment_id || a.id,
          request_id: a.request_id,
          quote_id: a.quote_id,
          scheduled_at: a.scheduled_at,
          status: a.status,
          location: a.location,
          // Prefer the explicit `kind` column; fall back to title
          // inference so legacy rows still render correctly.
          kind: a.kind || inferKindFromTitle(rawTitle) || null,
          title: rawTitle,
          service_name: a.service_name || null,
          project_title: a.project_title || null,
          request_title: a.request_title || null,
          tradesperson_id: tradeIdRef,
          // `tradeName` is the resolved display string or `null`.
          // The renderer decides what to do when null (currently
          // shows "Trade" — keep it visible rather than blank).
          tradeName: resolvedName,
        };
      });

      setAppointments(normalised);
    } catch (e) {
      console.warn("ActiveJobPanel load error:", e?.message || e);
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadAppointments();
    }, [loadAppointments])
  );

  // Upcoming = non-cancelled and scheduled_at >= now. Sorted soonest
  // first and trimmed to MAX_CARDS for the inline strip.
  const upcoming = useMemo(() => {
    const nowMs = Date.now();
    return appointments
      .filter((a) => {
        if (!a.scheduled_at) return false;
        const s = String(a.status || "").toLowerCase();
        if (s === "cancelled") return false;
        return new Date(a.scheduled_at).getTime() >= nowMs;
      })
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  }, [appointments]);

  const upcomingVisible = upcoming.slice(0, MAX_CARDS);

  // Tapping a card routes to the client's Your Request screen — that's
  // where they can see full context (quotes, photos, Recent Activity)
  // and action the appointment if it's awaiting confirmation.
  const openRequest = (a) => {
    if (!a?.request_id) return;
    router.push({
      pathname: "/(dashboard)/client/myquotes/request/[id]",
      params: { id: String(a.request_id) },
    });
  };

  // Panel header's chevron/onPress opens the full calendar.
  const openCalendar = () => setCalendarOpen(true);
  const closeCalendar = () => setCalendarOpen(false);

  if (loading) {
    return (
      <Panel title="Active job" chevron={false}>
        <View style={{ padding: 14 }}>
          <ThemedText style={{ ...TypeVariants.bodySm, color: c.textMuted }}>
            Loading…
          </ThemedText>
        </View>
      </Panel>
    );
  }

  // Hide the panel entirely when there's nothing to show AND no
  // historical appointments to browse. If they have past ones we
  // still render the panel + calendar button so they can find them.
  if (upcoming.length === 0 && appointments.length === 0) {
    return (
      <Panel title="Active job" chevron={false}>
        <View style={{ padding: 14 }}>
          <ThemedText style={{ ...TypeVariants.bodySm, color: c.textMid }}>
            No active jobs yet. Accepted quotes and scheduled appointments show up here.
          </ThemedText>
        </View>
      </Panel>
    );
  }

  return (
    <>
      <Panel title="Active job" chevron onPress={openCalendar}>
        {upcomingVisible.length === 0 ? (
          <View style={{ padding: 14 }}>
            <ThemedText style={{ ...TypeVariants.bodySm, color: c.textMid }}>
              No upcoming appointments. Tap the chevron to browse past ones.
            </ThemedText>
          </View>
        ) : (
          upcomingVisible.map((a, idx) => {
            const m = apptMeta(a);
            // Title = the appointment's type label ONLY (e.g. "Start
            // Job", "Survey") — no trailing "for <service>" copy. The
            // user wanted this single-line and tight; the request
            // context lives on the screen you tap through to.
            const titleStr = m.label;
            // Subtitle = business name. Falls back to a neutral
            // "Trade" only when every resolution path (profiles
            // read, public-names RPC, denormalised columns) came
            // back empty — the name is genuinely missing from our
            // data, not a code bug.
            const subtitle = a.tradeName || "Trade";
            return (
              <React.Fragment key={a.id}>
                <Pressable
                  onPress={() => openRequest(a)}
                  style={({ pressed }) => [
                    styles.card,
                    pressed && { backgroundColor: c.elevate2 },
                  ]}
                >
                  {/* Coloured stripe — matches the kind */}
                  <View
                    style={[styles.stripe, { backgroundColor: m.color }]}
                  />
                  <View
                    style={[
                      styles.iconBox,
                      {
                        backgroundColor: m.color + "22",
                        borderColor: m.color + "55",
                      },
                    ]}
                  >
                    <Ionicons name={m.icon} size={18} color={m.color} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText
                      style={[styles.cardTitle, { color: c.text }]}
                      numberOfLines={1}
                    >
                      {titleStr}
                    </ThemedText>
                    <ThemedText
                      style={[styles.cardSub, { color: c.textMuted }]}
                      numberOfLines={1}
                    >
                      {subtitle}
                    </ThemedText>
                  </View>
                  {/* Trailing — date on top, time underneath (same
                      pattern as the trade-side home Schedule rows). */}
                  <View style={styles.trailing}>
                    <ThemedText
                      style={[styles.trailDate, { color: c.text }]}
                      numberOfLines={1}
                    >
                      {fmtDay(a.scheduled_at)}
                    </ThemedText>
                    <ThemedText
                      style={[styles.trailTime, { color: c.textMuted }]}
                      numberOfLines={1}
                    >
                      {fmtTime(a.scheduled_at)}
                    </ThemedText>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={c.textMuted}
                    style={{ marginLeft: 4 }}
                  />
                </Pressable>
                {idx < upcomingVisible.length - 1 ? (
                  <View
                    style={[styles.divider, { backgroundColor: c.border }]}
                  />
                ) : null}
              </React.Fragment>
            );
          })
        )}

        {/* "See all" / calendar affordance when there are more than we
            can fit on the strip. */}
        {upcoming.length > MAX_CARDS || appointments.length > upcoming.length ? (
          <>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <Pressable
              onPress={openCalendar}
              style={({ pressed }) => [
                styles.seeAllRow,
                pressed && { backgroundColor: c.elevate2 },
              ]}
            >
              <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
              <ThemedText
                style={{
                  ...TypeVariants.buttonSm,
                  color: Colors.primary,
                }}
              >
                Open calendar
              </ThemedText>
            </Pressable>
          </>
        ) : null}
      </Panel>

      <ClientCalendarModal
        visible={calendarOpen}
        onClose={closeCalendar}
        appointments={appointments}
        onItemPress={openRequest}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  stripe: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  cardTitle: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
  },
  cardSub: {
    fontSize: 12,
    marginTop: 2,
  },
  trailing: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 62,
  },
  trailDate: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 12.5,
    letterSpacing: -0.1,
  },
  trailTime: {
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: 14,
  },
  seeAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
});
