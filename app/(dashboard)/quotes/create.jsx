// app/(dashboard)/quotes/create.jsx
// Clean 2-step quote creation with inline item editing
import {
  StyleSheet, Text, View, ScrollView, Pressable, useColorScheme, Platform,
  KeyboardAvoidingView, Alert, TextInput, Switch, Keyboard, InputAccessoryView,
} from "react-native";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useQuotes } from "../../../hooks/useQuotes";
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";

const PRIMARY = "#6849a7";
const DEFAULT_VAT_RATE = 0.20;

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
function computeTotals(items = [], vatEnabled = true, vatRate = DEFAULT_VAT_RATE) {
  let subtotal = 0;
  for (const it of items) subtotal += Number(it?.qty || 0) * Number(it?.unit_price || 0);
  const r2 = (n) => Math.round(n * 100) / 100;
  const tax_total = vatEnabled ? r2(subtotal * vatRate) : 0;
  const grand_total = r2(subtotal + tax_total);
  return { subtotal: r2(subtotal), tax_total, grand_total };
}
function formatNumber(num) {
  if (num == null || isNaN(num)) return "0.00";
  return Number(num).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Derive project info from request data - includes category, service, postcode */
function deriveProjectInfo(req) {
  if (!req) return { category: null, service: null, postcode: null };

  // Get category name from join
  const category = req.service_categories?.name || null;

  // Get service type name from join
  const service = req.service_types?.name || null;

  // Get postcode
  const postcode = (req.postcode || "").toString().trim().toUpperCase();

  return { category, service, postcode };
}

/** Get client display name from request */
async function getClientDisplayName(requestId) {
  if (!requestId) return null;
  try {
    // Try the privacy-aware RPC first
    const { data } = await supabase.rpc("rpc_get_client_contact_for_request", {
      p_request_id: requestId,
    });
    if (data?.name_display) return data.name_display;
    if (data?.name) return data.name;

    // Fallback: try rpc_list_conversations to get client name
    const { data: convData } = await supabase.rpc("rpc_list_conversations", { p_limit: 100 });
    if (convData) {
      const conv = convData.find((c) => c.request_id === requestId);
      if (conv?.other_party_name) return conv.other_party_name;
    }

    return null;
  } catch {
    return null;
  }
}

/* ----------------------- Main Screen ----------------------- */
export default function Create() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const iconColor = scheme === "dark" ? "#fff" : "#000";

  // Unique ID for InputAccessoryView - only for numeric inputs
  const NUMERIC_ACCESSORY_ID = "numeric-keyboard-done";

  const params = useLocalSearchParams();
  const titleParamRaw = asString(params?.title);
  const requestId = asString(params?.requestId) || null;
  const quoteId = asString(params?.quoteId) || null; // For editing existing drafts
  const lockParam = asBool(params?.lockTitle);

  const titleParam = titleParamRaw ? decodeURIComponent(titleParamRaw) : "";
  const initialLocked = lockParam || !!titleParam;

  // Form state
  const [projectTitle, setProjectTitle] = useState(titleParam || "");
  const [projectCategory, setProjectCategory] = useState("");
  const [projectService, setProjectService] = useState("");
  const [projectPostcode, setProjectPostcode] = useState("");
  const [clientName, setClientName] = useState(null);
  const [titleLocked, setTitleLocked] = useState(initialLocked);
  const [items, setItems] = useState([]);
  const [comments, setComments] = useState("");
  const [step, setStep] = useState(1);
  const [isEditing, setIsEditing] = useState(false); // True when editing existing draft

  // VAT state
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatRate, setVatRate] = useState(DEFAULT_VAT_RATE);

  // Sending state for loading overlay
  const [sending, setSending] = useState(false);

  const totals = useMemo(
    () => computeTotals(items, vatEnabled, vatRate),
    [items, vatEnabled, vatRate]
  );

  const { createQuote, updateQuote, fetchQuoteById } = useQuotes();
  const { user } = useUser();
  const router = useRouter();

  // Load existing draft data when editing
  useEffect(() => {
    if (!quoteId) return;
    let alive = true;

    (async () => {
      try {
        const quote = await fetchQuoteById(quoteId);
        if (!alive || !quote) return;

        setIsEditing(true);
        // Don't set projectTitle from saved quote - we'll derive it from request data
        setComments(quote.comments || "");
        setTitleLocked(true);

        // Load line items
        if (Array.isArray(quote.line_items) && quote.line_items.length > 0) {
          setItems(quote.line_items);
        }

        // Load VAT settings if stored
        if (quote.vat_enabled !== undefined) setVatEnabled(quote.vat_enabled);
        if (quote.vat_rate !== undefined) setVatRate(quote.vat_rate);

        // Fetch client name and request data
        const reqId = quote.request_id || requestId;
        if (reqId) {
          // Get client name
          const name = await getClientDisplayName(reqId);
          if (alive && name) setClientName(name);

          // Fetch request data for category/service/postcode
          const { data, error } = await supabase
            .from("quote_requests")
            .select(`
              id, postcode, suggested_title,
              service_categories(id, name),
              service_types(id, name)
            `)
            .eq("id", reqId)
            .maybeSingle();

          if (!error && data && alive) {
            const info = deriveProjectInfo(data);

            console.log("[DEBUG Create Quote - Edit Mode] Raw data from DB:", JSON.stringify({
              suggested_title: data?.suggested_title,
              postcode: data?.postcode,
              service_categories_name: data?.service_categories?.name,
              service_types_name: data?.service_types?.name,
            }));

            // Get category and service from joined tables
            let category = info.category;
            let service = info.service;

            // Fallback to parsing suggested_title
            if (!category || !service) {
              if (data?.suggested_title) {
                const parts = data.suggested_title.split(" - ").map(s => s.trim());
                if (parts.length >= 2) {
                  if (!category) category = parts[0];
                  if (!service) service = parts.slice(1).join(" - ");
                }
              }
            }

            console.log("[DEBUG Create Quote - Edit Mode] Final - category:", category, "service:", service, "postcode:", info.postcode);

            if (category) setProjectCategory(category);
            if (service) setProjectService(service);
            if (info.postcode) setProjectPostcode(info.postcode);
          }
        }
      } catch { /* ignore */ }
    })();

    return () => { alive = false; };
  }, [quoteId, requestId]);

  // Load project info from request (for new quotes)
  useEffect(() => {
    if (quoteId) return; // Skip if editing existing draft
    let alive = true;

    (async () => {
      // Always try to fetch client name if we have a requestId
      if (requestId) {
        try {
          const name = await getClientDisplayName(requestId);
          if (alive && name) setClientName(name);
        } catch { /* ignore */ }
      }

      // If we already have a title param, DON'T use it for category/service parsing
      // Instead, always fetch the request details from DB to get accurate category/service
      // The titleParam is only used as a display fallback
      if (titleParam && !requestId) {
        // Only use titleParam if we have no requestId to fetch from
        // First strip " in POSTCODE" suffix if present
        let titleWithoutPostcode = titleParam;
        const inMatch = titleParam.match(/^(.+?)\s+in\s+([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})$/i);
        if (inMatch) {
          titleWithoutPostcode = inMatch[1].trim();
          setProjectPostcode(inMatch[2].toUpperCase());
        }

        // Try to parse "Service, Category" format (comma-separated)
        const commaParts = titleWithoutPostcode.split(",").map(s => s.trim());
        if (commaParts.length >= 2) {
          // Format: "Service, Category"
          setProjectService(commaParts[0]);
          setProjectCategory(commaParts[1]);
        } else {
          // Try "Category - Service" format (dash-separated)
          const dashParts = titleWithoutPostcode.split(" - ").map(s => s.trim());
          if (dashParts.length >= 2) {
            setProjectCategory(dashParts[0]);
            setProjectService(dashParts[1]);
          }
        }

        setProjectTitle(titleWithoutPostcode);
        setTitleLocked(true);
        return;
      }

      if (!requestId) return;

      try {
        const { data, error } = await supabase
          .from("quote_requests")
          .select(`
            id, postcode, suggested_title,
            service_categories(id, name),
            service_types(id, name)
          `)
          .eq("id", requestId)
          .maybeSingle();
        if (error) throw error;
        if (!alive) return;

        const info = deriveProjectInfo(data);

        console.log("[DEBUG Create Quote] Raw data from DB:", JSON.stringify({
          suggested_title: data?.suggested_title,
          postcode: data?.postcode,
          service_categories_name: data?.service_categories?.name,
          service_types_name: data?.service_types?.name,
        }));
        console.log("[DEBUG Create Quote] deriveProjectInfo result:", JSON.stringify(info));

        // Get category and service from the joined tables (most reliable source)
        // These come from the foreign key relationships to service_categories and service_types tables
        let category = info.category; // From service_categories.name
        let service = info.service;   // From service_types.name

        console.log("[DEBUG Create Quote] Using joined table data - category:", category, "service:", service);

        // Fallback: if joined tables are empty, try parsing suggested_title
        if (!category || !service) {
          if (data?.suggested_title) {
            // Format: "Category - Service" -> split by " - "
            const parts = data.suggested_title.split(" - ").map(s => s.trim());
            console.log("[DEBUG Create Quote] Parsing suggested_title:", data.suggested_title, "parts:", parts);
            if (parts.length >= 2) {
              if (!category) category = parts[0];
              if (!service) service = parts.slice(1).join(" - ");
            }
          }
        }

        console.log("[DEBUG Create Quote] Final - category:", category, "service:", service, "postcode:", info.postcode);

        // Set state
        if (category) setProjectCategory(category);
        if (service) setProjectService(service);
        if (info.postcode) setProjectPostcode(info.postcode);

        // Don't set projectTitle separately - the chip will build it from category/service/postcode
        setTitleLocked(true);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [titleParam, requestId, quoteId]);

  // ---- Inline item management ----
  const addNewItem = () => {
    setItems(prev => [...prev, { name: "", description: "", qty: 1, unit_price: 0 }]);
  };

  const updateItem = (index, field, value) => {
    setItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const removeItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // ---- Navigation ----
  const goToStep2 = () => {
    if (!titleLocked && !projectTitle.trim()) {
      Alert.alert("Missing project", "Please enter the project name.");
      return;
    }
    // Filter out empty items
    const validItems = items.filter(it => it.name?.trim());
    setItems(validItems);
    setStep(2);
  };

  const goBack = () => {
    if (step > 1) setStep(step - 1);
    else router.back();
  };

  // Build the correct project title for saving
  // Format: "ClientName's Category: Service in Postcode"
  const buildProjectTitle = () => {
    let title = "";

    // Add client name prefix
    if (clientName) {
      title += `${clientName.split(" ")[0]}'s `;
    }

    // Add category: service
    if (projectCategory && projectService) {
      title += `${projectCategory}: ${projectService}`;
    } else if (projectCategory) {
      title += projectCategory;
    } else if (projectService) {
      title += projectService;
    } else if (projectTitle) {
      title += projectTitle;
    }

    // Add postcode
    if (projectPostcode) {
      title += ` in ${projectPostcode}`;
    }

    return title || projectTitle || "Untitled quote";
  };

  // ---- Submit handlers ----
  const handleSend = async () => {
    if (sending) return; // Prevent double-tap

    const derivedTitle = buildProjectTitle();
    if (!derivedTitle.trim() || derivedTitle === "Untitled quote") {
      Alert.alert("Missing project", "Please enter the project name.");
      return;
    }

    const payload = {
      request_id: requestId || null,
      project_title: derivedTitle,
      valid_until: null,
      line_items: items.filter(it => it.name?.trim()),
      measurements: [],
      comments: comments || null,
      status: "sent",
      trade_id: user?.id || null,
      userId: user?.id || null,
      vat_enabled: vatEnabled,
      vat_rate: vatRate,
    };

    try {
      setSending(true);
      if (isEditing && quoteId) {
        // Update existing draft and send
        await updateQuote(quoteId, payload);
      } else {
        // Create new quote
        await createQuote(payload);
      }
      router.replace("/quotes");
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Failed to save quote.");
    } finally {
      setSending(false);
    }
  };

  const handleSaveAsDraft = async () => {
    const derivedTitle = buildProjectTitle();

    const payload = {
      request_id: requestId || null,
      project_title: derivedTitle,
      valid_until: null,
      line_items: items.filter(it => it.name?.trim()),
      measurements: [],
      comments: comments || null,
      status: "draft",
      trade_id: user?.id || null,
      userId: user?.id || null,
      vat_enabled: vatEnabled,
      vat_rate: vatRate,
    };

    try {
      if (isEditing && quoteId) {
        await updateQuote(quoteId, payload);
      } else {
        await createQuote(payload);
      }
      router.replace("/quotes");
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Failed to save draft.");
    }
  };

  // Header title - "Quote for {ClientName}" or just "Quote for" with field
  const headerTitle = clientName ? `Quote for ${clientName.split(" ")[0]}` : "Quote for";
  const totalSteps = 2;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={goBack} hitSlop={10} style={styles.headerBackBtn}>
            <Ionicons name="chevron-back" size={24} color={iconColor} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>{headerTitle}</ThemedText>
          <View style={{ width: 24 }} />
        </View>

        {/* Segmented progress bar like registration */}
        <View style={styles.progressContainer}>
          {[...Array(totalSteps)].map((_, index) => (
            <View key={index} style={styles.progressSegmentWrapper}>
              <View
                style={[
                  styles.progressSegment,
                  index + 1 <= step && styles.progressSegmentActive,
                ]}
              />
            </View>
          ))}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* STEP 1: Line Items */}
          {step === 1 && (
            <>
              {/* Project info chip - shows: ClientName's Category: Service in Postcode */}
              {(projectCategory || projectService || projectTitle || projectPostcode) && (
                <View style={styles.projectChip}>
                  <ThemedText style={styles.projectChipText}>
                    {clientName ? `${clientName.split(" ")[0]}'s ` : ""}
                    {projectCategory && projectService
                      ? `${projectCategory}: ${projectService}`
                      : projectCategory
                      ? projectCategory
                      : projectService
                      ? projectService
                      : projectTitle || ""}
                    {projectPostcode ? ` in ${projectPostcode}` : ""}
                  </ThemedText>
                </View>
              )}

              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>Line items</ThemedText>
                <ThemedText style={styles.sectionSubtitle}>What's included in your quote?</ThemedText>
              </View>

              {/* Inline item cards */}
              {items.map((item, index) => {
                const lineTotal = Number(item.qty || 0) * Number(item.unit_price || 0);
                return (
                  <View key={index} style={styles.itemCard}>
                    {/* Item number badge */}
                    <View style={styles.itemNumberBadge}>
                      <ThemedText style={styles.itemNumberText}>{index + 1}</ThemedText>
                    </View>

                    {/* Item name row with remove button */}
                    <View style={styles.itemNameRow}>
                      <TextInput
                        style={styles.itemNameInput}
                        placeholder="Item name (e.g., Labour, Materials)"
                        placeholderTextColor="#9CA3AF"
                        value={item.name}
                        onChangeText={(t) => updateItem(index, "name", t)}
                        autoCapitalize="sentences"
                        returnKeyType="done"
                        blurOnSubmit={true}
                      />
                      <Pressable onPress={() => removeItem(index)} hitSlop={10} style={styles.removeBtn}>
                        <Ionicons name="close" size={20} color="#9CA3AF" />
                      </Pressable>
                    </View>

                    {/* Description */}
                    <TextInput
                      style={styles.itemDescInput}
                      placeholder="Description (optional)"
                      placeholderTextColor="#9CA3AF"
                      value={item.description}
                      onChangeText={(t) => updateItem(index, "description", t)}
                      multiline
                      blurOnSubmit={true}
                      returnKeyType="done"
                      autoCapitalize="sentences"
                    />

                    {/* Price row */}
                    <View style={styles.itemPriceRow}>
                      <View style={styles.qtyPriceFields}>
                        <TextInput
                          style={styles.qtyInput}
                          placeholder="1"
                          placeholderTextColor="#9CA3AF"
                          value={String(item.qty || "")}
                          onChangeText={(t) => updateItem(index, "qty", Number(t) || 0)}
                          keyboardType="number-pad"
                          inputAccessoryViewID={Platform.OS === "ios" ? NUMERIC_ACCESSORY_ID : undefined}
                        />
                        <ThemedText style={styles.timesSymbol}>×</ThemedText>
                        <View style={styles.priceInputWrap}>
                          <ThemedText style={styles.poundSign}>£</ThemedText>
                          <TextInput
                            style={styles.priceInput}
                            placeholder="0.00"
                            placeholderTextColor="#9CA3AF"
                            value={String(item.unit_price || "")}
                            onChangeText={(t) => updateItem(index, "unit_price", Number(t) || 0)}
                            keyboardType="decimal-pad"
                            inputAccessoryViewID={Platform.OS === "ios" ? NUMERIC_ACCESSORY_ID : undefined}
                          />
                        </View>
                      </View>
                      <ThemedText style={styles.lineTotal}>£{formatNumber(lineTotal)}</ThemedText>
                    </View>
                  </View>
                );
              })}

              {/* Add item button */}
              <Pressable onPress={addNewItem} style={styles.addItemBtn}>
                <Ionicons name="add" size={20} color={PRIMARY} />
                <Text style={styles.addItemText}>Add item</Text>
              </Pressable>

              {/* Totals section */}
              {items.length > 0 && items.some(it => it.name?.trim()) && (
                <View style={styles.totalsCard}>
                  <View style={styles.totalRow}>
                    <ThemedText style={styles.totalLabel}>Subtotal</ThemedText>
                    <ThemedText style={styles.totalValue}>£{formatNumber(totals.subtotal)}</ThemedText>
                  </View>

                  {/* VAT toggle */}
                  <View style={styles.vatRow}>
                    <View style={styles.vatToggleRow}>
                      <Switch
                        value={vatEnabled}
                        onValueChange={setVatEnabled}
                        trackColor={{ false: "#E5E7EB", true: PRIMARY }}
                        thumbColor="#FFFFFF"
                        style={styles.vatSwitch}
                      />
                      <ThemedText style={styles.vatLabel}>Add VAT</ThemedText>
                    </View>
                    {vatEnabled && (
                      <Pressable
                        style={styles.vatRateBtn}
                        onPress={() => {
                          Alert.prompt?.(
                            "VAT Rate",
                            "Enter VAT percentage",
                            (text) => {
                              const rate = parseFloat(text);
                              if (!isNaN(rate) && rate >= 0 && rate <= 100) {
                                setVatRate(rate / 100);
                              }
                            },
                            "plain-text",
                            String(Math.round(vatRate * 100))
                          );
                        }}
                      >
                        <ThemedText style={styles.vatRateText}>
                          {Math.round(vatRate * 100)}%
                        </ThemedText>
                        <ThemedText style={styles.vatAmountText}>
                          £{formatNumber(totals.tax_total)}
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>

                  <View style={styles.totalDivider} />

                  <View style={styles.totalRow}>
                    <ThemedText style={styles.grandTotalLabel}>Total</ThemedText>
                    <ThemedText style={styles.grandTotalValue}>£{formatNumber(totals.grand_total)}</ThemedText>
                  </View>
                </View>
              )}

              <Spacer size={24} />

              <Pressable onPress={goToStep2} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Continue</Text>
              </Pressable>

              <Pressable onPress={handleSaveAsDraft} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Save draft</Text>
              </Pressable>
            </>
          )}

          {/* STEP 2: Review */}
          {step === 2 && (
            <>
              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>Review your quote</ThemedText>
                <ThemedText style={styles.sectionSubtitle}>Check everything before sending</ThemedText>
              </View>

              {/* Project card - fixed field, no edit */}
              <View style={styles.reviewCard}>
                <ThemedText style={styles.reviewCardTitle}>Project</ThemedText>
                <ThemedText style={styles.reviewProjectName}>
                  {clientName ? `${clientName.split(" ")[0]}'s ` : ""}
                  {projectCategory && projectService
                    ? `${projectCategory} - ${projectService}`
                    : projectTitle || "Untitled"}
                </ThemedText>
                {projectPostcode && (
                  <ThemedText style={styles.reviewPostcode}>{projectPostcode}</ThemedText>
                )}
              </View>

              {/* Line items card */}
              <View style={styles.reviewCard}>
                <View style={styles.reviewCardHeader}>
                  <ThemedText style={styles.reviewCardTitle}>Line items</ThemedText>
                  <Pressable onPress={() => setStep(1)} hitSlop={10}>
                    <ThemedText style={styles.editLink}>Edit</ThemedText>
                  </Pressable>
                </View>

                {items.filter(it => it.name?.trim()).length === 0 ? (
                  <ThemedText style={styles.emptyText}>No items added</ThemedText>
                ) : (
                  items.filter(it => it.name?.trim()).map((item, i) => {
                    const lineTotal = Number(item.qty || 0) * Number(item.unit_price || 0);
                    return (
                      <View key={i} style={styles.reviewItemRow}>
                        <View style={styles.reviewItemNumberBadge}>
                          <ThemedText style={styles.reviewItemNumberText}>{i + 1}</ThemedText>
                        </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={styles.reviewItemName}>{item.name}</ThemedText>
                          <ThemedText style={styles.reviewItemMeta}>
                            {item.qty} × £{formatNumber(item.unit_price)}
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.reviewItemTotal}>£{formatNumber(lineTotal)}</ThemedText>
                      </View>
                    );
                  })
                )}

                <View style={styles.reviewDivider} />

                <View style={styles.totalRow}>
                  <ThemedText style={styles.totalLabel}>Subtotal</ThemedText>
                  <ThemedText style={styles.totalValue}>£{formatNumber(totals.subtotal)}</ThemedText>
                </View>
                {vatEnabled && (
                  <View style={styles.totalRow}>
                    <ThemedText style={styles.totalLabel}>VAT ({Math.round(vatRate * 100)}%)</ThemedText>
                    <ThemedText style={styles.totalValue}>£{formatNumber(totals.tax_total)}</ThemedText>
                  </View>
                )}
                <View style={styles.totalDivider} />
                <View style={styles.totalRow}>
                  <ThemedText style={styles.grandTotalLabel}>Total</ThemedText>
                  <ThemedText style={styles.grandTotalValue}>£{formatNumber(totals.grand_total)}</ThemedText>
                </View>
              </View>

              {/* Note to client */}
              <View style={styles.reviewCard}>
                <ThemedText style={styles.reviewCardTitle}>Note to client</ThemedText>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Add a message..."
                  placeholderTextColor="#9CA3AF"
                  value={comments}
                  onChangeText={setComments}
                  multiline
                  numberOfLines={3}
                  blurOnSubmit={true}
                  returnKeyType="done"
                  autoCapitalize="sentences"
                />
              </View>

              <Spacer size={24} />

              <Pressable
                onPress={handleSend}
                style={[styles.primaryBtn, sending && styles.btnDisabled]}
                disabled={sending}
              >
                <Text style={styles.primaryBtnText}>
                  {sending ? "Sending..." : "Send quote"}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleSaveAsDraft}
                style={[styles.secondaryBtn, sending && styles.btnDisabled]}
                disabled={sending}
              >
                <Text style={styles.secondaryBtnText}>Save draft</Text>
              </Pressable>
            </>
          )}

          <Spacer size={40} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* iOS keyboard toolbar with Done button - only for numeric inputs */}
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={NUMERIC_ACCESSORY_ID}>
          <View style={styles.keyboardToolbar}>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => Keyboard.dismiss()}
              style={styles.keyboardDoneBtn}
              hitSlop={8}
            >
              <Text style={styles.keyboardDoneText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerBackBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
  },
  progressContainer: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  progressSegmentWrapper: {
    flex: 1,
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressSegment: {
    height: "100%",
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
  },
  progressSegmentActive: {
    backgroundColor: PRIMARY,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Project chip
  projectChip: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  projectChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },

  // Section headers
  sectionHeader: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 15,
    color: "#6B7280",
  },

  // Item cards - inline editing
  itemCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    position: "relative",
  },
  itemNumberBadge: {
    position: "absolute",
    top: -8,
    left: 12,
    backgroundColor: PRIMARY,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  itemNumberText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  itemNameRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    marginBottom: 8,
  },
  itemNameInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  removeBtn: {
    padding: 4,
    marginLeft: 8,
  },
  itemDescInput: {
    fontSize: 14,
    color: "#6B7280",
    paddingVertical: 6,
    paddingHorizontal: 0,
    minHeight: 32,
  },
  itemPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  qtyPriceFields: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  qtyInput: {
    minWidth: 56,
    fontSize: 15,
    color: "#111827",
    textAlign: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  timesSymbol: {
    fontSize: 14,
    color: "#9CA3AF",
    marginHorizontal: 8,
  },
  priceInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    paddingLeft: 8,
  },
  poundSign: {
    fontSize: 15,
    color: "#6B7280",
  },
  priceInput: {
    width: 70,
    fontSize: 15,
    color: "#111827",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  lineTotal: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginLeft: 12,
  },
  removeBtn: {
    padding: 4,
    marginLeft: 8,
  },

  // Add item button - self-sized, not full width
  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  addItemText: {
    fontSize: 16,
    fontWeight: "600",
    color: PRIMARY,
    marginLeft: 8,
  },

  // Totals
  totalsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  totalValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  vatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingVertical: 4,
  },
  vatToggleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  vatSwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
    marginRight: 8,
  },
  vatLabel: {
    fontSize: 14,
    color: "#374151",
  },
  vatRateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  vatRateText: {
    fontSize: 14,
    color: PRIMARY,
    fontWeight: "600",
  },
  vatAmountText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  totalDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 8,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },

  // Review cards
  reviewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  reviewCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  reviewCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  editLink: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  reviewProjectName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  reviewPostcode: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  reviewItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  reviewItemNumberBadge: {
    backgroundColor: PRIMARY,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 2,
  },
  reviewItemNumberText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  reviewItemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  reviewItemMeta: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  reviewItemTotal: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginLeft: 12,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 12,
  },
  commentInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
    marginTop: 12,
    minHeight: 80,
    textAlignVertical: "top",
  },

  // Buttons
  primaryBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryBtn: {
    backgroundColor: "transparent",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // Keyboard toolbar - attached to keyboard for numeric inputs
  keyboardToolbar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D1D5DB",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#B5B5B5",
  },
  keyboardDoneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  keyboardDoneText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#007AFF",
  },
});
