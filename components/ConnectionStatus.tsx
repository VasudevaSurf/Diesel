// components/ConnectionStatus.tsx
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface ConnectionStatusProps {
  showDetails?: boolean;
  compact?: boolean;
}

export function ConnectionStatus({
  showDetails = false,
  compact = false,
}: ConnectionStatusProps) {
  const colorScheme = useColorScheme();
  const {
    connectionStatus,
    queueStatus,
    isOnline,
    isConnectedToBackend,
    refreshConnection,
    retryQueue,
    clearQueue,
  } = useConnectionStatus();

  const getStatusColor = () => {
    if (isConnectedToBackend) return "#28a745";
    if (isOnline) return "#ffc107";
    return "#dc3545";
  };

  const getStatusText = () => {
    if (isConnectedToBackend) return "✅ Connected";
    if (isOnline) return "⚠️ Backend Offline";
    return "❌ No Internet";
  };

  const getStatusIcon = () => {
    if (isConnectedToBackend) return "house.fill"; // Using existing icon
    if (isOnline) return "plus.circle.fill"; // Using existing icon
    return "xmark.circle.fill"; // This should already be mapped
  };

  const handleStatusPress = () => {
    if (showDetails) {
      const details = [
        `Internet: ${isOnline ? "Connected" : "Disconnected"}`,
        `Backend: ${isConnectedToBackend ? "Connected" : "Disconnected"}`,
        `Network: ${connectionStatus.networkType || "Unknown"}`,
        `Queue: ${queueStatus.count} items`,
        `Last Check: ${new Date(
          connectionStatus.lastChecked
        ).toLocaleTimeString()}`,
      ];

      if (connectionStatus.latency) {
        details.push(`Latency: ${connectionStatus.latency}ms`);
      }

      if (connectionStatus.error) {
        details.push(`Error: ${connectionStatus.error}`);
      }

      Alert.alert("Connection Details", details.join("\n"), [
        { text: "Refresh", onPress: refreshConnection },
        { text: "OK", style: "cancel" },
      ]);
    } else {
      refreshConnection();
    }
  };

  const handleQueuePress = () => {
    if (queueStatus.count === 0) {
      Alert.alert("Queue Empty", "No items in offline queue.");
      return;
    }

    const queueDetails = queueStatus.items
      .slice(0, 5)
      .map(
        (item, index) =>
          `${index + 1}. ${item.type} (${item.retryCount}/${
            item.maxRetries
          } attempts)`
      )
      .join("\n");

    const message = `${queueStatus.count} items in queue:\n\n${queueDetails}${
      queueStatus.count > 5 ? `\n\n...and ${queueStatus.count - 5} more` : ""
    }`;

    Alert.alert("Offline Queue", message, [
      { text: "Retry Now", onPress: retryQueue },
      { text: "Clear Queue", onPress: clearQueue, style: "destructive" },
      { text: "Close", style: "cancel" },
    ]);
  };

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactContainer, { backgroundColor: getStatusColor() }]}
        onPress={handleStatusPress}
      >
        <IconSymbol name={getStatusIcon()} size={16} color="white" />
        {queueStatus.count > 0 && (
          <View style={styles.queueBadge}>
            <Text style={styles.queueBadgeText}>{queueStatus.count}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]}
        onPress={handleStatusPress}
      >
        <IconSymbol name={getStatusIcon()} size={16} color="white" />
        <Text style={styles.statusText}>{getStatusText()}</Text>
      </TouchableOpacity>

      {queueStatus.count > 0 && (
        <TouchableOpacity
          style={[
            styles.queueIndicator,
            { backgroundColor: Colors[colorScheme ?? "light"].tint },
          ]}
          onPress={handleQueuePress}
        >
          <IconSymbol name="clock" size={14} color="white" />
          <Text style={styles.queueText}>{queueStatus.count} queued</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statusText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  queueIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  queueText: {
    color: "white",
    fontSize: 11,
    fontWeight: "600",
  },
  compactContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  queueBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#dc3545",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  queueBadgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
});
