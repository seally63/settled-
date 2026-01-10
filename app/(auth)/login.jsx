import { StyleSheet, Text, View, Pressable } from 'react-native'
import { Link } from 'expo-router'
import { Colors } from '../../constants/Colors'
import { useState } from 'react'
import { useUser } from '../../hooks/useUser'
import { Ionicons } from '@expo/vector-icons'


//themed components
import ThemedView from '../../components/ThemedView'
import ThemedText from '../../components/ThemedText'
import ThemedButton from '../../components/ThemedButton'
import Spacer from '../../components/Spacer'
import ThemedTextInput from "../../components/ThemedTextInput"


//email verfication is off

// Demo accounts for quick testing
const DEMO_ACCOUNTS = [
  {
    id: 'ac295f71-2868-4794-8c01-13d9b0e87788',
    email: 'ronan@test.settled.com',
    password: 'test1234',
    label: 'Trade 1',
    icon: 'construct',
    color: Colors.primary,
  },
  {
    id: '3daa9bcd-feb0-4a2e-8d09-cd5c2db1f63f',
    email: 'seally@ninja.dev',
    password: 'test1234',
    label: 'Trade 2',
    icon: 'hammer',
    color: Colors.primary,
  },
  {
    id: 'f58b331c-c523-4ec3-aa1c-1e0d1300cb56',
    email: 'seally2@ninja.dev',
    password: 'test1234',
    label: 'Client',
    icon: 'person',
    color: Colors.success,
  },
];

const Login = () => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState(null)
    const [loggingIn, setLoggingIn] = useState(false)

    const { login } = useUser()

    const handleSubmit = async () => {
      setError(null)
        try {
        await login(email, password)
    } catch (error) {
      setError(error.message)
        }

    }

    const handleDemoLogin = async (account) => {
      setError(null)
      setLoggingIn(true)
      try {
        await login(account.email, account.password)
      } catch (error) {
        setError(error.message)
      } finally {
        setLoggingIn(false)
      }
    }

  return (

    <ThemedView style={styles.container}>


        <Spacer />
        <ThemedText title={true} style={styles.title}>
            Login to Your Account
        </ThemedText>

        <ThemedTextInput
            style={{ width: '80%', marginBottom: 20 }}
            placeholder="Email"
            keyboardType="email-address"
            onChangeText={setEmail}
            value={email}
        />

        <ThemedTextInput
            style={{ width: '80%', marginBottom: 20 }}
            placeholder="Password"
            onChangeText={setPassword}
            value={password}
            secureTextEntry
        />

        <ThemedButton onPress={handleSubmit}>
            <Text style={{ color: '#f2f2f2'}}>Login</Text>
        </ThemedButton>

        {/* Demo Account Quick Login */}
        <View style={styles.demoSection}>
          <ThemedText style={styles.demoLabel}>Quick Login</ThemedText>
          <View style={styles.demoAvatars}>
            {DEMO_ACCOUNTS.map((account) => (
              <Pressable
                key={account.id}
                onPress={() => handleDemoLogin(account)}
                style={({ pressed }) => [
                  styles.demoAvatar,
                  { backgroundColor: account.color },
                  pressed && styles.demoAvatarPressed,
                ]}
                disabled={loggingIn}
              >
                <Ionicons name={account.icon} size={24} color="#fff" />
                <Text style={styles.demoAvatarLabel}>{account.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Spacer />
        {error && <Text style={styles.error}>{error}</Text>}


        <Spacer height={60} />
        <Link href='/register'>
            <ThemedText style={{ textAlign: 'center'}}>
                Register instead
            </ThemedText>
        </Link>



    </ThemedView>

  )
}

export default Login

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    title: {
        textAlign: 'center',
        fontSize: 18,
        marginBottom: 30
    },
    btn: {
        backgroundColor: Colors.primary,
        padding: 15,
        borderRadius: 5,
    },
    pressed: {
        opacity: 0.8
    },
    error: {
        color: Colors.warning,
        padding: 10,
        backgroundColor: '#f5c1c8',
        borderColor: Colors.warning,
        borderWidth: 1,
        borderRadius: 6,
        marginHorizontal: 10,
    },
    // Demo account styles
    demoSection: {
        marginTop: 32,
        alignItems: 'center',
    },
    demoLabel: {
        fontSize: 13,
        color: '#6B7280',
        marginBottom: 12,
    },
    demoAvatars: {
        flexDirection: 'row',
        gap: 16,
    },
    demoAvatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    demoAvatarPressed: {
        opacity: 0.7,
        transform: [{ scale: 0.95 }],
    },
    demoAvatarLabel: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '600',
        marginTop: 2,
    },
})