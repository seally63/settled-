// app/(auth)/register.jsx
import {
  StyleSheet,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  FlatList,
  Alert,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useState, useEffect, useRef, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'

import { useUser } from '../../hooks/useUser'
import ThemedView from '../../components/ThemedView'
import ThemedText from '../../components/ThemedText'
import ThemedTextInput from '../../components/ThemedTextInput'
import OTPInput from '../../components/OTPInput'
import Spacer from '../../components/Spacer'
import { Colors } from '../../constants/Colors'
import { geocodeUKPostcode } from '../../lib/api/places'

const TINT = Colors.primary

// Screen indices for the flow
const SCREENS = {
  NAME: 0,
  ENTER_EMAIL: 1,
  VERIFY_EMAIL: 2,
  ENTER_PHONE: 3,
  VERIFY_PHONE: 4,
  BUSINESS_DETAILS: 5, // Trades only
  PASSWORD: 6,
  WELCOME: 7,
}

// Progress bar mapping (which step each screen belongs to)
// For trades: 6 steps (Name, Email, Phone, Business, Password, Welcome)
// For clients: 5 steps (Name, Email, Phone, Password, Welcome)
const getProgressMap = (isTrade) => ({
  [SCREENS.NAME]: 1,
  [SCREENS.ENTER_EMAIL]: 2,
  [SCREENS.VERIFY_EMAIL]: 2,
  [SCREENS.ENTER_PHONE]: 3,
  [SCREENS.VERIFY_PHONE]: 3,
  [SCREENS.BUSINESS_DETAILS]: 4,
  [SCREENS.PASSWORD]: isTrade ? 5 : 4,
  [SCREENS.WELCOME]: isTrade ? 6 : 5,
})

// Trade job titles options
const JOB_TITLE_OPTIONS = [
  "Plumber",
  "Electrician",
  "Heating Engineer",
  "Roofer",
  "Painter & Decorator",
  "Carpenter",
  "Tiler",
  "Landscaper",
  "General Builder",
  "Locksmith",
  "Window Fitter",
  "Flooring Specialist",
  "Plasterer",
  "Bricklayer",
  "HVAC Technician",
  "Fencer",
  "Driveway Specialist",
  "Cleaner",
  "Handyman",
]

// Travel distance options
const TRAVEL_DISTANCE_OPTIONS = [
  { value: 5, label: "5 miles" },
  { value: 10, label: "10 miles" },
  { value: 15, label: "15 miles" },
  { value: 20, label: "20 miles" },
  { value: 25, label: "25 miles" },
  { value: 50, label: "50 miles" },
]

export default function RegisterScreen() {
  const router = useRouter()
  const { role } = useLocalSearchParams()
  const { register } = useUser()

  // Redirect if no role specified
  useEffect(() => {
    if (!role) {
      router.replace('/role-select')
    }
  }, [role])

  const [currentScreen, setCurrentScreen] = useState(SCREENS.NAME)

  // Form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [emailOtp, setEmailOtp] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneOtp, setPhoneOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Business details state (trades only)
  const [businessName, setBusinessName] = useState('')
  const [selectedJobTitles, setSelectedJobTitles] = useState([])
  const [basePostcode, setBasePostcode] = useState('') // UK postcode for base location
  const [travelRadius, setTravelRadius] = useState(10)
  const [postcodeValidating, setPostcodeValidating] = useState(false)
  const [postcodeValid, setPostcodeValid] = useState(null) // null = not checked, true = valid, false = invalid

  // Bottom sheet states
  const [showJobTitlesSheet, setShowJobTitlesSheet] = useState(false)
  const [showRadiusSheet, setShowRadiusSheet] = useState(false)
  const [jobTitleSearch, setJobTitleSearch] = useState('')

  // Helper for checking if user is trade
  const isTrade = role === 'trades'
  const totalProgressSteps = isTrade ? 6 : 5
  const PROGRESS_MAP = getProgressMap(isTrade)

  // UI state
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [emailResendCountdown, setEmailResendCountdown] = useState(0)
  const [phoneResendCountdown, setPhoneResendCountdown] = useState(0)

  // Countdown timers
  useEffect(() => {
    if (emailResendCountdown > 0) {
      const timer = setTimeout(() => setEmailResendCountdown(emailResendCountdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [emailResendCountdown])

  useEffect(() => {
    if (phoneResendCountdown > 0) {
      const timer = setTimeout(() => setPhoneResendCountdown(phoneResendCountdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [phoneResendCountdown])

  // DEV MODE: Bypass OTP verification
  const isDevBypass = (type) => {
    if (type === 'email') {
      // Allow bypass for: code 0000, @test.settled.com, @ninja.dev (demo accounts)
      return emailOtp === '0000' || email.endsWith('@test.settled.com') || email.endsWith('@ninja.dev')
    }
    if (type === 'phone') {
      return phoneOtp === '0000' || phone === '+447700900000' || phone === '07700900000'
    }
    return false
  }

  const validateScreen = (screen) => {
    setError(null)

    switch (screen) {
      case SCREENS.NAME:
        if (!firstName.trim() || firstName.trim().length < 2) {
          setError('Please enter your first name (at least 2 characters)')
          return false
        }
        if (!lastName.trim() || lastName.trim().length < 2) {
          setError('Please enter your last name (at least 2 characters)')
          return false
        }
        return true

      case SCREENS.ENTER_EMAIL:
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
          setError('Please enter a valid email address')
          return false
        }
        return true

      case SCREENS.VERIFY_EMAIL:
        if (emailOtp.length !== 4) {
          setError('Please enter the 4-digit code')
          return false
        }
        // DEV: Allow bypass codes
        if (!isDevBypass('email')) {
          // In production, verify OTP here
          // For now, any 4-digit code works in dev
        }
        return true

      case SCREENS.ENTER_PHONE:
        // Basic UK phone validation
        const cleanPhone = phone.replace(/\s/g, '')
        if (cleanPhone.length < 10) {
          setError('Please enter a valid phone number')
          return false
        }
        return true

      case SCREENS.VERIFY_PHONE:
        if (phoneOtp.length !== 4) {
          setError('Please enter the 4-digit code')
          return false
        }
        return true

      case SCREENS.BUSINESS_DETAILS:
        if (!businessName.trim() || businessName.trim().length < 2) {
          setError('Please enter your business name (at least 2 characters)')
          return false
        }
        if (selectedJobTitles.length === 0) {
          setError('Please select at least one type of work')
          return false
        }
        if (!basePostcode.trim() || basePostcode.trim().length < 5) {
          setError('Please enter your business postcode')
          return false
        }
        if (postcodeValid === false) {
          setError('Please enter a valid UK postcode')
          return false
        }
        return true

      case SCREENS.PASSWORD:
        if (password.length < 8) {
          setError('Password must be at least 8 characters')
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

  const handleSendEmailOtp = async () => {
    // In production, send OTP to email here
    // For now, just simulate sending
    setEmailResendCountdown(60)
    console.log('OTP sent to:', email)
  }

  const handleSendPhoneOtp = async () => {
    // In production, send OTP via SMS here
    // For now, just simulate sending
    setPhoneResendCountdown(60)
    console.log('OTP sent to:', phone)
  }

  const handleNext = async () => {
    if (!validateScreen(currentScreen)) return

    setLoading(true)
    setError(null)

    try {
      switch (currentScreen) {
        case SCREENS.NAME:
          setCurrentScreen(SCREENS.ENTER_EMAIL)
          break

        case SCREENS.ENTER_EMAIL:
          await handleSendEmailOtp()
          setCurrentScreen(SCREENS.VERIFY_EMAIL)
          break

        case SCREENS.VERIFY_EMAIL:
          setCurrentScreen(SCREENS.ENTER_PHONE)
          break

        case SCREENS.ENTER_PHONE:
          await handleSendPhoneOtp()
          setCurrentScreen(SCREENS.VERIFY_PHONE)
          break

        case SCREENS.VERIFY_PHONE:
          // Trades go to business details, clients skip to password
          if (isTrade) {
            setCurrentScreen(SCREENS.BUSINESS_DETAILS)
          } else {
            setCurrentScreen(SCREENS.PASSWORD)
          }
          break

        case SCREENS.BUSINESS_DETAILS:
          setCurrentScreen(SCREENS.PASSWORD)
          break

        case SCREENS.PASSWORD:
          await handleCreateAccount()
          break

        default:
          break
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    setError(null)

    switch (currentScreen) {
      case SCREENS.NAME:
        router.back()
        break
      case SCREENS.VERIFY_EMAIL:
        setEmailOtp('')
        setCurrentScreen(SCREENS.ENTER_EMAIL)
        break
      case SCREENS.VERIFY_PHONE:
        setPhoneOtp('')
        setCurrentScreen(SCREENS.ENTER_PHONE)
        break
      case SCREENS.BUSINESS_DETAILS:
        setCurrentScreen(SCREENS.VERIFY_PHONE)
        break
      case SCREENS.PASSWORD:
        // Trades go back to business details, clients go back to verify phone
        if (isTrade) {
          setCurrentScreen(SCREENS.BUSINESS_DETAILS)
        } else {
          setCurrentScreen(SCREENS.VERIFY_PHONE)
        }
        break
      default:
        setCurrentScreen(currentScreen - 1)
        break
    }
  }

  const handleCreateAccount = async () => {
    try {
      // Set welcome screen BEFORE register to prevent GuestOnly redirect
      setCurrentScreen(SCREENS.WELCOME)

      // Build registration metadata
      const metadata = {
        role: role,
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        phone: phone.trim(),
        email_verified: true,
        phone_verified: true,
      }

      // Add business details for trades
      if (isTrade) {
        metadata.business_name = businessName.trim()
        metadata.job_titles = selectedJobTitles
        metadata.base_postcode = basePostcode.trim().toUpperCase()
        metadata.travel_radius_miles = travelRadius
      }

      await register(email, password, metadata)
    } catch (err) {
      // If registration fails, go back to password screen
      setCurrentScreen(SCREENS.PASSWORD)
      throw err
    }
  }

  const handleWelcomeAction = (action) => {
    if (action === 'verify') {
      // Navigate to verification flow (to be implemented)
      router.replace('/(dashboard)/profile')
    } else {
      // Navigate to dashboard
      router.replace('/(dashboard)')
    }
  }

  // Progress bar component
  const renderProgressBar = () => {
    if (currentScreen === SCREENS.WELCOME) return null

    const currentStep = PROGRESS_MAP[currentScreen]

    return (
      <View style={styles.progressContainer}>
        {[...Array(totalProgressSteps)].map((_, index) => (
          <View key={index} style={styles.progressSegmentWrapper}>
            <View
              style={[
                styles.progressSegment,
                index + 1 <= currentStep && styles.progressSegmentActive,
              ]}
            />
          </View>
        ))}
      </View>
    )
  }

  // Render screen content
  const renderScreen = () => {
    switch (currentScreen) {
      case SCREENS.NAME:
        return (
          <View style={styles.screenContent}>
            <ThemedText style={styles.title}>Let's start with your name</ThemedText>
            <Spacer height={48} />
            <View style={styles.fieldContainer}>
              <ThemedText style={styles.label}>First name</ThemedText>
              <ThemedTextInput
                style={styles.input}
                placeholder="John"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                editable={!loading}
                autoFocus
              />
            </View>
            <Spacer height={20} />
            <View style={styles.fieldContainer}>
              <ThemedText style={styles.label}>Last name</ThemedText>
              <ThemedTextInput
                style={styles.input}
                placeholder="Smith"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                editable={!loading}
              />
            </View>
          </View>
        )

      case SCREENS.ENTER_EMAIL:
        return (
          <View style={styles.screenContent}>
            <ThemedText style={styles.title}>Enter your email</ThemedText>
            <Spacer height={48} />
            <View style={styles.fieldContainer}>
              <ThemedText style={styles.label}>Email address</ThemedText>
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
            </View>
            <Spacer height={8} />
            <ThemedText style={styles.helperText}>
              We'll send you a code to verify
            </ThemedText>
          </View>
        )

      case SCREENS.VERIFY_EMAIL:
        return (
          <View style={styles.screenContent}>
            <ThemedText style={styles.title}>Verify your email</ThemedText>
            <Spacer height={32} />
            <View style={styles.infoCard}>
              <Ionicons name="mail-outline" size={24} color={Colors.light.subtitle} />
              <Spacer height={12} />
              <ThemedText style={styles.infoCardText}>We sent a code to</ThemedText>
              <ThemedText style={styles.infoCardEmail}>{email}</ThemedText>
            </View>
            <Spacer height={32} />
            <ThemedText style={styles.label}>Enter code</ThemedText>
            <Spacer height={12} />
            <OTPInput
              length={4}
              value={emailOtp}
              onChange={setEmailOtp}
              error={!!error}
              disabled={loading}
            />
            <Spacer height={24} />
            <Pressable
              onPress={handleSendEmailOtp}
              disabled={emailResendCountdown > 0}
            >
              <ThemedText style={styles.resendText}>
                Didn't receive it?{' '}
                {emailResendCountdown > 0 ? (
                  <ThemedText style={styles.resendCountdown}>
                    Resend in {emailResendCountdown}s
                  </ThemedText>
                ) : (
                  <ThemedText style={styles.resendLink}>Resend</ThemedText>
                )}
              </ThemedText>
            </Pressable>
          </View>
        )

      case SCREENS.ENTER_PHONE:
        return (
          <View style={styles.screenContent}>
            <ThemedText style={styles.title}>Enter your phone number</ThemedText>
            <Spacer height={48} />
            <View style={styles.fieldContainer}>
              <ThemedText style={styles.label}>Phone number</ThemedText>
              <View style={styles.phoneInputContainer}>
                <View style={styles.countryCode}>
                  <ThemedText style={styles.countryCodeText}>+44</ThemedText>
                </View>
                <ThemedTextInput
                  style={[styles.input, styles.phoneInput]}
                  placeholder="7700 900123"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  editable={!loading}
                  autoFocus
                />
              </View>
            </View>
            <Spacer height={8} />
            <ThemedText style={styles.helperText}>
              We'll send you a code to verify
            </ThemedText>
          </View>
        )

      case SCREENS.VERIFY_PHONE:
        return (
          <View style={styles.screenContent}>
            <ThemedText style={styles.title}>Verify your phone number</ThemedText>
            <Spacer height={32} />
            <View style={styles.infoCard}>
              <Ionicons name="phone-portrait-outline" size={24} color={Colors.light.subtitle} />
              <Spacer height={12} />
              <ThemedText style={styles.infoCardText}>We sent a code to</ThemedText>
              <ThemedText style={styles.infoCardEmail}>+44 {phone}</ThemedText>
            </View>
            <Spacer height={32} />
            <ThemedText style={styles.label}>Enter code</ThemedText>
            <Spacer height={12} />
            <OTPInput
              length={4}
              value={phoneOtp}
              onChange={setPhoneOtp}
              error={!!error}
              disabled={loading}
            />
            <Spacer height={24} />
            <Pressable
              onPress={handleSendPhoneOtp}
              disabled={phoneResendCountdown > 0}
            >
              <ThemedText style={styles.resendText}>
                Didn't receive it?{' '}
                {phoneResendCountdown > 0 ? (
                  <ThemedText style={styles.resendCountdown}>
                    Resend in {phoneResendCountdown}s
                  </ThemedText>
                ) : (
                  <ThemedText style={styles.resendLink}>Resend</ThemedText>
                )}
              </ThemedText>
            </Pressable>
          </View>
        )

      case SCREENS.BUSINESS_DETAILS:
        return (
          <View style={styles.screenContent}>
            <ThemedText style={styles.title}>Tell us about your business</ThemedText>
            <Spacer height={32} />

            {/* Business Name */}
            <View style={styles.fieldContainer}>
              <ThemedText style={styles.label}>Business name</ThemedText>
              <ThemedTextInput
                style={styles.input}
                placeholder="e.g. Smith Plumbing"
                value={businessName}
                onChangeText={setBusinessName}
                autoCapitalize="words"
                editable={!loading}
                autoFocus
              />
            </View>

            <Spacer height={24} />

            {/* Job Titles */}
            <View style={styles.fieldContainer}>
              <ThemedText style={styles.label}>What type of work do you do?</ThemedText>
              <ThemedText style={styles.subLabel}>Select up to 3</ThemedText>
              <Spacer height={8} />
              <Pressable
                style={styles.dropdownButton}
                onPress={() => setShowJobTitlesSheet(true)}
              >
                <ThemedText style={selectedJobTitles.length > 0 ? styles.dropdownText : styles.dropdownPlaceholder}>
                  {selectedJobTitles.length > 0 ? `${selectedJobTitles.length} selected` : 'Select trades...'}
                </ThemedText>
                <Ionicons name="chevron-down" size={20} color={Colors.light.subtitle} />
              </Pressable>
            </View>

            {/* Selected Job Titles Chips */}
            {selectedJobTitles.length > 0 && (
              <View style={styles.chipsContainer}>
                {selectedJobTitles.map((title) => (
                  <View key={title} style={styles.chip}>
                    <ThemedText style={styles.chipText}>{title}</ThemedText>
                    <Pressable
                      onPress={() => setSelectedJobTitles((prev) => prev.filter((t) => t !== title))}
                      hitSlop={8}
                    >
                      <Ionicons name="close" size={16} color="#6B7280" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <Spacer height={24} />

            {/* Base Postcode */}
            <View style={styles.fieldContainer}>
              <ThemedText style={styles.label}>Business postcode</ThemedText>
              <ThemedText style={styles.subLabel}>We'll use this to match you with nearby clients</ThemedText>
              <Spacer height={8} />
              <View style={styles.postcodeInputContainer}>
                <ThemedTextInput
                  style={[
                    styles.input,
                    postcodeValid === true && styles.inputValid,
                    postcodeValid === false && styles.inputInvalid,
                  ]}
                  placeholder="e.g. SW1A 1AA"
                  value={basePostcode}
                  onChangeText={(text) => {
                    setBasePostcode(text.toUpperCase())
                    setPostcodeValid(null) // Reset validation on change
                  }}
                  onBlur={async () => {
                    if (basePostcode.trim().length >= 5) {
                      setPostcodeValidating(true)
                      try {
                        const result = await geocodeUKPostcode(basePostcode.trim())
                        setPostcodeValid(!!result)
                      } catch (e) {
                        setPostcodeValid(false)
                      } finally {
                        setPostcodeValidating(false)
                      }
                    }
                  }}
                  autoCapitalize="characters"
                  editable={!loading}
                />
                {postcodeValidating && (
                  <View style={styles.postcodeValidatingIcon}>
                    <ActivityIndicator size="small" color={Colors.light.subtitle} />
                  </View>
                )}
                {!postcodeValidating && postcodeValid === true && (
                  <View style={styles.postcodeValidIcon}>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                  </View>
                )}
                {!postcodeValidating && postcodeValid === false && (
                  <View style={styles.postcodeValidIcon}>
                    <Ionicons name="close-circle" size={20} color={Colors.warning} />
                  </View>
                )}
              </View>
              {postcodeValid === false && (
                <ThemedText style={styles.postcodeErrorText}>
                  Please enter a valid UK postcode
                </ThemedText>
              )}
            </View>

            <Spacer height={24} />

            {/* Travel Radius */}
            <View style={styles.fieldContainer}>
              <ThemedText style={styles.label}>How far will you travel?</ThemedText>
              <Spacer height={8} />
              <Pressable
                style={styles.dropdownButton}
                onPress={() => setShowRadiusSheet(true)}
              >
                <ThemedText style={styles.dropdownText}>
                  {TRAVEL_DISTANCE_OPTIONS.find((o) => o.value === travelRadius)?.label || '10 miles'}
                </ThemedText>
                <Ionicons name="chevron-down" size={20} color={Colors.light.subtitle} />
              </Pressable>
            </View>
          </View>
        )

      case SCREENS.PASSWORD:
        return (
          <View style={styles.screenContent}>
            <ThemedText style={styles.title}>Create a password</ThemedText>
            <Spacer height={48} />
            <View style={styles.fieldContainer}>
              <ThemedText style={styles.label}>Password</ThemedText>
              <ThemedTextInput
                style={styles.input}
                placeholder="Enter password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                showPasswordToggle
                editable={!loading}
                autoFocus
              />
            </View>
            <Spacer height={8} />
            <ThemedText style={styles.helperText}>At least 8 characters</ThemedText>
            <Spacer height={20} />
            <View style={styles.fieldContainer}>
              <ThemedText style={styles.label}>Confirm password</ThemedText>
              <ThemedTextInput
                style={styles.input}
                placeholder="Re-enter password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                showPasswordToggle
                editable={!loading}
              />
            </View>
          </View>
        )

      case SCREENS.WELCOME:
        return renderWelcomeScreen()

      default:
        return null
    }
  }

  // Welcome screen for tradesperson
  const renderTradesWelcome = () => (
    <View style={styles.welcomeContent}>
      <View style={styles.successIcon}>
        <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
      </View>
      <Spacer height={24} />
      <ThemedText style={styles.welcomeTitle}>
        Welcome to Settled, {firstName}
      </ThemedText>
      <Spacer height={16} />
      <ThemedText style={styles.welcomeSubtitle}>
        To start receiving quote requests from customers, you'll need to complete verification.
      </ThemedText>
      <Spacer height={32} />
      <ThemedText style={styles.welcomeLabel}>This includes:</ThemedText>
      <Spacer height={16} />
      <View style={styles.verificationItem}>
        <Ionicons name="person-outline" size={20} color={Colors.light.subtitle} />
        <ThemedText style={styles.verificationText}>Photo ID</ThemedText>
      </View>
      <View style={styles.verificationItem}>
        <Ionicons name="shield-outline" size={20} color={Colors.light.subtitle} />
        <ThemedText style={styles.verificationText}>Insurance</ThemedText>
      </View>
      <View style={styles.verificationItem}>
        <Ionicons name="ribbon-outline" size={20} color={Colors.light.subtitle} />
        <ThemedText style={styles.verificationText}>Credentials</ThemedText>
      </View>
      <Spacer height={40} />
      <Pressable
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && styles.primaryButtonPressed,
        ]}
        onPress={() => handleWelcomeAction('verify')}
      >
        <ThemedText style={styles.primaryButtonText}>Start verification</ThemedText>
      </Pressable>
      <Spacer height={16} />
      <Pressable onPress={() => handleWelcomeAction('later')}>
        <ThemedText style={styles.skipLink}>I'll do this later</ThemedText>
      </Pressable>
    </View>
  )

  // Welcome screen for homeowner/client
  const renderClientWelcome = () => (
    <View style={styles.welcomeContent}>
      <View style={styles.successIcon}>
        <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
      </View>
      <Spacer height={24} />
      <ThemedText style={styles.welcomeTitle}>
        Welcome to Settled, {firstName}
      </ThemedText>
      <Spacer height={16} />
      <ThemedText style={styles.welcomeSubtitle}>
        You're all set! Start browsing verified tradespeople in your area.
      </ThemedText>
      <Spacer height={48} />
      <Pressable
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && styles.primaryButtonPressed,
        ]}
        onPress={() => handleWelcomeAction('start')}
      >
        <ThemedText style={styles.primaryButtonText}>Get started</ThemedText>
      </Pressable>
    </View>
  )

  const renderWelcomeScreen = () => {
    return role === 'trades' ? renderTradesWelcome() : renderClientWelcome()
  }

  // Get button text based on current screen
  const getButtonText = () => {
    if (currentScreen === SCREENS.PASSWORD) return 'Create Account'
    if (currentScreen === SCREENS.VERIFY_EMAIL || currentScreen === SCREENS.VERIFY_PHONE) return 'Verify'
    return 'Continue'
  }

  // Check if continue button should be disabled
  const isContinueDisabled = () => {
    if (loading) return true

    switch (currentScreen) {
      case SCREENS.NAME:
        return !firstName.trim() || !lastName.trim()
      case SCREENS.ENTER_EMAIL:
        return !email.trim()
      case SCREENS.VERIFY_EMAIL:
        return emailOtp.length !== 4
      case SCREENS.ENTER_PHONE:
        return !phone.trim()
      case SCREENS.VERIFY_PHONE:
        return phoneOtp.length !== 4
      case SCREENS.BUSINESS_DETAILS:
        return !businessName.trim() || selectedJobTitles.length === 0 || !basePostcode.trim() || postcodeValid === false
      case SCREENS.PASSWORD:
        return !password || !confirmPassword
      default:
        return false
    }
  }

  // Filter job titles based on search
  const filteredJobTitles = useMemo(() => {
    if (!jobTitleSearch.trim()) return JOB_TITLE_OPTIONS
    const search = jobTitleSearch.toLowerCase()
    return JOB_TITLE_OPTIONS.filter((title) =>
      title.toLowerCase().includes(search)
    )
  }, [jobTitleSearch])

  // Toggle job title selection
  const toggleJobTitle = (title) => {
    setSelectedJobTitles((prev) => {
      if (prev.includes(title)) {
        return prev.filter((t) => t !== title)
      }
      if (prev.length >= 3) {
        Alert.alert('Limit reached', 'You can select up to 3 types of work.')
        return prev
      }
      return [...prev, title]
    })
  }


  if (!role) return null

  // Welcome screen has different layout
  if (currentScreen === SCREENS.WELCOME) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.welcomeScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {renderWelcomeScreen()}
        </ScrollView>
      </ThemedView>
    )
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

        {/* Progress Bar */}
        {renderProgressBar()}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Screen Content */}
          {renderScreen()}

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
            disabled={isContinueDisabled()}
            style={({ pressed }) => [
              styles.continueButton,
              pressed && styles.continueButtonPressed,
              isContinueDisabled() && styles.continueButtonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.continueButtonText}>
                {getButtonText()}
              </ThemedText>
            )}
          </Pressable>

          {/* Sign in link - only show on first screen */}
          {currentScreen === SCREENS.NAME && (
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

        {/* Job Titles Bottom Sheet */}
        <Modal
          visible={showJobTitlesSheet}
          transparent
          animationType="slide"
          onRequestClose={() => setShowJobTitlesSheet(false)}
        >
          <View style={styles.sheetOverlay}>
            <Pressable
              style={styles.sheetBackdrop}
              onPress={() => setShowJobTitlesSheet(false)}
            />
            <View style={styles.sheetContent}>
              <View style={styles.sheetHeader}>
                <ThemedText style={styles.sheetTitle}>What type of work do you do?</ThemedText>
                <Pressable onPress={() => setShowJobTitlesSheet(false)} hitSlop={10}>
                  <Ionicons name="close" size={24} color={Colors.light.title} />
                </Pressable>
              </View>

              <ThemedText style={styles.sheetSubtitle}>Select up to 3</ThemedText>
              <Spacer height={16} />

              {/* Search Input */}
              <View style={styles.sheetSearchContainer}>
                <Ionicons name="search" size={20} color={Colors.light.subtitle} />
                <TextInput
                  style={styles.sheetSearchInput}
                  placeholder="Search trades..."
                  placeholderTextColor={Colors.light.subtitle}
                  value={jobTitleSearch}
                  onChangeText={setJobTitleSearch}
                  autoCapitalize="none"
                />
                {jobTitleSearch.length > 0 && (
                  <Pressable onPress={() => setJobTitleSearch('')} hitSlop={10}>
                    <Ionicons name="close-circle" size={20} color={Colors.light.subtitle} />
                  </Pressable>
                )}
              </View>

              <Spacer height={16} />

              {/* Job Titles List */}
              <FlatList
                data={filteredJobTitles}
                keyExtractor={(item) => item}
                style={styles.sheetList}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const isSelected = selectedJobTitles.includes(item)
                  return (
                    <Pressable
                      style={[styles.sheetListItem, isSelected && styles.sheetListItemSelected]}
                      onPress={() => toggleJobTitle(item)}
                    >
                      <ThemedText style={[styles.sheetListItemText, isSelected && styles.sheetListItemTextSelected]}>
                        {item}
                      </ThemedText>
                      {isSelected && (
                        <Ionicons name="checkmark" size={20} color={TINT} />
                      )}
                    </Pressable>
                  )
                }}
              />

              <Spacer height={16} />

              {/* Done Button */}
              <Pressable
                style={styles.sheetDoneBtn}
                onPress={() => setShowJobTitlesSheet(false)}
              >
                <ThemedText style={styles.sheetDoneBtnText}>
                  Done {selectedJobTitles.length > 0 ? `(${selectedJobTitles.length})` : ''}
                </ThemedText>
              </Pressable>

              <Spacer height={Platform.OS === 'ios' ? 24 : 16} />
            </View>
          </View>
        </Modal>

        {/* Radius Bottom Sheet */}
        <Modal
          visible={showRadiusSheet}
          transparent
          animationType="slide"
          onRequestClose={() => setShowRadiusSheet(false)}
        >
          <View style={styles.sheetOverlay}>
            <Pressable
              style={styles.sheetBackdrop}
              onPress={() => setShowRadiusSheet(false)}
            />
            <View style={[styles.sheetContent, styles.sheetContentSmall]}>
              <View style={styles.sheetHeader}>
                <ThemedText style={styles.sheetTitle}>How far will you travel?</ThemedText>
                <Pressable onPress={() => setShowRadiusSheet(false)} hitSlop={10}>
                  <Ionicons name="close" size={24} color={Colors.light.title} />
                </Pressable>
              </View>

              <Spacer height={16} />

              {/* Radius Options */}
              {TRAVEL_DISTANCE_OPTIONS.map((option) => {
                const isSelected = travelRadius === option.value
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.sheetListItem, isSelected && styles.sheetListItemSelected]}
                    onPress={() => {
                      setTravelRadius(option.value)
                      setShowRadiusSheet(false)
                    }}
                  >
                    <ThemedText style={[styles.sheetListItemText, isSelected && styles.sheetListItemTextSelected]}>
                      {option.label}
                    </ThemedText>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={TINT} />
                    )}
                  </Pressable>
                )
              })}

              <Spacer height={Platform.OS === 'ios' ? 24 : 16} />
            </View>
          </View>
        </Modal>
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
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 32,
  },
  progressSegmentWrapper: {
    flex: 1,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressSegment: {
    height: '100%',
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
  },
  progressSegmentActive: {
    backgroundColor: TINT,
  },
  scrollContent: {
    paddingHorizontal: 32,
  },
  screenContent: {
    width: '100%',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.title,
    lineHeight: 32,
    textAlign: 'center',
  },
  fieldContainer: {
    width: '100%',
    maxWidth: 400,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 10,
  },
  input: {
    width: '100%',
  },
  helperText: {
    fontSize: 14,
    color: Colors.light.subtitle,
    textAlign: 'left',
    width: '100%',
    maxWidth: 400,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  countryCode: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.secondaryBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countryCodeText: {
    fontSize: 16,
    color: Colors.light.title,
    fontWeight: '500',
  },
  phoneInput: {
    flex: 1,
  },
  // Postcode input styles
  postcodeInputContainer: {
    position: 'relative',
  },
  inputValid: {
    borderColor: Colors.success,
  },
  inputInvalid: {
    borderColor: Colors.warning,
  },
  postcodeValidatingIcon: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -10 }],
  },
  postcodeValidIcon: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -10 }],
  },
  postcodeErrorText: {
    fontSize: 13,
    color: Colors.warning,
    marginTop: 6,
  },
  infoCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.light.secondaryBackground,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  infoCardText: {
    fontSize: 14,
    color: Colors.light.subtitle,
  },
  infoCardEmail: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.title,
    marginTop: 4,
  },
  resendText: {
    fontSize: 14,
    color: Colors.light.subtitle,
    textAlign: 'center',
  },
  resendLink: {
    color: TINT,
    fontWeight: '600',
  },
  resendCountdown: {
    color: Colors.light.subtitle,
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
    width: '100%',
    maxWidth: 400,
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
  continueButtonDisabled: {
    opacity: 0.5,
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
  // Welcome screen styles
  welcomeScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  welcomeContent: {
    alignItems: 'center',
  },
  successIcon: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.title,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: Colors.light.subtitle,
    textAlign: 'center',
    lineHeight: 24,
  },
  welcomeLabel: {
    fontSize: 14,
    color: Colors.light.subtitle,
    alignSelf: 'flex-start',
  },
  verificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.secondaryBackground,
    borderRadius: 12,
    marginBottom: 8,
  },
  verificationText: {
    fontSize: 16,
    color: Colors.light.title,
    fontWeight: '500',
  },
  primaryButton: {
    width: '100%',
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
  primaryButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  skipLink: {
    fontSize: 14,
    color: TINT,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  // Business Details styles
  subLabel: {
    fontSize: 13,
    color: Colors.light.subtitle,
    marginTop: 4,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
  },
  dropdownText: {
    fontSize: 16,
    color: Colors.light.title,
    flex: 1,
  },
  dropdownPlaceholder: {
    fontSize: 16,
    color: Colors.light.subtitle,
    flex: 1,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    width: '100%',
    maxWidth: 400,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.light.secondaryBackground,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 14,
    color: Colors.light.title,
  },
  // Bottom Sheet styles
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    maxHeight: '80%',
  },
  sheetContentFullScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
  },
  sheetContentSmall: {
    maxHeight: '50%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.title,
    flex: 1,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: Colors.light.subtitle,
    marginTop: 4,
  },
  sheetSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.light.secondaryBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sheetSearchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.title,
    padding: 0,
  },
  sheetList: {
    maxHeight: 300,
  },
  sheetListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
    gap: 12,
  },
  sheetListItemSelected: {
    backgroundColor: 'rgba(104, 73, 167, 0.05)',
  },
  sheetListItemText: {
    fontSize: 16,
    color: Colors.light.title,
    flex: 1,
  },
  sheetListItemTextSelected: {
    color: TINT,
    fontWeight: '500',
  },
  sheetEmptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  sheetEmptyText: {
    fontSize: 14,
    color: Colors.light.subtitle,
    textAlign: 'center',
  },
  sheetDoneBtn: {
    backgroundColor: TINT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDoneBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Location search specific styles
  locationItemContent: {
    flex: 1,
  },
  locationSecondaryText: {
    fontSize: 13,
    color: Colors.light.subtitle,
    marginTop: 2,
  },
  googleAttribution: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.light.border,
    marginTop: 8,
  },
  googleAttributionText: {
    fontSize: 12,
    color: Colors.light.subtitle,
  },
})
