// components/OTPInput.jsx
// Theme-aware 4-digit OTP entry. Each cell reads its bg / border /
// text from useTheme() so dark mode stops rendering as white boxes
// with dark digits (and by extension the email + phone verification
// screens in registration no longer have a white strip across the
// middle of the viewport).
import { useRef, useState, useEffect } from 'react'
import { View, TextInput, StyleSheet, Pressable } from 'react-native'
import { Colors } from '../constants/Colors'
import { useTheme } from '../hooks/useTheme'

const OTPInput = ({
  length = 4,
  value = '',
  onChange,
  error = false,
  autoFocus = true,
  disabled = false,
}) => {
  const inputRefs = useRef([])
  const [focusedIndex, setFocusedIndex] = useState(0)
  const { colors: c, dark } = useTheme()

  // Convert value string to array of digits
  const digits = value.split('').slice(0, length)
  while (digits.length < length) {
    digits.push('')
  }

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }
  }, [autoFocus])

  const handleChange = (text, index) => {
    const digit = text.replace(/[^0-9]/g, '').slice(-1)
    const newDigits = [...digits]
    newDigits[index] = digit
    const newValue = newDigits.join('')
    onChange(newValue)
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleFocus = (index) => {
    setFocusedIndex(index)
  }

  const handlePaste = (e) => {
    const pastedText = e.nativeEvent.text || ''
    const pastedDigits = pastedText.replace(/[^0-9]/g, '').slice(0, length)
    if (pastedDigits.length > 1) {
      onChange(pastedDigits)
      const focusIndex = Math.min(pastedDigits.length, length - 1)
      inputRefs.current[focusIndex]?.focus()
    }
  }

  return (
    <View style={styles.container}>
      {digits.map((digit, index) => {
        const isFocused = focusedIndex === index
        // Base cell paints from theme. Focused / error borders beat
        // the base border via the style cascade below.
        const baseBg = disabled ? c.elevate2 : c.elevate
        const baseBorder = c.border
        const borderColor = error
          ? Colors.warning
          : isFocused
          ? Colors.primary
          : baseBorder
        const borderWidth = error || isFocused ? 2 : 1
        return (
          <TextInput
            key={index}
            ref={(ref) => (inputRefs.current[index] = ref)}
            style={[
              styles.input,
              {
                backgroundColor: baseBg,
                borderColor,
                borderWidth,
                color: c.text,
                opacity: disabled ? 0.7 : 1,
              },
            ]}
            value={digit}
            onChangeText={(text) => handleChange(text, index)}
            onKeyPress={(e) => handleKeyPress(e, index)}
            onFocus={() => handleFocus(index)}
            onChange={index === 0 ? handlePaste : undefined}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            editable={!disabled}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            placeholderTextColor={c.textMuted}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  input: {
    width: 56,
    height: 56,
    borderRadius: 12,
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    // bg / border / color painted inline from theme at render site.
  },
})

export default OTPInput
