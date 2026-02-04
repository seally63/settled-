// contexts/NotificationContext.jsx
// Manages push notification state and listeners

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { AppState } from "react-native";

import {
  registerForPushNotifications,
  unregisterPushToken,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  getLastNotificationResponse,
  handleNotificationNavigation,
  clearBadgeCount,
} from "../lib/api/notifications";
import { useUser } from "../hooks/useUser";

const NotificationContext = createContext({
  expoPushToken: null,
  notification: null,
  isRegistered: false,
  registerNotifications: async () => {},
  unregisterNotifications: async () => {},
});

export function NotificationProvider({ children }) {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();

  const [expoPushToken, setExpoPushToken] = useState(null);
  const [notification, setNotification] = useState(null);
  const [isRegistered, setIsRegistered] = useState(false);

  const notificationListener = useRef();
  const responseListener = useRef();
  const appState = useRef(AppState.currentState);

  // Register for push notifications when user logs in
  useEffect(() => {
    if (!userLoading && user?.id) {
      registerNotifications();
    }
  }, [user?.id, userLoading]);

  // Set up notification listeners
  useEffect(() => {
    // Listener for notifications received while app is foregrounded
    notificationListener.current = addNotificationReceivedListener(
      (notification) => {
        console.log("Notification received:", notification);
        setNotification(notification);
      }
    );

    // Listener for when user taps on notification
    responseListener.current = addNotificationResponseListener((response) => {
      console.log("Notification tapped:", response);
      handleNotificationNavigation(response.notification, router);
    });

    // Check if app was opened from a notification
    checkInitialNotification();

    // Clear badge when app comes to foreground
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        clearBadgeCount();
      }
      appState.current = nextAppState;
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      subscription.remove();
    };
  }, [router]);

  async function checkInitialNotification() {
    try {
      const response = await getLastNotificationResponse();
      if (response) {
        console.log("App opened from notification:", response);
        // Small delay to ensure router is ready
        setTimeout(() => {
          handleNotificationNavigation(response.notification, router);
        }, 500);
      }
    } catch (error) {
      console.error("Error checking initial notification:", error);
    }
  }

  async function registerNotifications() {
    try {
      const token = await registerForPushNotifications();
      if (token) {
        setExpoPushToken(token);
        setIsRegistered(true);
        console.log("Push notifications registered");
      }
    } catch (error) {
      console.error("Error registering notifications:", error);
    }
  }

  async function unregisterNotifications() {
    try {
      await unregisterPushToken();
      setExpoPushToken(null);
      setIsRegistered(false);
      console.log("Push notifications unregistered");
    } catch (error) {
      console.error("Error unregistering notifications:", error);
    }
  }

  return (
    <NotificationContext.Provider
      value={{
        expoPushToken,
        notification,
        isRegistered,
        registerNotifications,
        unregisterNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider"
    );
  }
  return context;
}

export default NotificationContext;
