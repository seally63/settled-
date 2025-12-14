// app/(dashboard)/quotes/create.jsx
import {
  StyleSheet, Text, View, ScrollView, Pressable, useColorScheme, Platform,
  KeyboardAvoidingView, Alert, TextInput,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useQuotes } from "../../../hooks/useQuotes";
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import ThemedTextInput from "../../../components/ThemedTextInput";
import ThemedButton from "../../../components/ThemedButton";
import Spacer from "../../../components/Spacer";
import AddItemModal from "../../../components/AddItemModal";
import { Colors } from "../../../constants/Colors";

const VAT_RATE = 0.20;

/* ----------------------- helpers ----------------------- */
function asString(v) {
  if (Array.isArray(v)) return v[0] ?? "";
  return typeof v === "string" ? v : "";
}
function asBool(v) {
  if (Array.isArray(v)) v = v[0];
  if (v === true) return true;
  const s = typeof v === "string" ? v.toLowerCase() : "";
  return s === "1" || s === "true";
}
function computeTotals(items = []) {
  let subtotal = 0;
  for (const it of items) subtotal += Number(it?.qty || 0) * Number(it?.unit_price || 0);
  const r2 = (n) => Math.round(n * 100) / 100;
  const tax_total = r2(subtotal * VAT_RATE);
  const grand_total = r2(subtotal + tax_total);
  return { subtotal: r2(subtotal), tax_total, grand_total };
}
function todayDMY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}
function dmyToIso(s) {
  if (!s) return null;
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (d.getFullYear() !== Number(yyyy) || d.getMonth() + 1 !== Number(mm) || d.getDate() !== Number(dd)) return null;
  return `${yyyy}-${mm}-${dd}`;
}
function isValidDMY(s) {
  return dmyToIso(s) !== null;
}

/** Derive a clean project title; we’ll append the outcode if present. */
function deriveProjectTitle(req) {
  if (!req) return null;
  const candidates = [
    req.requested_title, req.project_title, req.project_type, req.job_type, req.category, req.title,
  ].filter(Boolean);
  const base = candidates.length ? String(candidates[0]).trim() : null;
  const out = (req.job_outcode || "").toString().trim().toUpperCase();
  if (base) return out ? `${base} in ${out}` : base;

  if (req.details) {
    try {
      const j = typeof req.details === "string" ? JSON.parse(req.details) : req.details;
      const jsonCands = [j?.project_title, j?.project_type, j?.type, j?.category, j?.title].filter(Boolean);
      const b2 = jsonCands.length ? String(jsonCands[0]).trim() : null;
      return b2 ? (out ? `${b2} in ${out}` : b2) : null;
    } catch { /* ignore */ }
  }
  return out || null;
}

/* ----------------------- screen ----------------------- */
export default function Create() {
  const scheme = useColorScheme();
  const theme = Colors[scheme] ?? Colors.light;
  const iconColor = theme.text;

  const params = useLocalSearchParams();
  const titleParamRaw = asString(params?.title);
  const requestId = asString(params?.requestId) || null;
  const lockParam = asBool(params?.lockTitle);

  const titleParam = titleParamRaw ? decodeURIComponent(titleParamRaw) : "";
  const initialLocked = lockParam || !!titleParam;

  const [titleLocked, setTitleLocked] = useState(initialLocked);
  const [projectTitle, setProjectTitle] = useState(titleParam || "");

  const [step, setStep] = useState(1);
  const [issueDate, setIssueDate] = useState(todayDMY());
  const [expiryDate, setExpiryDate] = useState("");

  const [items, setItems] = useState([]);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState(null);

  const [comments, setComments] = useState("");

  const projectInputRef = useRef(null);
  const totals = useMemo(() => computeTotals(items), [items]);

  const { createQuote } = useQuotes();
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (titleParam) {
      setProjectTitle(titleParam);
      setTitleLocked(true);
    }
  }, [titleParam]);

  // Fallback: derive title (with outcode) from requestId
  useEffect(() => {
    let alive = true;
    (async () => {
      if (titleParam || !requestId) return;
      try {
        const { data, error } = await supabase
          .from("quote_requests")
          // ✅ include job_outcode so we can append “in EH48”
          .select("id, requested_title, project_title, project_type, job_type, category, details, job_outcode")
          .eq("id", requestId)
          .maybeSingle();
        if (error) throw error;
        if (!alive) return;
        const derived = deriveProjectTitle(data);
        if (derived) {
          setProjectTitle(derived);
          setTitleLocked(true);
        }
      } catch {
        // no-op; user can still type if not locked
      }
    })();
    return () => { alive = false; };
  }, [titleParam, requestId]);

  const next = () => {
    if (step === 1) {
      if (!titleLocked && !projectTitle.trim()) {
        Alert.alert("Missing project", "Please enter the project name.");
        return;
      }
      if (issueDate && !isValidDMY(issueDate)) {
        Alert.alert("Invalid issue date", "Use DD-MM-YYYY.");
        return;
      }
      if (expiryDate && !isValidDMY(expiryDate)) {
        Alert.alert("Invalid expiry date", "Use DD-MM-YYYY.");
        return;
      }
    }
    setStep((s) => Math.min(3, s + 1));
  };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const addItem = (obj) => {
    if (editIndex != null) {
      setItems((prev) => {
        const copy = [...prev];
        copy[editIndex] = obj;
        return copy;
      });
      setEditIndex(null);
    } else {
      setItems((prev) => [...prev, obj]);
    }
    setItemModalOpen(false);
  };
  const openEdit = (idx) => { setEditIndex(idx); setItemModalOpen(true); };
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSend = async () => {
    if (!titleLocked && !projectTitle.trim()) {
      Alert.alert("Missing project", "Please enter the project name.");
      setStep(1);
      return;
    }
    if (expiryDate && !isValidDMY(expiryDate)) {
      Alert.alert("Invalid expiry date", "Use DD-MM-YYYY.");
      setStep(1);
      return;
    }

    const payload = {
      request_id: requestId || null,
      full_name: null,
      email: null,
      phone_number: null,
      job_address: null,

      project_title: projectTitle || null,
      valid_until: dmyToIso(expiryDate),
      line_items: items,
      measurements: [],
      comments: comments || null,
      userId: user?.id || null,
           // IMPORTANT for RLS: provide both, so DB policies see ownership
      trade_id: user?.id || null,   // new (for policies that check trade_id)
     userId: user?.id || null,     // keep your existing column
     // also propagate the request_id if we navigated from a request
      request_id: requestId || null,
     };

    try {
      await createQuote(payload);
      setStep(1);
      setProjectTitle(titleParam || "");
      setIssueDate(todayDMY());
      setExpiryDate("");
      setItems([]);
      setComments("");
      router.replace("/quotes");
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Failed to save quote.");
    }
  };

  const PageTitle = ({ children, caption }) => (
    <View style={styles.titleWrap}>
      <ThemedText title style={styles.titleText}>{children}</ThemedText>
      {!!caption && <ThemedText variant="muted" style={styles.titleCaption}>{caption}</ThemedText>}
    </View>
  );

  const SubHeader = ({ onBack, stepIndex }) => {
    const total = 3;
    const pct = stepIndex === 1 ? "33%" : stepIndex === 2 ? "66%" : "100%";
    return (
      <View style={[styles.subHeader, { borderBottomColor: theme.iconColor }]}>
        <Pressable onPress={onBack} style={styles.backButton} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={iconColor} />
          <ThemedText style={styles.backText}>Back</ThemedText>
        </Pressable>

        <View style={styles.stepRow}>
          <ThemedText variant="muted" style={styles.stepText}>
            Step {stepIndex} of {total}
          </ThemedText>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: pct, backgroundColor: Colors.primary }]} />
        </View>
      </View>
    );
  };

  const SectionCard = ({ title, subtitle, children, padTop = true }) => (
    <View style={[styles.card, { backgroundColor: theme.uiBackground, borderColor: theme.iconColor }]}>
      <View style={[styles.cardHead, padTop && { paddingTop: 10 }]}>
        <ThemedText style={styles.cardTitle}>{title}</ThemedText>
        {!!subtitle && <ThemedText variant="muted" style={styles.cardSubtitle}>{subtitle}</ThemedText>}
      </View>
      {children}
    </View>
  );

  const LockedProjectTitle = ({ title }) => (
    <View style={styles.lockedRow} accessible accessibilityLabel="Locked project title">
      <Ionicons name="lock-closed-outline" size={16} color="#666" style={{ marginRight: 6 }} />
      <ThemedText style={styles.lockedText}>{title || "—"}</ThemedText>
    </View>
  );

  const onChangeProject = (txt) => {
    setProjectTitle(txt);
    requestAnimationFrame(() => projectInputRef.current?.focus());
  };

  return (
    <ThemedView style={styles.container} safe={true}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="always"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator
        >
          {/* STEP 1 — Project basics */}
          {step === 1 && (
            <>
              <Spacer />
              <PageTitle caption="Project name can be supplied by the client’s request.">
                Add a New Quote
              </PageTitle>
              <Spacer size={8} />

              <SectionCard title="Project" subtitle={titleLocked ? "Provided by client" : undefined}>
                {titleLocked ? (
                  <LockedProjectTitle title={projectTitle || "Project"} />
                ) : (
                  <TextInput
                    ref={projectInputRef}
                    style={[styles.input, { backgroundColor: "#fff", color: "#111" }]}
                    placeholder="Project name (e.g., Bathroom refit)"
                    placeholderTextColor="#9aa0a6"
                    value={projectTitle}
                    onChangeText={onChangeProject}
                    blurOnSubmit={false}
                    returnKeyType="done"
                    autoCapitalize="sentences"
                    autoCorrect
                  />
                )}

                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.inputLabel}>Issue date</ThemedText>
                    <ThemedTextInput
                      style={styles.input}
                      placeholder="DD-MM-YYYY"
                      value={issueDate}
                      onChangeText={setIssueDate}
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.inputLabel}>Expiry date</ThemedText>
                    <ThemedTextInput
                      style={styles.input}
                      placeholder="DD-MM-YYYY"
                      value={expiryDate}
                      onChangeText={setExpiryDate}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              </SectionCard>

              <View style={styles.ctaWrap}>
                <ThemedButton onPress={next} style={styles.ctaBtn}>
                  <View style={styles.ctaRow}>
                    <Text style={styles.ctaText} numberOfLines={1}>Continue</Text>
                  </View>
                </ThemedButton>
              </View>
            </>
          )}

          {/* STEP 2 — Items */}
          {step === 2 && (
            <>
              <SubHeader onBack={back} stepIndex={2} />
              <PageTitle caption="Describe the work and pricing lines.">Project details</PageTitle>

              <SectionCard title="Line items" subtitle="Add services, quantities, and unit prices." padTop={false}>
                <View style={styles.inlineBtnWrap}>
                  <ThemedButton
                    onPress={() => { setEditIndex(null); setItemModalOpen(true); }}
                    style={styles.inlineBtn}
                  >
                    <View style={styles.inlineBtnRow}>
                      <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.ctaText}>Add Item</Text>
                    </View>
                  </ThemedButton>
                </View>

                <View style={{ marginTop: 4 }}>
                  {items.map((it, i) => {
                    const line = (Number(it.qty || 0) * Number(it.unit_price || 0)).toFixed(2);
                    return (
                      <View key={i} style={[styles.listCard, { borderColor: theme.iconColor }]}>
                        <Pressable onPress={() => openEdit(i)} style={{ flex: 1, paddingRight: 8 }}>
                          <ThemedText style={styles.itemTitle}>{it.name || "Untitled item"}</ThemedText>
                          {!!it.description && <ThemedText style={styles.itemBody}>{it.description}</ThemedText>}
                          <ThemedText style={styles.itemMeta}>
                            {`Qty: ${it.qty ?? 0}  •  Price: ${it.unit_price ?? 0}`}
                          </ThemedText>
                        </Pressable>
                        <View style={{ alignItems: "flex-end" }}>
                          <ThemedText style={styles.itemLineTotal}>{line}</ThemedText>
                          <Pressable onPress={() => removeItem(i)} hitSlop={8} style={{ marginTop: 6 }}>
                            <Ionicons name="trash-outline" size={18} color={scheme === "dark" ? "#ff7a7a" : "#b00020"} />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </SectionCard>

              <View style={styles.ctaWrap}>
                <ThemedButton onPress={next} style={styles.ctaBtn}>
                  <View style={styles.ctaRow}>
                    <Text style={styles.ctaText} numberOfLines={1}>Continue</Text>
                  </View>
                </ThemedButton>
              </View>
            </>
          )}

          {/* STEP 3 — Review & Send */}
          {step === 3 && (
            <>
              <SubHeader onBack={back} stepIndex={3} />
              <PageTitle caption="Check totals and add any final notes.">Review Quote</PageTitle>

              <SectionCard title="Project summary">
                <ThemedText style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Project: </Text>
                  <Text style={styles.summaryVal}>{projectTitle}</Text>
                </ThemedText>
                {!!issueDate && (
                  <ThemedText style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>Issue: </Text>
                    <Text style={styles.summaryVal}>{issueDate}</Text>
                  </ThemedText>
                )}
                {!!expiryDate && (
                  <ThemedText style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>Expiry: </Text>
                    <Text style={styles.summaryVal}>{expiryDate}</Text>
                  </ThemedText>
                )}
              </SectionCard>

              <SectionCard title="Service items">
                {items.length === 0 && <ThemedText>No items added yet.</ThemedText>}
                {items.map((it, i) => {
                  const line = (Number(it.qty || 0) * Number(it.unit_price || 0)).toFixed(2);
                  return (
                    <View
                      key={i}
                      style={{
                        paddingVertical: 10,
                        borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                        borderTopColor: theme.iconColor,
                      }}
                    >
                      <ThemedText style={styles.itemTitle}>{it.name || "Untitled item"}</ThemedText>
                      {!!it.description && <ThemedText style={styles.itemBody}>{it.description}</ThemedText>}
                      <ThemedText style={styles.itemMeta}>
                        {`Qty: ${it.qty ?? 0}  •  Price: ${it.unit_price ?? 0}  •  Total: ${line}`}
                      </ThemedText>
                    </View>
                  );
                })}
              </SectionCard>

              <SectionCard title="Totals">
                <View style={styles.rowBetween}>
                  <ThemedText>Subtotal</ThemedText>
                  <ThemedText>{totals.subtotal.toFixed(2)}</ThemedText>
                </View>
                <View style={styles.rowBetween}>
                  <ThemedText>Tax (20% VAT)</ThemedText>
                  <ThemedText>{totals.tax_total.toFixed(2)}</ThemedText>
                </View>
                <View style={[styles.rowBetween, { marginTop: 4 }]}>
                  <ThemedText style={{ fontWeight: "700" }}>Grand total</ThemedText>
                  <ThemedText style={{ fontWeight: "700" }}>{totals.grand_total.toFixed(2)}</ThemedText>
                </View>
              </SectionCard>

              <SectionCard title="Comments (optional)">
                <ThemedTextInput
                  style={styles.multiline}
                  placeholder="Any notes for the client…"
                  value={comments}
                  onChangeText={setComments}
                  multiline
                />
              </SectionCard>

              <View style={[styles.ctaWrap, { marginTop: 12 }]}>
                <ThemedButton onPress={handleSend} style={styles.ctaBtnPrimary}>
                  <View style={styles.ctaRow}>
                    <Text style={styles.ctaText}>Send</Text>
                  </View>
                </ThemedButton>
              </View>
            </>
          )}

          <AddItemModal
            visible={itemModalOpen}
            onClose={() => { setItemModalOpen(false); setEditIndex(null); }}
            onSave={addItem}
            initial={editIndex != null ? items[editIndex] : undefined}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "stretch" },
  titleWrap: { paddingHorizontal: 24, paddingTop: 6, paddingBottom: 4, alignItems: "center", justifyContent: "center" },
  titleText: { fontWeight: "800", fontSize: 18, textAlign: "center" },
  titleCaption: { textAlign: "center", marginTop: 4, fontSize: 13 },
  subHeader: { paddingTop: 8, paddingBottom: 10, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { flexDirection: "row", alignItems: "center" },
  backText: { fontSize: 16, marginLeft: 4 },
  stepRow: { marginTop: 8, flexDirection: "row", justifyContent: "flex-end" },
  stepText: { fontSize: 12, opacity: 0.8 },
  progressTrack: { height: 3, marginTop: 6, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.08)", overflow: "hidden" },
  progressFill: { height: 3, borderRadius: 2 },
  card: { marginHorizontal: 20, marginTop: 12, borderRadius: 12, borderWidth: 1, padding: 14 },
  cardHead: { marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardSubtitle: { marginTop: 2, fontSize: 13 },
  inputLabel: { marginHorizontal: 4, marginTop: 8, fontSize: 12, fontWeight: "700", opacity: 0.8 },
  input: { padding: 14, borderRadius: 10, alignSelf: "stretch", marginTop: 8 },
  multiline: { padding: 14, borderRadius: 10, minHeight: 90, alignSelf: "stretch", marginTop: 8, textAlignVertical: "top" },
  lockedRow: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.15)",
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
  },
  lockedText: { fontSize: 16, fontWeight: "700" },
  listCard: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  itemTitle: { fontWeight: "700", fontSize: 16, marginBottom: 4 },
  itemBody: { marginBottom: 4 },
  itemMeta: { opacity: 0.8 },
  itemLineTotal: { fontWeight: "700", marginLeft: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 3 },
  inlineBtnWrap: { marginTop: 8, marginBottom: 6, alignItems: "flex-start" },
  inlineBtn: { borderRadius: 24, paddingVertical: 10, paddingHorizontal: 14 },
  inlineBtnRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  ctaWrap: { marginHorizontal: 20, marginTop: 18, alignItems: "center" },
  ctaBtn: { alignSelf: "stretch", borderRadius: 28, paddingVertical: 14 },
  ctaBtnPrimary: { alignSelf: "stretch", borderRadius: 28, paddingVertical: 14, backgroundColor: Colors.primary },
  ctaRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center" },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16, textAlign: "center" },
  summaryRow: { marginBottom: 6 },
  summaryKey: { fontWeight: "700" },
  summaryVal: { fontWeight: "500" },
  row: { flexDirection: "row", alignItems: "flex-start", marginTop: 8 },
});





