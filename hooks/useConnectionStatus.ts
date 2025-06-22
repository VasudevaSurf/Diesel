// hooks/useConnectionStatus.ts
import { useState, useEffect, useCallback } from "react";
import {
  DieselService,
  ConnectionStatus,
  QueuedItem,
} from "@/services/DieselService";

interface UseConnectionStatusReturn {
  connectionStatus: ConnectionStatus;
  queueStatus: {
    count: number;
    items: QueuedItem[];
  };
  isOnline: boolean;
  isConnectedToBackend: boolean;
  refreshConnection: () => Promise<void>;
  retryQueue: () => Promise<void>;
  clearQueue: () => Promise<void>;
}

export function useConnectionStatus(): UseConnectionStatusReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    DieselService.getConnectionStatus()
  );
  const [queueStatus, setQueueStatus] = useState({
    count: 0,
    items: [] as QueuedItem[],
  });

  const updateStatus = useCallback(() => {
    setConnectionStatus(DieselService.getConnectionStatus());
    setQueueStatus(DieselService.getOfflineQueueStatus());
  }, []);

  const refreshConnection = useCallback(async () => {
    await DieselService.checkConnection();
    updateStatus();
  }, [updateStatus]);

  const retryQueue = useCallback(async () => {
    await DieselService.retryFailedItems();
    updateStatus();
  }, [updateStatus]);

  const clearQueue = useCallback(async () => {
    await DieselService.clearOfflineQueue();
    updateStatus();
  }, [updateStatus]);

  useEffect(() => {
    // Update status immediately
    updateStatus();

    // Set up periodic updates
    const interval = setInterval(updateStatus, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [updateStatus]);

  return {
    connectionStatus,
    queueStatus,
    isOnline: connectionStatus.isInternetReachable,
    isConnectedToBackend: connectionStatus.isConnected,
    refreshConnection,
    retryQueue,
    clearQueue,
  };
}
