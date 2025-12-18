// app/(auth)/role-select.jsx
import { StyleSheet, View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import ThemedView from '../../components/ThemedView'
import ThemedText from '../../components/ThemedText'
import Spacer from '../../components/Spacer'
import { Colors } from '../../constants/Colors'

const TINT = Colors?.light?.tint || "#6366F1"

export default function RoleSelectScreen() {
  const router = useRouter()

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText style={styles.title}>Join Settled</ThemedText>
        <ThemedText style={styles.subtitle}>
          Choose how you'd like to get started
        </ThemedText>

        <Spacer height={40} />

        {/* Client Card */}
        <Pressable
          style={({ pressed }) => [
            styles.roleCard,
            pressed && styles.roleCardPressed,
          ]}
          onPress={() => router.push('/register-client')}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#EEF2FF' }]}>
            <Ionicons name="home" size={32} color={TINT} />
          </View>
          <Spacer height={16} />
          <ThemedText style={styles.roleTitle}>I'm a Homeowner</ThemedText>
          <Spacer height={8} />
          <ThemedText style={styles.roleDescription}>
            Find trusted trades for your home improvement projects
          </ThemedText>
          <Spacer height={16} />
          <View style={styles.arrow}>
            <Ionicons name="arrow-forward" size={20} color={TINT} />
          </View>
        </Pressable>

        <Spacer height={20} />

        {/* Trade Card */}
        <Pressable
          style={({ pressed }) => [
            styles.roleCard,
            pressed && styles.roleCardPressed,
          ]}
          onPress={() => router.push('/register-trade')}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="hammer" size={32} color="#D97706" />
          </View>
          <Spacer height={16} />
          <ThemedText style={styles.roleTitle}>I'm a Tradesperson</ThemedText>
          <Spacer height={8} />
          <ThemedText style={styles.roleDescription}>
            Grow your business and connect with local customers
          </ThemedText>
          <Spacer height={16} />
          <View style={styles.arrow}>
            <Ionicons name="arrow-forward" size={20} color="#D97706" />
          </View>
        </Pressable>

        <Spacer height={40} />

        <Pressable onPress={() => router.push('/login')}>
          <ThemedText style={styles.loginLink}>
            Already have an account? <ThemedText style={styles.loginLinkBold}>Log in</ThemedText>
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
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#64748B',
    marginTop: 8,
  },
  roleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  roleCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: '#0F172A',
  },
  roleDescription: {
    fontSize: 14,
    textAlign: 'center',
    color: '#64748B',
    lineHeight: 20,
  },
  arrow: {
    alignSelf: 'flex-end',
  },
  loginLink: {
    fontSize: 14,
    textAlign: 'center',
    color: '#64748B',
  },
  loginLinkBold: {
    fontWeight: '600',
    color: TINT,
  },
})
