import { TextInput, useColorScheme, View, Pressable } from 'react-native'
import { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/Colors'


const ThemedTextInput = ({ style, showPasswordToggle = false, secureTextEntry, ...props}) => {
    const colorScheme = useColorScheme()
    const theme = Colors[colorScheme] ?? Colors.light
    const [isPasswordVisible, setIsPasswordVisible] = useState(false)

    // If this is a password field with toggle enabled
    const isSecure = showPasswordToggle ? (secureTextEntry && !isPasswordVisible) : secureTextEntry

    if (showPasswordToggle && secureTextEntry) {
        return (
            <View style={{
                position: 'relative',
                width: '100%',
            }}>
                <TextInput
                    style={[
                        {
                            backgroundColor: theme.uiBackground,
                            color: theme.text,
                            padding: 16,
                            paddingRight: 48, // Make room for eye icon
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: theme.border || '#E5E7EB',
                            fontSize: 16,
                        },
                        style
                    ]}
                    secureTextEntry={isSecure}
                    {...props}
                />
                <Pressable
                    onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                    style={{
                        position: 'absolute',
                        right: 12,
                        top: 0,
                        bottom: 0,
                        justifyContent: 'center',
                        padding: 4,
                    }}
                    hitSlop={8}
                >
                    <Ionicons
                        name={isPasswordVisible ? 'eye-off' : 'eye'}
                        size={20}
                        color={theme.subtitle || '#64748B'}
                    />
                </Pressable>
            </View>
        )
    }

    return (
        <TextInput
            style={[
                {
                    backgroundColor : theme.uiBackground,
                    color: theme.text,
                    padding: 16,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: theme.border || '#E5E7EB',
                    fontSize: 16,
            },
            style
        ]}
        secureTextEntry={isSecure}
        {...props}

        />
  )
}

export default ThemedTextInput

