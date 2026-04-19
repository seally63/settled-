// components/trades/home/NewRequestsPanel.jsx
// "New requests" Panel on trade home — matches the design spec's
// RequestRow shape: 38px icon square + title + subtitle + chevron,
// with a primary-tinted "N NEW" pill in the section head.
//
// Icon priority (uses existing asset pack):
//   serviceTypeName → getServiceTypeIcon  (e.g. "Leak or drip")
//   categoryName    → getCategoryIcon     (fallback to category)
//   default         → something-else PNG

import React from "react";
import { View, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ThemedText from "../../ThemedText";
import { Panel } from "../../design";
import { useTheme } from "../../../hooks/useTheme";
import { Colors } from "../../../constants/Colors";
import { FontFamily, Radius, TypeVariants } from "../../../constants/Typography";
import {
  getServiceTypeIcon,
  getCategoryIcon,
  defaultServiceTypeIcon,
} from "../../../assets/icons";

function timeSince(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function pickIcon(req) {
  // Try service type first (more specific), then category, then default.
  const svc =
    req.serviceTypeName ||
    req.service_type_name ||
    req.service_name ||
    req.service ||
    null;
  if (svc) {
    const icon = getServiceTypeIcon(svc);
    if (icon) return icon;
  }
  const cat =
    req.category_name ||
    req.service_category_name ||
    req.category ||
    null;
  if (cat) {
    const icon = getCategoryIcon(cat);
    if (icon) return icon;
  }
  return defaultServiceTypeIcon;
}

function RequestRow({ request, onPress }) {
  const { colors: c, dark } = useTheme();

  const title =
    request.title ||
    request.serviceTypeName ||
    request.service_type_name ||
    request.suggested_title ||
    "Request";

  // Subtitle: location · posted ago · (budget or distance if present)
  const subParts = [];
  const loc = request.postcode || request.client_postcode || request.location;
  if (loc) subParts.push(loc);
  const ts = request.invited_at || request.created_at;
  if (ts) subParts.push(`posted ${timeSince(ts)}`);
  if (request.budget_band) {
    subParts.push(request.budget_band);
  } else if (
    request.outsideServiceArea &&
    request.distanceMiles != null
  ) {
    subParts.push(`${request.distanceMiles} mi away`);
  }
  const subtitle = subParts.join(" · ");

  const iconSource = pickIcon(request);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: c.elevate2 },
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: c.elevate2 }]}>
        <Image
          source={iconSource}
          style={[
            styles.iconImage,
            dark && { tintColor: c.text },
          ]}
          resizeMode="contain"
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.titleRow}>
          <ThemedText
            style={{
              fontSize: 14,
              fontFamily: FontFamily.bodyMedium,
              color: c.text,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {title}
          </ThemedText>
          {request.extendedMatch && (
            <View
              style={[
                styles.metaPill,
                { backgroundColor: Colors.primaryTint },
              ]}
            >
              <ThemedText
                style={{
                  fontSize: 9.5,
                  fontFamily: FontFamily.headerBold,
                  color: Colors.primary,
                  letterSpacing: 0.4,
                }}
              >
                MATCH
              </ThemedText>
            </View>
          )}
        </View>
        {!!subtitle && (
          <ThemedText
            style={{
              fontSize: 11.5,
              color: c.textMuted,
              marginTop: 2,
              fontFamily: FontFamily.bodyRegular,
            }}
            numberOfLines={1}
          >
            {subtitle}
          </ThemedText>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
    </Pressable>
  );
}

export default function NewRequestsPanel({
  requests = [],
  newCount = 0,
  onItemPress,
  onSeeAll,
}) {
  const { colors: c } = useTheme();
  const top = requests.slice(0, 3);

  const trailing = newCount > 0 ? (
    <View
      style={[
        styles.newCountPill,
        { backgroundColor: Colors.primaryTint },
      ]}
    >
      <ThemedText
        style={{
          fontSize: 11,
          fontFamily: FontFamily.headerBold,
          color: Colors.primary,
          letterSpacing: 0.4,
        }}
      >
        {newCount} NEW
      </ThemedText>
    </View>
  ) : null;

  if (top.length === 0) {
    return (
      <Panel title="New requests" chevron trailing={trailing} onPress={onSeeAll}>
        <View style={{ padding: 14 }}>
          <ThemedText style={{ ...TypeVariants.bodySm, color: c.textMid }}>
            No new requests right now. We'll ping you when a client wants a quote.
          </ThemedText>
        </View>
      </Panel>
    );
  }

  return (
    <Panel title="New requests" chevron trailing={trailing} onPress={onSeeAll}>
      {top.map((req, idx) => {
        const key = req.request_id || req.id || `row-${idx}`;
        return (
          <React.Fragment key={key}>
            {idx > 0 ? (
              <View style={[styles.divider, { backgroundColor: c.divider }]} />
            ) : null}
            <RequestRow request={req} onPress={() => onItemPress?.(req)} />
          </React.Fragment>
        );
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm + 2,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconImage: {
    width: 20,
    height: 20,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  divider: {
    height: 1,
    marginLeft: 14,
  },
  newCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
});
