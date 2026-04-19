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
import { useTheme } from "../../../hooks/useTheme";
import { supabase } from "../../../lib/supabase";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";
import { FontFamily, Radius } from "../../../constants/Typography";

const PRIMARY = Colors.primary;
const DEFAULT_VAT_RATE = 0.20;

// Validation constants
const VALIDATION = {
  PRICE_MIN: 0,
  PRICE_MAX: 1000000,
  QTY_MIN: 1,
  QTY_MAX: 10000,
  COMMENTS_MAX: 2000,
  ITEM_NAME_MAX: 200,
  ITEM_DESC_MAX: 500,
};

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
  const { colors: c, dark } = useTheme();
  const styles = useMemo(() => makeStyles(c, dark), [c, dark]);
  const iconColor = c.text;

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


        // Get category and service from the joined tables (most reliable source)
        // These come from the foreign key relationships to service_categories and service_types tables
        let category = info.category; // From service_categories.name
        let service = info.service;   // From service_types.name

        // Fallback: if joined tables are empty, try parsing suggested_title
        if (!category || !service) {
          if (data?.suggested_title) {
            // Format: "Category - Service" -> split by " - "
            const parts = data.suggested_title.split(" - ").map(s => s.trim());

            if (parts.length >= 2) {
              if (!category) category = parts[0];
              if (!service) service = parts.slice(1).join(" - ");
            }
          }
        }

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
      let validatedValue = value;

      // Validate based on field type
      if (field === "qty") {
        const numVal = Number(value) || 0;
        // Ensure qty is positive and within limits
        validatedValue = Math.max(0, Math.min(numVal, VALIDATION.QTY_MAX));
      } else if (field === "unit_price") {
        const numVal = Number(value) || 0;
        // Ensure price is non-negative and within limits
        validatedValue = Math.max(0, Math.min(numVal, VALIDATION.PRICE_MAX));
      } else if (field === "name") {
        // Limit item name length
        validatedValue = String(value || "").slice(0, VALIDATION.ITEM_NAME_MAX);
      } else if (field === "description") {
        // Limit description length
        validatedValue = String(value || "").slice(0, VALIDATION.ITEM_DESC_MAX);
      }

      copy[index] = { ...copy[index], [field]: validatedValue };
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

  // ---- Validation helper ----
  const validateQuote = () => {
    const validItems = items.filter(it => it.name?.trim());

    // Check for items with zero quantity
    const zeroQtyItems = validItems.filter(it => Number(it.qty || 0) <= 0);
    if (zeroQtyItems.length > 0) {
      Alert.alert("Invalid quantity", "All items must have a quantity greater than 0.");
      return false;
    }

    // Check for items with negative prices
    const negativePriceItems = validItems.filter(it => Number(it.unit_price || 0) < 0);
    if (negativePriceItems.length > 0) {
      Alert.alert("Invalid price", "Item prices cannot be negative.");
      return false;
    }

    // Check total is positive and within limits
    if (totals.grand_total <= 0) {
      Alert.alert("Invalid total", "Quote total must be greater than £0.");
      return false;
    }

    if (totals.grand_total > VALIDATION.PRICE_MAX) {
      Alert.alert("Total too high", `Quote total cannot exceed £${VALIDATION.PRICE_MAX.toLocaleString()}.`);
      return false;
    }

    // Check comments length
    if (comments && comments.length > VALIDATION.COMMENTS_MAX) {
      Alert.alert("Note too long", `Note to client cannot exceed ${VALIDATION.COMMENTS_MAX} characters.`);
      return false;
    }

    return true;
  };

  // ---- Submit handlers ----
  const handleSend = async () => {
    if (sending) return; // Prevent double-tap

    const derivedTitle = buildProjectTitle();
    if (!derivedTitle.trim() || derivedTitle === "Untitled quote") {
      Alert.alert("Missing project", "Please enter the project name.");
      return;
    }

    // Validate quote before sending
    if (!validateQuote()) return;

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
        console.log("[Quote Create] Updating quote:", quoteId);
        await updateQuote(quoteId, payload);
      } else {
        // Create new quote
        console.log("[Quote Create] Creating new quote for request:", requestId);
        await createQuote(payload);
      }
      // Go back to Client Request page so trade can see all quotes for this request
      // Trades can create up to 3 quotes per request
      if (requestId) {
        console.log("[Quote Create] Redirecting to Client Request:", `/quotes/request/${requestId}`);
        router.replace(`/quotes/request/${requestId}`);
      } else {
        console.log("[Quote Create] No requestId, redirecting to Projects list");
        router.replace("/quotes");
      }
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Failed to save quote.");
    } finally {
      setSending(false);
    }
  };

  const handleSaveAsDraft = async () => {
    const derivedTitle = buildProjectTitle();
    console.log("[Quote Draft] Saving draft, requestId:", requestId, "quoteId:", quoteId);

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
        console.log("[Quote Draft] Updating existing draft:", quoteId);
        await updateQuote(quoteId, payload);
      } else {
        console.log("[Quote Draft] Creating new draft");
        await createQuote(payload);
      }
      // Go back to Client Request page so trade can see all quotes for this request
      // Trades can create up to 3 quotes per request
      if (requestId) {
        console.log("[Quote Draft] Redirecting to Client Request:", `/quotes/request/${requestId}`);
        router.replace(`/quotes/request/${requestId}`);
      } else {
        console.log("[Quote Draft] No requestId, redirecting to Projects list");
        router.replace("/quotes");
      }
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
                        placeholderTextColor={c.textMuted}
                        value={item.name}
                        onChangeText={(t) => updateItem(index, "name", t)}
                        autoCapitalize="sentences"
                        returnKeyType="done"
                        blurOnSubmit={true}
                      />
                      <Pressable onPress={() => removeItem(index)} hitSlop={10} style={styles.removeBtn}>
                        <Ionicons name="close" size={20} color={c.textMuted} />
                      </Pressable>
                    </View>

                    {/* Description */}
                    <TextInput
                      style={styles.itemDescInput}
                      placeholder="Description (optional)"
                      placeholderTextColor={c.textMuted}
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
                          placeholderTextColor={c.textMuted}
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
                            placeholderTextColor={c.textMuted}
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
                  placeholderTextColor={c.textMuted}
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

function makeStyles(c, dark) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: c.elevate,
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
    color: c.text,
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
    backgroundColor: c.elevate2,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  projectChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: c.textMid,
  },

  // Section headers
  sectionHeader: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: c.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 15,
    color: c.textMid,
  },

  // Item cards - inline editing
  itemCard: {
    backgroundColor: c.elevate,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: c.border,
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
    color: c.text,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  removeBtn: {
    padding: 4,
    marginLeft: 8,
  },
  itemDescInput: {
    fontSize: 14,
    color: c.textMid,
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
    color: c.text,
    textAlign: "center",
    backgroundColor: c.elevate,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  timesSymbol: {
    fontSize: 14,
    color: c.textMuted,
    marginHorizontal: 8,
  },
  priceInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.elevate,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    paddingLeft: 8,
  },
  poundSign: {
    fontSize: 15,
    color: c.textMid,
  },
  priceInput: {
    width: 70,
    fontSize: 15,
    color: c.text,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  lineTotal: {
    fontSize: 16,
    fontWeight: "700",
    color: c.text,
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
    backgroundColor: c.elevate,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 14,
    color: c.textMid,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: "500",
    color: c.text,
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
    color: c.textMid,
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
    color: c.text,
  },
  totalDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 8,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: c.text,
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: c.text,
  },

  // Review cards
  reviewCard: {
    backgroundColor: c.elevate,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: c.border,
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
    color: c.textMid,
  },
  editLink: {
    fontSize: 14,
    fontWeight: "600",
    color: c.textMid,
  },
  reviewProjectName: {
    fontSize: 16,
    fontWeight: "600",
    color: c.text,
  },
  reviewPostcode: {
    fontSize: 14,
    color: c.textMid,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: c.textMuted,
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
    color: c.text,
    marginBottom: 2,
  },
  reviewItemMeta: {
    fontSize: 13,
    color: c.textMuted,
  },
  reviewItemTotal: {
    fontSize: 15,
    fontWeight: "700",
    color: c.text,
    marginLeft: 12,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 12,
  },
  commentInput: {
    backgroundColor: c.elevate,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: c.text,
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
    color: c.textMid,
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
}
