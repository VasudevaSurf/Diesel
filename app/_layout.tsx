import { Tabs, useRouter, useSegments } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  Platform,
  Alert,
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

import { HapticTab } from "@/components/HapticTab";
import { IconSymbol } from "@/components/ui/IconSymbol";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

// Global state for authenticated tabs
let authenticatedTabs = new Set();

// Password protection component
function PasswordModal({ visible, onClose, onSuccess, title, description }) {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const colorScheme = useColorScheme();

  const handleSubmit = () => {
    if (!password.trim()) {
      Alert.alert("Error", "Please enter a password");
      return;
    }

    setIsLoading(true);

    // Simulate a small delay for better UX
    setTimeout(() => {
      onSuccess(password);
      setPassword("");
      setIsLoading(false);
    }, 300);
  };

  const handleClose = () => {
    setPassword("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <IconSymbol
              name="lock.fill"
              size={32}
              color={Colors[colorScheme ?? "light"].tint}
            />
            <Text style={styles.modalTitle}>{title}</Text>
            <Text style={styles.modalDescription}>{description}</Text>
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.passwordLabel}>Enter Password:</Text>
            <TextInput
              style={[
                styles.passwordInput,
                { borderColor: Colors[colorScheme ?? "light"].tint },
              ]}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry={true}
              autoFocus={true}
              onSubmitEditing={handleSubmit}
              editable={!isLoading}
            />
          </View>

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={isLoading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.submitButton,
                { backgroundColor: Colors[colorScheme ?? "light"].tint },
                isLoading && styles.disabledButton,
              ]}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              <Text style={styles.submitButtonText}>
                {isLoading ? "Verifying..." : "Access"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Custom tab button that handles password protection
function CustomTabButton({
  children,
  onPress,
  accessibilityState,
  href,
  ...props
}) {
  const router = useRouter();
  const segments = useSegments();

  // Always call hooks at the top level
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingRoute, setPendingRoute] = useState(null);

  const protectedRoutes = {
    inventory: {
      title: "Inventory Access",
      description: "Enter password to access inventory management",
      correctPassword: "inventory123",
    },
    admin: {
      title: "Admin Access",
      description: "Enter password to access admin panel",
      correctPassword: "admin123",
    },
  };

  const handleTabPress = (event) => {
    // Extract route name from href
    const routeName = href?.replace("/", "") || "";

    // Check if this is a protected route and not already authenticated
    if (protectedRoutes[routeName] && !authenticatedTabs.has(routeName)) {
      // Prevent default navigation
      event?.preventDefault();

      setPendingRoute(routeName);
      setShowPasswordModal(true);
      return;
    }

    // For non-protected routes or already authenticated routes, proceed normally
    if (onPress) {
      onPress(event);
    }
  };

  const handlePasswordSuccess = (enteredPassword) => {
    const config = protectedRoutes[pendingRoute];

    if (enteredPassword === config?.correctPassword) {
      // Mark this tab as authenticated
      authenticatedTabs.add(pendingRoute);
      setShowPasswordModal(false);

      // Navigate to the protected route
      router.push(`/${pendingRoute}`);

      Alert.alert("Access Granted", `Welcome to ${config.title}`);
    } else {
      Alert.alert("Access Denied", "Incorrect password. Please try again.", [
        {
          text: "Try Again",
          onPress: () => setShowPasswordModal(true),
        },
        {
          text: "Cancel",
          onPress: () => {
            setShowPasswordModal(false);
            setPendingRoute(null);
          },
          style: "cancel",
        },
      ]);
    }
  };

  const handleModalClose = () => {
    setShowPasswordModal(false);
    setPendingRoute(null);
  };

  return (
    <>
      <HapticTab
        {...props}
        accessibilityState={accessibilityState}
        onPress={handleTabPress}
      >
        {children}
      </HapticTab>

      <PasswordModal
        visible={showPasswordModal}
        onClose={handleModalClose}
        onSuccess={handlePasswordSuccess}
        title={protectedRoutes[pendingRoute]?.title || ""}
        description={protectedRoutes[pendingRoute]?.description || ""}
      />
    </>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: CustomTabButton,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            position: "absolute",
          },
          default: {},
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="entry"
        options={{
          title: "Diesel Entry",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="plus.circle.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: "Inventory",
          tabBarIcon: ({ color }) => (
            <View style={styles.protectedTabIcon}>
              <IconSymbol size={28} name="cylinder.fill" color={color} />
              {!authenticatedTabs.has("inventory") && (
                <IconSymbol
                  size={12}
                  name="lock.fill"
                  color={color}
                  style={styles.lockIcon}
                />
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="warning" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="chart.bar.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          tabBarIcon: ({ color }) => (
            <View style={styles.protectedTabIcon}>
              <IconSymbol size={28} name="gear.circle.fill" color={color} />
              {!authenticatedTabs.has("admin") && (
                <IconSymbol
                  size={12}
                  name="lock.fill"
                  color={color}
                  style={styles.lockIcon}
                />
              )}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Protected tab icon styles
  protectedTabIcon: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  lockIcon: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "white",
    borderRadius: 8,
    padding: 1,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    width: "85%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    marginTop: 10,
    marginBottom: 5,
  },
  modalDescription: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  modalContent: {
    marginBottom: 25,
  },
  passwordLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  passwordInput: {
    borderWidth: 2,
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    backgroundColor: "#f8f9fa",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 15,
  },
  button: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f8f9fa",
    borderWidth: 2,
    borderColor: "#dee2e6",
  },
  cancelButtonText: {
    color: "#6c757d",
    fontSize: 16,
    fontWeight: "600",
  },
  submitButton: {
    // backgroundColor will be set dynamically
  },
  submitButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.6,
  },
});
