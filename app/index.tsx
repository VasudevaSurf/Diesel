// Enhanced Home Screen with FIXED Connection Status Display
import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Alert,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
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
  underWorked?: any[];
  lowEfficiency?: any[];
}

interface LoadingState {
  machines: boolean;
  inventory: boolean;
  alerts: boolean;
  connection: boolean;
  initialLoad: boolean;
}

interface DataState {
  machines: number;
  inventory: number;
  alerts: AlertData;
  lastUpdate: string;
  dataSource: "live" | "cached" | "demo";
  freshness: {
    machines: { age: number; source: string };
    inventory: { age: number; source: string };
    logs: { age: number; source: string };
    alerts: { age: number; source: string };
  };
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();

  // Loading states
  const [loading, setLoading] = useState<LoadingState>({
    machines: true,
    inventory: true,
    alerts: true,
    connection: true,
    initialLoad: true,
  });

  // Data states
  const [dataState, setDataState] = useState<DataState>({
    machines: 0,
    inventory: 0,
    alerts: {
      overConsumption: [],
      idleMachines: [],
      underWorked: [],
      lowEfficiency: [],
    },
    lastUpdate: "",
    dataSource: "demo",
    freshness: {
      machines: { age: -1, source: "demo" },
      inventory: { age: -1, source: "demo" },
      logs: { age: -1, source: "demo" },
      alerts: { age: -1, source: "demo" },
    },
  });

  // Connection status with stability tracking
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: false,
    isInternetReachable: false,
    lastChecked: new Date().toISOString(),
    hasRealData: false,
  });

  // UI states
  const [refreshing, setRefreshing] = useState(false);
  const [showLoadingDetails, setShowLoadingDetails] = useState(true);
  const [lastConnectionChange, setLastConnectionChange] = useState<number>(0);
  const [stableConnectionStatus, setStableConnectionStatus] =
    useState<string>("");

  // FIXED: Stable connection status tracking
  const updateStableConnectionStatus = useCallback(
    (status: ConnectionStatus) => {
      const now = Date.now();
      const statusKey = `${status.isConnected}_${status.isInternetReachable}_${status.hasRealData}`;

      // Only update if enough time has passed since last change (prevent flickering)
      if (now - lastConnectionChange > 2000) {
        let newStatus = "";

        if (status.isConnected && status.isInternetReachable) {
          newStatus = "✅ Live Data";
        } else if (status.isInternetReachable) {
          newStatus = "⚠️ Backend Offline";
        } else {
          newStatus = "❌ No Internet";
        }

        if (newStatus !== stableConnectionStatus) {
          console.log(
            `📊 Stable status change: ${stableConnectionStatus} → ${newStatus}`
          );
          setStableConnectionStatus(newStatus);
          setLastConnectionChange(now);
        }
      }
    },
    [lastConnectionChange, stableConnectionStatus]
  );

  // FIXED: Stable data source determination
  const determineDataSource = useCallback(
    (status: ConnectionStatus): "live" | "cached" | "demo" => {
      if (status.isConnected && status.isInternetReachable) {
        // Only show as live if we actually have a stable backend connection
        const enhancedStatus = status as any;
        if (enhancedStatus.connectionStable !== false) {
          return "live";
        }
      }

      if (status.hasRealData) {
        return "cached";
      }

      return "demo";
    },
    []
  );

  useEffect(() => {
    initializeApp();

    // Subscribe to connection changes with debouncing
    const unsubscribe = DieselService.addConnectionListener((status) => {
      console.log("🏠 Connection status received:", {
        isConnected: status.isConnected,
        isInternetReachable: status.isInternetReachable,
        hasRealData: status.hasRealData,
        stable: (status as any).connectionStable,
      });

      setConnectionStatus(status);
      updateStableConnectionStatus(status);

      // Update loading state
      setLoading((prev) => ({ ...prev, connection: false }));

      // Determine data source based on stable connection
      const newDataSource = determineDataSource(status);
      setDataState((prev) => ({
        ...prev,
        dataSource: newDataSource,
      }));

      // Get data freshness information
      const freshness = DieselService.getDataFreshness();
      setDataState((prev) => ({
        ...prev,
        freshness,
      }));

      // If connection is truly stable and we have queue items, show a subtle indicator
      const enhancedStatus = status as any;
      if (
        enhancedStatus.isConnected &&
        enhancedStatus.isInternetReachable &&
        enhancedStatus.connectionStable &&
        !loading.initialLoad
      ) {
        const queueStatus = DieselService.getOfflineQueueStatus();
        if (queueStatus.count > 0) {
          console.log(
            `⚡ Stable connection with ${queueStatus.count} items in queue`
          );
          // Could show a sync indicator here
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [updateStableConnectionStatus, determineDataSource, loading.initialLoad]);

  const initializeApp = async () => {
    console.log("🚀 Initializing app...");

    try {
      // Show loading screen for minimum time for better UX
      const startTime = Date.now();

      // Get initial connection status
      const initialStatus = DieselService.getConnectionStatus();
      setConnectionStatus(initialStatus);
      updateStableConnectionStatus(initialStatus);
      setLoading((prev) => ({ ...prev, connection: false }));

      // Load dashboard data
      await loadDashboardData(false);

      // Ensure minimum loading time
      const loadTime = Date.now() - startTime;
      if (loadTime < 1500) {
        // Slightly increased for stability
        await new Promise((resolve) => setTimeout(resolve, 1500 - loadTime));
      }

      setLoading((prev) => ({ ...prev, initialLoad: false }));

      // Hide loading details after delay
      setTimeout(() => {
        setShowLoadingDetails(false);
      }, 4000); // Increased delay
    } catch (error) {
      console.error("❌ Error initializing app:", error);
      setLoading({
        machines: false,
        inventory: false,
        alerts: false,
        connection: false,
        initialLoad: false,
      });
    }
  };

  const loadDashboardData = async (isRefresh: boolean = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
        console.log("🔄 Refreshing dashboard data...");
      } else {
        console.log("📊 Loading dashboard data...");
      }

      // Load machines
      setLoading((prev) => ({ ...prev, machines: true }));
      const machinesData = await DieselService.getMachines();
      setDataState((prev) => ({
        ...prev,
        machines: machinesData.length,
      }));
      setLoading((prev) => ({ ...prev, machines: false }));
      console.log(`✅ Loaded ${machinesData.length} machines`);

      // Load inventory
      setLoading((prev) => ({ ...prev, inventory: true }));
      const inventoryData = await DieselService.getInventory();
      setDataState((prev) => ({
        ...prev,
        inventory: inventoryData.currentStock || 0,
      }));
      setLoading((prev) => ({ ...prev, inventory: false }));
      console.log(`✅ Loaded inventory: ${inventoryData.currentStock}L`);

      // Load alerts
      setLoading((prev) => ({ ...prev, alerts: true }));
      const alertsData = await DieselService.getAlertsData();

      // Get updated data source and freshness
      const currentStatus = DieselService.getConnectionStatus();
      const currentDataSource = determineDataSource(currentStatus);
      const freshness = DieselService.getDataFreshness();

      setDataState((prev) => ({
        ...prev,
        alerts: alertsData.alerts || {
          overConsumption: [],
          idleMachines: [],
          underWorked: [],
          lowEfficiency: [],
        },
        lastUpdate: new Date().toLocaleTimeString(),
        dataSource: currentDataSource,
        freshness,
      }));
      setLoading((prev) => ({ ...prev, alerts: false }));
      console.log(`✅ Loaded alerts data (source: ${currentDataSource})`);

      if (isRefresh) {
        // Show success feedback for manual refresh
        console.log("✨ Dashboard refresh completed");
      }
    } catch (error) {
      console.error("❌ Error loading dashboard data:", error);

      if (isRefresh) {
        Alert.alert(
          "⚠️ Refresh Failed",
          "Unable to refresh data. Using cached data.",
          [{ text: "OK" }]
        );
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleManualRefresh = async () => {
    console.log("🔄 Manual refresh requested");

    try {
      // Force connection check first
      await DieselService.checkConnection();

      // Wait a moment for connection status to stabilize
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Then reload data
      await loadDashboardData(true);
    } catch (error) {
      console.error("❌ Manual refresh failed:", error);
      Alert.alert(
        "⚠️ Refresh Failed",
        "Unable to refresh data. Please try again.",
        [{ text: "OK" }]
      );
    }
  };

  // FIXED: Stable connection status colors
  const getConnectionStatusColor = () => {
    if (loading.connection) return "#6c757d"; // Gray for loading

    if (connectionStatus.isConnected && connectionStatus.isInternetReachable) {
      return "#28a745"; // Green - fully connected
    } else if (connectionStatus.isInternetReachable) {
      return "#ffc107"; // Yellow - internet but no backend
    } else {
      return "#dc3545"; // Red - no internet
    }
  };

  // FIXED: Use stable connection status
  const getConnectionStatusText = () => {
    if (loading.connection) return "🔄 Checking...";
    return stableConnectionStatus || "❓ Unknown";
  };

  // FIXED: Stable data source text
  const getDataSourceText = () => {
    if (loading.initialLoad) return "🔄 Loading...";

    const source = dataState.dataSource;
    switch (source) {
      case "live":
        return "🌐 Live Data";
      case "cached":
        return "📱 Cached Data";
      case "demo":
        return "🎭 Demo Mode";
      default:
        return "📊 Unknown";
    }
  };

  // FIXED: Helper to get data age display
  const getDataAge = (ageMs: number): string => {
    if (ageMs < 0) return "Never";

    const seconds = Math.floor(ageMs / 1000);
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const getTotalAlerts = () => {
    return (
      dataState.alerts.overConsumption.length +
      dataState.alerts.idleMachines.length +
      (dataState.alerts.underWorked?.length || 0) +
      (dataState.alerts.lowEfficiency?.length || 0)
    );
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
      subtitle: loading.inventory
        ? "Loading..."
        : `Current stock: ${dataState.inventory.toFixed(1)}L`,
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
      subtitle: loading.alerts
        ? "Loading..."
        : `${getTotalAlerts()} active alerts`,
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
    if (!loading.initialLoad) {
      router.push(route as any);
    }
  };

  // Show loading screen during initial load
  if (loading.initialLoad) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

        {/* App Logo/Title */}
        <View style={styles.loadingHeader}>
          <Text style={styles.loadingTitle}>🏗️ Diesel Tracker Pro</Text>
          <Text style={styles.loadingSubtitle}>
            Enhanced Machine Management
          </Text>
        </View>

        {/* Loading Animation */}
        <View style={styles.loadingContent}>
          <ActivityIndicator
            size="large"
            color={Colors[colorScheme ?? "light"].tint}
            style={styles.loadingSpinner}
          />

          {showLoadingDetails && (
            <View style={styles.loadingDetails}>
              <Text style={styles.loadingText}>
                Initializing application...
              </Text>

              <View style={styles.loadingSteps}>
                <LoadingStep
                  label="Connection Status"
                  isLoading={loading.connection}
                  isComplete={!loading.connection}
                />
                <LoadingStep
                  label="Machine Data"
                  isLoading={loading.machines}
                  isComplete={!loading.machines}
                />
                <LoadingStep
                  label="Inventory Data"
                  isLoading={loading.inventory}
                  isComplete={!loading.inventory}
                />
                <LoadingStep
                  label="Alerts Data"
                  isLoading={loading.alerts}
                  isComplete={!loading.alerts}
                />
              </View>
            </View>
          )}
        </View>

        {/* Connection Status */}
        <View style={styles.loadingFooter}>
          <View
            style={[
              styles.loadingStatusIndicator,
              { backgroundColor: getConnectionStatusColor() },
            ]}
          >
            <Text style={styles.loadingStatusText}>
              {getConnectionStatusText()}
            </Text>
          </View>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

      {/* Header with Stable Status */}
      <View
        style={[
          styles.header,
          { backgroundColor: Colors[colorScheme ?? "light"].tint },
        ]}
      >
        {/* Alert Badge */}
        {getTotalAlerts() > 0 && !loading.alerts && (
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

        {/* FIXED: Stable Connection Status */}
        <TouchableOpacity
          style={[
            styles.statusIndicator,
            { backgroundColor: getConnectionStatusColor() },
          ]}
          onPress={handleManualRefresh}
          activeOpacity={0.8}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Text style={styles.statusText}>{getConnectionStatusText()}</Text>
              {connectionStatus.latency && (
                <Text style={styles.latencyText}>
                  {connectionStatus.latency}ms
                </Text>
              )}
            </>
          )}
        </TouchableOpacity>

        {/* FIXED: Stable Data Source Indicator */}
        <View style={styles.dataSourceIndicator}>
          <Text style={styles.dataSourceText}>{getDataSourceText()}</Text>
          {dataState.lastUpdate && (
            <Text style={styles.lastRefreshText}>
              Updated: {dataState.lastUpdate}
            </Text>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleManualRefresh}
            colors={[Colors[colorScheme ?? "light"].tint]}
            tintColor={Colors[colorScheme ?? "light"].tint}
            title="Pull to refresh data"
            titleColor={Colors[colorScheme ?? "light"].text}
          />
        }
      >
        {/* FIXED: Enhanced Connection Details Card */}
        <View style={styles.connectionCard}>
          <View style={styles.connectionHeader}>
            <Text style={styles.connectionTitle}>System Status</Text>
            <TouchableOpacity
              onPress={handleManualRefresh}
              style={styles.refreshButton}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size={16} color="#666" />
              ) : (
                <IconSymbol name="refresh" size={16} color="#666" />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.connectionDetails}>
            <View style={styles.connectionRow}>
              <Text style={styles.connectionLabel}>Internet:</Text>
              <View style={styles.connectionValueContainer}>
                {loading.connection ? (
                  <ActivityIndicator size={12} color="#666" />
                ) : (
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
                )}
              </View>
            </View>

            <View style={styles.connectionRow}>
              <Text style={styles.connectionLabel}>Backend:</Text>
              <View style={styles.connectionValueContainer}>
                {loading.connection ? (
                  <ActivityIndicator size={12} color="#666" />
                ) : (
                  <Text
                    style={[
                      styles.connectionValue,
                      {
                        color: connectionStatus.isConnected
                          ? "#28a745"
                          : "#dc3545",
                      },
                    ]}
                  >
                    {connectionStatus.isConnected
                      ? "Connected"
                      : "Disconnected"}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.connectionRow}>
              <Text style={styles.connectionLabel}>Data Source:</Text>
              <Text style={styles.connectionValue}>{getDataSourceText()}</Text>
            </View>

            {/* NEW: Data Freshness Information */}
            <View style={styles.connectionRow}>
              <Text style={styles.connectionLabel}>Data Age:</Text>
              <Text style={[styles.connectionValue, { fontSize: 12 }]}>
                M:{getDataAge(dataState.freshness.machines.age)} | I:
                {getDataAge(dataState.freshness.inventory.age)} | A:
                {getDataAge(dataState.freshness.alerts.age)}
              </Text>
            </View>

            {connectionStatus.error && (
              <View style={styles.connectionRow}>
                <Text style={styles.connectionLabel}>Status:</Text>
                <Text
                  style={[
                    styles.connectionValue,
                    { color: "#dc3545", fontSize: 12 },
                  ]}
                >
                  {connectionStatus.error}
                </Text>
              </View>
            )}

            {/* NEW: Queue Status */}
            {(() => {
              const queueStatus = DieselService.getOfflineQueueStatus();
              if (queueStatus.count > 0) {
                return (
                  <View style={styles.connectionRow}>
                    <Text style={styles.connectionLabel}>Queue:</Text>
                    <Text
                      style={[styles.connectionValue, { color: "#fd7e14" }]}
                    >
                      {queueStatus.count} pending
                    </Text>
                  </View>
                );
              }
              return null;
            })()}
          </View>
        </View>

        {/* Quick Stats with Loading States */}
        <View style={styles.statsContainer}>
          <StatCard
            value={loading.machines ? null : dataState.machines}
            label="Machines"
            color="#4CAF50"
            isLoading={loading.machines}
          />
          <StatCard
            value={
              loading.inventory ? null : `${dataState.inventory.toFixed(0)}L`
            }
            label="Fuel Stock"
            color="#9C27B0"
            isLoading={loading.inventory}
          />
          <StatCard
            value={
              loading.alerts ? null : dataState.alerts.overConsumption.length
            }
            label="Over Usage"
            color="#dc3545"
            isLoading={loading.alerts}
          />
          <StatCard
            value={loading.alerts ? null : dataState.alerts.idleMachines.length}
            label="Idle Machines"
            color="#fd7e14"
            isLoading={loading.alerts}
          />
        </View>

        {/* Navigation Grid */}
        <View style={styles.navigationGrid}>
          {navigationItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.navCard,
                { opacity: item.disabled || loading.initialLoad ? 0.6 : 1 },
              ]}
              onPress={() => !item.disabled && handleNavigation(item.route)}
              disabled={item.disabled || loading.initialLoad}
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
        {!loading.alerts && getTotalAlerts() > 0 && (
          <View style={styles.alertsSection}>
            <ThemedText style={styles.sectionTitle}>
              🚨 Recent Alerts
            </ThemedText>

            {dataState.alerts.overConsumption
              .slice(0, 3)
              .map((alert, index) => (
                <View
                  key={`over-${index}`}
                  style={[styles.alertItem, { borderLeftColor: "#dc3545" }]}
                >
                  <Text style={styles.alertText}>
                    ⚠️ {alert.machine} exceeded fuel limit (+{alert.mismatch}
                    L/hr)
                  </Text>
                </View>
              ))}

            {dataState.alerts.idleMachines.slice(0, 3).map((alert, index) => (
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

            {getTotalAlerts() > 6 && (
              <TouchableOpacity
                style={styles.viewAllAlertsButton}
                onPress={() => handleNavigation("/alerts")}
              >
                <Text style={styles.viewAllAlertsText}>
                  View All {getTotalAlerts()} Alerts →
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Footer Info */}
        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>
            Version 3.0+ Stable Connection Edition
          </ThemedText>
          <ThemedText style={styles.footerText}>
            {dataState.dataSource === "live"
              ? "Production Ready"
              : dataState.dataSource === "cached"
              ? "Cached Mode"
              : "Demo Mode Active"}
          </ThemedText>
          {dataState.lastUpdate && (
            <ThemedText style={styles.footerText}>
              Last Updated: {dataState.lastUpdate}
            </ThemedText>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

// Helper Components
const LoadingStep = ({
  label,
  isLoading,
  isComplete,
}: {
  label: string;
  isLoading: boolean;
  isComplete: boolean;
}) => (
  <View style={styles.loadingStep}>
    <View style={styles.loadingStepIcon}>
      {isLoading ? (
        <ActivityIndicator size={16} color="#007bff" />
      ) : isComplete ? (
        <IconSymbol name="checkmark.circle" size={16} color="#28a745" />
      ) : (
        <View style={styles.loadingStepDot} />
      )}
    </View>
    <Text
      style={[
        styles.loadingStepText,
        { color: isComplete ? "#28a745" : isLoading ? "#007bff" : "#666" },
      ]}
    >
      {label}
    </Text>
  </View>
);

const StatCard = ({
  value,
  label,
  color,
  isLoading,
}: {
  value: string | number | null;
  label: string;
  color: string;
  isLoading: boolean;
}) => (
  <View style={[styles.statCard, { backgroundColor: color }]}>
    {isLoading ? (
      <ActivityIndicator size="small" color="white" />
    ) : (
      <Text style={styles.statNumber}>{value}</Text>
    )}
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  // Loading Screen Styles
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  loadingHeader: {
    alignItems: "center",
    marginBottom: 50,
  },
  loadingTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 10,
  },
  loadingSubtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  loadingContent: {
    alignItems: "center",
    marginBottom: 50,
  },
  loadingSpinner: {
    marginBottom: 30,
  },
  loadingDetails: {
    alignItems: "center",
    width: "100%",
  },
  loadingText: {
    fontSize: 16,
    color: "#333",
    marginBottom: 20,
    textAlign: "center",
  },
  loadingSteps: {
    width: "100%",
    maxWidth: 300,
  },
  loadingStep: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  loadingStepIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingStepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ccc",
  },
  loadingStepText: {
    fontSize: 14,
    flex: 1,
  },
  loadingFooter: {
    alignItems: "center",
  },
  loadingStatusIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  loadingStatusText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },

  // Main Screen Styles
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
    minHeight: 36,
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
    minWidth: 32,
    minHeight: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  connectionDetails: {
    gap: 8,
  },
  connectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 24,
  },
  connectionLabel: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  connectionValueContainer: {
    minWidth: 24,
    alignItems: "flex-end",
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
    minHeight: 80,
    justifyContent: "center",
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
  viewAllAlertsButton: {
    backgroundColor: "#f8f9fa",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  viewAllAlertsText: {
    fontSize: 14,
    color: "#007bff",
    fontWeight: "600",
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
    marginBottom: 4,
  },
});
