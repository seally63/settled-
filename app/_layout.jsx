import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router'
import { View } from 'react-native'
import { StatusBar } from 'expo-status-bar'

import {
  useFonts as usePublicSans,
  PublicSans_400Regular,
  PublicSans_500Medium,
  PublicSans_600SemiBold,
  PublicSans_700Bold,
  PublicSans_800ExtraBold,
} from '@expo-google-fonts/public-sans'
import {
  useFonts as useDmSans,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans'

import { UserProvider } from '../contexts/UserContext'
import { QuotesProvider } from '../contexts/QuotesContext'
import { NotificationProvider } from '../contexts/NotificationContext'
import { ThemeProvider, useThemeContext } from '../contexts/ThemeContext'

function ThemedStack() {
  const { colors, scheme } = useThemeContext()
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{
          headerStyle: { backgroundColor: colors.navBackground },
          headerTintColor: colors.title,
          contentStyle: { backgroundColor: colors.background },
      }}>
        <Stack.Screen name='(auth)' options={{ headerShown: false }} />
        <Stack.Screen name='(dashboard)' options={{ headerShown: false }} />
        <Stack.Screen name='(admin)' options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ title: 'Home' }} />
      </Stack>
    </>
  )
}

const RootLayout = () => {
  const [publicSansLoaded] = usePublicSans({
    PublicSans_400Regular,
    PublicSans_500Medium,
    PublicSans_600SemiBold,
    PublicSans_700Bold,
    PublicSans_800ExtraBold,
  })
  const [dmSansLoaded] = useDmSans({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  })

  // Hold the splash/blank view until fonts are ready — prevents a visible
  // typography flash once the first screen renders.
  const fontsReady = publicSansLoaded && dmSansLoaded

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <UserProvider>
          <QuotesProvider>
            <NotificationProvider>
              {fontsReady ? <ThemedStack /> : <View style={{ flex: 1, backgroundColor: '#0B0B0D' }} />}
            </NotificationProvider>
          </QuotesProvider>
        </UserProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  )
}

export default RootLayout
