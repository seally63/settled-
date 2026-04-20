// app/(dashboard)/quotes/create.jsx
// Phase 11 — Trade Quote Builder (single-column document builder).
//
// Layout (per the redesign):
//   · top chrome: chevron-back · Draft/New chip · ⋯ (bottom sheet)
//   · eyebrow "QUOTE FOR {CLIENT FULL NAME} · {SPECIFIC REQUEST}"
//   · sticky £total hero (Public Sans 44px)
//   · line ledger — each line is its own card with:
//       # index · title · close
//       description
//       qty × £unit = £line_total
//   · dashed "Add line item" row
//   · Quote terms card — Earliest start · Duration · Valid until · Deposit
//   · Note to client textarea
//   · pinned bottom dock: single centered "Send quote · £X,XXX.XX"
//
// Preview and Save-as-draft live in the top-right ⋯ bottom sheet.
//
// Persistence contract (line_items, comments, status, project_title,
// request_id, totals at 20% VAT) is unchanged; the Phase 11 SQL migration
// added flat columns for the quote-terms card; see QuotesContext.

import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  Alert,
  TextInput,
  Keyboard,
  InputAccessoryView,
  Modal,
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useQuotes } from "../../../hooks/useQuotes";
import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";
import { supabase } from "../../../lib/supabase";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import ThemedStatusBar from "../../../components/ThemedStatusBar";
import CustomDateTimePicker from "../../../components/CustomDateTimePicker";
import { FontFamily, Radius, TypeVariants } from "../../../constants/Typography";

const VAT_RATE = 0.20;
const VALIDATION = {
  PRICE_MAX: 1000000,
  COMMENTS_MAX: 2000,
  ITEM_NAME_MAX: 200,
  ITEM_DESC_MAX: 500,
};
const NUMERIC_ACCESSORY_ID = "builder-numeric-done";

/* ───────── helpers ───────── */

const asString = (v) => (Array.isArray(v) ? v[0] ?? "" : typeof v === "string" ? v : "");
const r2 = (n) => Math.round(n * 100) / 100;

function computeTotals(items) {
  let subtotal = 0;
  for (const it of items) subtotal += Number(it?.qty || 1) * Number(it?.unit_price || 0);
  const tax = r2(subtotal * VAT_RATE);
  return { subtotal: r2(subtotal), tax, grand: r2(subtotal + tax) };
}
const formatGBP = (n) =>
  Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const formatGBPDecimal = (n) =>
  Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatDay(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}
function formatValidUntil(d) {
  const label = formatDay(d);
  if (!label) return null;
  const diffDays = Math.max(
    0,
    Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );
  return `${label} (${diffDays} day${diffDays === 1 ? "" : "s"})`;
}

// Extract the "specific thing they want done" — prefer the service name
// from the FK join, then the right side of suggested_title, then fall
// back to the category + service combo.
function resolveSpecificTitle({ serviceTypeName, serviceCategoryName, suggestedTitle }) {
  if (serviceTypeName) return serviceTypeName;
  if (suggestedTitle && suggestedTitle.includes(" - ")) {
    const parts = suggestedTitle.split(" - ").map((s) => s.trim());
    if (parts.length >= 2) return parts.slice(1).join(" - ");
  }
  if (suggestedTitle) return suggestedTitle;
  if (serviceCategoryName) return serviceCategoryName;
  return "Project";
}

async function fetchClientNameForRequest(requestId, requesterId) {
  if (!requestId) return null;
  // 1) privacy-aware RPC (best when conversation/contact is unlocked)
  try {
    const { data } = await supabase.rpc("rpc_get_client_contact_for_request", {
      p_request_id: requestId,
    });
    if (data?.name_display) return data.name_display;
    if (data?.name) return data.name;
  } catch {}
  // 2) conversation other-party name
  try {
    const { data: conv } = await supabase.rpc("rpc_list_conversations", { p_limit: 100 });
    if (conv) {
      const match = conv.find((c) => c.request_id === requestId);
      if (match?.other_party_name) return match.other_party_name;
    }
  } catch {}
  // 3) direct profile read using the request's requester_id — this is
  // the source of truth. Trade Projects index does the same thing. A
  // brand-new request with no conversation yet hits this branch.
  if (requesterId) {
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", requesterId)
        .maybeSingle();
      if (prof?.full_name) return prof.full_name;
    } catch {}
  }
  return null;
}

/* ───────── main screen ───────── */

export default function Create() {
  const insets = useSafeAreaInsets();
  const { colors: c, dark } = useTheme();
  const styles = useMemo(() => makeStyles(c, dark), [c, dark]);
  const router = useRouter();
  const { user } = useUser();
  const { createQuote, updateQuote, fetchQuoteById } = useQuotes();

  const params = useLocalSearchParams();
  const requestId = asString(params?.requestId) || null;
  const quoteId = asString(params?.quoteId) || null;

  // Project context
  const [clientFullName, setClientFullName] = useState(null);
  const [serviceTypeName, setServiceTypeName] = useState("");
  const [serviceCategoryName, setServiceCategoryName] = useState("");
  const [projectPostcode, setProjectPostcode] = useState("");
  const [suggestedTitle, setSuggestedTitle] = useState("");

  // Line items — every named line counts toward the total.
  const [items, setItems] = useState([
    { name: "", description: "", qty: 1, unit_price: 0 },
  ]);
  const [comments, setComments] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Quote terms (Phase 11 fields)
  const [earliestStart, setEarliestStart] = useState(null);
  const [duration, setDuration] = useState("");
  const [validUntil, setValidUntil] = useState(null);
  const [deposit, setDeposit] = useState("");

  // UI state
  const [sending, setSending] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showValidUntilPicker, setShowValidUntilPicker] = useState(false);
  const [showDurationEditor, setShowDurationEditor] = useState(false);
  const [showDepositEditor, setShowDepositEditor] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const activeItems = useMemo(
    () => items.filter((it) => String(it.name || "").trim()),
    [items]
  );
  const totals = useMemo(() => computeTotals(activeItems), [activeItems]);

  /* load project context */
  useEffect(() => {
    if (!requestId) return;
    let alive = true;
    (async () => {
      // Same robust fetch pattern as the trade Projects index: simple
      // embedded joins on service_types / service_categories, plus
      // separate-id lookups as a safety net, plus a profiles fallback
      // for the client name. The aliased-on-column syntax I had here
      // before ("service_types:service_type_id(...)") is invalid
      // PostgREST and silently returned null, which was why the
      // eyebrow showed the "CLIENT · PROJECT" fallback.
      const { data: req } = await supabase
        .from("quote_requests")
        .select(`
          id,
          postcode,
          suggested_title,
          requester_id,
          service_type_id,
          category_id,
          service_types (id, name),
          service_categories (id, name)
        `)
        .eq("id", requestId)
        .maybeSingle();

      if (!alive) return;

      let svcName = req?.service_types?.name || null;
      let catName = req?.service_categories?.name || null;

      // Safety-net lookups for legacy rows where the embedded join
      // came back empty but the FK column is still populated.
      if (!svcName && req?.service_type_id) {
        try {
          const { data: st } = await supabase
            .from("service_types")
            .select("name")
            .eq("id", req.service_type_id)
            .maybeSingle();
          if (st?.name) svcName = st.name;
        } catch {}
      }
      if (!catName && req?.category_id) {
        try {
          const { data: sc } = await supabase
            .from("service_categories")
            .select("name")
            .eq("id", req.category_id)
            .maybeSingle();
          if (sc?.name) catName = sc.name;
        } catch {}
      }

      const name = await fetchClientNameForRequest(requestId, req?.requester_id);
      if (!alive) return;

      if (name) setClientFullName(name);
      if (svcName) setServiceTypeName(svcName);
      if (catName) setServiceCategoryName(catName);
      if (req?.postcode) setProjectPostcode(String(req.postcode).toUpperCase());
      if (req?.suggested_title) setSuggestedTitle(String(req.suggested_title).trim());
    })();
    return () => {
      alive = false;
    };
  }, [requestId]);

  /* load existing draft */
  useEffect(() => {
    if (!quoteId) return;
    let alive = true;
    (async () => {
      const quote = await fetchQuoteById(quoteId);
      if (!alive || !quote) return;
      setIsEditing(true);
      setComments(quote.comments || "");
      if (Array.isArray(quote.line_items) && quote.line_items.length > 0) {
        setItems(
          quote.line_items.map((it) => ({
            name: it.name || "",
            description: it.description || "",
            qty: Number(it.qty || 1),
            unit_price: Number(it.unit_price || 0),
          }))
        );
      }
      if (quote.earliest_start) setEarliestStart(new Date(quote.earliest_start));
      if (quote.duration_text) setDuration(quote.duration_text);
      if (quote.valid_until_override) setValidUntil(new Date(quote.valid_until_override));
      if (quote.deposit_percent != null) setDeposit(String(quote.deposit_percent));
    })();
    return () => {
      alive = false;
    };
  }, [quoteId, fetchQuoteById]);

  /* actions */

  const addLine = () => {
    Keyboard.dismiss();
    setItems((prev) => [...prev, { name: "", description: "", qty: 1, unit_price: 0 }]);
  };

  const updateLine = (idx, field, value) => {
    setItems((prev) => {
      const copy = [...prev];
      let v = value;
      if (field === "unit_price") {
        const n = Number(value) || 0;
        v = Math.max(0, Math.min(n, VALIDATION.PRICE_MAX));
      } else if (field === "qty") {
        const raw = String(value || "").replace(/[^0-9]/g, "");
        v = raw === "" ? "" : Math.max(1, Math.min(Number(raw) || 1, 9999));
      } else if (field === "name") {
        v = String(value || "").slice(0, VALIDATION.ITEM_NAME_MAX);
      } else if (field === "description") {
        v = String(value || "").slice(0, VALIDATION.ITEM_DESC_MAX);
      }
      copy[idx] = { ...copy[idx], [field]: v };
      return copy;
    });
  };

  const removeLine = (idx) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const buildProjectTitle = () => {
    const specific = resolveSpecificTitle({
      serviceTypeName,
      serviceCategoryName,
      suggestedTitle,
    });
    const clientFirst = clientFullName ? clientFullName.split(" ")[0] : null;
    const base = clientFirst ? `${clientFirst}'s ${specific}` : specific;
    return projectPostcode ? `${base} in ${projectPostcode}` : base;
  };

  const validate = () => {
    if (activeItems.length === 0) {
      Alert.alert("No line items", "Add at least one line item before sending.");
      return false;
    }
    const bad = activeItems.find((it) => Number(it.unit_price || 0) <= 0);
    if (bad) {
      Alert.alert("Missing price", `"${bad.name}" has no price.`);
      return false;
    }
    if (totals.grand <= 0) {
      Alert.alert("Invalid total", "Quote total must be greater than £0.");
      return false;
    }
    if (totals.grand > VALIDATION.PRICE_MAX) {
      Alert.alert("Total too high", "Quote total exceeds the allowed maximum.");
      return false;
    }
    if (comments.length > VALIDATION.COMMENTS_MAX) {
      Alert.alert("Note too long", "Trim the note to client before sending.");
      return false;
    }
    const dep = Number(deposit);
    if (deposit !== "" && (Number.isNaN(dep) || dep < 0 || dep > 100)) {
      Alert.alert("Invalid deposit", "Deposit must be between 0 and 100%.");
      return false;
    }
    return true;
  };

  const buildPayload = (status) => ({
    request_id: requestId || null,
    project_title: buildProjectTitle(),
    line_items: activeItems.map((it) => ({
      name: String(it.name || "").trim(),
      description: String(it.description || "").trim(),
      qty: Number(it.qty || 1),
      unit_price: Number(it.unit_price || 0),
    })),
    measurements: [],
    comments: comments.trim() || null,
    status,
    trade_id: user?.id || null,
    userId: user?.id || null,
    vat_enabled: true,
    vat_rate: VAT_RATE,
    earliest_start: earliestStart ? earliestStart.toISOString().slice(0, 10) : null,
    duration_text: duration.trim() || null,
    valid_until_override: validUntil ? validUntil.toISOString().slice(0, 10) : null,
    deposit_percent: deposit === "" ? null : Number(deposit),
  });

  const handleSend = async () => {
    if (sending) return;
    if (!validate()) return;
    setSending(true);
    try {
      const payload = buildPayload("sent");
      if (isEditing && quoteId) await updateQuote(quoteId, payload);
      else await createQuote(payload);
      // Prefer router.back() — same pattern as handleSaveDraft. The
      // stack is typically
      //   Projects → Request → (FAB or Continue draft) → Create
      // so `back()` pops the builder and returns to the ORIGINAL
      // Request page instead of router.replace-ing in a duplicate
      // copy of it (which was causing the "tap back goes to the old
      // Request screen" bug).
      if (router.canGoBack?.()) {
        router.back();
      } else if (requestId) {
        router.replace(`/quotes/request/${requestId}`);
      } else {
        router.replace("/quotes");
      }
    } catch (e) {
      Alert.alert("Send failed", e?.message || "Could not send quote.");
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      const payload = buildPayload("draft");
      if (isEditing && quoteId) await updateQuote(quoteId, payload);
      else await createQuote(payload);
      // Prefer router.back() — the stack is usually
      //   Projects → Request → (FAB) → Create
      // so `back()` pops the builder and returns to the request page
      // using the reverse of the fade animation the builder entered
      // with. No slide_from_right. If there's no back stack (deep
      // link), fall back to `replace` onto the request page.
      if (router.canGoBack?.()) {
        router.back();
      } else if (requestId) {
        router.replace(`/quotes/request/${requestId}`);
      } else {
        router.replace("/quotes");
      }
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Could not save draft.");
    }
  };

  /* render */

  const specific = resolveSpecificTitle({
    serviceTypeName,
    serviceCategoryName,
    suggestedTitle,
  });
  const eyebrow = `QUOTE FOR ${(clientFullName || "CLIENT").toUpperCase()} · ${specific.toUpperCase()}`;

  return (
    <ThemedView style={styles.container}>
      <ThemedStatusBar />

      {/* Top chrome — transparent, not sticky. Sits inside the scroll
          content as the first row so it scrolls with the page. No black
          background, independent chevron and preview buttons on the same
          row.                                                        */}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 10 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Inline chrome — chevron back + eye (preview). Transparent,
              scrolls with the page (not sticky), no background row. */}
          <View style={styles.inlineChrome}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={18} color={c.text} />
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => setShowPreview(true)}
              hitSlop={10}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Preview quote"
            >
              <Ionicons name="eye-outline" size={20} color={c.text} />
            </Pressable>
          </View>

          {/* Hero */}
          <View style={styles.hero}>
            <ThemedText style={styles.eyebrow} numberOfLines={2}>
              {eyebrow}
            </ThemedText>
            <View style={styles.totalRow}>
              <ThemedText style={styles.totalPound}>£</ThemedText>
              <ThemedText style={styles.totalNumber}>{formatGBP(totals.grand)}</ThemedText>
            </View>
            <ThemedText style={styles.totalSubtitle}>
              {activeItems.length} item{activeItems.length === 1 ? "" : "s"} · incl.{" "}
              {Math.round(VAT_RATE * 100)}% VAT
            </ThemedText>
          </View>

          {/* Line ledger */}
          <View style={styles.ledger}>
            {items.map((item, idx) => (
              <BuilderLine
                key={idx}
                c={c}
                styles={styles}
                item={item}
                index={idx}
                onChange={(field, v) => updateLine(idx, field, v)}
                onRemove={() => removeLine(idx)}
                canRemove={items.length > 1}
                numericAccessoryId={NUMERIC_ACCESSORY_ID}
              />
            ))}

            <Pressable
              onPress={addLine}
              style={({ pressed }) => [styles.addLineRow, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Add line item"
            >
              <View style={styles.addLineDot}>
                <Ionicons name="add" size={14} color="#fff" />
              </View>
              <ThemedText style={styles.addLineLabel}>Add line item</ThemedText>
            </Pressable>
          </View>

          {/* Quote terms */}
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionLabel}>QUOTE TERMS</ThemedText>
          </View>
          <View style={styles.termsCard}>
            <TermRow
              c={c}
              styles={styles}
              label="Earliest start"
              value={earliestStart ? formatDay(earliestStart) : null}
              placeholder="Pick a start date"
              onPress={() => setShowStartPicker(true)}
            />
            <View style={styles.termsDivider} />
            <TermRow
              c={c}
              styles={styles}
              label="Estimated duration"
              value={duration || null}
              placeholder="e.g. 5–7 working days"
              onPress={() => setShowDurationEditor(true)}
            />
            <View style={styles.termsDivider} />
            <TermRow
              c={c}
              styles={styles}
              label="Quote valid until"
              value={validUntil ? formatValidUntil(validUntil) : null}
              placeholder="7 days from send (default)"
              onPress={() => setShowValidUntilPicker(true)}
            />
            <View style={styles.termsDivider} />
            <TermRow
              c={c}
              styles={styles}
              label="Deposit"
              value={deposit ? `${Number(deposit)}% on acceptance` : null}
              placeholder="No deposit"
              onPress={() => setShowDepositEditor(true)}
            />
          </View>

          {/* Note */}
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionLabel}>NOTE TO CLIENT</ThemedText>
          </View>
          <View style={styles.noteCard}>
            <TextInput
              value={comments}
              onChangeText={setComments}
              placeholder="Add context, caveats, survey notes… (optional)"
              placeholderTextColor={c.textFaint}
              multiline
              style={styles.noteInput}
              maxLength={VALIDATION.COMMENTS_MAX}
            />
          </View>

          {/* Inline actions — Save as draft above Send quote, both part
              of the scroll content (no sticky dock). The eye icon at the
              top of the screen still opens the preview.              */}
          <View style={styles.inlineActions}>
            <Pressable
              onPress={handleSaveDraft}
              style={({ pressed }) => [
                styles.actionGhostBtn,
                { backgroundColor: c.elevate, borderColor: c.borderStrong },
                pressed && { opacity: 0.8 },
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="save-outline" size={16} color={c.text} style={{ marginRight: 8 }} />
              <ThemedText style={[styles.actionGhostText, { color: c.text }]}>
                {isEditing ? "Update draft" : "Save as draft"}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={handleSend}
              disabled={sending || activeItems.length === 0}
              style={({ pressed }) => [
                styles.actionPrimaryBtn,
                (sending || activeItems.length === 0) && { opacity: 0.5 },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="send" size={15} color="#fff" style={{ marginRight: 8 }} />
              <ThemedText style={styles.actionPrimaryText}>
                Send quote · £{formatGBPDecimal(totals.grand)}
              </ThemedText>
            </Pressable>
          </View>

          <View style={{ height: insets.bottom + 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* iOS numeric keyboard Done accessory */}
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={NUMERIC_ACCESSORY_ID}>
          <View style={styles.accessory}>
            <Pressable onPress={Keyboard.dismiss} hitSlop={8}>
              <ThemedText style={styles.accessoryDone}>Done</ThemedText>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}

      {/* Pickers + editors */}
      <CustomDateTimePicker
        visible={showStartPicker}
        mode="date"
        value={earliestStart || new Date()}
        minimumDate={new Date()}
        onConfirm={(d) => {
          setEarliestStart(d);
          setShowStartPicker(false);
        }}
        onCancel={() => setShowStartPicker(false)}
      />
      <CustomDateTimePicker
        visible={showValidUntilPicker}
        mode="date"
        value={validUntil || (() => {
          const d = new Date();
          d.setDate(d.getDate() + 7);
          return d;
        })()}
        minimumDate={(() => {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          return d;
        })()}
        onConfirm={(d) => {
          setValidUntil(d);
          setShowValidUntilPicker(false);
        }}
        onCancel={() => setShowValidUntilPicker(false)}
      />

      <TextPromptModal
        c={c}
        styles={styles}
        visible={showDurationEditor}
        title="Estimated duration"
        placeholder="e.g. 5–7 working days"
        initial={duration}
        maxLength={80}
        onCancel={() => setShowDurationEditor(false)}
        onSave={(v) => {
          setDuration(v);
          setShowDurationEditor(false);
        }}
      />
      <TextPromptModal
        c={c}
        styles={styles}
        visible={showDepositEditor}
        title="Deposit percentage"
        placeholder="10"
        initial={deposit}
        keyboardType="decimal-pad"
        suffix="%"
        maxLength={5}
        onCancel={() => setShowDepositEditor(false)}
        onSave={(v) => {
          const n = v === "" ? "" : String(Math.max(0, Math.min(100, Number(v) || 0)));
          setDeposit(n);
          setShowDepositEditor(false);
        }}
      />

      <PreviewModal
        c={c}
        styles={styles}
        insets={insets}
        visible={showPreview}
        onClose={() => setShowPreview(false)}
        eyebrow={eyebrow}
        totals={totals}
        items={activeItems}
        earliestStart={earliestStart}
        duration={duration}
        validUntil={validUntil}
        deposit={deposit}
        comments={comments}
      />

    </ThemedView>
  );
}

/* ───────── sub-components ───────── */

function BuilderLine({
  c,
  styles,
  item,
  index,
  onChange,
  onRemove,
  canRemove,
  numericAccessoryId,
}) {
  const qty = Number(item.qty || 1);
  const unit = Number(item.unit_price || 0);
  const lineTotal = qty * unit;

  return (
    <View style={styles.lineCard}>
      <View style={styles.lineCardHeader}>
        <View style={styles.lineIndexBadge}>
          <ThemedText style={styles.lineIndexText}>{index + 1}</ThemedText>
        </View>
        <TextInput
          style={styles.lineTitle}
          value={item.name}
          onChangeText={(v) => onChange("name", v)}
          placeholder={`Line item ${index + 1}`}
          placeholderTextColor={c.textFaint}
          returnKeyType="next"
          blurOnSubmit
        />
        {canRemove && (
          <Pressable
            onPress={onRemove}
            hitSlop={10}
            style={({ pressed }) => [styles.lineRemoveBtn, pressed && { opacity: 0.6 }]}
            accessibilityLabel={`Remove line ${index + 1}`}
          >
            <Ionicons name="close" size={16} color={c.textMuted} />
          </Pressable>
        )}
      </View>

      <TextInput
        style={styles.lineDetail}
        value={item.description}
        onChangeText={(v) => onChange("description", v)}
        placeholder="Optional detail — labour, materials, notes"
        placeholderTextColor={c.textFaint}
        returnKeyType="done"
        blurOnSubmit
        multiline
      />

      <View style={styles.lineMathRow}>
        <View style={styles.lineQtyWrap}>
          <TextInput
            style={styles.lineQtyInput}
            value={String(item.qty ?? "")}
            onChangeText={(v) => onChange("qty", v)}
            placeholder="1"
            placeholderTextColor={c.textFaint}
            keyboardType="number-pad"
            inputAccessoryViewID={Platform.OS === "ios" ? numericAccessoryId : undefined}
            returnKeyType="done"
            accessibilityLabel="Quantity"
          />
          <ThemedText style={styles.lineQtyLabel}>qty</ThemedText>
        </View>
        <ThemedText style={styles.lineTimes}>×</ThemedText>
        <View style={styles.lineUnitWrap}>
          <ThemedText style={styles.lineUnitSymbol}>£</ThemedText>
          <TextInput
            style={styles.lineUnitInput}
            value={item.unit_price ? String(item.unit_price) : ""}
            onChangeText={(v) => onChange("unit_price", v.replace(/[^0-9.]/g, ""))}
            placeholder="0"
            placeholderTextColor={c.textFaint}
            keyboardType="decimal-pad"
            inputAccessoryViewID={Platform.OS === "ios" ? numericAccessoryId : undefined}
            returnKeyType="done"
            accessibilityLabel="Unit price"
          />
        </View>
        <View style={{ flex: 1 }} />
        <ThemedText style={styles.lineTotalLabel}>=</ThemedText>
        <ThemedText style={styles.lineTotal}>£{formatGBPDecimal(lineTotal)}</ThemedText>
      </View>
    </View>
  );
}

function TermRow({ c, styles, label, value, placeholder, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.termRow, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
    >
      <ThemedText style={styles.termLabel}>{label}</ThemedText>
      <ThemedText
        style={[styles.termValue, !value && { color: c.textMuted }]}
        numberOfLines={1}
      >
        {value || placeholder}
      </ThemedText>
      <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
    </Pressable>
  );
}

function TextPromptModal({
  c,
  styles,
  visible,
  title,
  placeholder,
  initial,
  keyboardType = "default",
  suffix,
  maxLength,
  onCancel,
  onSave,
}) {
  const [value, setValue] = useState(initial || "");
  useEffect(() => {
    if (visible) setValue(initial || "");
  }, [visible, initial]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.modalBackdrop} onPress={onCancel}>
        <Pressable style={styles.promptCard} onPress={(e) => e.stopPropagation?.()}>
          <ThemedText style={styles.promptTitle}>{title}</ThemedText>
          <View style={styles.promptInputWrap}>
            <TextInput
              autoFocus
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor={c.textFaint}
              keyboardType={keyboardType}
              maxLength={maxLength}
              style={styles.promptInput}
              returnKeyType="done"
              onSubmitEditing={() => onSave(value)}
            />
            {suffix && <ThemedText style={styles.promptSuffix}>{suffix}</ThemedText>}
          </View>
          <View style={styles.promptActions}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [styles.promptGhost, pressed && { opacity: 0.7 }]}
            >
              <ThemedText style={styles.promptGhostText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => onSave(value)}
              style={({ pressed }) => [styles.promptPrimary, pressed && { opacity: 0.85 }]}
            >
              <ThemedText style={styles.promptPrimaryText}>Save</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionsSheet({ c, styles, insets, visible, isEditing, onClose, onPreview, onSaveDraft }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={[styles.sheetCard, { paddingBottom: insets.bottom + 18 }]}
        >
          <View style={styles.sheetHandle} />
          <Pressable
            onPress={onPreview}
            style={({ pressed }) => [styles.sheetRow, pressed && styles.sheetRowPressed]}
            accessibilityRole="button"
          >
            <Ionicons name="eye-outline" size={20} color={c.text} />
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.sheetRowTitle}>Preview</ThemedText>
              <ThemedText style={styles.sheetRowSubtitle}>
                See how the client will receive this quote
              </ThemedText>
            </View>
          </Pressable>
          <View style={styles.sheetDivider} />
          <Pressable
            onPress={onSaveDraft}
            style={({ pressed }) => [styles.sheetRow, pressed && styles.sheetRowPressed]}
            accessibilityRole="button"
          >
            <Ionicons name="save-outline" size={20} color={c.text} />
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.sheetRowTitle}>
                {isEditing ? "Update draft" : "Save as draft"}
              </ThemedText>
              <ThemedText style={styles.sheetRowSubtitle}>
                Keep working on this quote later
              </ThemedText>
            </View>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PreviewModal({
  c,
  styles,
  insets,
  visible,
  onClose,
  eyebrow,
  totals,
  items,
  earliestStart,
  duration,
  validUntil,
  deposit,
  comments,
}) {
  const resolvedValidUntil = validUntil || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
  })();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ThemedView style={{ flex: 1 }}>
        <ThemedStatusBar />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + 10,
              paddingBottom: insets.bottom + 40,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Inline chevron back — matches the builder (and schedule /
              client-request) chrome: transparent row, scrolls with
              content, no "Preview" chip, no block behind the icon. */}
          <View style={styles.inlineChrome}>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={18} color={c.text} />
            </Pressable>
            <View style={{ flex: 1 }} />
          </View>
          <View style={styles.hero}>
            <ThemedText style={styles.eyebrow} numberOfLines={2}>
              {eyebrow}
            </ThemedText>
            <View style={styles.totalRow}>
              <ThemedText style={styles.totalPound}>£</ThemedText>
              <ThemedText style={styles.totalNumber}>{formatGBP(totals.grand)}</ThemedText>
            </View>
            <ThemedText style={styles.totalSubtitle}>
              {items.length} item{items.length === 1 ? "" : "s"} · incl.{" "}
              {Math.round(VAT_RATE * 100)}% VAT
            </ThemedText>
          </View>

          <View style={[styles.ledger, { paddingTop: 8 }]}>
            {items.map((it, i) => (
              <View key={i} style={styles.previewLine}>
                <View style={styles.previewIndex}>
                  <ThemedText style={styles.previewIndexText}>{i + 1}</ThemedText>
                </View>
                <View style={styles.previewLineBody}>
                  <ThemedText style={styles.previewLineTitle} numberOfLines={2}>
                    {it.name || "Untitled line"}
                  </ThemedText>
                  {it.description ? (
                    <ThemedText style={styles.previewLineDetail} numberOfLines={2}>
                      {it.description}
                    </ThemedText>
                  ) : null}
                  {Number(it.qty || 1) > 1 ? (
                    <ThemedText style={styles.previewLineQty}>
                      {Number(it.qty)} × £{formatGBPDecimal(Number(it.unit_price || 0))}
                    </ThemedText>
                  ) : null}
                </View>
                <ThemedText style={styles.previewLineAmount}>
                  £{formatGBPDecimal(Number(it.qty || 1) * Number(it.unit_price || 0))}
                </ThemedText>
              </View>
            ))}

            <View style={[styles.previewLine, { borderBottomWidth: 0, paddingTop: 20 }]}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.previewTotalLabel}>Subtotal</ThemedText>
              </View>
              <ThemedText style={styles.previewLineAmount}>
                £{formatGBPDecimal(totals.subtotal)}
              </ThemedText>
            </View>
            <View style={[styles.previewLine, { borderBottomWidth: 0, paddingTop: 0 }]}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.previewTotalLabel}>
                  VAT ({Math.round(VAT_RATE * 100)}%)
                </ThemedText>
              </View>
              <ThemedText style={styles.previewLineAmount}>
                £{formatGBPDecimal(totals.tax)}
              </ThemedText>
            </View>
            <View
              style={[
                styles.previewLine,
                { borderBottomWidth: 0, paddingTop: 6, borderTopWidth: 1, borderTopColor: c.border },
              ]}
            >
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.previewGrandLabel}>Total</ThemedText>
              </View>
              <ThemedText style={styles.previewGrandAmount}>
                £{formatGBPDecimal(totals.grand)}
              </ThemedText>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionLabel}>QUOTE TERMS</ThemedText>
          </View>
          <View style={styles.termsCard}>
            <PreviewTerm
              styles={styles}
              label="Earliest start"
              value={earliestStart ? formatDay(earliestStart) : "To be confirmed"}
            />
            <View style={styles.termsDivider} />
            <PreviewTerm
              styles={styles}
              label="Estimated duration"
              value={duration || "To be confirmed"}
            />
            <View style={styles.termsDivider} />
            <PreviewTerm
              styles={styles}
              label="Valid until"
              value={formatValidUntil(resolvedValidUntil)}
            />
            <View style={styles.termsDivider} />
            <PreviewTerm
              styles={styles}
              label="Deposit"
              value={deposit ? `${Number(deposit)}% on acceptance` : "None"}
            />
          </View>

          {comments ? (
            <>
              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionLabel}>NOTE FROM TRADE</ThemedText>
              </View>
              <View style={styles.noteCard}>
                <ThemedText style={styles.previewNoteText}>{comments}</ThemedText>
              </View>
            </>
          ) : null}

          <View style={{ height: 40 }} />
        </ScrollView>
      </ThemedView>
    </Modal>
  );
}

function PreviewTerm({ styles, label, value }) {
  return (
    <View style={styles.termRow}>
      <ThemedText style={styles.termLabel}>{label}</ThemedText>
      <ThemedText style={styles.termValue} numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}

/* ───────── styles ───────── */

function makeStyles(c, dark) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },

    /* inline chrome — transparent row, scrolls with content */
    inlineChrome: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingBottom: 14,
      gap: 10,
      backgroundColor: "transparent",
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.elevate,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },

    scrollContent: { paddingBottom: 40 },

    /* hero */
    hero: { paddingHorizontal: 20, paddingTop: 8 },
    eyebrow: {
      ...TypeVariants.eyebrow,
      color: c.textMid,
      letterSpacing: 0.8,
    },
    totalRow: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 4,
    },
    totalPound: {
      fontFamily: FontFamily.headerSemibold,
      fontSize: 22,
      lineHeight: 32,
      color: c.textMid,
    },
    totalNumber: {
      fontFamily: FontFamily.headerBold,
      fontSize: 44,
      lineHeight: 46,
      letterSpacing: -1.5,
      color: c.text,
    },
    totalSubtitle: {
      ...TypeVariants.caption,
      color: c.textMuted,
      marginTop: 6,
    },

    /* ledger — bigger cards, generous tap regions per-field */
    ledger: { paddingHorizontal: 16, paddingTop: 22 },
    lineCard: {
      backgroundColor: c.elevate,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      marginBottom: 10,
    },
    lineCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 10,
    },
    lineIndexBadge: {
      width: 26,
      height: 26,
      borderRadius: 8,
      backgroundColor: c.elevate2 ?? c.background,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    lineIndexText: {
      fontFamily: FontFamily.headerBold,
      fontSize: 12,
      color: c.textMid,
    },
    lineTitle: {
      flex: 1,
      fontFamily: FontFamily.headerSemibold,
      fontSize: 16,
      letterSpacing: -0.2,
      color: c.text,
      paddingVertical: 6,
      paddingHorizontal: 0,
      minHeight: 32,
    },
    lineRemoveBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    lineDetail: {
      fontFamily: FontFamily.bodyRegular,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMid,
      paddingVertical: 8,
      paddingHorizontal: 0,
      minHeight: 36,
      textAlignVertical: "top",
    },
    lineMathRow: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.divider,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    lineQtyWrap: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: c.elevate2 ?? c.background,
      borderWidth: 1,
      borderColor: c.border,
      minWidth: 70,
    },
    lineQtyInput: {
      fontFamily: FontFamily.headerSemibold,
      fontSize: 15,
      color: c.text,
      minWidth: 26,
      textAlign: "right",
      padding: 0,
    },
    lineQtyLabel: {
      fontFamily: FontFamily.bodyRegular,
      fontSize: 11,
      color: c.textMuted,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    lineTimes: {
      fontFamily: FontFamily.headerRegular,
      fontSize: 14,
      color: c.textMuted,
    },
    lineUnitWrap: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 2,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: c.elevate2 ?? c.background,
      borderWidth: 1,
      borderColor: c.border,
      minWidth: 92,
    },
    lineUnitSymbol: {
      fontFamily: FontFamily.headerSemibold,
      fontSize: 13,
      color: c.textMid,
    },
    lineUnitInput: {
      fontFamily: FontFamily.headerSemibold,
      fontSize: 15,
      color: c.text,
      minWidth: 58,
      textAlign: "right",
      padding: 0,
    },
    lineTotalLabel: {
      fontFamily: FontFamily.headerRegular,
      fontSize: 14,
      color: c.textMuted,
      marginRight: 4,
    },
    lineTotal: {
      fontFamily: FontFamily.headerBold,
      fontSize: 15,
      letterSpacing: -0.2,
      color: c.text,
    },

    addLineRow: {
      marginTop: 10,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: c.borderStrong,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    addLineDot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.tint,
      alignItems: "center",
      justifyContent: "center",
    },
    addLineLabel: {
      fontFamily: FontFamily.headerSemibold,
      fontSize: 14,
      color: c.textMid,
    },

    /* sections */
    sectionHeader: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
    sectionLabel: {
      ...TypeVariants.eyebrow,
      color: c.textMuted,
      letterSpacing: 1,
    },

    /* terms card */
    termsCard: {
      marginHorizontal: 16,
      backgroundColor: c.elevate,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
    },
    termRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 14,
      gap: 12,
    },
    termLabel: {
      fontFamily: FontFamily.bodyRegular,
      fontSize: 14,
      color: c.textMid,
      flex: 1,
    },
    termValue: {
      fontFamily: FontFamily.headerSemibold,
      fontSize: 14,
      color: c.text,
      letterSpacing: -0.1,
      maxWidth: 200,
    },
    termsDivider: {
      height: 1,
      backgroundColor: c.divider,
      marginLeft: 14,
    },

    /* note card */
    noteCard: {
      marginHorizontal: 20,
      padding: 14,
      borderRadius: 14,
      backgroundColor: c.elevate,
      borderWidth: 1,
      borderColor: c.border,
      minHeight: 90,
    },
    noteInput: {
      fontFamily: FontFamily.bodyRegular,
      fontSize: 14,
      lineHeight: 21,
      color: c.text,
      padding: 0,
      minHeight: 60,
      textAlignVertical: "top",
    },

    /* inline actions (after note section) — Save draft above Send quote */
    inlineActions: {
      paddingHorizontal: 20,
      paddingTop: 26,
      gap: 10,
    },
    actionGhostBtn: {
      height: 54,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
    },
    actionGhostText: {
      ...TypeVariants.button,
    },
    actionPrimaryBtn: {
      height: 54,
      borderRadius: 16,
      backgroundColor: c.tint,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
    },
    actionPrimaryText: {
      ...TypeVariants.button,
      color: "#fff",
    },

    /* numeric accessory */
    accessory: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: c.elevate,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    accessoryDone: {
      ...TypeVariants.button,
      color: c.tint,
    },

    /* prompt modal */
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    promptCard: {
      width: "100%",
      maxWidth: 420,
      backgroundColor: c.background,
      borderRadius: Radius.lg,
      padding: 20,
      gap: 14,
    },
    promptTitle: {
      fontFamily: FontFamily.headerBold,
      fontSize: 17,
      color: c.text,
      letterSpacing: -0.3,
    },
    promptInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    promptInput: {
      flex: 1,
      fontFamily: FontFamily.bodyRegular,
      fontSize: 15,
      color: c.text,
      padding: 0,
    },
    promptSuffix: {
      fontFamily: FontFamily.headerSemibold,
      fontSize: 15,
      color: c.textMuted,
    },
    promptActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
    promptGhost: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
    },
    promptGhostText: {
      ...TypeVariants.button,
      color: c.textMid,
    },
    promptPrimary: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: c.tint,
    },
    promptPrimaryText: {
      ...TypeVariants.button,
      color: "#fff",
    },

    /* actions bottom sheet */
    sheetBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    sheetCard: {
      backgroundColor: c.background,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingTop: 10,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: c.border,
    },
    sheetHandle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderStrong,
      marginBottom: 10,
    },
    sheetRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 16,
      borderRadius: 14,
    },
    sheetRowPressed: { backgroundColor: c.elevate },
    sheetRowTitle: {
      fontFamily: FontFamily.headerSemibold,
      fontSize: 15,
      color: c.text,
    },
    sheetRowSubtitle: {
      fontFamily: FontFamily.bodyRegular,
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
    },
    sheetDivider: {
      height: 1,
      backgroundColor: c.divider,
      marginHorizontal: 8,
    },

    /* preview modal */
    previewLine: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.divider,
      gap: 10,
    },
    previewLineBody: { flex: 1, minWidth: 0 },
    previewIndex: {
      width: 22,
      height: 22,
      borderRadius: 6,
      backgroundColor: c.elevate2 ?? c.elevate,
      alignItems: "center",
      justifyContent: "center",
    },
    previewIndexText: {
      fontFamily: FontFamily.headerSemibold,
      fontSize: 11,
      color: c.textMid,
    },
    previewLineTitle: {
      fontFamily: FontFamily.headerSemibold,
      fontSize: 15,
      color: c.text,
    },
    previewLineDetail: {
      fontFamily: FontFamily.bodyRegular,
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
    },
    previewLineQty: {
      fontFamily: FontFamily.bodyRegular,
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
    },
    previewLineAmount: {
      fontFamily: FontFamily.headerSemibold,
      fontSize: 15,
      color: c.text,
      letterSpacing: -0.2,
    },
    previewTotalLabel: {
      fontFamily: FontFamily.bodyRegular,
      fontSize: 13,
      color: c.textMuted,
    },
    previewGrandLabel: {
      fontFamily: FontFamily.headerBold,
      fontSize: 15,
      color: c.text,
    },
    previewGrandAmount: {
      fontFamily: FontFamily.headerBold,
      fontSize: 17,
      color: c.text,
      letterSpacing: -0.2,
    },
    previewNoteText: {
      fontFamily: FontFamily.bodyRegular,
      fontSize: 14,
      lineHeight: 21,
      color: c.textMid,
    },
  });
}
