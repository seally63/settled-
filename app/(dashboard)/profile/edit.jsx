// app/(dashboard)/profile/edit.jsx
import {
  StyleSheet,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useEffect, useState, useCallback } from "react";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useUser } from "../../../hooks/useUser";
import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import ThemedTextInput from "../../../components/ThemedTextInput";
import ThemedButton from "../../../components/ThemedButton";
import Spacer from "../../../components/Spacer";
import { KeyboardDoneButton, KEYBOARD_DONE_ID } from "../../../components/KeyboardDoneButton";
import { Colors } from "../../../constants/Colors";

import {
  getMyProfile,
  updateMyProfile,
  setBaseAddressOnce,
  updateServiceRadius,
} from "../../../lib/api/profile";
import { geocodeUkPostcode } from "../../../lib/api/search";
import { supabase } from "../../../lib/supabase";

export default function EditProfileScreen() {
  const { user } = useUser();
  const router = useRouter();
  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!user?.id) {
          if (alive) {
            setRole("guest");
            setRoleLoading(false);
          }
          router.replace("/profile");
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (alive) {
          // default to client if error/unknown
          setRole(error ? "client" : (data?.role || "client"));
          setRoleLoading(false);
        }
      } catch {
        if (alive) {
          setRole("client");
          setRoleLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.id, router]);

  if (roleLoading) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return <ProfileEditBody role={role} />;
}

// ===== Body (behind Edit Profile) =====
function ProfileEditBody({ role }) {
  const { authChecked } = useUser();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [savingPrivate, setSavingPrivate] = useState(false);
  const [savingPublic, setSavingPublic] = useState(false);

  const [savingBase, setSavingBase] = useState(false);
  const [savingRadius, setSavingRadius] = useState(false);

  const isTrades = role === "trades";

  // CLIENT private fields
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // TRADES public fields (no service_areas here — proximity replaces it)
  const [businessName, setBusinessName] = useState("");
  const [tradeTitle, setTradeTitle] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  // TRADES proximity fields
  const [baseAddr1, setBaseAddr1] = useState("");
  const [baseCity, setBaseCity] = useState("");
  const [basePostcode, setBasePostcode] = useState("");
  const [baseLocked, setBaseLocked] = useState(false);
  const [serviceRadiusKm, setServiceRadiusKm] = useState(25);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const p = await getMyProfile();
      if (p) {
        // client/private
        setEmail(p.email ?? "");
        setFullName(p.full_name ?? "");
        setPhoneNumber(p.phone ?? "");

        // trades/public
        setBusinessName(p.business_name ?? "");
        setTradeTitle(p.trade_title ?? "");
        setBio(p.bio ?? "");
        setPhotoUrl(p.photo_url ?? "");

        // trades/proximity (lock if already set)
        const hasBase = !!p.base_postcode || p.base_lat != null || p.base_lon != null;
        setBaseLocked(!!hasBase);
        setBasePostcode(p.base_postcode ?? "");
        setBaseAddr1(p.base_addr1 ?? "");
        setBaseCity(p.town_city ?? "");
        if (p.service_radius_km != null) setServiceRadiusKm(Number(p.service_radius_km));
      }
    } catch (e) {
      console.log("profile.load error:", e?.message || e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked) load();
  }, [authChecked, load]);

  // ===== CLIENT save =====
  async function onSavePrivate() {
    try {
      setSavingPrivate(true);
      await updateMyProfile({
        full_name: fullName?.trim() || null,
        phone: phoneNumber?.trim() || null,
      });
      Alert.alert("Saved", "Your account details were updated.");
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to save account details");
    } finally {
      setSavingPrivate(false);
    }
  }

  // ===== TRADES save (public info) =====
  async function onSavePublic() {
    try {
      setSavingPublic(true);
      await updateMyProfile({
        business_name: businessName?.trim() || null,
        trade_title: tradeTitle?.trim() || null,
        bio: bio?.trim() || null,
        photo_url: photoUrl?.trim() || null,
      });
      Alert.alert("Saved", "Your public info was updated.");
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to save public info");
    } finally {
      setSavingPublic(false);
    }
  }

  // ===== TRADES set base address (one-time) =====
  async function onSetBaseAddress() {
    try {
      if (!basePostcode.trim()) {
        Alert.alert("Missing postcode", "Please enter your postcode.");
        return;
      }
      setSavingBase(true);

      // Geocode the postcode - this also returns the city/town name
      const { lat, lon, city: geocodedCity } = await geocodeUkPostcode(basePostcode.trim());

      // Use user-entered city if provided, otherwise use geocoded city
      const finalCity = baseCity.trim() || geocodedCity || "";

      await setBaseAddressOnce({
        addr1: baseAddr1.trim(),
        city: finalCity,
        postcode: basePostcode.trim(),
        lat,
        lon,
      });

      // Update local state with the city name
      if (!baseCity.trim() && finalCity) {
        setBaseCity(finalCity);
      }

      setBaseLocked(true);
      Alert.alert("Saved", "Base address set. You can't change it later here.");
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to set base address");
    } finally {
      setSavingBase(false);
    }
  }

  // ===== TRADES change service radius =====
  async function onPickRadius(km) {
    if (savingRadius) return;
    try {
      setSavingRadius(true);
      await updateServiceRadius(Number(km));
      setServiceRadiusKm(Number(km));
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to update service radius");
    } finally {
      setSavingRadius(false);
    }
  }

  const RadiusPill = ({ value }) => {
    const selected = Number(serviceRadiusKm) === Number(value);
    return (
      <Pressable
        onPress={() => onPickRadius(value)}
        disabled={savingRadius}
        style={[
          styles.pill,
          selected && { backgroundColor: Colors.primary, borderColor: Colors.primary },
        ]}
      >
        <ThemedText style={[styles.pillText, selected && { color: "#fff", fontWeight: "800" }]}>
          {value} km
        </ThemedText>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <StatusBar style="light" backgroundColor={Colors.primary} />
      <View style={[styles.headerWrap, { paddingTop: insets.top, backgroundColor: Colors.primary }]}>
        <View style={styles.headerInner}>
          <ThemedText style={styles.headerTitle}>Edit profile</ThemedText>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.select({ ios: 10, android: 0 })}
      >
        <ScrollView contentContainerStyle={styles.container}>
          {/* ===== CLIENTS ONLY: Account info (private) ===== */}
          {role !== "trades" && (
            <>
              <ThemedText title style={styles.sectionTitle}>
                Account info (private)
              </ThemedText>
              <ThemedText style={styles.label}>Email</ThemedText>
              <ThemedTextInput value={email} editable={false} style={styles.input} />
              <ThemedText style={styles.label}>Full name</ThemedText>
              <ThemedTextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your name"
                style={styles.input}
              />
              <ThemedText style={styles.label}>Phone number</ThemedText>
              <ThemedTextInput
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="Your phone"
                keyboardType="phone-pad"
                style={styles.input}
              />
              <Spacer height={10} />
              <ThemedButton onPress={onSavePrivate} disabled={savingPrivate}>
                <ThemedText style={styles.buttonText}>
                  {savingPrivate ? "Saving…" : "Save account info"}
                </ThemedText>
              </ThemedButton>
            </>
          )}

          {/* ===== TRADES ONLY: Public info + Proximity ===== */}
          {role === "trades" && (
            <>
              <ThemedText title style={[styles.sectionTitle, { marginTop: 0 }]}>
                Public info (for discovery)
              </ThemedText>

              <ThemedText style={styles.label}>Business name</ThemedText>
              <ThemedTextInput
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="e.g. Ling Bathrooms & Plumbing"
                style={styles.input}
              />

              <ThemedText style={styles.label}>Trade title</ThemedText>
              <ThemedTextInput
                value={tradeTitle}
                onChangeText={setTradeTitle}
                placeholder="e.g. Bathroom fitter & plumber"
                style={styles.input}
              />

              <ThemedText style={styles.label}>Bio</ThemedText>
              <ThemedTextInput
                value={bio}
                onChangeText={setBio}
                placeholder="Short intro about your business"
                multiline
                style={styles.input}
                inputAccessoryViewID={Platform.OS === "ios" ? KEYBOARD_DONE_ID : undefined}
              />

              <ThemedText style={styles.label}>Photo URL</ThemedText>
              <ThemedTextInput
                value={photoUrl}
                onChangeText={setPhotoUrl}
                placeholder="https://…"
                style={styles.input}
              />
              {photoUrl?.trim()?.length > 5 && (
                <View style={{ alignItems: "center", marginTop: 10 }}>
                  <Image
                    source={{ uri: photoUrl }}
                    style={{ width: 120, height: 120, borderRadius: 8 }}
                    resizeMode="cover"
                  />
                </View>
              )}

              <Spacer height={10} />
              <ThemedButton onPress={onSavePublic} disabled={savingPublic}>
                <ThemedText style={styles.buttonText}>
                  {savingPublic ? "Saving…" : "Save public info"}
                </ThemedText>
              </ThemedButton>

              <Spacer height={28} />

              {/* ===== Base address (one-time) ===== */}
              <ThemedText title style={styles.sectionTitle}>Base address (one-time)</ThemedText>
              <ThemedText style={{ marginBottom: 10 }}>
                Set your business base. This powers proximity search. It’s locked after saving.
              </ThemedText>

              <ThemedText style={styles.label}>Address line 1</ThemedText>
              <ThemedTextInput
                value={baseAddr1}
                onChangeText={setBaseAddr1}
                placeholder="e.g. 10 High Street"
                style={styles.input}
                editable={!baseLocked}
              />

              <ThemedText style={styles.label}>Town / City</ThemedText>
              <ThemedTextInput
                value={baseCity}
                onChangeText={setBaseCity}
                placeholder="e.g. Hackney"
                style={styles.input}
                editable={!baseLocked}
              />

              <ThemedText style={styles.label}>Postcode</ThemedText>
              <ThemedTextInput
                value={basePostcode}
                onChangeText={setBasePostcode}
                placeholder="e.g. E8 1EA"
                autoCapitalize="characters"
                style={styles.input}
                editable={!baseLocked}
              />

              {!baseLocked ? (
                <>
                  <Spacer height={8} />
                  <ThemedButton onPress={onSetBaseAddress} disabled={savingBase}>
                    <ThemedText style={styles.buttonText}>
                      {savingBase ? "Saving…" : "Set base address"}
                    </ThemedText>
                  </ThemedButton>
                </>
              ) : (
                <ThemedText style={{ marginTop: 6 }}>
                  Base address locked. Contact support to change it.
                </ThemedText>
              )}

              <Spacer height={24} />

              {/* ===== Service radius ===== */}
              <ThemedText title style={styles.sectionTitle}>Service radius</ThemedText>
              <ThemedText style={{ marginBottom: 10 }}>
                How far you’ll travel from your base.
              </ThemedText>

              <View style={styles.pillRow}>
                {[5, 10, 15, 25, 35, 50].map((v) => (
                  <RadiusPill key={v} value={v} />
                ))}
              </View>

              {savingRadius && (
                <ThemedText style={{ marginTop: 6 }}>
                  Updating radius…
                </ThemedText>
              )}
            </>
          )}

          <Spacer height={28} />
        </ScrollView>
      </KeyboardAvoidingView>
      <KeyboardDoneButton />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  headerWrap: {},
  headerInner: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },

  container: { padding: 20 },
  sectionTitle: { fontWeight: "700", fontSize: 14, marginBottom: 8 },

  input: { marginBottom: 6 },
  label: { marginBottom: 6, fontWeight: "600" },
  buttonText: { color: "#fff", textAlign: "center", fontWeight: "700" },

  // Radius pills
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
    backgroundColor: "#fff",
  },
  pillText: { fontWeight: "700" },
});





