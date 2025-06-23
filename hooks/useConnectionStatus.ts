// hooks/useConnectionStatus.ts
import { useState, useEffect } from "react";
import { DieselService, ConnectionStatus } from "@/services/DieselService";

export function useConnectionStatus() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: false,
    isInternetReachable: false,
    lastChecked: new Date().toISOString(),
    hasRealData: false,
  });

  useEffect(() => {
    // Get initial status
    const initialStatus = DieselService.getConnectionStatus();
    setConnectionStatus(initialStatus);

    // Subscribe to real-time updates
    const unsubscribe = DieselService.addConnectionListener((status) => {
      console.log("🔄 Connection status updated:", status);
      setConnectionStatus(status);
    });

    // Cleanup subscription
    return unsubscribe;
  }, []);

  const refreshConnection = async () => {
    await DieselService.checkConnection();
  };

  const getStatusColor = () => {
    if (connectionStatus.isConnected && connectionStatus.isInternetReachable) {
      return "#28a745"; // Green - fully connected
    } else if (connectionStatus.isInternetReachable) {
      return "#ffc107"; // Yellow - internet but no backend
    } else {
      return "#dc3545"; // Red - no internet
    }
  };

  const getStatusText = () => {
    if (connectionStatus.isConnected && connectionStatus.isInternetReachable) {
      return "✅ Connected";
    } else if (connectionStatus.isInternetReachable) {
      return "⚠️ Backend Offline";
    } else {
      return "❌ No Internet";
    }
  };

  const getDataSourceText = () => {
    if (connectionStatus.isConnected) {
      return "🌐 Live Data";
    } else if (connectionStatus.hasRealData) {
      return "📱 Cached Data";
    } else {
      return "🎭 Demo Mode";
    }
  };

  const isOnline = connectionStatus.isInternetReachable;
  const isConnectedToBackend = connectionStatus.isConnected;
  const hasRealData = connectionStatus.hasRealData;

  return {
    connectionStatus,
    isOnline,
    isConnectedToBackend,
    hasRealData,
    refreshConnection,
    getStatusColor,
    getStatusText,
    getDataSourceText,
  };
}
