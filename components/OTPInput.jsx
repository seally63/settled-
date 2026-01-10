// components/OTPInput.jsx
import { useRef, useState, useEffect } from 'react'
import { View, TextInput, StyleSheet, Pressable } from 'react-native'
import { Colors } from '../constants/Colors'

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
    // Only allow digits
    const digit = text.replace(/[^0-9]/g, '').slice(-1)

    // Create new value
    const newDigits = [...digits]
    newDigits[index] = digit
    const newValue = newDigits.join('')

    onChange(newValue)

    // Auto-advance to next field
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      // Move to previous field on backspace when current is empty
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
      // Focus the last filled input or the next empty one
      const focusIndex = Math.min(pastedDigits.length, length - 1)
      inputRefs.current[focusIndex]?.focus()
    }
  }

  return (
    <View style={styles.container}>
      {digits.map((digit, index) => (
        <TextInput
          key={index}
          ref={(ref) => (inputRefs.current[index] = ref)}
          style={[
            styles.input,
            focusedIndex === index && styles.inputFocused,
            error && styles.inputError,
            disabled && styles.inputDisabled,
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
        />
      ))}
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
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: Colors.light.uiBackground,
    color: Colors.light.title,
  },
  inputFocused: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  inputError: {
    borderColor: Colors.warning,
    borderWidth: 2,
  },
  inputDisabled: {
    backgroundColor: Colors.light.secondaryBackground,
    opacity: 0.7,
  },
})

export default OTPInput
