// app/(auth)/role-select.jsx
// First screen of the sign-up flow. Two primary cards — "I'm a
// Homeowner" / "I'm a Tradesperson" — each routes to /register with
// the chosen role. Theme-aware: colours come from useTheme() so
// both cards, icon circles, and chevrons flip correctly in dark
// mode (previously every bg + text was pinned to Colors.light.*).
import { StyleSheet, View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import ThemedView from '../../components/ThemedView'
import ThemedText from '../../components/ThemedText'
import Spacer from '../../components/Spacer'
import { Colors } from '../../constants/Colors'
import { useTheme } from '../../hooks/useTheme'

const TINT = Colors.primary

export default function RoleSelectScreen() {
  const router = useRouter()
  const { colors: c } = useTheme()

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        {/* Logo placeholder */}
        <View
          style={[
            styles.logoContainer,
            { borderColor: c.border },
          ]}
        >
          <ThemedText style={[styles.logoText, { color: c.text }]}>
            SETTLED
          </ThemedText>
        </View>

        <Spacer height={40} />

        <ThemedText style={[styles.title, { color: c.text }]}>Join Settled</ThemedText>
        <ThemedText style={[styles.subtitle, { color: c.textMuted }]}>
          Choose how you'd like to get started
        </ThemedText>

        <Spacer height={40} />

        {/* Homeowner Card */}
        <Pressable
          style={({ pressed }) => [
            styles.roleCard,
            { backgroundColor: c.elevate, borderColor: c.border },
            pressed && styles.roleCardPressed,
          ]}
          onPress={() => router.push({ pathname: '/register', params: { role: 'client' } })}
        >
          <View style={styles.cardContent}>
            <View style={[styles.iconCircle, { backgroundColor: c.elevate2 }]}>
              <Ionicons name="home-outline" size={28} color={c.textMuted} />
            </View>
            <View style={styles.cardTextContent}>
              <ThemedText style={[styles.roleTitle, { color: c.text }]}>
                I'm a Homeowner
              </ThemedText>
              <Spacer height={4} />
              <ThemedText style={[styles.roleDescription, { color: c.textMuted }]}>
                Find trusted trades for your home improvement projects
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
          </View>
        </Pressable>

        <Spacer height={16} />

        {/* Tradesperson Card */}
        <Pressable
          style={({ pressed }) => [
            styles.roleCard,
            { backgroundColor: c.elevate, borderColor: c.border },
            pressed && styles.roleCardPressed,
          ]}
          onPress={() => router.push({ pathname: '/register', params: { role: 'trades' } })}
        >
          <View style={styles.cardContent}>
            <View style={[styles.iconCircle, { backgroundColor: c.elevate2 }]}>
              <Ionicons name="hammer-outline" size={28} color={c.textMuted} />
            </View>
            <View style={styles.cardTextContent}>
              <ThemedText style={[styles.roleTitle, { color: c.text }]}>
                I'm a Tradesperson
              </ThemedText>
              <Spacer height={4} />
              <ThemedText style={[styles.roleDescription, { color: c.textMuted }]}>
                Grow your business and connect with local customers
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
          </View>
        </Pressable>

        <Spacer height={40} />

        <Pressable onPress={() => router.push('/login')}>
          <ThemedText style={[styles.loginLink, { color: c.textMuted }]}>
            Already have an account?{' '}
            <ThemedText style={styles.loginLinkBold}>Log in</ThemedText>
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  logoContainer: {
    width: 120,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
  },
  roleCard: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  roleCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextContent: {
    flex: 1,
    marginLeft: 16,
    marginRight: 8,
  },
  roleTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  roleDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  loginLink: {
    fontSize: 14,
    textAlign: 'center',
  },
  loginLinkBold: {
    fontWeight: '600',
    color: TINT,
  },
})
