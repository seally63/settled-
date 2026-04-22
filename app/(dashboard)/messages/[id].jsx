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
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { decode } from "base64-arraybuffer";
import ImageViewing from "react-native-image-viewing";

import { supabase } from "../../../lib/supabase";
import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";
import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import ThemedStatusBar from "../../../components/ThemedStatusBar";
import Spacer from "../../../components/Spacer";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../../constants/Colors";
import { FontFamily } from "../../../constants/Typography";

const TINT = Colors.primary;
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

function MessageBubble({ message, isMine, onImagePress, imageStartIndex }) {
  // Check if message has image attachments
  // Support both 'paths' (from rpc_send_message) and 'attachment_paths' (from DB column)
  // Also support 'localUris' for optimistic UI (before upload completes)
  const imagePaths = message.paths || message.attachment_paths;
  const localUris = message.localUris; // For optimistic UI
  const hasImages = (imagePaths && Array.isArray(imagePaths) && imagePaths.length > 0) ||
                    (localUris && Array.isArray(localUris) && localUris.length > 0);
  const hasText = message.body && message.body.trim().length > 0;

  // State for signed URLs
  const [imageUrls, setImageUrls] = useState([]);

  // Fetch signed URLs for images (bucket is private)
  // Skip if we have local URIs (optimistic message)
  useEffect(() => {
    // If we have local URIs, use those directly (optimistic UI)
    if (localUris && localUris.length > 0) {
      setImageUrls(localUris);
      return;
    }

    if (!imagePaths || imagePaths.length === 0) {
      setImageUrls([]);
      return;
    }

    let mounted = true;

    (async () => {
      try {
        const cleanPaths = imagePaths.map(p => String(p || "").replace(/^\//, ""));
        const { data, error } = await supabase.storage
          .from(MESSAGE_PHOTOS_BUCKET)
          .createSignedUrls(cleanPaths, 3600); // 1 hour expiry

        if (error) {
          console.warn("Failed to get signed URLs:", error.message);
          setImageUrls([]);
          return;
        }

        if (mounted) {
          const urls = (data || [])
            .map(item => item?.signedUrl || item?.signed_url)
            .filter(Boolean);
          setImageUrls(urls);
        }
      } catch (e) {
        console.warn("Error fetching signed URLs:", e?.message || e);
        if (mounted) setImageUrls([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [imagePaths, localUris]);

  // Determine grid layout based on number of images
  const imageCount = imageUrls.length;
  const isSingleImage = imageCount === 1;

  // Handle image tap - use pre-calculated start index
  const handleImageTap = (localIndex) => {
    if (!onImagePress || imageStartIndex < 0) return;
    onImagePress(imageStartIndex + localIndex);
  };

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
        {/* Render images - WhatsApp style grid */}
        {imageUrls.length > 0 && (
          <View style={styles.messageImagesContainer}>
            {imageCount === 1 && (
              // Single image - full width, preserve aspect ratio
              <Pressable onPress={() => handleImageTap(0)}>
                <Image
                  source={{ uri: imageUrls[0] }}
                  style={styles.imageSingle}
                  resizeMode="cover"
                />
              </Pressable>
            )}
            {imageCount === 2 && (
              // Two images - side by side
              <View style={styles.imageRow}>
                {imageUrls.map((url, idx) => (
                  <Pressable key={idx} onPress={() => handleImageTap(idx)} style={styles.imageHalf}>
                    <Image source={{ uri: url }} style={styles.imageHalfImg} resizeMode="cover" />
                  </Pressable>
                ))}
              </View>
            )}
            {imageCount === 3 && (
              // Three images - one large left, two stacked right
              <View style={styles.imageRow}>
                <Pressable onPress={() => handleImageTap(0)} style={styles.imageTwoThirds}>
                  <Image source={{ uri: imageUrls[0] }} style={styles.imageTwoThirdsImg} resizeMode="cover" />
                </Pressable>
                <View style={styles.imageStackRight}>
                  {imageUrls.slice(1).map((url, idx) => (
                    <Pressable key={idx} onPress={() => handleImageTap(idx + 1)} style={styles.imageStackItem}>
                      <Image source={{ uri: url }} style={styles.imageStackItemImg} resizeMode="cover" />
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            {imageCount >= 4 && (
              // Four+ images - 2x2 grid with +N overlay on last
              <View style={styles.imageGrid2x2}>
                {imageUrls.slice(0, 4).map((url, idx) => (
                  <Pressable key={idx} onPress={() => handleImageTap(idx)} style={styles.imageGridItem}>
                    <Image source={{ uri: url }} style={styles.imageGridItemImg} resizeMode="cover" />
                    {idx === 3 && imageCount > 4 && (
                      <View style={styles.imageOverlay}>
                        <ThemedText style={styles.imageOverlayText}>+{imageCount - 4}</ThemedText>
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            )}
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
          <Ionicons name="calendar" size={24} color="#0F172A" />
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

  // Accept / Decline actions are NOT rendered in the conversation
  // thread anymore — the chat is messaging-only. Status tracking +
  // responses live on the project screen. We only show the inline
  // buttons if callers explicitly pass both handlers; callers that
  // omit them (the party-based MessageThread here) get a tappable
  // read-only card instead.
  const showClientActions =
    userRole === "client" && isProposed && !!onAccept && !!onDecline;

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
          <Ionicons name="calendar-outline" size={20} color="#0F172A" />
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

// Shared status palette for quote chips — used by both the inline
// in-thread card and the bottom-sheet history rows.
function quoteStatusMeta(status, c) {
  const s = String(status || "draft").toLowerCase();
  switch (s) {
    case "accepted":
    case "awaiting_completion":
      return { label: "Accepted", fg: "#065F46", bg: "#D1FAE5" };
    case "completed":
      return { label: "Completed", fg: "#065F46", bg: "#D1FAE5" };
    case "sent":
    case "created":
    case "quoted":
      return { label: "Quote sent", fg: "#1E3A8A", bg: "#DBEAFE" };
    case "declined":
      return { label: "Declined", fg: "#991B1B", bg: "#FEE2E2" };
    case "expired":
      return { label: "Expired", fg: "#5C5C66", bg: c.elevate };
    case "draft":
    default:
      return { label: "Draft", fg: "#92400E", bg: "#FEF3C7" };
  }
}

function formatQuoteAmount(n) {
  const v = Number(n || 0);
  return `£${v.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Compact single-row inline quote card. ~48px tall, same horizontal
// bleed as a message bubble. Title (truncated) · amount · status
// chip. Whole row is tappable — the parent Pressable handles the
// navigation.
function InlineQuoteCard({ c, quote }) {
  if (!quote) return null;
  const meta = quoteStatusMeta(quote.status, c);
  const title = quote.project_title || "Quote";
  const amount = formatQuoteAmount(quote.grand_total);
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginVertical: 5,
        height: 48,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        backgroundColor: c.elevate2,
        borderColor: c.border,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Ionicons name="document-text-outline" size={16} color={c.textMid} />
      <ThemedText
        numberOfLines={1}
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: FontFamily.bodyMedium,
          fontSize: 14,
          color: c.text,
        }}
      >
        {title}
      </ThemedText>
      <ThemedText
        style={{
          fontFamily: FontFamily.headerSemibold,
          fontSize: 14,
          letterSpacing: -0.2,
          color: c.text,
        }}
      >
        {amount}
      </ThemedText>
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: meta.bg,
        }}
      >
        <ThemedText
          style={{
            fontFamily: FontFamily.headerSemibold,
            fontSize: 11,
            color: meta.fg,
          }}
        >
          {meta.label}
        </ThemedText>
      </View>
    </View>
  );
}

// Thin "N quotes with this trade" summary bar pinned below the
// sticky header. Shown whenever there's at least one shared quote
// with the contact — tapping opens the history sheet. Since quotes
// no longer appear inline in the thread, this bar is the user's
// only path to the quote record from the conversation.
function QuoteHistoryBar({ c, count, onPress, userRole }) {
  if (!count || count < 1) return null;
  const noun = count === 1 ? "quote" : "quotes";
  const contact = userRole === "trades" ? "this client" : "this trade";
  const cta = count === 1 ? "View" : "View all";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: c.border,
          backgroundColor: c.elevate,
        },
        pressed && { opacity: 0.75 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${count} ${noun} with ${contact}. Tap to view.`}
    >
      <Ionicons name="receipt-outline" size={14} color={c.textMid} />
      <ThemedText
        style={{
          flex: 1,
          fontFamily: FontFamily.bodyMedium,
          fontSize: 13,
          color: c.textMid,
        }}
        numberOfLines={1}
      >
        {count} {noun} with {contact}
      </ThemedText>
      <ThemedText
        style={{
          fontFamily: FontFamily.headerSemibold,
          fontSize: 12,
          color: c.text,
        }}
      >
        {cta}
      </ThemedText>
      <Ionicons name="chevron-forward" size={14} color={c.textMuted} />
    </Pressable>
  );
}

// Bottom sheet that lists every shared quote as a compact row.
// Re-uses the same row shape as the inline InlineQuoteCard so the
// two surfaces feel the same.
function QuoteHistorySheet({ c, visible, onClose, quotes, onPick, insets }) {
  const items = useMemo(() => {
    const list = (quotes || []).slice();
    list.sort((a, b) => {
      const aAt = new Date(a.issued_at || a.created_at || 0).getTime();
      const bAt = new Date(b.issued_at || b.created_at || 0).getTime();
      return bAt - aAt;
    });
    return list;
  }, [quotes]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: c.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 12,
            paddingBottom: (insets?.bottom || 0) + 20,
            height: "70%",
          }}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              alignSelf: "center",
              backgroundColor: c.borderStrong,
              marginBottom: 14,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 20,
              paddingBottom: 14,
            }}
          >
            <View style={{ flex: 1 }}>
              <ThemedText
                style={{
                  fontFamily: FontFamily.headerBold,
                  fontSize: 11,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: c.textMuted,
                  marginBottom: 4,
                }}
              >
                Quote history
              </ThemedText>
              <ThemedText
                style={{
                  fontFamily: FontFamily.headerBold,
                  fontSize: 22,
                  letterSpacing: -0.4,
                  color: c.text,
                }}
              >
                {items.length} quote{items.length !== 1 ? "s" : ""}
              </ThemedText>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.elevate,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={18} color={c.text} />
            </Pressable>
          </View>
          <View style={{ height: 1, marginHorizontal: 20, backgroundColor: c.border }} />
          <FlatList
            data={items}
            keyExtractor={(q) => String(q.id)}
            contentContainerStyle={{ paddingVertical: 8 }}
            ItemSeparatorComponent={() => (
              <View style={{ height: 8 }} />
            )}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onPick?.(item)}
                style={({ pressed }) => [pressed && { opacity: 0.75 }]}
              >
                <InlineQuoteCard c={c} quote={item} />
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

export default function MessageThread() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const { colors: c, dark } = useTheme();
  const insets = useSafeAreaInsets();

  // `id` can be either a request_id (legacy callers) or an
  // other_party_id (new caller from the Messages tab list, which
  // passes `kind=party` explicitly). Either way we resolve to a
  // canonical otherPartyId and auto-upgrade to party mode so every
  // entry point lands on the same unified thread — one conversation
  // per person, across all their shared projects.
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const kindParam = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const routeIsParty = kindParam === "party";

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

  // If the URL says party directly, use it. Otherwise a resolver
  // effect below looks up the other party's user id from the
  // request_id. Once that resolves, isPartyMode flips on and all
  // loaders switch to the unified-thread path.
  const [resolvedOtherPartyId, setResolvedOtherPartyId] = useState(
    routeIsParty ? routeId : null
  );
  const otherPartyId = resolvedOtherPartyId;
  const isPartyMode = routeIsParty || !!resolvedOtherPartyId;
  // Legacy request-scoped id — only used during the brief window
  // before the resolver has populated otherPartyId.
  const requestId = routeIsParty ? null : routeId;

  const quoteId = quoteIdParam || null;

  // Name + avatar for the sticky top bar. Start with whatever the
  // caller passed in the URL params (fast initial render), then
  // overwrite with whatever we fetch from the profiles table for
  // the authoritative value.
  const [fetchedPartyName, setFetchedPartyName] = useState(null);
  const tradeName = fetchedPartyName || tradeNameParam || "Tradesperson";
  const avatarInitials = getInitials(tradeName);

  // Generate a consistent color based on name (same as index.jsx)
  const avatarColors = ["#6849a7", "#3B82F6", "#10B981", "#F59E0B", "#EF4444"];
  const colorIndex = tradeName ? tradeName.charCodeAt(0) % avatarColors.length : 0;
  const avatarBgColor = avatarColors[colorIndex];

  // Quotes between the two parties, keyed by quote id. Populated by
  // loadQuotesByParty; used by renderItem to interleave inline quote
  // cards into the message flow in chronological order.
  const [quotesByParty, setQuotesByParty] = useState({});
  // Quote-history bottom sheet — opens from the thin bar under the
  // sticky top header when there's more than one quote between the
  // two parties. Keeps the thread uncluttered while the full
  // history is still one tap away.
  const [quoteHistoryOpen, setQuoteHistoryOpen] = useState(false);

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
  // Fetched avatar URL (when not passed as param)
  const [fetchedAvatarUrl, setFetchedAvatarUrl] = useState(null);
  // Full-screen image viewer state
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);
  // Cache for all conversation image URLs (for the viewer)
  const [allConversationImages, setAllConversationImages] = useState([]);

  // Use passed avatar param or fetched avatar
  const avatarUrl = avatarParam || fetchedAvatarUrl || null;

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
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.7,
      base64: true, // Get base64 directly from picker - avoids file read issues
    });

    console.log("ImagePicker result:", {
      canceled: result.canceled,
      assetsCount: result.assets?.length,
      assets: result.assets?.map((a, i) => ({
        index: i,
        uri: a.uri?.substring(0, 50) + "...",
        hasBase64: !!a.base64,
        base64Length: a.base64?.length || 0,
      })),
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
      quality: 0.7,
      base64: true, // Get base64 directly from camera - avoids file read issues
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

  // Compress image if too large (target ~4MB max to stay under 5MB bucket limit)
  const compressImageIfNeeded = async (image) => {
    const MAX_BASE64_SIZE = 5 * 1024 * 1024; // ~3.75MB actual file (base64 is ~33% larger)

    let base64Data = image.base64;
    let uri = image.uri;

    // If no base64, read from file
    if (!base64Data && uri) {
      base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });
    }

    if (!base64Data) return null;

    // If under limit, return as-is
    if (base64Data.length <= MAX_BASE64_SIZE) {
      return base64Data;
    }

    // Need to compress - use ImageManipulator
    console.log(`Image too large (${(base64Data.length / 1024 / 1024).toFixed(2)}MB), compressing...`);

    // Try progressively lower quality until under limit
    const qualities = [0.6, 0.4, 0.3, 0.2];

    for (const quality of qualities) {
      try {
        const result = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1920 } }], // Also resize to max 1920px width
          { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        if (result.base64 && result.base64.length <= MAX_BASE64_SIZE) {
          console.log(`Compressed to ${(result.base64.length / 1024 / 1024).toFixed(2)}MB at quality ${quality}`);
          return result.base64;
        }
      } catch (e) {
        console.warn(`Compression at quality ${quality} failed:`, e?.message);
      }
    }

    // Last resort - very aggressive compression
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.15, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (result.base64) {
        console.log(`Aggressive compression: ${(result.base64.length / 1024 / 1024).toFixed(2)}MB`);
        return result.base64;
      }
    } catch (e) {
      console.warn("Aggressive compression failed:", e?.message);
    }

    return null;
  };

  // Upload images to Supabase storage
  const uploadImages = async (images) => {
    console.log("uploadImages called with", images.length, "images");
    const uploadedPaths = [];
    const baseTime = Date.now();

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      console.log(`Processing image ${i}:`, {
        hasUri: !!image.uri,
        hasBase64: !!image.base64,
        base64Length: image.base64?.length || 0,
      });
      try {
        // Use index to ensure unique filenames even for rapid uploads
        const fileName = `${user.id}/${baseTime}_${i}_${Math.random().toString(36).substring(2, 9)}.jpg`;

        // Compress if needed
        const base64Data = await compressImageIfNeeded(image);

        if (!base64Data) {
          console.warn("No image data available for image", i);
          continue;
        }

        // Convert base64 to ArrayBuffer for Supabase upload
        const arrayBuffer = decode(base64Data);

        // Upload to Supabase storage
        const { data, error } = await supabase.storage
          .from(MESSAGE_PHOTOS_BUCKET)
          .upload(fileName, arrayBuffer, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (error) {
          console.warn(`Image ${i} upload error:`, error.message);
          continue;
        }

        console.log(`Image ${i} uploaded successfully:`, data.path);
        uploadedPaths.push(data.path);
      } catch (e) {
        console.warn(`Failed to upload image ${i}:`, e?.message || e);
      }
    }

    console.log("uploadImages completed, uploadedPaths:", uploadedPaths);
    return uploadedPaths;
  };

  // Defence-in-depth filter: the conversation thread is text-only.
  // Legacy `message_type='appointment'` rows from before the
  // 2026-04-28 migration should never surface here. The server RPC
  // already filters them, but we repeat the guard client-side so
  // the thread stays clean even if a client is hitting an older
  // server or the legacy rpc_list_messages.
  const stripNonTextMessages = (rows) =>
    (rows || []).filter((m) => {
      const t = String(m?.message_type || "").toLowerCase();
      return t !== "appointment" && t !== "system";
    });

  const loadMessages = useCallback(async () => {
    // Party mode: fetch every message between me and the other
    // party across all shared requests (one unified thread).
    if (isPartyMode && otherPartyId) {
      try {
        const { data, error } = await supabase.rpc("rpc_list_messages_by_party", {
          p_other_party_id: otherPartyId,
        });
        if (error) {
          console.warn("rpc_list_messages_by_party error:", error.message);
          setMessages([]);
          return;
        }
        setMessages(stripNonTextMessages(data));
      } catch (e) {
        console.warn("loadMessages (party) failed:", e?.message || e);
        setMessages([]);
      }
      return;
    }

    // Legacy request-scoped mode.
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
      setMessages(stripNonTextMessages(data));
    } catch (e) {
      console.warn("loadMessages failed:", e?.message || e);
      setMessages([]);
    }
  }, [requestId, isPartyMode, otherPartyId]);

  // Load all quotes exchanged between me and the other party so we
  // can render them as inline tappable cards interleaved into the
  // message timeline. Skipped in legacy request-scoped mode (the
  // pinned QuoteHeader handled that there — and is gone in party
  // mode).
  const loadQuotesByParty = useCallback(async () => {
    if (!isPartyMode || !otherPartyId || !user?.id) {
      setQuotesByParty({});
      return;
    }
    try {
      const { data, error } = await supabase
        .from("tradify_native_app_db")
        .select("id, project_title, grand_total, status, issued_at, created_at, trade_id, client_id, request_id")
        .or(
          `and(trade_id.eq.${user.id},client_id.eq.${otherPartyId}),and(trade_id.eq.${otherPartyId},client_id.eq.${user.id})`
        );
      if (error) {
        console.warn("loadQuotesByParty error:", error.message);
        setQuotesByParty({});
        return;
      }
      const map = {};
      for (const q of data || []) map[q.id] = q;
      setQuotesByParty(map);
    } catch (e) {
      console.warn("loadQuotesByParty failed:", e?.message || e);
      setQuotesByParty({});
    }
  }, [isPartyMode, otherPartyId, user?.id]);

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

  // Load all appointments to display inline in the conversation.
  // In legacy mode this filters by request_id. In party mode we pull
  // appointments across every shared request so the card lookup works
  // regardless of which project the appointment belongs to.
  const loadAppointments = useCallback(async () => {
    if (isPartyMode) {
      if (!otherPartyId || !user?.id) { setAppointmentsById({}); return; }
      try {
        const { data, error } = await supabase
          .from("appointments")
          .select("id, scheduled_at, title, location, status, request_id, quote_id")
          .or(
            `and(trade_id.eq.${user.id},client_id.eq.${otherPartyId}),and(trade_id.eq.${otherPartyId},client_id.eq.${user.id})`
          )
          .order("scheduled_at", { ascending: true });
        if (error) {
          console.warn("loadAppointments (party) failed:", error.message);
          setAppointmentsById({});
          return;
        }
        const byId = {};
        (data || []).forEach((appt) => { byId[appt.id] = appt; });
        setAppointmentsById(byId);
      } catch (e) {
        console.warn("loadAppointments (party) failed:", e?.message || e);
        setAppointmentsById({});
      }
      return;
    }

    if (!requestId) { setAppointmentsById({}); return; }
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
      const byId = {};
      (data || []).forEach(appt => { byId[appt.id] = appt; });
      setAppointmentsById(byId);
    } catch (e) {
      console.warn("loadAppointments failed:", e?.message || e);
      setAppointmentsById({});
    }
  }, [requestId, isPartyMode, otherPartyId, user?.id]);

  // Legacy fallback: when the screen is opened with a request_id
  // (not a party id), resolve the other party's user id so downstream
  // logic can still rely on otherPartyId when convenient. Runs once
  // per request.
  useEffect(() => {
    if (isPartyMode || !requestId || resolvedOtherPartyId) return;
    let alive = true;
    (async () => {
      try {
        const { data: qr } = await supabase
          .from("quote_requests")
          .select("requester_id")
          .eq("id", requestId)
          .maybeSingle();
        if (!alive || !qr) return;
        if (qr.requester_id && qr.requester_id !== user?.id) {
          setResolvedOtherPartyId(qr.requester_id);
          return;
        }
        // I'm the requester — the other party is the trade_target.
        const { data: tgt } = await supabase
          .from("request_targets")
          .select("trade_id")
          .eq("request_id", requestId)
          .limit(1)
          .maybeSingle();
        if (alive && tgt?.trade_id) setResolvedOtherPartyId(tgt.trade_id);
      } catch (e) {
        console.warn("resolve party from request failed:", e?.message || e);
      }
    })();
    return () => { alive = false; };
  }, [isPartyMode, requestId, resolvedOtherPartyId, user?.id]);

  useEffect(() => {
    loadMessages();
    loadQuote();
    loadRequest();
    loadAppointments();
    loadQuotesByParty();
  }, [loadMessages, loadQuote, loadRequest, loadAppointments, loadQuotesByParty]);

  // Collect all image URLs from messages for the full-screen viewer
  // This allows swiping through all conversation images
  useEffect(() => {
    const collectImages = async () => {
      const allUrls = [];

      for (const msg of messages) {
        const paths = msg.paths || msg.attachment_paths;
        const localUris = msg.localUris;

        // Use local URIs for optimistic messages
        if (localUris && localUris.length > 0) {
          allUrls.push(...localUris);
          continue;
        }

        // Fetch signed URLs for server messages
        if (paths && paths.length > 0) {
          try {
            const cleanPaths = paths.map(p => String(p || "").replace(/^\//, ""));
            const { data, error } = await supabase.storage
              .from(MESSAGE_PHOTOS_BUCKET)
              .createSignedUrls(cleanPaths, 3600);

            if (!error && data) {
              const urls = data
                .map(item => item?.signedUrl || item?.signed_url)
                .filter(Boolean);
              allUrls.push(...urls);
            }
          } catch (e) {
            console.warn("Error fetching signed URLs for viewer:", e?.message);
          }
        }
      }

      setAllConversationImages(allUrls);
    };

    collectImages();
  }, [messages]);

  // Handle opening image viewer
  const handleOpenImageViewer = useCallback((index) => {
    setImageViewerIndex(index);
    setImageViewerVisible(true);
  }, []);

  // Mark conversation as read when opening. In party mode we mark
  // every shared request at once (via rpc_mark_party_read); legacy
  // mode keeps the per-request call.
  useEffect(() => {
    if (!user?.id) return;

    (async () => {
      try {
        if (isPartyMode && otherPartyId) {
          await supabase.rpc("rpc_mark_party_read", {
            p_other_party_id: otherPartyId,
          });
          return;
        }
        if (requestId) {
          await supabase.rpc("rpc_mark_conversation_read", {
            p_request_id: requestId,
          });
        }
      } catch (e) {
        console.warn("Failed to mark conversation as read:", e?.message);
      }
    })();
  }, [requestId, user?.id, isPartyMode, otherPartyId]);

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

  // Load the other party's authoritative name + avatar from the
  // profiles table. Runs as soon as we have an otherPartyId (either
  // passed directly in party mode or resolved from request_id). The
  // URL-provided name/avatar show first for zero-flash initial
  // render, then this effect overwrites with the canonical values.
  // For trades we prefer business_name over full_name.
  useEffect(() => {
    if (!otherPartyId) return;
    let mounted = true;
    (async () => {
      try {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("business_name, full_name, role, photo_url")
          .eq("id", otherPartyId)
          .maybeSingle();
        if (!mounted || !profileData) return;

        const isTradeProfile =
          String(profileData.role || "").toLowerCase() === "trades" ||
          String(profileData.role || "").toLowerCase() === "trade";
        const resolvedName = isTradeProfile
          ? (profileData.business_name || profileData.full_name || null)
          : (profileData.full_name || profileData.business_name || null);

        if (resolvedName) setFetchedPartyName(resolvedName);
        if (profileData.photo_url) setFetchedAvatarUrl(profileData.photo_url);
      } catch (e) {
        console.warn("Failed to fetch other party profile:", e?.message || e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [otherPartyId]);

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
    // Future feature: edit appointment modal (reschedule from within messages)
    Alert.alert('Edit Appointment', 'This feature will be available soon!');
  }, []);

  const handleSend = useCallback(async () => {
    const body = input.trim();
    const hasImages = selectedImages.length > 0;

    // Need either text or images to send
    if (!body && !hasImages) return;
    if (!user?.id) return;
    // Party mode needs an otherPartyId; legacy mode needs a requestId.
    if (isPartyMode && !otherPartyId) return;
    if (!isPartyMode && !requestId) return;

    // Create optimistic message for instant display
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage = {
      id: optimisticId,
      request_id: requestId || null,
      sender_id: user.id,
      body: body || null,
      message_type: "text",
      created_at: new Date().toISOString(),
      // Use local URIs for instant image preview
      localUris: hasImages ? selectedImages.map(img => img.uri) : null,
      paths: null,
      isOptimistic: true,
    };

    // Add optimistic message immediately
    setMessages(prev => [...prev, optimisticMessage]);

    // Clear input immediately for better UX
    const imagesToUpload = [...selectedImages];
    setInput("");
    setSelectedImages([]);
    setSending(true);
    setUploadingImages(hasImages);

    try {
      // Upload images first if any
      let imagePaths = [];
      if (hasImages) {
        imagePaths = await uploadImages(imagesToUpload);
        if (imagePaths.length === 0 && !body) {
          // Remove optimistic message on failure
          setMessages(prev => prev.filter(m => m.id !== optimisticId));
          Alert.alert("Upload failed", "Failed to upload images. Please try again.");
          return;
        }
      }

      // Party mode: send via the RPC that auto-picks the most recent
      // shared request between the two parties. Legacy mode still
      // uses per-request send.
      let sendErr = null;
      if (isPartyMode) {
        const { error } = await supabase.rpc("rpc_send_message_to_party", {
          p_other_party_id: otherPartyId,
          p_body: body || "",
          p_paths: imagePaths,
          p_quote_id: null,
        });
        sendErr = error;
      } else {
        const { error } = await supabase.rpc("rpc_send_message", {
          p_request_id: requestId,
          p_quote_id: null,
          p_body: body || "",
          p_paths: imagePaths,
        });
        sendErr = error;
      }

      if (sendErr) {
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
        Alert.alert("Send failed", sendErr.message);
        return;
      }

      // Reload messages to get the real message from server
      await loadMessages();
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      Alert.alert("Send failed", e?.message || "Unknown error");
    } finally {
      setSending(false);
      setUploadingImages(false);
    }
  }, [input, selectedImages, requestId, isPartyMode, otherPartyId, user?.id, loadMessages]);

  // Calculate image start index for each message (for the image viewer)
  const messageImageStartIndex = useMemo(() => {
    const indexMap = {};
    let currentIndex = 0;

    for (const msg of messages) {
      const paths = msg.paths || msg.attachment_paths;
      const localUris = msg.localUris;
      const imageCount = (localUris?.length) || (paths?.length) || 0;

      if (imageCount > 0) {
        indexMap[msg.id] = currentIndex;
        currentIndex += imageCount;
      } else {
        indexMap[msg.id] = -1; // No images
      }
    }

    return indexMap;
  }, [messages]);

  // List of quotes between the two parties that surface in the
  // thread (drafts are hidden — those are a trade-only concern).
  // Used by both the interleave memo below and the history bar /
  // sheet so counts + contents stay in sync.
  const visibleQuoteList = useMemo(() => {
    if (!isPartyMode) return [];
    return Object.values(quotesByParty || {}).filter((q) => {
      const s = String(q.status || "").toLowerCase();
      return s && s !== "draft";
    });
  }, [quotesByParty, isPartyMode]);

  // Thread shows messages only — quotes are surfaced through the
  // QuoteHistoryBar at the top + the QuoteHistorySheet bottom sheet.
  // Keeping them out of the message flow means the conversation
  // stays focused on actual communication, and the quote record is
  // always a single tap away.
  const threadData = useMemo(() => {
    return [...messages].sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return ta - tb;
    });
  }, [messages]);

  // Navigation helper for tapping inline quote / appointment cards —
  // the conversation is now messaging-only, so actions happen on the
  // project screen. Tapping a card routes to the quote detail view
  // for the current user's role.
  //
  // We pass an explicit `returnTo` that points straight back at the
  // current conversation URL. The destination back handlers prefer
  // `returnTo` over `router.back()` (see the fix on myquotes/[id] +
  // quotes/[id] in this branch), so the user doesn't detour through
  // stale stack entries from earlier navigations on the same tab.
  const conversationReturnUrl = useMemo(() => {
    if (!otherPartyId) return null;
    return `/(dashboard)/messages/${encodeURIComponent(otherPartyId)}?kind=party`;
  }, [otherPartyId]);

  const openQuoteDetail = useCallback((qId) => {
    if (!qId) return;
    const params = { id: String(qId) };
    if (conversationReturnUrl) params.returnTo = conversationReturnUrl;
    if (userRole === "trades") {
      router.push({ pathname: "/quotes/[id]", params });
    } else {
      router.push({ pathname: "/(dashboard)/myquotes/[id]", params });
    }
  }, [router, userRole, conversationReturnUrl]);

  const openAppointmentDetail = useCallback((appt) => {
    if (appt?.quote_id) {
      openQuoteDetail(appt.quote_id);
      return;
    }
    const reqId = appt?.request_id;
    if (!reqId) return;
    const params = { id: String(reqId) };
    if (conversationReturnUrl) params.returnTo = conversationReturnUrl;
    if (userRole === "trades") {
      router.push({ pathname: "/quotes/request/[id]", params });
    } else {
      router.push({
        pathname: "/(dashboard)/client/myquotes/request/[id]",
        params,
      });
    }
  }, [router, userRole, openQuoteDetail, conversationReturnUrl]);

  const renderItem = ({ item }) => {
    const isMine = item.sender_id === user?.id;

    // Inline appointment cards — tap-to-navigate only. Accept /
    // Decline actions live on the project screen now; the thread is
    // messaging-only.
    if (item.message_type === 'appointment') {
      const appointmentId = item.appointment_id;
      const appointment = appointmentId ? appointmentsById[appointmentId] : null;
      if (!appointment) return null;
      return (
        <Pressable
          onPress={() => openAppointmentDetail(appointment)}
          style={({ pressed }) => [
            styles.inlineAppointmentWrap,
            pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="View appointment details"
        >
          <AppointmentCard
            appointment={appointment}
            userRole={userRole}
            /* onAccept / onDecline intentionally omitted —
               AppointmentCard handles the null case below. */
            busy={apptBusy}
          />
        </Pressable>
      );
    }

    // Regular text / image message.
    const imageStartIndex = messageImageStartIndex[item.id] ?? -1;
    return (
      <MessageBubble
        message={item}
        isMine={isMine}
        onImagePress={handleOpenImageViewer}
        imageStartIndex={imageStartIndex}
      />
    );
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
    // safe-area top padded via inset; themed bg through ThemedView.
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ThemedStatusBar />
      {/* Sticky top bar — chevron back (same shape/size as the
          Client Request page iconBtn), avatar + name inline. Themed
          via useTheme so dark mode looks right. The bar stays on
          top of the scrolling content so the user can always go
          back from any scroll position. */}
      <View
        style={[
          styles.topBar,
          { backgroundColor: c.background, borderBottomColor: c.border },
        ]}
      >
        <Pressable
          onPress={() => {
            if (returnToParam) {
              router.navigate(returnToParam);
            } else if (router.canGoBack()) {
              router.back();
            } else {
              router.navigate("/(dashboard)/messages");
            }
          }}
          hitSlop={10}
          style={({ pressed }) => [
            styles.topBarChevron,
            { backgroundColor: c.elevate, borderColor: c.border },
            pressed && { opacity: 0.6 },
          ]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={18} color={c.text} />
        </Pressable>

        <View style={styles.topBarCenter}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.topBarAvatar} />
          ) : (
            <View
              style={[
                styles.topBarAvatar,
                styles.topBarAvatarFallback,
                { backgroundColor: avatarBgColor },
              ]}
            >
              <ThemedText style={styles.topBarAvatarInitials}>
                {avatarInitials}
              </ThemedText>
            </View>
          )}
          <ThemedText
            style={[styles.topBarName, { color: c.text }]}
            numberOfLines={1}
          >
            {tradeName}
          </ThemedText>
        </View>

        {/* Right-side spacer — keeps the avatar+name block centred
            visually with the chevron on the left. */}
        <View style={{ width: 36 }} />
      </View>

      {/* Quote-history summary bar — shown in party mode whenever
          the pair has at least one shared quote. Tap opens the
          history sheet. Quotes are no longer rendered inline in
          the thread; this bar is the single affordance. */}
      {isPartyMode && (
        <QuoteHistoryBar
          c={c}
          count={visibleQuoteList.length}
          onPress={() => setQuoteHistoryOpen(true)}
          userRole={userRole}
        />
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.flex}>
          <FlatList
            data={threadData}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            /* QuoteHeader intentionally removed — in party mode
               quotes are rendered as inline tappable InlineQuoteCard
               items interleaved by timestamp (see threadData memo).
               Legacy request-scoped callers that used to rely on the
               hero card no longer pin it; consistency across modes. */
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

        {/* Input bar — themed, safe-area aware. Lifts above the iOS
            home-indicator gesture zone so the "swipe up to go home"
            and "swipe-from-edge to go back" don't collide with the
            text field / send button. bottom pad = insets.bottom + 10
            on physical devices, minimum 20 so the simulator still
            has visible padding.                                     */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: c.background,
              borderTopColor: c.border,
              paddingBottom: Math.max(insets.bottom + 10, 20),
            },
          ]}
        >
          <Pressable
            onPress={showImagePickerOptions}
            disabled={sending || selectedImages.length >= 5}
            style={({ pressed }) => [
              styles.attachBtn,
              {
                opacity: sending || selectedImages.length >= 5 ? 0.4 : pressed ? 0.7 : 1,
              },
            ]}
            hitSlop={6}
            accessibilityLabel="Attach image"
          >
            <Ionicons name="image-outline" size={22} color={c.textMid} />
          </Pressable>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: c.elevate,
                borderColor: c.border,
                color: c.text,
              },
            ]}
            placeholder="Type a message…"
            placeholderTextColor={c.textMuted}
            value={input}
            onChangeText={setInput}
            editable={!sending}
            multiline
          />

          <Pressable
            onPress={handleSend}
            disabled={sending || (!input.trim() && selectedImages.length === 0)}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor: Colors.primary,
                opacity:
                  sending || (!input.trim() && selectedImages.length === 0)
                    ? 0.4
                    : pressed
                    ? 0.85
                    : 1,
              },
            ]}
            accessibilityLabel="Send message"
          >
            {uploadingImages ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={17} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Full-screen image viewer with swipe navigation */}
      <ImageViewing
        images={allConversationImages.map(uri => ({ uri }))}
        imageIndex={imageViewerIndex}
        visible={imageViewerVisible}
        onRequestClose={() => setImageViewerVisible(false)}
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
      />

      {/* Quote history sheet — opened from the summary bar. */}
      <QuoteHistorySheet
        c={c}
        visible={quoteHistoryOpen}
        onClose={() => setQuoteHistoryOpen(false)}
        quotes={visibleQuoteList}
        onPick={(q) => {
          setQuoteHistoryOpen(false);
          openQuoteDetail(q.id);
        }}
        insets={insets}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    // Themed by ThemedView. No hardcoded bg — and no fake manual
    // safe-area: we consume insets.top on the container padding.
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarChevron: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  topBarAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E5E7EB",
  },
  topBarAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  topBarAvatarInitials: {
    fontFamily: FontFamily.headerBold,
    fontSize: 13,
    color: "#FFFFFF",
  },
  topBarName: {
    marginLeft: 10,
    fontFamily: FontFamily.headerSemibold,
    fontSize: 16,
    letterSpacing: -0.2,
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
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 4,
    backgroundColor: "transparent",
    borderRadius: 12,
    overflow: "hidden",
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

  // Message images - WhatsApp style
  messageImagesContainer: {
    width: 240,
    marginBottom: 4,
    borderRadius: 12,
    overflow: "hidden",
  },
  // Single image
  imageSingle: {
    width: 240,
    height: 280,
    borderRadius: 12,
  },
  // Two images - side by side
  imageRow: {
    flexDirection: "row",
    gap: 2,
  },
  imageHalf: {
    flex: 1,
  },
  imageHalfImg: {
    width: "100%",
    height: 160,
  },
  // Three images - one large + two stacked
  imageTwoThirds: {
    flex: 2,
  },
  imageTwoThirdsImg: {
    width: "100%",
    height: 200,
  },
  imageStackRight: {
    flex: 1,
    gap: 2,
    marginLeft: 2,
  },
  imageStackItem: {
    flex: 1,
  },
  imageStackItemImg: {
    width: "100%",
    height: 99, // (200 - 2 gap) / 2
  },
  // Four+ images - 2x2 grid
  imageGrid2x2: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },
  imageGridItem: {
    width: "49%", // ~half minus gap
    aspectRatio: 1,
    position: "relative",
  },
  imageGridItemImg: {
    width: "100%",
    height: "100%",
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageOverlayText: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
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
    paddingTop: 10,
    // paddingBottom set inline from insets for safe-area lift.
    borderTopWidth: StyleSheet.hairlineWidth,
    // backgroundColor + borderTopColor set inline from useTheme.
  },
  attachBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 140,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    fontFamily: FontFamily.bodyRegular,
    fontSize: 15,
    // bg / border / text colors set inline from useTheme.
  },
  sendBtn: {
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    // bg set inline to Colors.primary for consistency across themes.
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
