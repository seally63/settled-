//app/(dasboard)/messages/[id].jsx

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  StyleSheet,
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Pressable,
  Alert,
  Image,
  ActionSheetIOS,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { supabase } from "../../../lib/supabase";
import { useUser } from "../../../hooks/useUser";
import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";

const TINT = Colors?.light?.tint || "#0ea5e9";
const MESSAGE_PHOTOS_BUCKET = "message-photos";

function formatTime(iso) {
  if (!iso) return "";
  const dt = new Date(iso);
  return dt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name) {
  if (!name) return "?";
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (
    parts[0].charAt(0).toUpperCase() +
    parts[parts.length - 1].charAt(0).toUpperCase()
  );
}

// Parse project_title format: "Business Name: Service type in POSTCODE"
// Example: "Ronan's Kitchen: Full kitchen refit in EH48 3NN"
// Returns { serviceType: "Full kitchen refit", postcode: "EH48 3NN" }
function parseProjectTitle(projectTitle) {
  const res = { serviceType: null, postcode: null };
  if (!projectTitle) return res;

  // Remove business name (before the colon)
  const colonIndex = projectTitle.indexOf(":");
  const afterColon = colonIndex >= 0 ? projectTitle.slice(colonIndex + 1).trim() : projectTitle;

  // Try to extract postcode (UK postcodes: letters+numbers at the end after "in ")
  // Pattern: "... in POSTCODE" where POSTCODE is like "EH48 3NN"
  const inMatch = afterColon.match(/^(.+?)\s+in\s+([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})$/i);
  if (inMatch) {
    res.serviceType = inMatch[1].trim();
    res.postcode = inMatch[2].trim().toUpperCase();
  } else {
    // No postcode found, use the whole thing as service type
    res.serviceType = afterColon;
  }

  return res;
}

// Same parser as myquotes detail
// Details format: "Category: X\nService: Y\nDescription: Z\nProperty: W\n..."
function parseDetails(details) {
  const res = {
    title: null,
    start: null,
    address: null,
    category: null,
    service: null,
    main: null,
    refit: null,
    notes: null,
    postcode: null,
  };
  if (!details) return res;
  const lines = String(details)
    .split("\n")
    .map((s) => s.trim());
  res.title = lines[0] || "Request";
  for (const ln of lines) {
    const [k, ...rest] = ln.split(":");
    if (!rest.length) continue;
    const key = (k || "").trim().toLowerCase();
    const v = rest.join(":").trim();
    if (key.includes("start")) res.start = v;
    else if (key.includes("address")) res.address = v;
    else if (key === "category") res.category = v;
    else if (key === "service") res.service = v;
    else if (key === "main") res.main = v;
    else if (key.includes("refit")) res.refit = v;
    else if (key.includes("notes")) res.notes = v;
    else if (key === "postcode") res.postcode = v;
  }
  return res;
}

function MessageBubble({ message, isMine }) {
  // Check if message has image attachments
  const hasImages = message.paths && Array.isArray(message.paths) && message.paths.length > 0;
  const hasText = message.body && message.body.trim().length > 0;

  // Build image URLs from paths
  const imageUrls = useMemo(() => {
    if (!hasImages) return [];
    return message.paths.map(path => {
      const cleanPath = String(path || "").replace(/^\//, "");
      return supabase.storage.from(MESSAGE_PHOTOS_BUCKET).getPublicUrl(cleanPath).data?.publicUrl;
    }).filter(Boolean);
  }, [message.paths, hasImages]);

  return (
    <View
      style={[
        styles.bubbleRow,
        { justifyContent: isMine ? "flex-end" : "flex-start" },
      ]}
    >
      <View
        style={[
          styles.bubble,
          isMine ? styles.bubbleMine : styles.bubbleOther,
          hasImages && !hasText && styles.bubbleImageOnly,
        ]}
      >
        {/* Render images */}
        {imageUrls.length > 0 && (
          <View style={styles.messageImagesWrap}>
            {imageUrls.map((url, idx) => (
              <Image
                key={idx}
                source={{ uri: url }}
                style={styles.messageImage}
                resizeMode="cover"
              />
            ))}
          </View>
        )}
        {/* Render text if present */}
        {hasText && (
          <ThemedText
            style={[
              styles.bubbleText,
              isMine && styles.bubbleTextMine,
              hasImages && styles.bubbleTextWithImage,
            ]}
          >
            {message.body}
          </ThemedText>
        )}
        <ThemedText
          style={[
            styles.bubbleMeta,
            isMine && styles.bubbleMetaMine,
          ]}
          variant="muted"
        >
          {formatTime(message.created_at)}
        </ThemedText>
      </View>
    </View>
  );
}

function AppointmentMessageBubble({ message, appointment, isMine, userRole, onRespond, onEdit }) {
  if (!appointment) return null;

  const scheduledDate = new Date(appointment.scheduled_at);
  const isPending = appointment.status === 'proposed';
  const isConfirmed = appointment.status === 'confirmed';
  const isCancelled = appointment.status === 'cancelled';

  const showClientActions = !isMine && userRole === 'client' && isPending;
  const showTradeActions = isMine && userRole === 'trades' && isPending;

  const statusMap = {
    proposed: { bg: "#FEF3C7", fg: "#92400E", icon: "time-outline", label: "Proposed" },
    confirmed: { bg: "#D1FAE5", fg: "#065F46", icon: "checkmark-circle", label: "Confirmed" },
    cancelled: { bg: "#FEE2E2", fg: "#991B1B", icon: "close-circle", label: "Cancelled" },
  };
  const statusInfo = statusMap[appointment.status] || statusMap.proposed;

  return (
    <View style={styles.appointmentBubbleContainer}>
      <View style={styles.appointmentBubble}>
        {/* Header with icon and title - centered */}
        <View style={styles.appointmentHeader}>
          <Ionicons name="calendar" size={24} color={TINT} />
          <Spacer height={8} />
          <ThemedText style={styles.appointmentTitle}>
            {appointment.title || 'Site Survey Appointment'}
          </ThemedText>
        </View>

        {/* Status badge - centered */}
        <View style={[styles.appointmentStatusBadge, { backgroundColor: statusInfo.bg }]}>
          <Ionicons name={statusInfo.icon} size={14} color={statusInfo.fg} />
          <ThemedText style={[styles.appointmentStatusText, { color: statusInfo.fg }]}>
            {statusInfo.label}
          </ThemedText>
        </View>

        <Spacer height={20} />

        {/* Date and time - centered */}
        <View style={styles.appointmentDetailRow}>
          <Ionicons name="calendar-outline" size={18} color="#6B7280" />
          <ThemedText style={styles.appointmentDetailText}>
            {scheduledDate.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
          </ThemedText>
        </View>

        <Spacer height={8} />

        <View style={styles.appointmentDetailRow}>
          <Ionicons name="time-outline" size={18} color="#6B7280" />
          <ThemedText style={styles.appointmentDetailText}>
            {scheduledDate.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </ThemedText>
        </View>

        {appointment.location && (
          <>
            <Spacer height={8} />
            <View style={styles.appointmentDetailRow}>
              <Ionicons name="location-outline" size={18} color="#6B7280" />
              <ThemedText style={styles.appointmentDetailText}>
                {appointment.location}
              </ThemedText>
            </View>
          </>
        )}

        {/* Client action buttons */}
        {showClientActions && (
          <>
            <Spacer height={12} />
            <View style={styles.appointmentActions}>
              <Pressable
                style={styles.appointmentDeclineBtn}
                onPress={() => onRespond('cancelled')}
              >
                <Ionicons name="close-circle-outline" size={16} color="#B42318" />
                <ThemedText style={styles.appointmentDeclineBtnText}>Decline</ThemedText>
              </Pressable>
              <Pressable
                style={styles.appointmentAcceptBtn}
                onPress={() => onRespond('confirmed')}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color="#FFFFFF" />
                <ThemedText style={styles.appointmentAcceptBtnText}>Accept</ThemedText>
              </Pressable>
            </View>
          </>
        )}

        {/* Trade edit button */}
        {showTradeActions && (
          <>
            <Spacer height={12} />
            <Pressable
              style={styles.appointmentEditBtn}
              onPress={onEdit}
            >
              <Ionicons name="create-outline" size={16} color={TINT} />
              <ThemedText style={styles.appointmentEditBtnText}>Edit appointment</ThemedText>
            </Pressable>
          </>
        )}

        {/* Confirmed banner */}
        {isConfirmed && (
          <>
            <Spacer height={12} />
            <View style={styles.appointmentConfirmedBanner}>
              <Ionicons name="checkmark-circle" size={16} color="#065F46" />
              <ThemedText style={styles.appointmentConfirmedText}>
                {userRole === 'client' ? 'You confirmed this appointment' : 'Client confirmed this appointment'}
              </ThemedText>
            </View>
          </>
        )}

        {/* Cancelled banner */}
        {isCancelled && (
          <>
            <Spacer height={12} />
            <View style={styles.appointmentCancelledBanner}>
              <Ionicons name="close-circle" size={16} color="#991B1B" />
              <ThemedText style={styles.appointmentCancelledText}>
                This appointment was cancelled
              </ThemedText>
            </View>
          </>
        )}

        {/* Timestamp */}
        <Spacer height={8} />
        <ThemedText style={styles.appointmentTimestamp} variant="muted">
          {formatTime(message.created_at)}
        </ThemedText>
      </View>
    </View>
  );
}

function StatusChip({ value }) {
  const v = String(value || "").toLowerCase();
  if (v === "sent") return null;

  const map = {
    accepted: { bg: "#E7F6EC", fg: "#166534", icon: "checkmark-circle" },
    declined: { bg: "#FEE2E2", fg: "#991B1B", icon: "close-circle" },
    quoted: { bg: "#F1F5F9", fg: "#0F172A", icon: "pricetag" },
    created: { bg: "#F1F5F9", fg: "#0F172A", icon: "document-text" },
    draft: { bg: "#F1F5F9", fg: "#0F172A", icon: "document-text" },
    expired: { bg: "#F8FAFC", fg: "#334155", icon: "time" },
  };
  const s = map[v] || map.created;

  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      <Ionicons
        name={s.icon}
        size={14}
        color={s.fg}
        style={{ marginRight: 6 }}
      />
      <ThemedText style={{ color: s.fg, fontWeight: "700" }}>
        {v.charAt(0).toUpperCase() + v.slice(1)}
      </ThemedText>
    </View>
  );
}

// Appointment card - shows all appointment types sent by trade
// Types: Survey/Assessment, Design consultation, Start work, Follow-up visit, Final inspection
// Shows accept/decline buttons for proposed appointments (client view)
function AppointmentCard({ appointment, userRole, onAccept, onDecline, busy }) {
  if (!appointment) return null;

  const scheduledDate = new Date(appointment.scheduled_at);
  const isConfirmed = appointment.status === "confirmed";
  const isProposed = appointment.status === "proposed";
  const isCancelled = appointment.status === "cancelled";

  // Show action buttons for clients when appointment is proposed
  const showClientActions = userRole === "client" && isProposed;

  // Status badge colors
  const getStatusStyle = () => {
    if (isConfirmed) return { bg: "#D1FAE5", fg: "#065F46", icon: "checkmark-circle", label: "Confirmed" };
    if (isCancelled) return { bg: "#FEE2E2", fg: "#991B1B", icon: "close-circle", label: "Cancelled" };
    return { bg: "#FEF3C7", fg: "#92400E", icon: "time-outline", label: "Awaiting response" };
  };
  const statusStyle = getStatusStyle();

  return (
    <View style={styles.surveyCard}>
      <View style={styles.surveyCardRow}>
        <View style={styles.surveyIconWrap}>
          <Ionicons name="calendar-outline" size={20} color={TINT} />
        </View>
        <View style={styles.surveyCardMain}>
          <ThemedText style={styles.surveyTitle}>
            {appointment.title || "Appointment"}
          </ThemedText>
          <ThemedText style={styles.surveyDateTime}>
            {scheduledDate.toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "short",
            })}{" "}
            ·{" "}
            {scheduledDate.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </ThemedText>
          {appointment.location && (
            <ThemedText style={styles.surveyLocation} numberOfLines={1}>
              {appointment.location}
            </ThemedText>
          )}
        </View>
        {!showClientActions && (
          <View
            style={[
              styles.surveyStatusBadge,
              { backgroundColor: statusStyle.bg },
            ]}
          >
            <Ionicons
              name={statusStyle.icon}
              size={14}
              color={statusStyle.fg}
            />
            <ThemedText
              style={[
                styles.surveyStatusText,
                { color: statusStyle.fg },
              ]}
            >
              {statusStyle.label}
            </ThemedText>
          </View>
        )}
      </View>
      {/* Accept/Decline buttons for client */}
      {showClientActions && (
        <View style={styles.surveyActionRow}>
          <Pressable
            style={[styles.surveyDeclineBtn, busy && { opacity: 0.5 }]}
            onPress={onDecline}
            disabled={busy}
          >
            <Ionicons name="close" size={16} color="#B42318" />
            <ThemedText style={styles.surveyDeclineBtnText}>Decline</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.surveyAcceptBtn, busy && { opacity: 0.5 }]}
            onPress={onAccept}
            disabled={busy}
          >
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            <ThemedText style={styles.surveyAcceptBtnText}>Accept</ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// Helper to format numbers with commas
function formatNumber(num) {
  if (num == null || isNaN(num)) return "0.00";
  return Number(num).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Hero card - matches quote overview page design
// Shows: Name, Service Category - Service Type, Postcode, Status, Total, Issued
function QuoteHeader({ quote, displayName, serviceInfo, postcode, userRole }) {
  if (!quote) return null;

  const total = Number(quote.grand_total ?? quote.quote_total ?? 0);
  const includesVat = Number(quote.tax_total ?? 0) > 0;
  const issuedAt = quote.issued_at ? new Date(quote.issued_at) : null;
  const status = String(quote.status || "created").toLowerCase();

  // Status badge rendering
  const renderStatusBadge = () => {
    if (status === "completed") {
      return (
        <View style={styles.statusChipCompleted}>
          <Ionicons name="checkmark-done-circle" size={16} color="#10B981" />
          <ThemedText style={styles.statusChipCompletedText}>Completed</ThemedText>
        </View>
      );
    }
    if (status === "issue_reported") {
      return (
        <View style={styles.statusChipIssue}>
          <Ionicons name="alert-circle" size={16} color="#EF4444" />
          <ThemedText style={styles.statusChipIssueText}>Issue</ThemedText>
        </View>
      );
    }
    if (status === "awaiting_completion") {
      return (
        <View style={styles.statusChipAwaiting}>
          <Ionicons name="hourglass" size={16} color="#F59E0B" />
          <ThemedText style={styles.statusChipAwaitingText}>Awaiting</ThemedText>
        </View>
      );
    }
    if (status === "accepted") {
      return (
        <View style={styles.statusChipAccepted}>
          <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
          <ThemedText style={styles.statusChipAcceptedText}>Accepted</ThemedText>
        </View>
      );
    }
    // Default status chip for other statuses
    return <StatusChip value={status} />;
  };

  return (
    <View style={styles.heroCard}>
      {/* Top row: Name, Service info, Postcode + Status badge */}
      <View style={styles.heroTopRow}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.heroClientName}>{displayName}</ThemedText>
          {serviceInfo && (
            <ThemedText style={styles.heroJobTitle}>{serviceInfo}</ThemedText>
          )}
          {postcode && (
            <ThemedText style={styles.heroLocation} variant="muted">
              {postcode}
            </ThemedText>
          )}
        </View>
        {renderStatusBadge()}
      </View>

      <Spacer height={16} />

      {/* Bottom row: Total quote + Issued date */}
      <View style={styles.heroInfoGrid}>
        <View style={styles.heroInfoItem}>
          <ThemedText style={styles.heroInfoLabel}>Total quote</ThemedText>
          <ThemedText style={styles.heroInfoValue}>
            £{formatNumber(total)}
          </ThemedText>
          <ThemedText style={styles.heroInfoSub}>
            {includesVat ? "Includes VAT" : "No VAT added"}
          </ThemedText>
        </View>
        {issuedAt && (
          <View style={[styles.heroInfoItem, { alignItems: "flex-end" }]}>
            <ThemedText style={styles.heroInfoLabel}>Issued</ThemedText>
            <ThemedText style={styles.heroInfoValue}>
              {issuedAt.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </ThemedText>
          </View>
        )}
      </View>
    </View>
  );
}

export default function MessageThread() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { user } = useUser();

  const requestId = Array.isArray(params.id) ? params.id[0] : params.id;
  const tradeNameParam = Array.isArray(params.name)
    ? params.name[0]
    : params.name;
  const quoteIdParam = Array.isArray(params.quoteId)
    ? params.quoteId[0]
    : params.quoteId;
  const avatarParam = Array.isArray(params.avatar)
    ? params.avatar[0]
    : params.avatar;
  const returnToParam = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : params.returnTo;

  const tradeName = tradeNameParam || "Tradesperson";
  const quoteId = quoteIdParam || null;
  const avatarUrl = avatarParam || null;
  const avatarInitials = getInitials(tradeName);

  // Generate a consistent color based on name (same as index.jsx)
  const avatarColors = ["#6849a7", "#3B82F6", "#10B981", "#F59E0B", "#EF4444"];
  const colorIndex = tradeName ? tradeName.charCodeAt(0) % avatarColors.length : 0;
  const avatarBgColor = avatarColors[colorIndex];

  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [quoteSummary, setQuoteSummary] = useState(null);
  const [request, setRequest] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [apptBusy, setApptBusy] = useState(false);
  // Store all appointments by ID for inline rendering in conversation
  const [appointmentsById, setAppointmentsById] = useState({});
  // Image picking state
  const [selectedImages, setSelectedImages] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  // Request camera permissions
  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === "granted";
  };

  // Request media library permissions
  const requestMediaLibraryPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === "granted";
  };

  // Pick image from gallery
  const pickImageFromGallery = async () => {
    const hasPermission = await requestMediaLibraryPermission();
    if (!hasPermission) {
      Alert.alert("Permission Required", "Please allow access to your photo library to send images.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.length > 0) {
      setSelectedImages((prev) => [...prev, ...result.assets].slice(0, 5));
    }
  };

  // Take photo with camera
  const takePhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert("Permission Required", "Please allow camera access to take photos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.length > 0) {
      setSelectedImages((prev) => [...prev, ...result.assets].slice(0, 5));
    }
  };

  // Show action sheet to choose gallery or camera
  const showImagePickerOptions = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Take Photo", "Choose from Library"],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            takePhoto();
          } else if (buttonIndex === 2) {
            pickImageFromGallery();
          }
        }
      );
    } else {
      // Android - show alert with options
      Alert.alert(
        "Add Photo",
        "Choose an option",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Take Photo", onPress: takePhoto },
          { text: "Choose from Library", onPress: pickImageFromGallery },
        ]
      );
    }
  };

  // Remove selected image
  const removeSelectedImage = (index) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Upload images to Supabase storage
  const uploadImages = async (images) => {
    const uploadedPaths = [];

    for (const image of images) {
      try {
        const uri = image.uri;
        const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

        // Fetch image as blob
        const response = await fetch(uri);
        const blob = await response.blob();

        // Upload to Supabase storage
        const { data, error } = await supabase.storage
          .from(MESSAGE_PHOTOS_BUCKET)
          .upload(fileName, blob, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (error) {
          console.warn("Image upload error:", error.message);
          continue;
        }

        uploadedPaths.push(data.path);
      } catch (e) {
        console.warn("Failed to upload image:", e?.message || e);
      }
    }

    return uploadedPaths;
  };

  const loadMessages = useCallback(async () => {
    if (!requestId) return;
    try {
      const { data, error } = await supabase.rpc("rpc_list_messages", {
        p_request_id: requestId,
        p_quote_id: null,
      });
      if (error) {
        console.warn("rpc_list_messages error:", error.message);
        setMessages([]);
        return;
      }
      setMessages(data || []);
    } catch (e) {
      console.warn("loadMessages failed:", e?.message || e);
      setMessages([]);
    }
  }, [requestId]);

  const loadQuote = useCallback(async () => {
    try {
      let data = null;
      let error = null;

      if (quoteId) {
        const res = await supabase
          .from("tradify_native_app_db")
          .select("*")
          .eq("id", quoteId)
          .maybeSingle();
        data = res.data;
        error = res.error;
      } else if (requestId) {
        const res = await supabase
          .from("tradify_native_app_db")
          .select("*")
          .eq("request_id", requestId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        data = res.data;
        error = res.error;
      }

      if (error) {
        console.warn("loadQuote failed:", error.message);
        setQuoteSummary(null);
        return;
      }

      setQuoteSummary(data || null);
    } catch (e) {
      console.warn("loadQuote failed:", e?.message || e);
      setQuoteSummary(null);
    }
  }, [quoteId, requestId]);

  const loadRequest = useCallback(async () => {
    if (!requestId) {
      setRequest(null);
      return;
    }
    try {
      // Note: quote_requests table does NOT have service_category or service_type columns
      // Service info comes from the details field or project_title on the quote
      const { data, error } = await supabase
        .from("quote_requests")
        .select("id, details, postcode, suggested_title, status")
        .eq("id", requestId)
        .maybeSingle();

      if (error) {
        console.warn("loadRequest failed:", error.message);
        setRequest(null);
        return;
      }
      setRequest(data || null);
    } catch (e) {
      console.warn("loadRequest failed:", e?.message || e);
      setRequest(null);
    }
  }, [requestId]);

  // Load all appointments for this request to display inline in conversation
  const loadAppointments = useCallback(async () => {
    if (!requestId) {
      setAppointmentsById({});
      return;
    }
    try {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, scheduled_at, title, location, status")
        .eq("request_id", requestId)
        .order("scheduled_at", { ascending: true });

      if (error) {
        console.warn("loadAppointments failed:", error.message);
        setAppointmentsById({});
        return;
      }

      // Store appointments by ID for quick lookup when rendering messages
      const byId = {};
      (data || []).forEach(appt => {
        byId[appt.id] = appt;
      });

      setAppointmentsById(byId);
    } catch (e) {
      console.warn("loadAppointments failed:", e?.message || e);
      setAppointmentsById({});
    }
  }, [requestId]);

  useEffect(() => {
    loadMessages();
    loadQuote();
    loadRequest();
    loadAppointments();
  }, [loadMessages, loadQuote, loadRequest, loadAppointments]);

  // Fetch user role
  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!user?.id) {
        setUserRole('client');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (mounted) {
        setUserRole(!error ? (data?.role || 'client') : 'client');
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const handleRespondToAppointment = useCallback(async (appointmentId, response) => {
    if (apptBusy || !appointmentId) return;

    const isAccepting = response === 'confirmed';
    const action = isAccepting ? 'Accept' : 'Decline';

    Alert.alert(
      `${action} this appointment?`,
      isAccepting
        ? 'This will confirm the appointment with the tradesperson.'
        : 'This will notify the tradesperson that you declined this appointment.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          style: isAccepting ? 'default' : 'destructive',
          onPress: async () => {
            try {
              setApptBusy(true);

              const { error } = await supabase.rpc('rpc_client_respond_appointment', {
                p_appointment_id: appointmentId,
                p_response: isAccepting ? 'accepted' : 'declined',
              });

              if (error) {
                Alert.alert('Error', error.message || `Could not ${action.toLowerCase()} appointment`);
                return;
              }

              // Reload messages and appointments to show updated status
              await loadMessages();
              await loadAppointments();
            } catch (e) {
              Alert.alert('Error', e?.message || 'Something went wrong');
            } finally {
              setApptBusy(false);
            }
          },
        },
      ]
    );
  }, [apptBusy, loadMessages, loadAppointments]);

  const handleEditAppointment = useCallback((appointmentId) => {
    // TODO: Implement edit appointment modal
    Alert.alert('Edit Appointment', 'This feature will be available soon!');
  }, []);

  const handleSend = useCallback(async () => {
    const body = input.trim();
    const hasImages = selectedImages.length > 0;

    // Need either text or images to send
    if (!body && !hasImages) return;
    if (!requestId || !user?.id) return;

    setSending(true);
    setUploadingImages(hasImages);

    try {
      // Upload images first if any
      let imagePaths = [];
      if (hasImages) {
        imagePaths = await uploadImages(selectedImages);
        if (imagePaths.length === 0 && !body) {
          Alert.alert("Upload failed", "Failed to upload images. Please try again.");
          return;
        }
      }

      const { error } = await supabase.rpc("rpc_send_message", {
        p_request_id: requestId,
        p_quote_id: null,
        p_body: body || "",
        p_paths: imagePaths,
      });

      if (error) {
        Alert.alert("Send failed", error.message);
        return;
      }

      setInput("");
      setSelectedImages([]);
      await loadMessages();
    } catch (e) {
      Alert.alert("Send failed", e?.message || "Unknown error");
    } finally {
      setSending(false);
      setUploadingImages(false);
    }
  }, [input, selectedImages, requestId, user?.id, loadMessages]);

  const renderItem = ({ item }) => {
    const isMine = item.sender_id === user?.id;

    // Render appointment messages as inline cards in the conversation flow
    if (item.message_type === 'appointment') {
      const appointmentId = item.appointment_id;
      const appointment = appointmentId ? appointmentsById[appointmentId] : null;

      if (!appointment) {
        return null;
      }

      return (
        <View style={styles.inlineAppointmentWrap}>
          <AppointmentCard
            appointment={appointment}
            userRole={userRole}
            onAccept={() => handleRespondToAppointment(appointment.id, 'confirmed')}
            onDecline={() => handleRespondToAppointment(appointment.id, 'cancelled')}
            busy={apptBusy}
          />
        </View>
      );
    }

    // Regular text message
    return <MessageBubble message={item} isMine={isMine} />;
  };

  const parsed = useMemo(() => {
    return parseDetails(request?.details);
  }, [request?.details]);

  // Parse project_title to extract service type and postcode
  // Format: "Business Name: Service type in POSTCODE"
  const parsedProjectTitle = useMemo(() => {
    return parseProjectTitle(quoteSummary?.project_title);
  }, [quoteSummary?.project_title]);

  // Build service info string: "Service Category - Service Type"
  const serviceInfo = useMemo(() => {
    // Try from parsed details - "Category: X" and "Service: Y" lines
    if (parsed.category && parsed.service) {
      return `${parsed.category} - ${parsed.service}`;
    }
    // Try category + refit combination
    if (parsed.category && parsed.refit) {
      return `${parsed.category} - ${parsed.refit}`;
    }
    // Try main + refit combination
    if (parsed.main && parsed.refit) {
      return `${parsed.main} - ${parsed.refit}`;
    }
    // Single field fallbacks from parsed details
    if (parsed.category && parsed.service === null) {
      // Only category available, but we also need service type
      // Fall through to project_title parsing which might have it
    }
    // Try from quote summary service fields
    if (quoteSummary?.service_category && quoteSummary?.service_type) {
      return `${quoteSummary.service_category} - ${quoteSummary.service_type}`;
    }
    // Fall back to parsed project_title (extracts service type without business name)
    // This handles format like "Kitchen: Full kitchen refit" -> "Full kitchen refit"
    if (parsedProjectTitle.serviceType) {
      // If we have category from details, combine with service type from project_title
      if (parsed.category) {
        return `${parsed.category} - ${parsedProjectTitle.serviceType}`;
      }
      return parsedProjectTitle.serviceType;
    }
    // Last resort single fields
    if (parsed.category) {
      return parsed.category;
    }
    if (parsed.service) {
      return parsed.service;
    }
    if (parsed.main) {
      return parsed.main;
    }
    if (parsed.refit) {
      return parsed.refit;
    }
    return null;
  }, [parsed, quoteSummary, parsedProjectTitle]);

  // Get postcode: try request.postcode first, then parsed details, then parsed project_title, then parsed.address
  const postcode = useMemo(() => {
    if (request?.postcode) return request.postcode;
    if (parsed.postcode) return parsed.postcode;
    if (parsedProjectTitle.postcode) return parsedProjectTitle.postcode;
    if (parsed.address) return parsed.address;
    return null;
  }, [request?.postcode, parsed.postcode, parsedProjectTitle.postcode, parsed.address]);

  // Display name: For clients, show trade name. For trades, show client name.
  // Note: tradeName param contains "other_party_name" from the conversation list,
  // which is the client name for trades and the trade name for clients.
  const heroDisplayName = useMemo(() => {
    // The tradeName param already contains the correct "other party" name:
    // - For trades viewing: it's the client name
    // - For clients viewing: it's the trade/business name
    // So we can just use tradeName directly for both cases
    return tradeName || (userRole === "trades" ? "Client" : "Tradesperson");
  }, [userRole, tradeName]);

  return (
    // No safe prop → no extra safe-area padding at the bottom
    <ThemedView style={styles.container}>
      {/* Top bar with avatar + name */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => {
            // If returnTo param exists, navigate there instead of going back
            if (returnToParam) {
              router.replace(returnToParam);
            } else if (router.canGoBack()) {
              router.back(); // gives you the proper "back" animation
            } else {
              router.replace("/(dashboard)/messages");
            }
          }}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={22} color="#0F172A" />
        </Pressable>

        <View style={styles.topBarCenter}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.topBarAvatar} />
          ) : (
            <View style={[styles.topBarAvatar, styles.topBarAvatarFallback, { backgroundColor: avatarBgColor }]}>
              <ThemedText style={styles.topBarAvatarInitials}>
                {avatarInitials}
              </ThemedText>
            </View>
          )}
          <ThemedText title style={styles.topBarName} numberOfLines={1}>
            {tradeName}
          </ThemedText>
        </View>

        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.flex}>
          <FlatList
            data={messages}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              quoteSummary ? (
                <QuoteHeader
                  quote={quoteSummary}
                  displayName={heroDisplayName}
                  serviceInfo={serviceInfo}
                  postcode={postcode}
                  userRole={userRole}
                />
              ) : null
            }
          />
        </View>

        {/* Selected images preview */}
        {selectedImages.length > 0 && (
          <View style={styles.selectedImagesContainer}>
            {selectedImages.map((img, idx) => (
              <View key={idx} style={styles.selectedImageWrap}>
                <Image source={{ uri: img.uri }} style={styles.selectedImageThumb} />
                <Pressable
                  style={styles.removeImageBtn}
                  onPress={() => removeSelectedImage(idx)}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          {/* Attachment button */}
          <Pressable
            onPress={showImagePickerOptions}
            disabled={sending || selectedImages.length >= 5}
            style={({ pressed }) => [
              styles.attachBtn,
              {
                opacity: sending || selectedImages.length >= 5 ? 0.4 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="image-outline" size={24} color="#6B7280" />
          </Pressable>

          <TextInput
            style={styles.input}
            placeholder="Type a message…"
            value={input}
            onChangeText={setInput}
            editable={!sending}
            multiline
          />

          {/* Send button with loading indicator */}
          <Pressable
            onPress={handleSend}
            disabled={sending || (!input.trim() && selectedImages.length === 0)}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                opacity:
                  sending || (!input.trim() && selectedImages.length === 0) ? 0.4 : pressed ? 0.8 : 1,
              },
            ]}
          >
            {uploadingImages ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={18} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    // manual safe-area for the notch; no bottom padding so no blob
    paddingTop: Platform.OS === "ios" ? 56 : 0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  topBarCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  topBarAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E5E7EB",
  },
  topBarAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  topBarAvatarInitials: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  topBarName: {
    marginLeft: 8,
    fontSize: 17,
    textAlign: "left",
  },

  // Hero card - matches quote overview page
  heroCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  heroClientName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  heroJobTitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "500",
    color: "#374151",
  },
  heroLocation: {
    marginTop: 2,
    fontSize: 14,
    color: "#6B7280",
  },
  heroInfoGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  heroInfoItem: {
    flex: 1,
  },
  heroInfoLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
  },
  heroInfoValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  heroInfoSub: {
    marginTop: 2,
    fontSize: 12,
    color: "#6B7280",
  },
  // Status chips
  statusChipCompleted: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusChipCompletedText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10B981",
  },
  statusChipIssue: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusChipIssueText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#EF4444",
  },
  statusChipAwaiting: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusChipAwaitingText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#F59E0B",
  },
  statusChipAccepted: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusChipAcceptedText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#16A34A",
  },
  // Survey visit card
  surveyCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  surveyCardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  surveyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  surveyCardMain: {
    flex: 1,
  },
  surveyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  surveyDateTime: {
    fontSize: 13,
    color: "#374151",
    marginTop: 2,
  },
  surveyLocation: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  surveyStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4,
  },
  surveyStatusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  surveyActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  surveyDeclineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  surveyDeclineBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#B42318",
  },
  surveyAcceptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#16A34A",
  },
  surveyAcceptBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  // Fallback chip style for other statuses
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },

  listContent: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  // Wrapper for inline appointment cards in conversation flow
  inlineAppointmentWrap: {
    marginVertical: 8,
  },
  bubbleRow: {
    marginBottom: 9, // slightly bigger gap between messages
    paddingHorizontal: 16,
    flexDirection: "row",
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  bubbleMine: {
    backgroundColor: TINT,
  },
  bubbleOther: {
    backgroundColor: "#E5E7EB",
  },
  bubbleImageOnly: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: "transparent",
  },
  bubbleText: {
    fontSize: 14,
    color: "#0F172A",
  },
  bubbleTextMine: {
    color: "#FFFFFF",
  },
  bubbleTextWithImage: {
    marginTop: 8,
  },
  bubbleMeta: {
    fontSize: 10,
    marginTop: 2,
    textAlign: "right",
    opacity: 0.7,
    color: "rgba(15,23,42,0.7)",
  },
  bubbleMetaMine: {
    color: "rgba(255,255,255,0.75)",
  },

  // Message images
  messageImagesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 4,
  },
  messageImage: {
    width: 180,
    height: 180,
    borderRadius: 12,
  },

  // Selected images preview
  selectedImagesContainer: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: "#F9FAFB",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148,163,184,0.5)",
  },
  selectedImageWrap: {
    position: "relative",
  },
  selectedImageThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  removeImageBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
  },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148,163,184,0.5)",
    backgroundColor: "#FFFFFF",
  },
  attachBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    backgroundColor: "#FFFFFF",
    fontSize: 14,
  },
  sendBtn: {
    marginLeft: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TINT,
  },

  // Appointment message styles - Compact design
  appointmentBubbleContainer: {
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  appointmentBubble: {
    width: "100%",
    maxWidth: 340,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  appointmentHeader: {
    alignItems: "center",
    marginBottom: 12,
  },
  appointmentTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    color: "#0F172A",
  },
  appointmentStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  appointmentStatusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  appointmentDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 8,
  },
  appointmentDetailText: {
    fontSize: 14,
    color: "#374151",
  },
  appointmentActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  appointmentDeclineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  appointmentDeclineBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#B42318",
  },
  appointmentAcceptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#16A34A",
  },
  appointmentAcceptBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  appointmentEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  appointmentEditBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: TINT,
  },
  appointmentConfirmedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#D1FAE5",
  },
  appointmentConfirmedText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#065F46",
  },
  appointmentCancelledBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
  },
  appointmentCancelledText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#991B1B",
  },
  appointmentTimestamp: {
    fontSize: 11,
    textAlign: "right",
  },
});
