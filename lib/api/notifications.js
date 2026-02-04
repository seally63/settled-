// lib/api/notifications.js
// Push notification service for Expo

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "../supabase";

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions and get the Expo push token
 * @returns {Promise<string|null>} The Expo push token or null if failed
 */
export async function registerForPushNotifications() {
  // Must be a physical device
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not already granted
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Push notification permission denied");
      return null;
    }

    // Get the Expo push token
    // projectId comes from app.json/app.config.js via Constants
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = tokenData.data;
    console.log("Expo push token:", token);

    // Register token with backend
    await registerTokenWithBackend(token);

    // Set up Android notification channel
    if (Platform.OS === "android") {
      await setupAndroidChannels();
    }

    return token;
  } catch (error) {
    console.error("Error registering for push notifications:", error);
    return null;
  }
}

/**
 * Register the push token with the Supabase backend
 * @param {string} token - The Expo push token
 */
async function registerTokenWithBackend(token) {
  try {
    const { data, error } = await supabase.rpc("rpc_register_push_token", {
      p_token: token,
    });

    if (error) {
      console.error("Error registering push token:", error);
      return false;
    }

    console.log("Push token registered successfully");
    return true;
  } catch (error) {
    console.error("Error registering push token:", error);
    return false;
  }
}

/**
 * Unregister push token (call on logout)
 */
export async function unregisterPushToken() {
  try {
    const { error } = await supabase.rpc("rpc_unregister_push_token");

    if (error) {
      console.error("Error unregistering push token:", error);
      return false;
    }

    console.log("Push token unregistered successfully");
    return true;
  } catch (error) {
    console.error("Error unregistering push token:", error);
    return false;
  }
}

/**
 * Set up Android notification channels
 */
async function setupAndroidChannels() {
  // Default channel for general notifications
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#6849a7",
  });

  // Messages channel - high priority
  await Notifications.setNotificationChannelAsync("messages", {
    name: "Messages",
    description: "New message notifications",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#6849a7",
    sound: "default",
  });

  // Quotes channel
  await Notifications.setNotificationChannelAsync("quotes", {
    name: "Quotes",
    description: "Quote updates and new requests",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#6849a7",
    sound: "default",
  });

  // Reminders channel
  await Notifications.setNotificationChannelAsync("reminders", {
    name: "Reminders",
    description: "Appointment and job reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250],
    lightColor: "#6849a7",
  });
}

/**
 * Add a listener for when a notification is received while app is foregrounded
 * @param {Function} callback - Function to call when notification is received
 * @returns {Object} Subscription object (call .remove() to unsubscribe)
 */
export function addNotificationReceivedListener(callback) {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add a listener for when user taps on a notification
 * @param {Function} callback - Function to call when notification is tapped
 * @returns {Object} Subscription object (call .remove() to unsubscribe)
 */
export function addNotificationResponseListener(callback) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Get the notification that was used to open the app (if any)
 * @returns {Promise<Object|null>} The notification response or null
 */
export async function getLastNotificationResponse() {
  return await Notifications.getLastNotificationResponseAsync();
}

/**
 * Handle navigation based on notification data
 * @param {Object} notification - The notification object
 * @param {Object} router - Expo Router instance
 */
export function handleNotificationNavigation(notification, router) {
  const data = notification?.request?.content?.data;

  if (!data || !router) return;

  const { type, request_id, quote_id, conversation_id, appointment_id } = data;

  switch (type) {
    // Trade receives new request
    case "new_request":
    case "direct_request":
      if (request_id) {
        router.push(`/quotes/request/${request_id}`);
      } else {
        router.push("/quotes");
      }
      break;

    // Client receives request status update
    case "request_accepted":
    case "request_declined":
    case "request_expired":
      if (request_id) {
        router.push(`/client/myquotes/request/${request_id}`);
      } else {
        router.push("/client/myquotes");
      }
      break;

    // Client receives quote
    case "quote_sent":
    case "quote_expiring":
    case "quote_expired":
      if (quote_id) {
        router.push(`/client/myquotes/${quote_id}`);
      } else {
        router.push("/client/myquotes");
      }
      break;

    // Trade receives quote response
    case "quote_accepted":
    case "quote_declined":
      if (quote_id) {
        router.push(`/quotes/${quote_id}`);
      } else {
        router.push("/quotes");
      }
      break;

    // Message notifications
    case "new_message":
      if (conversation_id) {
        router.push(`/messages/${conversation_id}`);
      } else {
        router.push("/messages");
      }
      break;

    // Appointment notifications
    case "appointment_scheduled":
    case "appointment_reminder":
      if (quote_id) {
        router.push(`/quotes/${quote_id}`);
      } else if (appointment_id) {
        router.push(`/appointments/${appointment_id}`);
      }
      break;

    // Work completed - client should see quote/review
    case "work_completed":
      if (quote_id) {
        router.push(`/client/myquotes/${quote_id}`);
      }
      break;

    // Review received - trade sees their reviews
    case "review_received":
      router.push("/profile");
      break;

    // Response time nudge - trade sees pending requests
    case "response_time_nudge":
      router.push("/quotes");
      break;

    default:
      // Default: go to dashboard
      break;
  }
}

/**
 * Set the badge count on the app icon
 * @param {number} count - The badge count
 */
export async function setBadgeCount(count) {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    console.error("Error setting badge count:", error);
  }
}

/**
 * Clear the badge count
 */
export async function clearBadgeCount() {
  await setBadgeCount(0);
}

/**
 * Check if notifications are enabled
 * @returns {Promise<boolean>}
 */
export async function areNotificationsEnabled() {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted";
}

/**
 * Get all scheduled local notifications
 * @returns {Promise<Array>}
 */
export async function getScheduledNotifications() {
  return await Notifications.getAllScheduledNotificationsAsync();
}

/**
 * Cancel all scheduled local notifications
 */
export async function cancelAllScheduledNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Schedule a local notification (for reminders)
 * @param {Object} options - Notification options
 * @returns {Promise<string>} Notification identifier
 */
export async function scheduleLocalNotification({
  title,
  body,
  data = {},
  triggerDate,
  channelId = "reminders",
}) {
  const trigger = triggerDate
    ? { date: triggerDate }
    : { seconds: 1 }; // Immediate if no date

  return await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
      ...(Platform.OS === "android" && { channelId }),
    },
    trigger,
  });
}
