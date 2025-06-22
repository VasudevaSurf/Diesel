import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Alert,
  Dimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { DieselService } from "@/services/DieselService";

const { width } = Dimensions.get("window");

interface AlertData {
  overConsumption: any[];
  idleMachines: any[];
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const [connectionStatus, setConnectionStatus] = useState<
    "checking" | "connected" | "offline"
  >("checking");
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [totalMachines, setTotalMachines] = useState<number>(0);
  const [alerts, setAlerts] = useState<AlertData>({
    overConsumption: [],
    idleMachines: [],
  });

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Check backend connection
      const isConnected = await DieselService.checkConnection();
      setConnectionStatus(isConnected ? "connected" : "offline");

      if (isConnected) {
        // Load dashboard data
        const [machines, inventory, alertsData] = await Promise.all([
          DieselService.getMachines(),
          DieselService.getInventory(),
          DieselService.getAlertsData(),
        ]);

        setTotalMachines(machines.length);
        setCurrentBalance(inventory.currentStock || 0);
        setAlerts(
          alertsData.alerts || { overConsumption: [], idleMachines: [] }
        );
      } else {
        // Demo mode data
        setTotalMachines(3);
        setCurrentBalance(475);
        setAlerts({
          overConsumption: [{ machine: "JCB-12", mismatch: 1.2 }],
          idleMachines: [{ machine: "CAT-09", mismatch: -3 }],
        });
      }
    } catch (error) {
      console.error("Error initializing app:", error);
      setConnectionStatus("offline");
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "#28a745";
      case "offline":
        return "#dc3545";
      default:
        return "#ffc107";
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case "connected":
        return "✅ Backend Connected";
      case "offline":
        return "❌ Offline Mode";
      default:
        return "🔄 Checking Connection...";
    }
  };

  const getTotalAlerts = () => {
    return alerts.overConsumption.length + alerts.idleMachines.length;
  };

  const navigationItems = [
    {
      title: "Diesel Entry",
      subtitle: "Record daily fuel consumption",
      icon: "plus.circle.fill",
      color: "#4CAF50",
      route: "/entry",
      disabled: false,
    },
    {
      title: "Inventory",
      subtitle: `Current stock: ${currentBalance.toFixed(1)}L`,
      icon: "cylinder.fill",
      color: "#9C27B0",
      route: "/inventory",
      disabled: false,
    },
    {
      title: "Reports",
      subtitle: "Logs, analytics & exports",
      icon: "chart.bar.fill",
      color: "#2196F3",
      route: "/reports",
      disabled: false,
    },
    {
      title: "Admin Panel",
      subtitle: "Manage machines & settings",
      icon: "gear.circle.fill",
      color: "#FF9800",
      route: "/admin",
      disabled: false,
    },
  ];

  const handleNavigation = (route: string) => {
    if (route === "/admin") {
      Alert.prompt(
        "Admin Access",
        "Enter admin password:",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "OK",
            onPress: (password) => {
              if (password === "admin123") {
                router.push(route as any);
              } else {
                Alert.alert("Error", "Incorrect password!");
              }
            },
          },
        ],
        "secure-text"
      );
    } else if (route === "/inventory") {
      Alert.prompt(
        "Inventory Access",
        "Enter inventory password:",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "OK",
            onPress: (password) => {
              if (password === "inventory456") {
                router.push(route as any);
              } else {
                Alert.alert("Error", "Incorrect inventory password!");
              }
            },
          },
        ],
        "secure-text"
      );
    } else {
      router.push(route as any);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: Colors[colorScheme ?? "light"].tint },
        ]}
      >
        {getTotalAlerts() > 0 && (
          <View style={styles.alertBadge}>
            <Text style={styles.alertBadgeText}>
              🚨 {getTotalAlerts()} Alerts
            </Text>
          </View>
        )}

        <ThemedText style={styles.headerTitle}>
          🏗️ Diesel Tracker Pro
        </ThemedText>
        <ThemedText style={styles.headerSubtitle}>
          ✨ Enhanced Machine Management | 📊 Smart Reports
        </ThemedText>

        <View
          style={[
            styles.statusIndicator,
            { backgroundColor: getConnectionStatusColor() },
          ]}
        >
          <Text style={styles.statusText}>{getConnectionStatusText()}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: "#4CAF50" }]}>
            <Text style={styles.statNumber}>{totalMachines}</Text>
            <Text style={styles.statLabel}>Machines</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: "#9C27B0" }]}>
            <Text style={styles.statNumber}>{currentBalance.toFixed(0)}L</Text>
            <Text style={styles.statLabel}>Fuel Stock</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: "#dc3545" }]}>
            <Text style={styles.statNumber}>
              {alerts.overConsumption.length}
            </Text>
            <Text style={styles.statLabel}>Over Usage</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: "#fd7e14" }]}>
            <Text style={styles.statNumber}>{alerts.idleMachines.length}</Text>
            <Text style={styles.statLabel}>Idle Machines</Text>
          </View>
        </View>

        {/* Navigation Grid */}
        <View style={styles.navigationGrid}>
          {navigationItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.navCard, { opacity: item.disabled ? 0.6 : 1 }]}
              onPress={() => !item.disabled && handleNavigation(item.route)}
              disabled={item.disabled}
            >
              <View
                style={[
                  styles.navIconContainer,
                  { backgroundColor: item.color },
                ]}
              >
                <IconSymbol name={item.icon as any} size={32} color="white" />
              </View>

              <View style={styles.navTextContainer}>
                <ThemedText style={styles.navTitle}>{item.title}</ThemedText>
                <ThemedText style={styles.navSubtitle}>
                  {item.subtitle}
                </ThemedText>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Alerts Section */}
        {getTotalAlerts() > 0 && (
          <View style={styles.alertsSection}>
            <ThemedText style={styles.sectionTitle}>
              🚨 Recent Alerts
            </ThemedText>

            {alerts.overConsumption.map((alert, index) => (
              <View
                key={`over-${index}`}
                style={[styles.alertItem, { borderLeftColor: "#dc3545" }]}
              >
                <Text style={styles.alertText}>
                  ⚠️ {alert.machine} exceeded fuel limit (+{alert.mismatch}L/hr)
                </Text>
              </View>
            ))}

            {alerts.idleMachines.map((alert, index) => (
              <View
                key={`idle-${index}`}
                style={[styles.alertItem, { borderLeftColor: "#fd7e14" }]}
              >
                <Text style={styles.alertText}>
                  💤 {alert.machine} was idle ({alert.mismatch}hrs below
                  expected)
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer Info */}
        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>
            Version 2.9+ Enhanced Edition
          </ThemedText>
          <ThemedText style={styles.footerText}>
            {connectionStatus === "offline"
              ? "Demo Mode Active"
              : "Production Ready"}
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    position: "relative",
  },
  alertBadge: {
    position: "absolute",
    top: 50,
    right: 20,
    backgroundColor: "#dc3545",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  alertBadgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "center",
    marginTop: 5,
  },
  statusIndicator: {
    marginTop: 15,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "center",
  },
  statusText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 30,
  },
  statCard: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    marginHorizontal: 3,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
  },
  statLabel: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.9)",
    marginTop: 5,
    textAlign: "center",
  },
  navigationGrid: {
    gap: 15,
  },
  navCard: {
    flexDirection: "row",
    padding: 20,
    borderRadius: 15,
    backgroundColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    alignItems: "center",
  },
  navIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  navTextContainer: {
    flex: 1,
  },
  navTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  navSubtitle: {
    fontSize: 14,
    opacity: 0.7,
  },
  alertsSection: {
    marginTop: 30,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },
  alertItem: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  alertText: {
    fontSize: 14,
    color: "#333",
  },
  footer: {
    alignItems: "center",
    paddingVertical: 20,
    marginTop: 20,
  },
  footerText: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: "center",
  },
});
