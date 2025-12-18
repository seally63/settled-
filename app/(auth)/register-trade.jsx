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
import Spacer from '../../components/Spacer'
import { Colors } from '../../constants/Colors'

const TINT = Colors?.primary || "#6849a7"

export default function RegisterTradeScreen() {
  const router = useRouter()
  const { register } = useUser()

  const [currentStep, setCurrentStep] = useState(1)
  const totalSteps = 4

  // Form state
  const [fullName, setFullName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [tradeType, setTradeType] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [postcode, setPostcode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const validateStep = (step) => {
    setError(null)

    switch (step) {
      case 1:
        if (!fullName.trim()) {
          setError('Please enter your name')
          return false
        }
        const nameParts = fullName.trim().split(' ')
        if (nameParts.length < 2) {
          setError('Please enter both first and last name')
          return false
        }
        return true

      case 2:
        if (!businessName.trim()) {
          setError('Please enter your business name')
          return false
        }
        if (!tradeType.trim()) {
          setError('Please enter your trade type')
          return false
        }
        return true

      case 3:
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
          setError('Please enter a valid email address')
          return false
        }
        if (!phone.trim()) {
          setError('Please enter your phone number')
          return false
        }
        if (!postcode.trim()) {
          setError('Please enter your postcode')
          return false
        }
        return true

      case 4:
        if (password.length < 6) {
          setError('Password must be at least 6 characters')
          return false
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match')
          return false
        }
        return true

      default:
        return true
    }
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < totalSteps) {
        setCurrentStep(currentStep + 1)
      } else {
        handleSubmit()
      }
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setError(null)
      setCurrentStep(currentStep - 1)
    } else {
      router.back()
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

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

  const renderStepIndicator = () => (
    <View style={styles.stepIndicatorContainer}>
      {[...Array(totalSteps)].map((_, index) => (
        <View key={index} style={styles.stepIndicatorWrapper}>
          <View
            style={[
              styles.stepIndicator,
              index + 1 <= currentStep && styles.stepIndicatorActive,
            ]}
          />
        </View>
      ))}
    </View>
  )

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <ThemedText style={styles.stepTitle}>Hi! What's your name?</ThemedText>
            <Spacer height={32} />
            <ThemedText style={styles.label}>First name</ThemedText>
            <ThemedTextInput
              style={styles.input}
              placeholder="John"
              value={fullName.split(' ')[0] || fullName}
              onChangeText={(text) => {
                const lastName = fullName.split(' ').slice(1).join(' ')
                setFullName(lastName ? `${text} ${lastName}` : text)
              }}
              autoCapitalize="words"
              editable={!loading}
              autoFocus
            />
            <Spacer height={16} />
            <ThemedText style={styles.label}>Last name</ThemedText>
            <ThemedTextInput
              style={styles.input}
              placeholder="Smith"
              value={fullName.split(' ').slice(1).join(' ')}
              onChangeText={(text) => {
                const firstName = fullName.split(' ')[0] || ''
                setFullName(`${firstName} ${text}`.trim())
              }}
              autoCapitalize="words"
              editable={!loading}
            />
          </View>
        )

      case 2:
        return (
          <View style={styles.stepContent}>
            <ThemedText style={styles.stepTitle}>Tell us about your business</ThemedText>
            <Spacer height={32} />
            <ThemedText style={styles.label}>Business Name</ThemedText>
            <ThemedTextInput
              style={styles.input}
              placeholder="ABC Plumbing Ltd"
              value={businessName}
              onChangeText={setBusinessName}
              autoCapitalize="words"
              editable={!loading}
              autoFocus
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
          </View>
        )

      case 3:
        return (
          <View style={styles.stepContent}>
            <ThemedText style={styles.stepTitle}>How can clients reach you?</ThemedText>
            <Spacer height={32} />
            <ThemedText style={styles.label}>Email Address</ThemedText>
            <ThemedTextInput
              style={styles.input}
              placeholder="john@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
              autoFocus
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
          </View>
        )

      case 4:
        return (
          <View style={styles.stepContent}>
            <ThemedText style={styles.stepTitle}>Last step! Create a password</ThemedText>
            <Spacer height={32} />
            <ThemedText style={styles.label}>Password</ThemedText>
            <ThemedTextInput
              style={styles.input}
              placeholder="At least 6 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
              autoFocus
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
          </View>
        )

      default:
        return null
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ThemedView style={styles.container}>
        {/* Header with back button */}
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            hitSlop={10}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.light.title} />
          </Pressable>
        </View>

        {/* Progress Indicator */}
        {renderStepIndicator()}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Step Content */}
          {renderStep()}

          <Spacer height={24} />

          {/* Error Message */}
          {error && (
            <>
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={Colors.warning} />
                <ThemedText style={styles.errorText}>{error}</ThemedText>
              </View>
              <Spacer height={16} />
            </>
          )}

          <Spacer height={40} />
        </ScrollView>

        {/* Bottom Section - Continue Button */}
        <View style={styles.bottomSection}>
          <Pressable
            onPress={handleNext}
            disabled={loading}
            style={({ pressed }) => [
              styles.continueButton,
              pressed && styles.continueButtonPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.continueButtonText}>
                {currentStep === totalSteps ? 'Create Account' : 'Continue'}
              </ThemedText>
            )}
          </Pressable>

          {/* Sign in link - only show on first step */}
          {currentStep === 1 && (
            <>
              <Spacer height={16} />
              <Pressable onPress={() => router.push('/login')}>
                <ThemedText style={styles.signInLink}>
                  Already have an account?{' '}
                  <ThemedText style={styles.signInLinkBold}>Sign in</ThemedText>
                </ThemedText>
              </Pressable>
            </>
          )}
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  stepIndicatorContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 32,
  },
  stepIndicatorWrapper: {
    flex: 1,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  stepIndicator: {
    height: '100%',
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
  },
  stepIndicatorActive: {
    backgroundColor: TINT,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  stepContent: {
    width: '100%',
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.title,
    lineHeight: 32,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
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
  bottomSection: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  continueButton: {
    backgroundColor: TINT,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: TINT,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 4,
  },
  continueButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  signInLink: {
    fontSize: 14,
    textAlign: 'center',
    color: Colors.light.subtitle,
  },
  signInLinkBold: {
    fontWeight: '600',
    color: TINT,
  },
})
