// app/(auth)/role-select.jsx
import { StyleSheet, View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import ThemedView from '../../components/ThemedView'
import ThemedText from '../../components/ThemedText'
import Spacer from '../../components/Spacer'
import { Colors } from '../../constants/Colors'

const TINT = Colors.primary

export default function RoleSelectScreen() {
  const router = useRouter()

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        {/* Logo placeholder */}
        <View style={styles.logoContainer}>
          <ThemedText style={styles.logoText}>SETTLED</ThemedText>
        </View>

        <Spacer height={40} />

        <ThemedText style={styles.title}>Join Settled</ThemedText>
        <ThemedText style={styles.subtitle}>
          Choose how you'd like to get started
        </ThemedText>

        <Spacer height={40} />

        {/* Homeowner Card */}
        <Pressable
          style={({ pressed }) => [
            styles.roleCard,
            pressed && styles.roleCardPressed,
          ]}
          onPress={() => router.push({ pathname: '/register', params: { role: 'client' } })}
        >
          <View style={styles.cardContent}>
            <View style={styles.iconCircle}>
              <Ionicons name="home-outline" size={28} color={Colors.light.subtitle} />
            </View>
            <View style={styles.cardTextContent}>
              <ThemedText style={styles.roleTitle}>I'm a Homeowner</ThemedText>
              <Spacer height={4} />
              <ThemedText style={styles.roleDescription}>
                Find trusted trades for your home improvement projects
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.light.subtitle} />
          </View>
        </Pressable>

        <Spacer height={16} />

        {/* Tradesperson Card */}
        <Pressable
          style={({ pressed }) => [
            styles.roleCard,
            pressed && styles.roleCardPressed,
          ]}
          onPress={() => router.push({ pathname: '/register', params: { role: 'trades' } })}
        >
          <View style={styles.cardContent}>
            <View style={styles.iconCircle}>
              <Ionicons name="hammer-outline" size={28} color={Colors.light.subtitle} />
            </View>
            <View style={styles.cardTextContent}>
              <ThemedText style={styles.roleTitle}>I'm a Tradesperson</ThemedText>
              <Spacer height={4} />
              <ThemedText style={styles.roleDescription}>
                Grow your business and connect with local customers
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.light.subtitle} />
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
    alignItems: 'center',
  },
  logoContainer: {
    width: 120,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.light.title,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    color: Colors.light.title,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: Colors.light.subtitle,
    marginTop: 8,
  },
  roleCard: {
    width: '100%',
    backgroundColor: Colors.light.uiBackground,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.light.border,
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
    backgroundColor: Colors.light.secondaryBackground,
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
    color: Colors.light.title,
  },
  roleDescription: {
    fontSize: 14,
    color: Colors.light.subtitle,
    lineHeight: 20,
  },
  loginLink: {
    fontSize: 14,
    textAlign: 'center',
    color: Colors.light.subtitle,
  },
  loginLinkBold: {
    fontWeight: '600',
    color: TINT,
  },
})
