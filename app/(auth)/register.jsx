// app/(auth)/register.jsx
// This file redirects to the new role selection screen
import { useEffect } from 'react'
import { useRouter } from 'expo-router'

export default function Register() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to role selection screen
    router.replace('/role-select')
  }, [])

  return null
}