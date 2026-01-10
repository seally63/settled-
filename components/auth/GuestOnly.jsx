import { useRouter, usePathname } from "expo-router"
import { useUser } from "../../hooks/useUser"
import { useEffect, useState } from "react"
import ThemedLoader from "../ThemedLoader"

const GuestOnly = ({ children }) => {
  const { user, authChecked } = useUser()
  const router = useRouter()
  const pathname = usePathname()

  // Track if we just registered (to show welcome screen)
  const [justRegistered, setJustRegistered] = useState(false)

  // Check if we're on the register page - allow showing welcome screen
  const isRegisterPage = pathname === '/register'

  // If user becomes logged in while on register page, they just registered
  useEffect(() => {
    if (authChecked && user !== null && isRegisterPage) {
      setJustRegistered(true)
    }
  }, [user, authChecked, isRegisterPage])

  // Redirect to profile if logged in (unless just registered and on register page)
  useEffect(() => {
    if (authChecked && user !== null && !isRegisterPage) {
      router.replace("/profile")
    }
  }, [user, authChecked, isRegisterPage])

  // Show loader while checking auth, but not if just registered (show welcome screen)
  if (!authChecked) {
    return <ThemedLoader />
  }

  // If user is logged in but NOT on register page, show loader while redirecting
  if (user && !isRegisterPage) {
    return <ThemedLoader />
  }

  return children
}

export default GuestOnly