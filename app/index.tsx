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
import { DieselService, ConnectionStatus } from "@/services/DieselService";

const { width } = Dimensions.get("window");

interface AlertData {
  overConsumption: any[];
  idleMachines: any[];
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();

  // Real-time connection status
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: false,
    isInternetReachable: false,
    lastChecked: new Date().toISOString(),
    hasRealData: false,
  });

  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [totalMachines, setTotalMachines] = useState<number>(0);
  const [alerts, setAlerts] = useState<AlertData>({
    overConsumption: [],
    idleMachines: [],
  });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  useEffect(() => {
    // Subscribe to real-time connection status updates
    const unsubscribe = DieselService.addConnectionListener((status) => {
      console.log("🏠 Home screen received connection update:", status);
      setConnectionStatus(status);

      // If connection is restored, refresh data
      if (status.isConnected && status.isInternetReachable) {
        console.log("🔄 Connection restored, refreshing data...");
        loadDashboardData();
      }
    });

    // Initial data load
    initializeApp();

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
    };
  }, []);

  const initializeApp = async () => {
    try {
      setLoading(true);

      // Get initial connection status
      const initialStatus = DieselService.getConnectionStatus();
      setConnectionStatus(initialStatus);

      // Load dashboard data
      await loadDashboardData();
    } catch (error) {
      console.error("Error initializing app:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      console.log("📊 Loading dashboard data...");

      const [machines, inventory, alertsData] = await Promise.all([
        DieselService.getMachines(),
        DieselService.getInventory(),
        DieselService.getAlertsData(),
      ]);

      setTotalMachines(machines.length);
      setCurrentBalance(inventory.currentStock || 0);
      setAlerts(alertsData.alerts || { overConsumption: [], idleMachines: [] });
      setLastRefresh(new Date().toLocaleTimeString());

      console.log(
        `✅ Dashboard loaded: ${machines.length} machines, ${inventory.currentStock}L fuel`
      );
    } catch (error) {
      console.error("Error loading dashboard data:", error);

      // Fallback to cached/demo data
      setTotalMachines(3);
      setCurrentBalance(475);
      setAlerts({
        overConsumption: [{ machine: "JCB-12", mismatch: 1.2 }],
        idleMachines: [{ machine: "CAT-09", mismatch: -3 }],
      });
    }
  };

  const handleRefresh = async () => {
    console.log("🔄 Manual refresh requested");

    // Force connection check
    await DieselService.checkConnection();

    // Reload data
    await loadDashboardData();
  };

  const getConnectionStatusColor = () => {
    if (connectionStatus.isConnected && connectionStatus.isInternetReachable) {
      return "#28a745"; // Green - fully connected
    } else if (connectionStatus.isInternetReachable) {
      return "#ffc107"; // Yellow - internet but no backend
    } else {
      return "#dc3545"; // Red - no internet
    }
  };

  const getConnectionStatusText = () => {
    if (connectionStatus.isConnected && connectionStatus.isInternetReachable) {
      return "✅ Backend Connected";
    } else if (connectionStatus.isInternetReachable) {
      return "⚠️ Backend Offline";
    } else {
      return "❌ No Internet";
    }
  };

  const getDataSourceIndicator = () => {
    if (connectionStatus.isConnected) {
      return "🌐 Live Data";
    } else if (connectionStatus.hasRealData) {
      return "📱 Cached Data";
    } else {
      return "🎭 Demo Mode";
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
      title: "Alerts",
      subtitle: `${getTotalAlerts()} active alerts`,
      icon: "warning",
      color: "#FF9800",
      route: "/alerts",
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
    router.push(route as any);
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

      {/* Header with Real-time Connection Status */}
      <View
        style={[
          styles.header,
          { backgroundColor: Colors[colorScheme ?? "light"].tint },
        ]}
      >
        {/* Alert Badge */}
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

        {/* Real-time Connection Status */}
        <TouchableOpacity
          style={[
            styles.statusIndicator,
            { backgroundColor: getConnectionStatusColor() },
          ]}
          onPress={handleRefresh}
          activeOpacity={0.8}
        >
          <Text style={styles.statusText}>{getConnectionStatusText()}</Text>
          {connectionStatus.latency && (
            <Text style={styles.latencyText}>{connectionStatus.latency}ms</Text>
          )}
        </TouchableOpacity>

        {/* Data Source Indicator */}
        <View style={styles.dataSourceIndicator}>
          <Text style={styles.dataSourceText}>{getDataSourceIndicator()}</Text>
          {lastRefresh && (
            <Text style={styles.lastRefreshText}>Updated: {lastRefresh}</Text>
          )}
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Connection Details Card */}
        <View style={styles.connectionCard}>
          <View style={styles.connectionHeader}>
            <Text style={styles.connectionTitle}>Connection Status</Text>
            <TouchableOpacity
              onPress={handleRefresh}
              style={styles.refreshButton}
            >
              <IconSymbol name="refresh" size={16} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.connectionDetails}>
            <View style={styles.connectionRow}>
              <Text style={styles.connectionLabel}>Internet:</Text>
              <Text
                style={[
                  styles.connectionValue,
                  {
                    color: connectionStatus.isInternetReachable
                      ? "#28a745"
                      : "#dc3545",
                  },
                ]}
              >
                {connectionStatus.isInternetReachable
                  ? "Connected"
                  : "Disconnected"}
              </Text>
            </View>

            <View style={styles.connectionRow}>
              <Text style={styles.connectionLabel}>Backend:</Text>
              <Text
                style={[
                  styles.connectionValue,
                  {
                    color: connectionStatus.isConnected ? "#28a745" : "#dc3545",
                  },
                ]}
              >
                {connectionStatus.isConnected ? "Connected" : "Disconnected"}
              </Text>
            </View>

            <View style={styles.connectionRow}>
              <Text style={styles.connectionLabel}>Network:</Text>
              <Text style={styles.connectionValue}>
                {connectionStatus.networkType || "Unknown"}
              </Text>
            </View>

            {connectionStatus.error && (
              <View style={styles.connectionRow}>
                <Text style={styles.connectionLabel}>Error:</Text>
                <Text style={[styles.connectionValue, { color: "#dc3545" }]}>
                  {connectionStatus.error}
                </Text>
              </View>
            )}
          </View>
        </View>

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
            Version 3.0+ Real-time Edition
          </ThemedText>
          <ThemedText style={styles.footerText}>
            {connectionStatus.isConnected
              ? "Production Ready"
              : connectionStatus.hasRealData
              ? "Cached Mode"
              : "Demo Mode Active"}
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
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  latencyText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 12,
  },
  dataSourceIndicator: {
    marginTop: 8,
    alignItems: "center",
  },
  dataSourceText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 12,
    fontWeight: "500",
  },
  lastRefreshText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 11,
    marginTop: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  connectionCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 15,
    marginTop: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  connectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  connectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  refreshButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#f8f9fa",
  },
  connectionDetails: {
    gap: 8,
  },
  connectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  connectionLabel: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  connectionValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
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
