// app/(auth)/role-select.jsx
// First screen of the sign-up flow.
//
// Settled is now trade-only on the mobile app — the homeowner side has
// moved off to the web directory project. This screen used to offer a
// "I'm a Homeowner" / "I'm a Tradesperson" choice; the homeowner card
// has been removed and the screen now reads as a single confirm step
// before the trade sign-up form. The route is kept (instead of routing
// straight to /register) so the user lands on a screen that frames
// what Settled is for trades, rather than a bare form.
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
          The invite-only network for vetted tradespeople
        </ThemedText>

        <Spacer height={40} />

        {/* Tradesperson Card — only sign-up path on mobile.
            Homeowners go through the web directory; the homeowner
            card that used to live here has been removed. */}
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
                Grow your business and connect with verified clients
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
