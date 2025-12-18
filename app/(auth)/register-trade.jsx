// app/(auth)/register-trade.jsx
import {
  StyleSheet,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'

import { useUser } from '../../hooks/useUser'
import ThemedView from '../../components/ThemedView'
import ThemedText from '../../components/ThemedText'
import ThemedTextInput from '../../components/ThemedTextInput'
import ThemedButton from '../../components/ThemedButton'
import Spacer from '../../components/Spacer'
import { Colors } from '../../constants/Colors'

const TINT = Colors?.light?.tint || "#6366F1"

export default function RegisterTradeScreen() {
  const router = useRouter()
  const { register } = useUser()

  const [fullName, setFullName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [tradeType, setTradeType] = useState('')
  const [postcode, setPostcode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError(null)

    // Validation
    if (!fullName.trim()) {
      setError('Please enter your full name')
      return
    }

    if (!businessName.trim()) {
      setError('Please enter your business name')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address')
      return
    }

    if (!phone.trim()) {
      setError('Please enter your phone number')
      return
    }

    if (!tradeType.trim()) {
      setError('Please enter your trade type (e.g., Plumber, Electrician)')
      return
    }

    if (!postcode.trim()) {
      setError('Please enter your business postcode')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      await register(email, password, {
        role: 'trades',
        full_name: fullName.trim(),
        business_name: businessName.trim(),
        phone: phone.trim(),
        trade_type: tradeType.trim(),
        postcode: postcode.trim().toUpperCase(),
      })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#0F172A" />
            </Pressable>
          </View>

          <Spacer height={20} />

          <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="hammer" size={28} color="#D97706" />
          </View>

          <Spacer height={16} />

          <ThemedText style={styles.title}>Create Trade Account</ThemedText>
          <ThemedText style={styles.subtitle}>
            Join our network and grow your business
          </ThemedText>

          <Spacer height={32} />

          {/* Form */}
          <View style={styles.form}>
            <ThemedText style={styles.label}>Full Name</ThemedText>
            <ThemedTextInput
              style={styles.input}
              placeholder="John Smith"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              editable={!loading}
            />

            <Spacer height={16} />

            <ThemedText style={styles.label}>Business Name</ThemedText>
            <ThemedTextInput
              style={styles.input}
              placeholder="ABC Plumbing Ltd"
              value={businessName}
              onChangeText={setBusinessName}
              autoCapitalize="words"
              editable={!loading}
            />

            <Spacer height={16} />

            <ThemedText style={styles.label}>Trade Type</ThemedText>
            <ThemedTextInput
              style={styles.input}
              placeholder="e.g., Plumber, Electrician, Builder"
              value={tradeType}
              onChangeText={setTradeType}
              autoCapitalize="words"
              editable={!loading}
            />

            <Spacer height={16} />

            <ThemedText style={styles.label}>Email Address</ThemedText>
            <ThemedTextInput
              style={styles.input}
              placeholder="john@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />

            <Spacer height={16} />

            <ThemedText style={styles.label}>Phone Number</ThemedText>
            <ThemedTextInput
              style={styles.input}
              placeholder="07123 456789"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              editable={!loading}
            />

            <Spacer height={16} />

            <ThemedText style={styles.label}>Business Postcode</ThemedText>
            <ThemedTextInput
              style={styles.input}
              placeholder="SW1A 1AA"
              value={postcode}
              onChangeText={setPostcode}
              autoCapitalize="characters"
              editable={!loading}
            />

            <Spacer height={16} />

            <ThemedText style={styles.label}>Password</ThemedText>
            <ThemedTextInput
              style={styles.input}
              placeholder="At least 6 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />

            <Spacer height={16} />

            <ThemedText style={styles.label}>Confirm Password</ThemedText>
            <ThemedTextInput
              style={styles.input}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!loading}
            />

            <Spacer height={24} />

            {error && (
              <>
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color={Colors.warning} />
                  <ThemedText style={styles.errorText}>{error}</ThemedText>
                </View>
                <Spacer height={16} />
              </>
            )}

            <ThemedButton
              onPress={handleSubmit}
              disabled={loading}
              style={styles.submitButton}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <ThemedText style={styles.submitButtonText}>Create Account</ThemedText>
              )}
            </ThemedButton>

            <Spacer height={20} />

            <Pressable onPress={() => router.push('/login')}>
              <ThemedText style={styles.loginLink}>
                Already have an account?{' '}
                <ThemedText style={styles.loginLinkBold}>Log in</ThemedText>
              </ThemedText>
            </Pressable>
          </View>

          <Spacer height={20} />
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    color: '#64748B',
    marginTop: 8,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    width: '100%',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderColor: Colors.warning,
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: Colors.warning,
  },
  submitButton: {
    width: '100%',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
