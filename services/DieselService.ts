// Enhanced DieselService.ts - FIXED Connection Management and Stable Data States
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Network from "expo-network";

// Configuration
const CONFIG = {
  APPS_SCRIPT_URL:
    "https://script.google.com/macros/s/AKfycbxXBRh7D7kZMrFbZfANGg_BXYJp2ibDRdM_YOCRgr9Nt39Fvn6HPvFK1MbmASG6zjSs/exec",
  ADMIN_PASSWORD: "admin123",
  INVENTORY_PASSWORD: "inventory456",
  TIMEOUT: 15000, // Increased to 15 seconds for better stability
  RETRY_ATTEMPTS: 3,
  CACHE_DURATION: 10 * 60 * 1000, // Increased to 10 minutes
  SYNC_INTERVAL: 60000, // Increased to 60 seconds to reduce flickering
  CONNECTION_CHECK_INTERVAL: 5000, // Increased to 5 seconds
  BACKEND_CHECK_INTERVAL: 10000, // New: separate interval for backend checks
  PING_CHECK_INTERVAL: 2000, // Reduced frequency for backup monitoring
  CONNECTION_STABILITY_DELAY: 3000, // New: wait before changing connection status
};

// Storage Keys
const STORAGE_KEYS = {
  MACHINES: "@diesel_tracker:machines",
  LOGS: "@diesel_tracker:logs",
  INVENTORY: "@diesel_tracker:inventory",
  CONNECTION_STATUS: "@diesel_tracker:connection_status",
  LAST_SYNC: "@diesel_tracker:last_sync",
  USER_SETTINGS: "@diesel_tracker:user_settings",
  OFFLINE_QUEUE: "@diesel_tracker:offline_queue",
  PENDING_ENTRIES: "@diesel_tracker:pending_entries",
  PENDING_INVENTORY: "@diesel_tracker:pending_inventory",
  PENDING_MACHINES: "@diesel_tracker:pending_machines",
  CACHED_DATA_TIMESTAMP: "@diesel_tracker:cached_data_timestamp",
  HAS_REAL_DATA: "@diesel_tracker:has_real_data",
  ALERTS: "@diesel_tracker:alerts",
  MISMATCH_DATA: "@diesel_tracker:mismatch_data",
  // New: Connection stability tracking
  CONNECTION_HISTORY: "@diesel_tracker:connection_history",
  LAST_SUCCESSFUL_FETCH: "@diesel_tracker:last_successful_fetch",
};

const DEBUG_MODE = __DEV__;

// Global event listeners for real-time updates
const connectionListeners: ((status: ConnectionStatus) => void)[] = [];

// Types
export interface LoadingState {
  isLoading: boolean;
  operation: string;
  progress?: number;
  message?: string;
  startTime?: number;
}

export interface EnhancedConnectionStatus extends ConnectionStatus {
  loadingState?: LoadingState;
  lastDataFetch?: {
    machines: string;
    inventory: string;
    logs: string;
    alerts: string;
  };
  // New: Connection stability tracking
  connectionStable?: boolean;
  lastStableConnection?: string;
  consecutiveFailures?: number;
  backendRetryCount?: number;
}

const loadingListeners: ((state: LoadingState) => void)[] = [];

export interface Machine {
  name: string;
  plate: string;
  lastReading?: number;
  machineType?: "L/hr" | "KM/l";
  ownershipType?: "Own" | "Rental";
  standardAvgDiesel?: number;
  expectedDailyHours?: number;
  doorNo?: string;
  remarks?: string;
  dateAdded?: string;
  initialReading?: number;
  id?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DieselEntry {
  id?: string;
  machineName: string;
  startReading: number;
  endReading: number;
  dieselFilled: number;
  remarks: string;
  phoneNumber: string;
  imageURL?: string;
  timestamp?: string;
  usage?: number;
  rate?: number;
  machineType?: string;
  consumptionMismatch?: number;
  hoursMismatch?: number;
  standardAvg?: number;
  expectedDaily?: number;
  createdAt?: string;
  updatedAt?: string;
  // Dispenser readings
  dispenserStartReading?: number;
  dispenserEndReading?: number;
  // Warning flags
  hasWarnings?: boolean;
  warningTypes?: string[];
  warningMessages?: string[];
}

export interface InventoryEntry {
  id?: string;
  litersReceived: number;
  receiptNumber?: string;
  remarks?: string;
  receiptImage?: string;
  phoneNumber: string;
  timestamp?: string;
  type?: "IN" | "OUT";
  createdAt?: string;
  updatedAt?: string;
}

export interface QueuedItem {
  id: string;
  type:
    | "entry"
    | "inventory"
    | "machine"
    | "machineUpdate"
    | "machineDelete"
    | "alertUpdate";
  data: any;
  timestamp: string;
  retryCount: number;
  maxRetries: number;
  priority: number;
}

export interface AlertData {
  overConsumption: OverConsumptionAlert[];
  idleMachines: IdleMachineAlert[];
  underWorked?: UnderWorkedAlert[];
  lowEfficiency?: LowEfficiencyAlert[];
}

export interface OverConsumptionAlert {
  machine: string;
  plate?: string;
  standardAvg: number;
  actualAvg: number;
  mismatch: number;
  timestamp: string;
  severity: "low" | "medium" | "high" | "critical";
  machineType: string;
  ownershipType: string;
  unit: string;
  description: string;
}

export interface IdleMachineAlert {
  machine: string;
  plate?: string;
  expectedHours: number;
  actualHours: number;
  mismatch: number;
  timestamp: string;
  severity: "low" | "medium" | "high" | "critical";
  machineType: string;
  ownershipType: string;
  unit: string;
  description: string;
}

export interface UnderWorkedAlert {
  machine: string;
  plate?: string;
  expectedHours: number;
  actualHours: number;
  mismatch: number;
  timestamp: string;
  severity: "low" | "medium" | "high" | "critical";
  machineType: string;
  ownershipType: string;
  unit: string;
  description: string;
}

export interface LowEfficiencyAlert {
  machine: string;
  plate?: string;
  standardAvg: number;
  actualAvg: number;
  mismatch: number;
  timestamp: string;
  severity: "low" | "medium" | "high" | "critical";
  machineType: string;
  ownershipType: string;
  unit: string;
  description: string;
}

export interface MismatchData {
  id: string;
  machineName: string;
  plate: string;
  machineType: string;
  timestamp: string;
  consumptionMismatch: number;
  hoursMismatch: number;
  standardConsumption: number;
  actualConsumption: number;
  standardHours: number;
  actualHours: number;
  severity: "low" | "medium" | "high" | "critical";
  warningTypes: string[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  machines?: Machine[];
  logs?: DieselEntry[];
  currentStock?: number;
  transactions?: InventoryEntry[];
  alerts?: AlertData;
  imageURL?: string;
  error?: string;
  timestamp?: string;
  hasLogs?: boolean;
  requiresConfirmation?: boolean;
  deletedMachine?: any;
  hasWarnings?: boolean;
  warningMessages?: string[];
  warningTypes?: string[];
  allowSubmitWithWarnings?: boolean;
}

export interface ConnectionStatus {
  isConnected: boolean;
  isInternetReachable: boolean;
  lastChecked: string;
  latency?: number;
  error?: string;
  networkType?: string;
  networkState?: string;
  hasRealData: boolean;
}

export interface EnhancedAlertData {
  recent: AlertItem[];
  weekly: AlertItem[];
  monthly: AlertItem[];
  overConsumption: AlertItem[];
  lowEfficiency: AlertItem[];
  idleMachines: AlertItem[];
  underWorked: AlertItem[];
  maintenanceDue: AlertItem[];
  unusualPatterns: AlertItem[];
  summary: {
    total: number;
    high: number;
    medium: number;
    low: number;
    critical: number;
  };
}

export interface AlertItem {
  id: string;
  timestamp: string;
  machine: string;
  plate?: string;
  alertType:
    | "OVER_CONSUMPTION"
    | "LOW_EFFICIENCY"
    | "IDLE_MACHINE"
    | "UNDER_WORKED"
    | "MAINTENANCE_DUE"
    | "UNUSUAL_PATTERN";
  severity: "low" | "medium" | "high" | "critical";
  standardValue: number;
  actualValue: number;
  mismatch: number;
  unit: string;
  description: string;
  machineType: string;
  ownershipType: string;
  status: "active" | "resolved" | "acknowledged";
  expectedHours?: number;
  actualHours?: number;
  consumptionMismatch?: number;
  hoursMismatch?: number;
  mismatchDisplay?: string;
}

export interface MachinePerformanceAnalytics {
  machine: string;
  plate: string;
  machineType: string;
  ownershipType: string;
  totalEntries: number;
  avgDailyUsage: number;
  avgConsumptionRate: number;
  totalUsage: number;
  totalDiesel: number;
  efficiencyTrend: "improving" | "declining" | "stable" | "no-data";
  alertRisk: "low" | "medium" | "high";
  recommendations: string[];
  standardValues: {
    expectedDaily: number;
    standardConsumption: number;
  };
}

class EnhancedDieselServiceClass {
  private connectionStatus: EnhancedConnectionStatus = {
    isConnected: false,
    isInternetReachable: false,
    lastChecked: new Date().toISOString(),
    hasRealData: false,
    loadingState: { isLoading: false, operation: "idle" },
    lastDataFetch: {
      machines: "",
      inventory: "",
      logs: "",
      alerts: "",
    },
    // New stability tracking
    connectionStable: false,
    lastStableConnection: "",
    consecutiveFailures: 0,
    backendRetryCount: 0,
  };

  private currentLoadingState: LoadingState = {
    isLoading: false,
    operation: "idle",
  };

  private offlineQueue: QueuedItem[] = [];
  private isProcessingQueue: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private backendCheckInterval: NodeJS.Timeout | null = null;
  private realTimeCheckInterval: NodeJS.Timeout | null = null;
  private netInfoUnsubscribe: (() => void) | null = null;
  private lastNetworkState: any = null;
  private isInitialized: boolean = false;

  // New: Connection stability tracking
  private connectionStabilityTimeout: NodeJS.Timeout | null = null;
  private lastBackendSuccess: number = 0;
  private pendingConnectionChange: {
    isConnected: boolean;
    timestamp: number;
  } | null = null;

  constructor() {
    this.initializeService();
  }

  addLoadingListener(callback: (state: LoadingState) => void): () => void {
    loadingListeners.push(callback);
    callback(this.currentLoadingState);

    return () => {
      const index = loadingListeners.indexOf(callback);
      if (index > -1) {
        loadingListeners.splice(index, 1);
      }
    };
  }

  private notifyLoadingListeners(): void {
    loadingListeners.forEach((listener) => {
      try {
        listener(this.currentLoadingState);
      } catch (error) {
        console.error("Error in loading listener:", error);
      }
    });
  }

  private setLoadingState(
    isLoading: boolean,
    operation: string,
    message?: string,
    progress?: number
  ): void {
    this.currentLoadingState = {
      isLoading,
      operation,
      message,
      progress,
      startTime: isLoading ? Date.now() : this.currentLoadingState.startTime,
    };

    this.connectionStatus.loadingState = this.currentLoadingState;

    if (DEBUG_MODE) {
      console.log(
        `🔄 Loading: ${operation} - ${isLoading ? "Started" : "Completed"}${
          message ? ` (${message})` : ""
        }${progress ? ` - ${progress}%` : ""}`
      );
    }

    this.notifyLoadingListeners();
  }

  addConnectionListener(
    callback: (status: ConnectionStatus) => void
  ): () => void {
    connectionListeners.push(callback);
    callback(this.connectionStatus);

    return () => {
      const index = connectionListeners.indexOf(callback);
      if (index > -1) {
        connectionListeners.splice(index, 1);
      }
    };
  }

  private notifyConnectionListeners(): void {
    connectionListeners.forEach((listener) => {
      try {
        listener(this.connectionStatus);
      } catch (error) {
        console.error("Error in connection listener:", error);
      }
    });
  }

  // FIXED: Enhanced initialization with stable monitoring
  private async initializeService(): Promise<void> {
    try {
      console.log(
        "🚀 Initializing Enhanced DieselService with stable monitoring..."
      );

      // Load cached data first
      await this.loadCachedData();

      // Start network monitoring with stability checks
      this.startStableNetworkMonitoring();

      // Start connection checking with proper intervals
      this.startStableConnectionChecking();

      // Start auto-sync with reduced frequency
      this.startAutoSync();

      // Initial connection check (non-blocking with stability)
      this.performStableInitialCheck();

      this.isInitialized = true;
      console.log(
        "✅ Enhanced DieselService initialized with stable monitoring"
      );
    } catch (error) {
      console.error("❌ Failed to initialize service:", error);
      this.isInitialized = true;
    }
  }

  private async loadCachedData(): Promise<void> {
    try {
      // Load connection status but mark as disconnected initially
      const cachedStatus = await this.getCachedData<EnhancedConnectionStatus>(
        STORAGE_KEYS.CONNECTION_STATUS
      );
      if (cachedStatus) {
        this.connectionStatus = {
          ...cachedStatus,
          isConnected: false, // Always start disconnected
          isInternetReachable: false, // Will be updated by monitoring
          lastChecked: new Date().toISOString(),
          connectionStable: false, // Reset stability
          consecutiveFailures: 0,
          backendRetryCount: 0,
        };
      }

      // Check if we have real data cached
      const hasRealData = await this.getCachedData<boolean>(
        STORAGE_KEYS.HAS_REAL_DATA
      );
      this.connectionStatus.hasRealData = hasRealData || false;

      // Load offline queue
      const cachedQueue = await this.getCachedData<QueuedItem[]>(
        STORAGE_KEYS.OFFLINE_QUEUE
      );
      if (cachedQueue) {
        this.offlineQueue = cachedQueue;
      }

      // Load last successful fetch timestamp
      const lastSuccessfulFetch = await this.getCachedData<number>(
        STORAGE_KEYS.LAST_SUCCESSFUL_FETCH
      );
      if (lastSuccessfulFetch) {
        this.lastBackendSuccess = lastSuccessfulFetch;
      }

      console.log(
        `💾 Loaded cache - Has real data: ${
          this.connectionStatus.hasRealData
        }, Queue: ${this.offlineQueue.length} items, Last success: ${new Date(
          this.lastBackendSuccess
        ).toLocaleString()}`
      );
    } catch (error) {
      console.error("❌ Failed to load cached data:", error);
    }
  }

  // FIXED: Stable network monitoring with reduced sensitivity
  private startStableNetworkMonitoring(): void {
    console.log("🔥 Starting STABLE network monitoring...");

    try {
      // Primary monitoring with NetInfo
      this.netInfoUnsubscribe = NetInfo.addEventListener((state) => {
        console.log("📡 Network state detected:", {
          type: state.type,
          isConnected: state.isConnected,
          isInternetReachable: state.isInternetReachable,
          timestamp: new Date().toISOString(),
        });

        this.handleNetworkStateChangeStable(state);
      });

      // Get initial state
      NetInfo.fetch()
        .then((state) => {
          console.log("📊 Initial network state:", state);
          this.handleNetworkStateChangeStable(state);
        })
        .catch((error) => {
          console.error("❌ Failed to get initial NetInfo state:", error);
          this.fallbackToExpoNetworkingStable();
        });
    } catch (error) {
      console.error("❌ NetInfo setup failed, using stable fallback:", error);
      this.fallbackToExpoNetworkingStable();
    }

    // Reduced frequency backup monitoring
    this.realTimeCheckInterval = setInterval(async () => {
      try {
        const expoState = await Network.getNetworkStateAsync();

        // Only update if there's a significant change
        if (
          expoState.isInternetReachable !==
          this.connectionStatus.isInternetReachable
        ) {
          console.log("⚡ BACKUP: Significant network change detected");
          this.handleNetworkStateChangeStable(expoState);
        }
      } catch (error) {
        // Silent error for backup monitoring
      }
    }, CONFIG.PING_CHECK_INTERVAL);
  }

  // FIXED: Stable fallback networking
  private fallbackToExpoNetworkingStable(): void {
    console.log("🔄 Using Expo Network as stable primary monitoring...");

    this.realTimeCheckInterval = setInterval(async () => {
      try {
        const networkState = await Network.getNetworkStateAsync();

        const currentStateKey = `${networkState.type}_${networkState.isConnected}_${networkState.isInternetReachable}`;
        const lastStateKey = this.lastNetworkState
          ? `${this.lastNetworkState.type}_${this.lastNetworkState.isConnected}_${this.lastNetworkState.isInternetReachable}`
          : null;

        // Only process if state actually changed
        if (currentStateKey !== lastStateKey) {
          console.log("🔄 Stable network state changed (Expo):", {
            from: this.lastNetworkState,
            to: networkState,
            timestamp: new Date().toISOString(),
          });

          this.handleNetworkStateChangeStable(networkState);
          this.lastNetworkState = networkState;
        }
      } catch (error) {
        console.error("❌ Error in stable Expo network monitoring:", error);
      }
    }, CONFIG.PING_CHECK_INTERVAL);
  }

  // FIXED: Stable network state change handler
  private handleNetworkStateChangeStable(state: any): void {
    const wasInternetReachable = this.connectionStatus.isInternetReachable;

    // Update internet status immediately but backend status with stability
    this.connectionStatus = {
      ...this.connectionStatus,
      isInternetReachable: state.isInternetReachable ?? false,
      networkType: state.type,
      networkState: `${state.type}_${state.isConnected}_${state.isInternetReachable}`,
      lastChecked: new Date().toISOString(),
    };

    // Handle internet connectivity changes
    if (wasInternetReachable !== state.isInternetReachable) {
      if (state.isInternetReachable) {
        console.log("🌟 INTERNET RESTORED! Starting backend verification...");
        this.connectionStatus.error = undefined;
        this.connectionStatus.consecutiveFailures = 0;

        // Start backend verification with stability delay
        this.scheduleStableBackendCheck();

        // FIXED: Also schedule queue processing check after connection is restored
        setTimeout(() => {
          if (
            this.connectionStatus.isConnected &&
            this.connectionStatus.connectionStable &&
            this.offlineQueue.length > 0
          ) {
            console.log("🔄 Connection restored, checking offline queue...");
            this.processOfflineQueue();
          }
        }, 5000); // Give some time for backend connection to stabilize
      } else {
        console.log("❌ INTERNET LOST! Going offline...");
        this.markBackendDisconnected("No internet connection");
      }
    }

    // Always cache and notify for network changes
    this.cacheData(STORAGE_KEYS.CONNECTION_STATUS, this.connectionStatus);
    this.notifyConnectionListeners();
  }

  // NEW: Schedule stable backend check with delay
  private scheduleStableBackendCheck(): void {
    // Clear any pending connection change
    if (this.connectionStabilityTimeout) {
      clearTimeout(this.connectionStabilityTimeout);
    }

    // Schedule backend check after stability delay
    this.connectionStabilityTimeout = setTimeout(async () => {
      if (this.connectionStatus.isInternetReachable) {
        console.log("🔍 Performing delayed stable backend check...");
        const isBackendConnected = await this.checkBackendConnectionStable();

        if (isBackendConnected && this.offlineQueue.length > 0) {
          console.log("⚡ Backend verified stable! Processing queue...");
          setTimeout(() => this.processOfflineQueue(), 1000);
        }
      }
    }, CONFIG.CONNECTION_STABILITY_DELAY);
  }

  // FIXED: Stable connection checking with separate intervals
  private startStableConnectionChecking(): void {
    // Internet connectivity monitoring (frequent but stable)
    this.connectionCheckInterval = setInterval(async () => {
      try {
        const networkState = await NetInfo.fetch();
        if (!networkState.isInternetReachable) {
          if (this.connectionStatus.isConnected) {
            console.log("⚠️ Internet lost, marking backend as disconnected");
            this.markBackendDisconnected("Internet connection lost");
          }
        }
      } catch (error) {
        console.error("❌ Error checking internet connectivity:", error);
      }
    }, CONFIG.CONNECTION_CHECK_INTERVAL);

    // Backend connectivity monitoring (less frequent, more stable)
    this.backendCheckInterval = setInterval(async () => {
      // Only check backend if we have internet
      if (this.connectionStatus.isInternetReachable) {
        // Check if we should verify backend connection
        const timeSinceLastSuccess = Date.now() - this.lastBackendSuccess;

        // Only check backend if:
        // 1. We're not currently connected, OR
        // 2. It's been a while since last successful connection
        if (
          !this.connectionStatus.isConnected ||
          timeSinceLastSuccess > CONFIG.BACKEND_CHECK_INTERVAL * 2
        ) {
          const wasConnected = this.connectionStatus.isConnected;
          const isConnected = await this.checkBackendConnectionStable();

          // Only notify if connection status actually changed
          if (wasConnected !== isConnected) {
            console.log(
              `🔄 Backend connection changed: ${wasConnected} → ${isConnected}`
            );
            this.notifyConnectionListeners();
          }
        }
      }
    }, CONFIG.BACKEND_CHECK_INTERVAL);
  }

  // NEW: Mark backend as disconnected with proper error handling
  private markBackendDisconnected(reason: string): void {
    const wasConnected = this.connectionStatus.isConnected;

    this.connectionStatus = {
      ...this.connectionStatus,
      isConnected: false,
      error: reason,
      connectionStable: false,
      consecutiveFailures: (this.connectionStatus.consecutiveFailures || 0) + 1,
      lastChecked: new Date().toISOString(),
    };

    if (wasConnected) {
      console.log(`❌ Backend marked as disconnected: ${reason}`);
      this.cacheData(STORAGE_KEYS.CONNECTION_STATUS, this.connectionStatus);
      this.notifyConnectionListeners();
    }
  }

  private startAutoSync(): void {
    this.syncInterval = setInterval(async () => {
      if (
        this.connectionStatus.isConnected &&
        this.connectionStatus.isInternetReachable &&
        this.connectionStatus.connectionStable &&
        this.offlineQueue.length > 0
      ) {
        console.log("🔄 Auto-sync: Processing offline queue...");
        await this.processOfflineQueue();
      }
    }, CONFIG.SYNC_INTERVAL);
  }

  // FIXED: Stable initial connection check
  private async performStableInitialCheck(): Promise<void> {
    console.log("🔍 Performing stable initial connection check...");

    try {
      // Get current network state with timeout
      let networkState;
      try {
        const networkPromise = NetInfo.fetch();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("NetInfo timeout")), 5000)
        );

        networkState = await Promise.race([networkPromise, timeoutPromise]);
      } catch (error) {
        console.log("⚠️ NetInfo fetch failed, using Expo Network...");
        networkState = await Network.getNetworkStateAsync();
      }

      console.log("📶 Initial network state:", networkState);

      // Update internet status
      this.connectionStatus = {
        ...this.connectionStatus,
        isInternetReachable: networkState.isInternetReachable ?? false,
        networkType: networkState.type,
        lastChecked: new Date().toISOString(),
      };

      // Check backend only if we have internet
      if (networkState.isInternetReachable) {
        console.log("🔗 Internet available, checking backend...");

        // Add delay for stability
        setTimeout(async () => {
          const isBackendConnected = await this.checkBackendConnectionStable();
          console.log(
            `🔗 Initial backend check: ${
              isBackendConnected ? "✅ Connected" : "❌ Failed"
            }`
          );
        }, 2000);
      } else {
        console.log("❌ No internet connection on startup");
        this.connectionStatus.isConnected = false;
        this.connectionStatus.error = "No internet connection";
      }

      // Cache and notify
      await this.cacheData(
        STORAGE_KEYS.CONNECTION_STATUS,
        this.connectionStatus
      );
      this.notifyConnectionListeners();
    } catch (error) {
      console.error("❌ Initial connection check failed:", error);
      this.connectionStatus = {
        ...this.connectionStatus,
        isConnected: false,
        isInternetReachable: false,
        error:
          error instanceof Error ? error.message : "Connection check failed",
        lastChecked: new Date().toISOString(),
      };
      await this.cacheData(
        STORAGE_KEYS.CONNECTION_STATUS,
        this.connectionStatus
      );
      this.notifyConnectionListeners();
    }
  }

  // Manual connection check (can be called by UI)
  async checkConnection(): Promise<boolean> {
    this.setLoadingState(true, "checkConnection", "Checking connection...");
    console.log("🔍 Manual connection check requested...");

    try {
      this.setLoadingState(
        true,
        "checkConnection",
        "Checking network status...",
        25
      );

      // Get current network state
      let netInfoState;
      try {
        netInfoState = await NetInfo.fetch();
      } catch (error) {
        console.log("⚠️ NetInfo failed, using Expo Network fallback...");
        const expoState = await Network.getNetworkStateAsync();
        netInfoState = {
          type: expoState.type,
          isConnected: expoState.isConnected,
          isInternetReachable: expoState.isInternetReachable,
        };
      }

      console.log("📶 Current network state:", netInfoState);

      if (!netInfoState.isInternetReachable) {
        this.markBackendDisconnected("No internet connection");
        this.setLoadingState(
          false,
          "checkConnection",
          "No internet connection"
        );
        console.log("❌ No internet connection");
        return false;
      }

      this.setLoadingState(
        true,
        "checkConnection",
        "Internet available, checking backend...",
        60
      );

      // Update internet status
      this.connectionStatus.isInternetReachable = true;
      this.connectionStatus.networkType = netInfoState.type;
      this.connectionStatus.error = undefined;

      // Check backend connection with stability
      this.setLoadingState(
        true,
        "checkConnection",
        "Testing backend connection...",
        80
      );
      const isConnected = await this.checkBackendConnectionStable();

      this.setLoadingState(
        false,
        "checkConnection",
        isConnected ? "Connected to backend" : "Backend unavailable"
      );

      this.notifyConnectionListeners();
      return isConnected;
    } catch (error) {
      console.error("❌ Connection check failed:", error);
      this.markBackendDisconnected(
        error instanceof Error ? error.message : "Unknown error"
      );
      this.setLoadingState(false, "checkConnection", "Connection check failed");
      return false;
    }
  }

  getCurrentLoadingState(): LoadingState {
    return { ...this.currentLoadingState };
  }

  isOperationLoading(operation: string): boolean {
    return (
      this.currentLoadingState.isLoading &&
      this.currentLoadingState.operation === operation
    );
  }

  clearLoadingState(): void {
    this.setLoadingState(false, "idle");
  }

  getDataFreshness(): { [key: string]: { age: number; source: string } } {
    const now = Date.now();
    const lastFetch = this.connectionStatus.lastDataFetch || {};

    return {
      machines: {
        age: lastFetch.machines
          ? now - new Date(lastFetch.machines).getTime()
          : -1,
        source: this.connectionStatus.hasRealData
          ? this.connectionStatus.isConnected &&
            this.connectionStatus.connectionStable
            ? "live"
            : "cached"
          : "demo",
      },
      inventory: {
        age: lastFetch.inventory
          ? now - new Date(lastFetch.inventory).getTime()
          : -1,
        source: this.connectionStatus.hasRealData
          ? this.connectionStatus.isConnected &&
            this.connectionStatus.connectionStable
            ? "live"
            : "cached"
          : "demo",
      },
      logs: {
        age: lastFetch.logs ? now - new Date(lastFetch.logs).getTime() : -1,
        source: this.connectionStatus.hasRealData
          ? this.connectionStatus.isConnected &&
            this.connectionStatus.connectionStable
            ? "live"
            : "cached"
          : "demo",
      },
      alerts: {
        age: lastFetch.alerts ? now - new Date(lastFetch.alerts).getTime() : -1,
        source: this.connectionStatus.hasRealData
          ? this.connectionStatus.isConnected &&
            this.connectionStatus.connectionStable
            ? "live"
            : "cached"
          : "demo",
      },
    };
  }

  // FIXED: Stable backend connection checking
  private async checkBackendConnectionStable(): Promise<boolean> {
    const startTime = Date.now();

    try {
      const testUrl = `${
        CONFIG.APPS_SCRIPT_URL
      }?action=testBackend&timestamp=${Date.now()}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

      const response = await fetch(testUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;

      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          // SUCCESS: Update connection status with stability
          const wasConnected = this.connectionStatus.isConnected;

          this.lastBackendSuccess = Date.now();

          this.connectionStatus = {
            ...this.connectionStatus,
            isConnected: true,
            connectionStable: true,
            lastStableConnection: new Date().toISOString(),
            consecutiveFailures: 0,
            backendRetryCount: 0,
            lastChecked: new Date().toISOString(),
            latency,
            error: undefined,
          };

          // Cache success state
          await this.cacheData(
            STORAGE_KEYS.CONNECTION_STATUS,
            this.connectionStatus
          );
          await this.cacheData(
            STORAGE_KEYS.LAST_SUCCESSFUL_FETCH,
            this.lastBackendSuccess
          );

          console.log(`✅ Backend connected and stable (${latency}ms)`);

          // If we just connected and have items in queue, process them
          if (!wasConnected && this.offlineQueue.length > 0) {
            console.log(
              "🚀 Backend connection restored, scheduling queue processing..."
            );
            setTimeout(() => this.processOfflineQueue(), 2000); // Add delay for stability
          }

          return true;
        } else {
          throw new Error(
            `Backend returned HTML instead of JSON. Content-Type: ${contentType}`
          );
        }
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      console.log(`❌ Backend connection failed: ${errorMessage}`);

      // Update failure tracking
      this.connectionStatus = {
        ...this.connectionStatus,
        isConnected: false,
        connectionStable: false,
        consecutiveFailures:
          (this.connectionStatus.consecutiveFailures || 0) + 1,
        backendRetryCount: (this.connectionStatus.backendRetryCount || 0) + 1,
        lastChecked: new Date().toISOString(),
        error: errorMessage,
      };

      await this.cacheData(
        STORAGE_KEYS.CONNECTION_STATUS,
        this.connectionStatus
      );
      return false;
    }
  }

  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  // FIXED: Enhanced data retrieval with stable connection checking
  async getMachines(): Promise<Machine[]> {
    this.setLoadingState(true, "machines", "Loading machine data...");

    try {
      console.log(
        `📋 Getting machines... (Connected: ${this.connectionStatus.isConnected}, Stable: ${this.connectionStatus.connectionStable}, Internet: ${this.connectionStatus.isInternetReachable})`
      );

      // Use cached data if not connected OR not stable
      if (
        !this.connectionStatus.isConnected ||
        !this.connectionStatus.isInternetReachable ||
        !this.connectionStatus.connectionStable
      ) {
        console.log("📱 Using cached/offline data for machines");
        this.setLoadingState(true, "machines", "Loading from cache...", 50);

        const cached = await this.getCachedData<Machine[]>(
          STORAGE_KEYS.MACHINES
        );

        if (cached && cached.length > 0) {
          console.log(`✅ Returning ${cached.length} cached machines`);
          this.connectionStatus.lastDataFetch!.machines =
            new Date().toISOString();
          this.setLoadingState(
            false,
            "machines",
            `Loaded ${cached.length} machines from cache`
          );
          return cached;
        } else if (this.connectionStatus.hasRealData) {
          console.log("⚠️ No cached machines but should have real data");
          this.setLoadingState(false, "machines", "No cached data available");
          return [];
        } else {
          console.log("🎭 No cached data, returning demo machines");
          const mockData = this.getMockMachines();
          this.setLoadingState(
            false,
            "machines",
            `Loaded ${mockData.length} demo machines`
          );
          return mockData;
        }
      }

      // Try to fetch from backend
      console.log("📡 Fetching machines from backend...");
      this.setLoadingState(true, "machines", "Connecting to server...", 25);

      const response = await this.makeRequest<{ machines: Machine[] }>(
        `${CONFIG.APPS_SCRIPT_URL}?action=getMachines&timestamp=${Date.now()}`
      );

      this.setLoadingState(true, "machines", "Processing response...", 75);

      if (response.success && response.machines) {
        console.log(
          `✅ Fetched ${response.machines.length} machines from backend`
        );

        // Cache the data
        await this.cacheData(STORAGE_KEYS.MACHINES, response.machines);

        // Mark that we have real data
        this.connectionStatus.hasRealData = true;
        this.connectionStatus.lastDataFetch!.machines =
          new Date().toISOString();
        await this.cacheData(STORAGE_KEYS.HAS_REAL_DATA, true);
        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );

        this.setLoadingState(
          false,
          "machines",
          `Loaded ${response.machines.length} machines from server`
        );
        return response.machines;
      } else {
        throw new Error(response.message || "Failed to fetch machines");
      }
    } catch (error) {
      console.error("❌ Error fetching machines:", error);
      this.setLoadingState(
        true,
        "machines",
        "Server error, checking cache...",
        60
      );

      // Try to return cached data
      const cached = await this.getCachedData<Machine[]>(STORAGE_KEYS.MACHINES);
      if (cached && cached.length > 0) {
        console.log(`📱 Fallback to ${cached.length} cached machines`);
        this.setLoadingState(
          false,
          "machines",
          `Loaded ${cached.length} machines from cache (offline)`
        );
        return cached;
      }

      // Only return mock data if we've never had real data
      if (!this.connectionStatus.hasRealData) {
        console.log("🎭 Fallback to demo machines (no real data ever fetched)");
        const mockData = this.getMockMachines();
        this.setLoadingState(
          false,
          "machines",
          `Loaded ${mockData.length} demo machines (first time)`
        );
        return mockData;
      }

      console.log("📭 No machines available");
      this.setLoadingState(false, "machines", "No data available");
      return [];
    }
  }

  async getInventory(): Promise<{
    currentStock: number;
    transactions: InventoryEntry[];
  }> {
    this.setLoadingState(true, "inventory", "Loading inventory data...");

    try {
      console.log(
        `📦 Getting inventory... (Connected: ${this.connectionStatus.isConnected}, Stable: ${this.connectionStatus.connectionStable}, Internet: ${this.connectionStatus.isInternetReachable})`
      );

      if (
        !this.connectionStatus.isConnected ||
        !this.connectionStatus.isInternetReachable ||
        !this.connectionStatus.connectionStable
      ) {
        console.log("📱 Using cached/offline inventory data");
        this.setLoadingState(true, "inventory", "Loading from cache...", 50);

        const cached = await this.getCachedData<{
          currentStock: number;
          transactions: InventoryEntry[];
        }>(STORAGE_KEYS.INVENTORY);

        if (cached) {
          console.log(
            `✅ Returning cached inventory: ${cached.currentStock}L, ${cached.transactions.length} transactions`
          );
          this.connectionStatus.lastDataFetch!.inventory =
            new Date().toISOString();
          this.setLoadingState(
            false,
            "inventory",
            `Loaded inventory: ${cached.currentStock.toFixed(1)}L`
          );
          return cached;
        } else if (this.connectionStatus.hasRealData) {
          console.log("⚠️ No cached inventory but should have real data");
          this.setLoadingState(false, "inventory", "No cached data available");
          return { currentStock: 0, transactions: [] };
        } else {
          console.log("🎭 No cached data, returning demo inventory");
          this.setLoadingState(
            false,
            "inventory",
            "Loaded demo inventory: 475.0L"
          );
          return { currentStock: 475, transactions: [] };
        }
      }

      console.log("📡 Fetching inventory from backend...");
      this.setLoadingState(true, "inventory", "Connecting to server...", 25);

      const response = await this.makeRequest<{
        currentStock: number;
        transactions: InventoryEntry[];
      }>(
        `${CONFIG.APPS_SCRIPT_URL}?action=getInventory&timestamp=${Date.now()}`
      );

      this.setLoadingState(
        true,
        "inventory",
        "Processing inventory data...",
        75
      );

      if (response.success) {
        const inventoryData = {
          currentStock: response.currentStock || 0,
          transactions: response.transactions || [],
        };

        console.log(
          `✅ Fetched inventory: ${inventoryData.currentStock}L, ${inventoryData.transactions.length} transactions`
        );

        // Cache the data
        await this.cacheData(STORAGE_KEYS.INVENTORY, inventoryData);

        // Mark that we have real data
        this.connectionStatus.hasRealData = true;
        this.connectionStatus.lastDataFetch!.inventory =
          new Date().toISOString();
        await this.cacheData(STORAGE_KEYS.HAS_REAL_DATA, true);
        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );

        this.setLoadingState(
          false,
          "inventory",
          `Loaded inventory: ${inventoryData.currentStock.toFixed(1)}L`
        );
        return inventoryData;
      } else {
        throw new Error(response.message || "Failed to fetch inventory");
      }
    } catch (error) {
      console.error("❌ Error fetching inventory:", error);
      this.setLoadingState(
        true,
        "inventory",
        "Server error, checking cache...",
        60
      );

      // Return cached data
      const cached = await this.getCachedData<{
        currentStock: number;
        transactions: InventoryEntry[];
      }>(STORAGE_KEYS.INVENTORY);

      if (cached) {
        console.log(`📱 Fallback to cached inventory: ${cached.currentStock}L`);
        this.setLoadingState(
          false,
          "inventory",
          `Loaded cached inventory: ${cached.currentStock.toFixed(
            1
          )}L (offline)`
        );
        return cached;
      }

      // Only return mock data if we've never had real data
      if (!this.connectionStatus.hasRealData) {
        console.log(
          "🎭 Fallback to demo inventory (no real data ever fetched)"
        );
        this.setLoadingState(
          false,
          "inventory",
          "Loaded demo inventory: 475.0L (first time)"
        );
        return { currentStock: 475, transactions: [] };
      }

      console.log("📭 No inventory data available");
      this.setLoadingState(false, "inventory", "No data available");
      return { currentStock: 0, transactions: [] };
    }
  }

  async getLogs(filters?: {
    dateFrom?: string;
    dateTo?: string;
    machineName?: string;
    ownership?: string;
  }): Promise<{ logs: DieselEntry[]; success: boolean }> {
    this.setLoadingState(true, "logs", "Loading logs data...");

    try {
      console.log(
        `📊 Getting logs... (Connected: ${this.connectionStatus.isConnected}, Stable: ${this.connectionStatus.connectionStable}, Internet: ${this.connectionStatus.isInternetReachable})`
      );

      if (
        !this.connectionStatus.isConnected ||
        !this.connectionStatus.isInternetReachable ||
        !this.connectionStatus.connectionStable
      ) {
        console.log("📱 Using cached/offline logs data");
        this.setLoadingState(true, "logs", "Loading from cache...", 50);

        const cached = await this.getCachedData<DieselEntry[]>(
          STORAGE_KEYS.LOGS
        );

        if (cached && cached.length > 0) {
          console.log(`✅ Returning ${cached.length} cached logs`);
          this.connectionStatus.lastDataFetch!.logs = new Date().toISOString();
          this.setLoadingState(
            false,
            "logs",
            `Loaded ${cached.length} logs from cache`
          );
          return { logs: cached, success: true };
        } else if (this.connectionStatus.hasRealData) {
          console.log("⚠️ No cached logs but should have real data");
          this.setLoadingState(false, "logs", "No cached data available");
          return { logs: [], success: true };
        } else {
          console.log("🎭 No cached data, returning demo logs");
          const mockLogs = this.getMockLogs();
          this.setLoadingState(
            false,
            "logs",
            `Loaded ${mockLogs.length} demo logs`
          );
          return { logs: mockLogs, success: true };
        }
      }

      console.log("📡 Fetching logs from backend...");
      this.setLoadingState(true, "logs", "Preparing request...", 20);

      let url = `${
        CONFIG.APPS_SCRIPT_URL
      }?action=getLogsEnhanced&timestamp=${Date.now()}`;

      if (filters) {
        if (filters.dateFrom) url += `&dateFrom=${filters.dateFrom}`;
        if (filters.dateTo) url += `&dateTo=${filters.dateTo}`;
        if (filters.machineName)
          url += `&machineName=${encodeURIComponent(filters.machineName)}`;
        if (filters.ownership)
          url += `&ownership=${encodeURIComponent(filters.ownership)}`;
      }

      this.setLoadingState(true, "logs", "Connecting to server...", 40);
      const response = await this.makeRequest<{ logs: DieselEntry[] }>(url);

      this.setLoadingState(true, "logs", "Processing logs...", 80);

      if (response.success && response.logs) {
        console.log(`✅ Fetched ${response.logs.length} logs from backend`);

        // Cache the data
        await this.cacheData(STORAGE_KEYS.LOGS, response.logs);

        // Mark that we have real data
        this.connectionStatus.hasRealData = true;
        this.connectionStatus.lastDataFetch!.logs = new Date().toISOString();
        await this.cacheData(STORAGE_KEYS.HAS_REAL_DATA, true);
        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );

        this.setLoadingState(
          false,
          "logs",
          `Loaded ${response.logs.length} logs from server`
        );
        return { logs: response.logs, success: true };
      } else {
        throw new Error(response.message || "Failed to fetch logs");
      }
    } catch (error) {
      console.error("❌ Error fetching logs:", error);
      this.setLoadingState(true, "logs", "Server error, checking cache...", 60);

      // Return cached data
      const cached = await this.getCachedData<DieselEntry[]>(STORAGE_KEYS.LOGS);
      if (cached && cached.length > 0) {
        console.log(`📱 Fallback to ${cached.length} cached logs`);
        this.setLoadingState(
          false,
          "logs",
          `Loaded ${cached.length} logs from cache (offline)`
        );
        return { logs: cached, success: false };
      }

      // Only return mock data if we've never had real data
      if (!this.connectionStatus.hasRealData) {
        console.log("🎭 Fallback to demo logs (no real data ever fetched)");
        const mockLogs = this.getMockLogs();
        this.setLoadingState(
          false,
          "logs",
          `Loaded ${mockLogs.length} demo logs (first time)`
        );
        return { logs: mockLogs, success: false };
      }

      console.log("📭 No logs available");
      this.setLoadingState(false, "logs", "No data available");
      return { logs: [], success: false };
    }
  }

  // Get mismatch data with enhanced calculations
  async getMismatchData(): Promise<{
    mismatchData: MismatchData[];
    success: boolean;
  }> {
    this.setLoadingState(true, "mismatchData", "Loading mismatch data...");

    try {
      console.log("📊 Getting mismatch data...");

      if (
        !this.connectionStatus.isConnected ||
        !this.connectionStatus.isInternetReachable ||
        !this.connectionStatus.connectionStable
      ) {
        console.log("📱 Using cached/offline mismatch data");
        const cached = await this.getCachedData<MismatchData[]>(
          STORAGE_KEYS.MISMATCH_DATA
        );

        if (cached && cached.length > 0) {
          console.log(`✅ Returning ${cached.length} cached mismatch records`);
          this.setLoadingState(
            false,
            "mismatchData",
            `Loaded ${cached.length} mismatch records from cache`
          );
          return { mismatchData: cached, success: true };
        } else {
          console.log("🎭 No cached mismatch data, calculating from logs...");
          const calculatedMismatch = await this.calculateMismatchFromLocal();
          this.setLoadingState(
            false,
            "mismatchData",
            `Calculated ${calculatedMismatch.length} mismatch records`
          );
          return { mismatchData: calculatedMismatch, success: true };
        }
      }

      console.log("📡 Fetching mismatch data from backend...");
      const response = await this.makeRequest<{ mismatchData: MismatchData[] }>(
        `${
          CONFIG.APPS_SCRIPT_URL
        }?action=getMismatchData&timestamp=${Date.now()}`
      );

      if (response.success && response.data) {
        const mismatchData = response.data.mismatchData || [];
        console.log(
          `✅ Fetched ${mismatchData.length} mismatch records from backend`
        );

        // Cache the data
        await this.cacheData(STORAGE_KEYS.MISMATCH_DATA, mismatchData);

        this.setLoadingState(
          false,
          "mismatchData",
          `Loaded ${mismatchData.length} mismatch records from server`
        );
        return { mismatchData, success: true };
      } else {
        throw new Error(response.message || "Failed to fetch mismatch data");
      }
    } catch (error) {
      console.error("❌ Error fetching mismatch data:", error);

      // Fallback to local calculation
      const calculatedMismatch = await this.calculateMismatchFromLocal();
      this.setLoadingState(
        false,
        "mismatchData",
        `Calculated ${calculatedMismatch.length} mismatch records (offline)`
      );
      return { mismatchData: calculatedMismatch, success: false };
    }
  }

  // Calculate mismatch data from local logs and machines
  private async calculateMismatchFromLocal(): Promise<MismatchData[]> {
    try {
      const [machines, logsResult] = await Promise.all([
        this.getMachines(),
        this.getLogs(),
      ]);

      const mismatchData: MismatchData[] = [];

      for (const log of logsResult.logs) {
        const machine = machines.find((m) => m.name === log.machineName);
        if (!machine) continue;

        const consumptionMismatch =
          (log.rate || 0) - (machine.standardAvgDiesel || 0);
        const hoursMismatch =
          (log.usage || 0) - (machine.expectedDailyHours || 0);

        // Calculate severity based on mismatch values
        const severity = this.calculateMismatchSeverity(
          consumptionMismatch,
          hoursMismatch,
          machine.machineType
        );

        // Determine warning types
        const warningTypes: string[] = [];
        if (
          Math.abs(consumptionMismatch) >
          (machine.standardAvgDiesel || 0) * 0.1
        ) {
          warningTypes.push(
            machine.machineType === "KM/l"
              ? "LOW_EFFICIENCY"
              : "OVER_CONSUMPTION"
          );
        }
        if (Math.abs(hoursMismatch) > (machine.expectedDailyHours || 0) * 0.2) {
          warningTypes.push(hoursMismatch < 0 ? "IDLE_MACHINE" : "OVER_WORKED");
        }

        mismatchData.push({
          id: `mismatch_${log.id || Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          machineName: log.machineName,
          plate: machine.plate || "",
          machineType: machine.machineType || "L/hr",
          timestamp: log.timestamp || new Date().toISOString(),
          consumptionMismatch,
          hoursMismatch,
          standardConsumption: machine.standardAvgDiesel || 0,
          actualConsumption: log.rate || 0,
          standardHours: machine.expectedDailyHours || 0,
          actualHours: log.usage || 0,
          severity,
          warningTypes,
        });
      }

      // Cache the calculated data
      await this.cacheData(STORAGE_KEYS.MISMATCH_DATA, mismatchData);

      return mismatchData;
    } catch (error) {
      console.error("❌ Error calculating mismatch data:", error);
      return [];
    }
  }

  // Calculate mismatch severity
  private calculateMismatchSeverity(
    consumptionMismatch: number,
    hoursMismatch: number,
    machineType?: string
  ): "low" | "medium" | "high" | "critical" {
    const absConsumption = Math.abs(consumptionMismatch);
    const absHours = Math.abs(hoursMismatch);

    // For consumption mismatch
    let consumptionSeverity = 0;
    if (machineType === "KM/l") {
      if (absConsumption > 2) consumptionSeverity = 4;
      else if (absConsumption > 1) consumptionSeverity = 3;
      else if (absConsumption > 0.5) consumptionSeverity = 2;
      else consumptionSeverity = 1;
    } else {
      if (absConsumption > 2.5) consumptionSeverity = 4;
      else if (absConsumption > 1.5) consumptionSeverity = 3;
      else if (absConsumption > 0.5) consumptionSeverity = 2;
      else consumptionSeverity = 1;
    }

    // For hours mismatch
    let hoursSeverity = 0;
    if (absHours > 5) hoursSeverity = 4;
    else if (absHours > 3) hoursSeverity = 3;
    else if (absHours > 1) hoursSeverity = 2;
    else hoursSeverity = 1;

    // Take the higher severity
    const maxSeverity = Math.max(consumptionSeverity, hoursSeverity);

    switch (maxSeverity) {
      case 4:
        return "critical";
      case 3:
        return "high";
      case 2:
        return "medium";
      default:
        return "low";
    }
  }

  async getAlertsData(): Promise<{ alerts: AlertData; success: boolean }> {
    this.setLoadingState(true, "alerts", "Loading alerts data...");

    try {
      console.log(
        `🚨 Getting alerts... (Connected: ${this.connectionStatus.isConnected}, Stable: ${this.connectionStatus.connectionStable}, Internet: ${this.connectionStatus.isInternetReachable})`
      );

      if (
        !this.connectionStatus.isConnected ||
        !this.connectionStatus.isInternetReachable ||
        !this.connectionStatus.connectionStable
      ) {
        console.log("📱 Using cached/offline alerts data");
        this.setLoadingState(true, "alerts", "Loading from cache...", 50);

        const cached = await this.getCachedData<AlertData>(STORAGE_KEYS.ALERTS);

        if (cached) {
          console.log(`✅ Returning cached alerts`);
          this.connectionStatus.lastDataFetch!.alerts =
            new Date().toISOString();
          const totalAlerts =
            (cached.overConsumption?.length || 0) +
            (cached.idleMachines?.length || 0) +
            (cached.underWorked?.length || 0) +
            (cached.lowEfficiency?.length || 0);
          this.setLoadingState(
            false,
            "alerts",
            `Loaded ${totalAlerts} alerts from cache`
          );
          return { alerts: cached, success: true };
        } else if (this.connectionStatus.hasRealData) {
          console.log("⚠️ No cached alerts but should have real data");
          this.setLoadingState(false, "alerts", "No cached data available");
          return {
            alerts: {
              overConsumption: [],
              idleMachines: [],
              underWorked: [],
              lowEfficiency: [],
            },
            success: true,
          };
        } else {
          console.log(
            "🎭 No cached data, generating demo alerts from mismatch data"
          );
          const demoAlerts = await this.generateAlertsFromMismatch();
          this.setLoadingState(false, "alerts", "Generated demo alerts");
          return { alerts: demoAlerts, success: true };
        }
      }

      console.log("📡 Fetching alerts from backend...");
      this.setLoadingState(true, "alerts", "Connecting to server...", 30);

      const response = await this.makeRequest<{ alerts: AlertData }>(
        `${CONFIG.APPS_SCRIPT_URL}?action=getAlertsData&timestamp=${Date.now()}`
      );

      this.setLoadingState(true, "alerts", "Processing alerts...", 70);

      if (response.success) {
        const alertsData = response.alerts || {
          overConsumption: [],
          idleMachines: [],
          underWorked: [],
          lowEfficiency: [],
        };

        // Cache the data
        await this.cacheData(STORAGE_KEYS.ALERTS, alertsData);

        // Mark that we have real data
        this.connectionStatus.hasRealData = true;
        this.connectionStatus.lastDataFetch!.alerts = new Date().toISOString();
        await this.cacheData(STORAGE_KEYS.HAS_REAL_DATA, true);
        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );

        const totalAlerts =
          (alertsData.overConsumption?.length || 0) +
          (alertsData.idleMachines?.length || 0) +
          (alertsData.underWorked?.length || 0) +
          (alertsData.lowEfficiency?.length || 0);
        this.setLoadingState(
          false,
          "alerts",
          `Loaded ${totalAlerts} alerts from server`
        );
        return { alerts: alertsData, success: true };
      } else {
        throw new Error(response.message || "Failed to fetch alerts data");
      }
    } catch (error) {
      console.error("❌ Error fetching alerts:", error);
      this.setLoadingState(
        true,
        "alerts",
        "Server error, checking cache...",
        60
      );

      // Return cached data
      const cached = await this.getCachedData<AlertData>(STORAGE_KEYS.ALERTS);
      if (cached) {
        const totalAlerts =
          (cached.overConsumption?.length || 0) +
          (cached.idleMachines?.length || 0) +
          (cached.underWorked?.length || 0) +
          (cached.lowEfficiency?.length || 0);
        this.setLoadingState(
          false,
          "alerts",
          `Loaded ${totalAlerts} alerts from cache (offline)`
        );
        return { alerts: cached, success: false };
      }

      // Generate alerts from mismatch data as fallback
      const fallbackAlerts = await this.generateAlertsFromMismatch();
      this.setLoadingState(false, "alerts", "Generated fallback alerts");
      return { alerts: fallbackAlerts, success: false };
    }
  }

  // Generate alerts from mismatch data
  private async generateAlertsFromMismatch(): Promise<AlertData> {
    try {
      const mismatchResult = await this.getMismatchData();
      const machines = await this.getMachines();

      const alerts: AlertData = {
        overConsumption: [],
        idleMachines: [],
        underWorked: [],
        lowEfficiency: [],
      };

      for (const mismatch of mismatchResult.mismatchData) {
        const machine = machines.find((m) => m.name === mismatch.machineName);
        if (!machine) continue;

        // Over consumption / Low efficiency alerts
        if (mismatch.warningTypes.includes("OVER_CONSUMPTION")) {
          alerts.overConsumption.push({
            machine: mismatch.machineName,
            plate: mismatch.plate,
            standardAvg: mismatch.standardConsumption,
            actualAvg: mismatch.actualConsumption,
            mismatch: mismatch.consumptionMismatch,
            timestamp: mismatch.timestamp,
            severity: mismatch.severity,
            machineType: mismatch.machineType,
            ownershipType: machine.ownershipType || "Own",
            unit: mismatch.machineType === "KM/l" ? "KM/l" : "L/hr",
            description: `Over consumption: ${Math.abs(
              mismatch.consumptionMismatch
            ).toFixed(2)} ${
              mismatch.machineType === "KM/l" ? "KM/l" : "L/hr"
            } above standard`,
          });
        }

        if (mismatch.warningTypes.includes("LOW_EFFICIENCY")) {
          alerts.lowEfficiency.push({
            machine: mismatch.machineName,
            plate: mismatch.plate,
            standardAvg: mismatch.standardConsumption,
            actualAvg: mismatch.actualConsumption,
            mismatch: mismatch.consumptionMismatch,
            timestamp: mismatch.timestamp,
            severity: mismatch.severity,
            machineType: mismatch.machineType,
            ownershipType: machine.ownershipType || "Own",
            unit: mismatch.machineType === "KM/l" ? "KM/l" : "L/hr",
            description: `Low efficiency: ${Math.abs(
              mismatch.consumptionMismatch
            ).toFixed(2)} ${
              mismatch.machineType === "KM/l" ? "KM/l" : "L/hr"
            } below standard`,
          });
        }

        // Idle machine alerts
        if (mismatch.warningTypes.includes("IDLE_MACHINE")) {
          alerts.idleMachines.push({
            machine: mismatch.machineName,
            plate: mismatch.plate,
            expectedHours: mismatch.standardHours,
            actualHours: mismatch.actualHours,
            mismatch: mismatch.hoursMismatch,
            timestamp: mismatch.timestamp,
            severity: mismatch.severity,
            machineType: mismatch.machineType,
            ownershipType: machine.ownershipType || "Own",
            unit: "hours",
            description: `Machine idle: ${Math.abs(
              mismatch.hoursMismatch
            ).toFixed(1)} hours below expected`,
          });
        }

        // Under worked alerts
        if (mismatch.warningTypes.includes("OVER_WORKED")) {
          alerts.underWorked?.push({
            machine: mismatch.machineName,
            plate: mismatch.plate,
            expectedHours: mismatch.standardHours,
            actualHours: mismatch.actualHours,
            mismatch: mismatch.hoursMismatch,
            timestamp: mismatch.timestamp,
            severity: mismatch.severity,
            machineType: mismatch.machineType,
            ownershipType: machine.ownershipType || "Own",
            unit: "hours",
            description: `Machine over-worked: ${Math.abs(
              mismatch.hoursMismatch
            ).toFixed(1)} hours above expected`,
          });
        }
      }

      return alerts;
    } catch (error) {
      console.error("❌ Error generating alerts from mismatch:", error);
      return {
        overConsumption: [],
        idleMachines: [],
        underWorked: [],
        lowEfficiency: [],
      };
    }
  }

  // Enhanced offline queue management
  private async addToOfflineQueue(
    type: QueuedItem["type"],
    data: any,
    priority: number = 1,
    maxRetries: number = 8 // FIXED: Increased from 5 to 8 for better retry chances
  ): Promise<string> {
    const queueItem: QueuedItem = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      maxRetries,
      priority,
    };

    this.offlineQueue.push(queueItem);

    // Sort by priority (higher first) and then by timestamp
    this.offlineQueue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    await this.cacheData(STORAGE_KEYS.OFFLINE_QUEUE, this.offlineQueue);

    console.log(
      `📝 Added ${type} to offline queue. Queue size: ${this.offlineQueue.length}`
    );

    // Try to process immediately if connected AND stable
    if (
      this.connectionStatus.isConnected &&
      this.connectionStatus.isInternetReachable &&
      this.connectionStatus.connectionStable
    ) {
      console.log("⚡ Attempting immediate processing...");
      setTimeout(() => this.processOfflineQueue(), 2000); // Add stability delay
    }

    return queueItem.id;
  }

  getOfflineQueueStatus(): { count: number; items: QueuedItem[] } {
    return {
      count: this.offlineQueue.length,
      items: this.offlineQueue,
    };
  }

  async clearOfflineQueue(): Promise<void> {
    console.log("🗑️ Clearing offline queue...");
    this.offlineQueue = [];
    await this.cacheData(STORAGE_KEYS.OFFLINE_QUEUE, this.offlineQueue);
  }

  async retryFailedItems(): Promise<void> {
    console.log("🔄 Manual retry requested...");
    if (
      this.connectionStatus.isConnected &&
      this.connectionStatus.isInternetReachable &&
      this.connectionStatus.connectionStable
    ) {
      await this.processOfflineQueue();
    } else {
      console.log("⚠️ Cannot retry: connection not stable");
    }
  }

  // Enhanced offline queue processing
  private async processOfflineQueue(): Promise<void> {
    if (this.isProcessingQueue || this.offlineQueue.length === 0) {
      return;
    }

    // Only process if connection is stable
    if (
      !this.connectionStatus.isConnected ||
      !this.connectionStatus.isInternetReachable ||
      !this.connectionStatus.connectionStable
    ) {
      console.log("⏸️ Cannot process queue: connection not stable");
      return;
    }

    this.isProcessingQueue = true;
    console.log(
      `🔄 Processing offline queue with ${this.offlineQueue.length} items...`
    );

    try {
      const processedItems: string[] = [];
      const failedItems: QueuedItem[] = [];
      let successCount = 0;
      let networkFailureCount = 0;

      // Sort queue by priority and timestamp
      const sortedQueue = [...this.offlineQueue].sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority; // Higher priority first
        }
        return (
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      });

      for (const item of sortedQueue) {
        try {
          console.log(
            `⚙️ Processing queued ${item.type} (attempt ${
              item.retryCount + 1
            }/${item.maxRetries}, priority: ${item.priority})`
          );

          let success = false;
          let isNetworkError = false;

          try {
            switch (item.type) {
              case "entry":
                success = await this.processQueuedEntry(item.data);
                break;
              case "inventory":
                success = await this.processQueuedInventory(item.data);
                break;
              case "machine":
                success = await this.processQueuedMachine(item.data);
                break;
              case "machineUpdate":
                success = await this.processQueuedMachineUpdate(item.data);
                break;
              case "machineDelete":
                success = await this.processQueuedMachineDelete(item.data);
                break;
              case "alertUpdate":
                success = await this.processQueuedAlertUpdate(item.data);
                break;
              default:
                console.warn(`❓ Unknown queue item type: ${item.type}`);
                success = true; // Remove unknown types
            }
          } catch (error) {
            // FIXED: Detect network errors vs actual processing errors
            const errorMessage =
              error instanceof Error ? error.message : String(error);

            isNetworkError =
              errorMessage.includes("fetch") ||
              errorMessage.includes("network") ||
              errorMessage.includes("timeout") ||
              errorMessage.includes("abort") ||
              errorMessage.includes("connection") ||
              errorMessage.includes("HTTP 5") || // Server errors
              errorMessage.includes("Failed to fetch") ||
              errorMessage.includes("NetworkError") ||
              errorMessage.includes("ERR_NETWORK") ||
              errorMessage.includes("ERR_INTERNET_DISCONNECTED");

            console.log(
              `❌ Error processing ${item.type}: ${errorMessage} (Network error: ${isNetworkError})`
            );
            success = false;
          }

          if (success) {
            processedItems.push(item.id);
            successCount++;
            console.log(`✅ Successfully processed ${item.type} ${item.id}`);
          } else {
            item.retryCount++;

            // FIXED: Different retry logic for network errors vs processing errors
            if (isNetworkError) {
              networkFailureCount++;
              console.log(
                `🌐 Network error for ${item.type} ${item.id}, will retry when connection improves`
              );

              // For network errors, don't count against max retries as aggressively
              if (item.retryCount >= item.maxRetries * 2) {
                // Double the retries for network issues
                console.error(
                  `🚫 Max network retries reached for ${item.type} ${item.id}, removing from queue`
                );
                processedItems.push(item.id);
              } else {
                failedItems.push(item);
                console.log(
                  `⚠️ Network retry for ${item.type} ${item.id} (${
                    item.retryCount
                  }/${item.maxRetries * 2})`
                );
              }
            } else {
              // Processing/validation errors - use normal retry logic
              if (item.retryCount >= item.maxRetries) {
                console.error(
                  `🚫 Max processing retries reached for ${item.type} ${item.id}, removing from queue`
                );
                processedItems.push(item.id);
              } else {
                failedItems.push(item);
                console.warn(
                  `⚠️ Processing retry for ${item.type} ${item.id} (${item.retryCount}/${item.maxRetries})`
                );
              }
            }
          }

          // FIXED: If we hit too many network errors, stop processing and wait
          if (networkFailureCount >= 3) {
            console.log(
              "🔄 Multiple network errors detected, stopping queue processing to wait for stable connection"
            );

            // Add remaining items back to failed items without incrementing retry count
            for (
              let i = sortedQueue.indexOf(item) + 1;
              i < sortedQueue.length;
              i++
            ) {
              const remainingItem = sortedQueue[i];
              if (!processedItems.includes(remainingItem.id)) {
                failedItems.push(remainingItem);
              }
            }
            break;
          }

          // Small delay between items for stability
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          console.error(
            `💥 Unexpected error processing queue item ${item.id}:`,
            error
          );
          item.retryCount++;
          if (item.retryCount < item.maxRetries) {
            failedItems.push(item);
          } else {
            processedItems.push(item.id);
          }
        }
      }

      // Remove processed items from queue
      this.offlineQueue = this.offlineQueue.filter(
        (item) => !processedItems.includes(item.id)
      );

      // Add failed items back with updated retry count
      this.offlineQueue = [...failedItems, ...this.offlineQueue];

      // Re-sort queue
      this.offlineQueue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return (
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      });

      await this.cacheData(STORAGE_KEYS.OFFLINE_QUEUE, this.offlineQueue);

      const failedCount = failedItems.length;
      const removedCount = processedItems.length - successCount;

      console.log(
        `✨ Queue processing complete. ` +
          `Processed: ${successCount}, ` +
          `Failed (will retry): ${failedCount}, ` +
          `Removed permanently: ${removedCount}, ` +
          `Remaining: ${this.offlineQueue.length}` +
          (networkFailureCount > 0
            ? `, Network errors: ${networkFailureCount}`
            : "")
      );

      // FIXED: If we had network failures, schedule another attempt sooner
      if (networkFailureCount > 0 && this.offlineQueue.length > 0) {
        console.log("⏰ Scheduling earlier retry due to network issues...");
        setTimeout(() => {
          if (
            this.connectionStatus.isConnected &&
            this.connectionStatus.isInternetReachable &&
            this.connectionStatus.connectionStable
          ) {
            this.processOfflineQueue();
          }
        }, 10000); // Retry in 10 seconds instead of waiting for the full sync interval
      }
    } catch (error) {
      console.error("💥 Error processing offline queue:", error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async processQueuedEntry(entryData: DieselEntry): Promise<boolean> {
    try {
      // FIXED: Double-check connection before making request
      if (
        !this.connectionStatus.isConnected ||
        !this.connectionStatus.isInternetReachable ||
        !this.connectionStatus.connectionStable
      ) {
        throw new Error("Connection not stable for entry processing");
      }

      console.log(`📡 Submitting queued entry for ${entryData.machineName}...`);

      const response = await this.makeRequest(CONFIG.APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "submitEntryEnhanced",
          ...entryData,
          // Ensure we acknowledge any warnings from queued entries
          acknowledgeWarnings: true,
          forceSubmit: true,
          queuedSubmission: true, // Flag to indicate this is from queue
          timestamp: Date.now(),
        }),
      });

      if (response.success) {
        console.log(
          `✅ Queued entry submitted successfully for ${entryData.machineName}`
        );

        // Update machine's last reading in local cache
        const machines = await this.getMachines();
        const machine = machines.find((m) => m.name === entryData.machineName);
        if (machine) {
          machine.lastReading = entryData.endReading;
          machine.updatedAt = new Date().toISOString();
          await this.cacheData(STORAGE_KEYS.MACHINES, machines);
        }

        // Remove the entry from local cache if it was temporarily added
        // (since it's now confirmed in the backend)
        const logs =
          (await this.getCachedData<DieselEntry[]>(STORAGE_KEYS.LOGS)) || [];
        const updatedLogs = logs.filter((log) => log.id !== entryData.id);
        if (updatedLogs.length !== logs.length) {
          await this.cacheData(STORAGE_KEYS.LOGS, updatedLogs);
        }

        return true;
      } else {
        console.error(`❌ Backend rejected queued entry: ${response.message}`);

        // FIXED: Check if this is a validation error (permanent) vs network error (temporary)
        const isValidationError =
          response.message?.includes("validation") ||
          response.message?.includes("invalid") ||
          response.message?.includes("already exists") ||
          response.message?.includes("not found") ||
          response.message?.includes("required");

        if (isValidationError) {
          console.log(
            `🚫 Validation error for queued entry, removing from queue: ${response.message}`
          );
          // For validation errors, we might want to remove from queue
          // but let the caller decide based on the specific error
          throw new Error(`VALIDATION_ERROR: ${response.message}`);
        } else {
          // For other errors, treat as temporary network/server issues
          throw new Error(`SERVER_ERROR: ${response.message}`);
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("❌ Error processing queued entry:", errorMessage);

      // Re-throw to let the queue processor handle retry logic
      throw error;
    }
  }

  private async processQueuedInventory(
    inventoryData: InventoryEntry
  ): Promise<boolean> {
    try {
      const params = new URLSearchParams({
        action: "addInventory",
        litersReceived: inventoryData.litersReceived.toString(),
        receiptNumber: inventoryData.receiptNumber || "",
        remarks: inventoryData.remarks || "",
        receiptImage: inventoryData.receiptImage || "",
        phoneNumber: inventoryData.phoneNumber,
        timestamp: Date.now().toString(),
      });

      const response = await this.makeRequest(
        `${CONFIG.APPS_SCRIPT_URL}?${params}`
      );

      return response.success;
    } catch (error) {
      console.error("❌ Error processing queued inventory:", error);
      return false;
    }
  }

  private async processQueuedMachine(
    machineData: Omit<Machine, "lastReading" | "id">
  ): Promise<boolean> {
    try {
      const params = new URLSearchParams({
        action: "addMachineEnhanced",
        machineName: machineData.name,
        machinePlate: machineData.plate,
        machineType: machineData.machineType || "L/hr",
        ownershipType: machineData.ownershipType || "Own",
        initialReading: (machineData.initialReading || 0).toString(),
        standardAvgDiesel: (machineData.standardAvgDiesel || 0).toString(),
        expectedDailyHours: (machineData.expectedDailyHours || 0).toString(),
        doorNo: machineData.doorNo || "",
        remarks: machineData.remarks || "",
        dateAdded:
          machineData.dateAdded || new Date().toISOString().split("T")[0],
        timestamp: Date.now().toString(),
      });

      const response = await this.makeRequest(
        `${CONFIG.APPS_SCRIPT_URL}?${params}`
      );

      return response.success;
    } catch (error) {
      console.error("❌ Error processing queued machine:", error);
      return false;
    }
  }

  private async processQueuedMachineUpdate(updateData: {
    machineName: string;
    updates: Partial<Machine>;
  }): Promise<boolean> {
    try {
      const response = await this.makeRequest(CONFIG.APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "editMachine",
          oldName: updateData.machineName,
          ...updateData.updates,
          updatedAt: new Date().toISOString(),
          timestamp: Date.now(),
        }),
      });

      return response.success;
    } catch (error) {
      console.error("❌ Error processing queued machine update:", error);
      return false;
    }
  }

  private async processQueuedMachineDelete(deleteData: {
    machineName: string;
    machineData: Machine;
    options?: {
      forceDelete?: boolean;
      deletionReason?: string;
      deletedBy?: string;
    };
  }): Promise<boolean> {
    try {
      const params = new URLSearchParams({
        action: "deleteMachine",
        machineName: deleteData.machineName,
        forceDelete: deleteData.options?.forceDelete ? "true" : "false",
        deletionReason: deleteData.options?.deletionReason || "",
        deletedBy: deleteData.options?.deletedBy || "System",
        timestamp: Date.now().toString(),
      });

      const response = await this.makeRequest(
        `${CONFIG.APPS_SCRIPT_URL}?${params}`
      );

      return response.success;
    } catch (error) {
      console.error("❌ Error processing queued machine deletion:", error);
      return false;
    }
  }

  private async processQueuedAlertUpdate(alertData: {
    alertId: string;
    status: string;
    resolvedBy?: string;
    comments?: string;
  }): Promise<boolean> {
    try {
      const response = await this.makeRequest(CONFIG.APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "updateAlertStatus",
          alertId: alertData.alertId,
          status: alertData.status,
          resolvedBy: alertData.resolvedBy,
          comments: alertData.comments,
          timestamp: Date.now(),
        }),
      });

      return response.success;
    } catch (error) {
      console.error("❌ Error processing queued alert update:", error);
      return false;
    }
  }

  // FIXED: API request method with enhanced connection tracking
  private async makeRequest<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      if (DEBUG_MODE) {
        console.log(`🔍 Making request to: ${url}`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const responseText = await response.text();
        console.error(`❌ Invalid content type: ${contentType}`);
        console.error(
          `📄 Response body (first 500 chars):`,
          responseText.substring(0, 500)
        );

        throw new Error(`Expected JSON response but got: ${contentType}`);
      }

      const data: ApiResponse<T> = await response.json();

      // FIXED: Update connection status on successful request with stability
      if (!this.connectionStatus.isConnected) {
        console.log(
          "✅ Request successful, marking backend as connected and stable"
        );

        this.lastBackendSuccess = Date.now();

        this.connectionStatus = {
          ...this.connectionStatus,
          isConnected: true,
          connectionStable: true,
          lastStableConnection: new Date().toISOString(),
          consecutiveFailures: 0,
          backendRetryCount: 0,
          lastChecked: new Date().toISOString(),
          error: undefined,
        };

        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );
        await this.cacheData(
          STORAGE_KEYS.LAST_SUCCESSFUL_FETCH,
          this.lastBackendSuccess
        );

        this.notifyConnectionListeners();
      }

      return data;
    } catch (error) {
      console.error(`💥 Request failed:`, error);

      // FIXED: Update connection status on failed request with stability tracking
      const wasConnected = this.connectionStatus.isConnected;

      this.connectionStatus = {
        ...this.connectionStatus,
        isConnected: false,
        connectionStable: false,
        consecutiveFailures:
          (this.connectionStatus.consecutiveFailures || 0) + 1,
        backendRetryCount: (this.connectionStatus.backendRetryCount || 0) + 1,
        error: error instanceof Error ? error.message : "Request failed",
        lastChecked: new Date().toISOString(),
      };

      // Only notify and cache if status actually changed
      if (wasConnected) {
        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );
        this.notifyConnectionListeners();
      }

      throw error;
    }
  }

  // FIXED: Enhanced submission methods with proper warning handling
  async submitEntry(entry: DieselEntry): Promise<ApiResponse> {
    this.setLoadingState(true, "submitEntry", "Preparing diesel entry...");
    console.log("📝 Submitting diesel entry...");

    try {
      this.setLoadingState(
        true,
        "submitEntry",
        "Calculating usage and rate...",
        20
      );

      // Calculate additional fields
      const usage = entry.endReading - entry.startReading;
      const machine = (await this.getMachines()).find(
        (m) => m.name === entry.machineName
      );

      if (!machine) {
        this.setLoadingState(false, "submitEntry", "Machine not found");
        return {
          success: false,
          message: `Machine "${entry.machineName}" not found`,
        };
      }

      let rate = 0;
      if (machine.machineType === "KM/l") {
        rate = entry.dieselFilled > 0 ? usage / entry.dieselFilled : 0;
      } else {
        rate = usage > 0 ? entry.dieselFilled / usage : 0;
      }

      // Check for warnings but don't prevent submission
      const warnings = this.checkEntryWarnings(entry, machine, usage, rate);

      const entryWithCalculations = {
        ...entry,
        id:
          entry.id ||
          `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        usage,
        rate,
        machineType: machine.machineType || "L/hr",
        timestamp: entry.timestamp || new Date().toISOString(),
        createdAt: entry.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // Add warning information
        hasWarnings: warnings.length > 0,
        warningTypes: warnings.map((w) => w.type),
        warningMessages: warnings.map((w) => w.message),
        // Add mismatch calculations
        consumptionMismatch: rate - (machine.standardAvgDiesel || 0),
        hoursMismatch: usage - (machine.expectedDailyHours || 0),
        standardAvg: machine.standardAvgDiesel || 0,
        expectedDaily: machine.expectedDailyHours || 0,
      };

      this.setLoadingState(true, "submitEntry", "Updating local cache...", 40);

      // Update local cache immediately for better UX
      const logs =
        (await this.getCachedData<DieselEntry[]>(STORAGE_KEYS.LOGS)) || [];
      const existingIndex = logs.findIndex(
        (log) => log.id === entryWithCalculations.id
      );
      if (existingIndex === -1) {
        logs.unshift(entryWithCalculations);
        await this.cacheData(STORAGE_KEYS.LOGS, logs.slice(0, 1000));
      }

      // Update machine's last reading locally
      const machines = await this.getMachines();
      const machineIndex = machines.findIndex(
        (m) => m.name === entry.machineName
      );
      if (machineIndex !== -1) {
        machines[machineIndex].lastReading = entry.endReading;
        machines[machineIndex].updatedAt = new Date().toISOString();
        await this.cacheData(STORAGE_KEYS.MACHINES, machines);
      }

      // Try immediate submission if connection is stable
      if (
        this.connectionStatus.isConnected &&
        this.connectionStatus.isInternetReachable &&
        this.connectionStatus.connectionStable
      ) {
        try {
          console.log("📡 Attempting immediate submission...");
          this.setLoadingState(
            true,
            "submitEntry",
            warnings.length > 0
              ? "Submitting with warnings..."
              : "Submitting to server...",
            70
          );

          // Include warning acknowledgment in submission
          const response = await this.makeRequest(CONFIG.APPS_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({
              action: "submitEntryEnhanced",
              ...entryWithCalculations,
              // Explicit warning acknowledgment
              acknowledgeWarnings: true,
              forceSubmit: true, // Force submission even with warnings
              timestamp: Date.now(),
            }),
          });

          if (response.success) {
            console.log(
              "✅ Entry submitted successfully with warnings acknowledged!"
            );

            // Store mismatch data locally
            if (
              entryWithCalculations.consumptionMismatch !== 0 ||
              entryWithCalculations.hoursMismatch !== 0
            ) {
              await this.storeMismatchData(entryWithCalculations, machine);
            }

            this.setLoadingState(
              false,
              "submitEntry",
              warnings.length > 0
                ? "Entry submitted successfully with warnings noted!"
                : "Entry submitted successfully!"
            );

            return {
              success: true,
              message:
                warnings.length > 0
                  ? `Entry submitted successfully! ${warnings.length} warning(s) logged for review.`
                  : "Entry submitted successfully!",
              hasWarnings: warnings.length > 0,
              warningMessages: warnings.map((w) => w.message),
              usage: usage,
              rate: rate,
              newLastReading: entry.endReading,
              machineType: machine.machineType,
            };
          } else {
            // If backend rejects submission, fall through to queuing
            console.log("⚠️ Backend rejected submission:", response.message);
            throw new Error(response.message || "Backend submission failed");
          }
        } catch (error) {
          console.log(
            "⚠️ Immediate submission failed, queuing for later:",
            error
          );
          this.setLoadingState(
            true,
            "submitEntry",
            "Server issue, queuing for retry...",
            85
          );
          // Fall through to queue the entry
        }
      } else {
        this.setLoadingState(
          true,
          "submitEntry",
          "Connection not stable, queuing for later...",
          80
        );
      }

      // Queue for later submission
      const queueId = await this.addToOfflineQueue(
        "entry",
        entryWithCalculations,
        5 // High priority
      );
      console.log(`📦 Entry queued with ID: ${queueId}`);

      // Store mismatch data locally even when queued
      if (
        entryWithCalculations.consumptionMismatch !== 0 ||
        entryWithCalculations.hoursMismatch !== 0
      ) {
        await this.storeMismatchData(entryWithCalculations, machine);
      }

      this.setLoadingState(
        false,
        "submitEntry",
        "Entry saved locally and queued"
      );

      const connectionMessage = !this.connectionStatus.isInternetReachable
        ? "Entry saved locally and queued for submission when online."
        : !this.connectionStatus.isConnected
        ? "Entry saved locally and will be submitted when backend connection is restored."
        : "Entry saved locally and will be submitted when connection stabilizes.";

      return {
        success: true,
        message: connectionMessage,
        hasWarnings: warnings.length > 0,
        warningMessages: warnings.map((w) => w.message),
        usage: usage,
        rate: rate,
        newLastReading: entry.endReading,
        machineType: machine.machineType,
      };
    } catch (error) {
      console.error("💥 Error submitting entry:", error);
      this.setLoadingState(false, "submitEntry", "Submission failed");
      return {
        success: false,
        message: `Failed to submit entry: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  // Check entry warnings without blocking submission
  private checkEntryWarnings(
    entry: DieselEntry,
    machine: Machine,
    usage: number,
    rate: number
  ): Array<{ type: string; message: string; severity: string }> {
    const warnings: Array<{ type: string; message: string; severity: string }> =
      [];

    // Over consumption check for L/hr machines
    if (
      machine.machineType === "L/hr" &&
      machine.standardAvgDiesel &&
      machine.standardAvgDiesel > 0
    ) {
      const threshold = machine.standardAvgDiesel * 1.15; // 15% tolerance
      if (rate > threshold) {
        const excess = rate - machine.standardAvgDiesel;
        const severity =
          excess > machine.standardAvgDiesel * 0.5
            ? "high"
            : excess > machine.standardAvgDiesel * 0.25
            ? "medium"
            : "low";
        warnings.push({
          type: "OVER_CONSUMPTION",
          message: `⚠️ High consumption: ${rate.toFixed(
            2
          )} L/hr vs standard ${machine.standardAvgDiesel.toFixed(
            2
          )} L/hr (+${excess.toFixed(2)})`,
          severity,
        });
      }
    }

    // Low efficiency check for KM/l machines
    if (
      machine.machineType === "KM/l" &&
      machine.standardAvgDiesel &&
      machine.standardAvgDiesel > 0
    ) {
      const threshold = machine.standardAvgDiesel * 0.85; // 15% tolerance
      if (rate < threshold) {
        const deficit = machine.standardAvgDiesel - rate;
        const severity =
          deficit > machine.standardAvgDiesel * 0.3
            ? "high"
            : deficit > machine.standardAvgDiesel * 0.15
            ? "medium"
            : "low";
        warnings.push({
          type: "LOW_EFFICIENCY",
          message: `⚠️ Low efficiency: ${rate.toFixed(
            2
          )} KM/l vs standard ${machine.standardAvgDiesel.toFixed(
            2
          )} KM/l (-${deficit.toFixed(2)})`,
          severity,
        });
      }
    }

    // Idle machine check
    if (machine.expectedDailyHours && machine.expectedDailyHours > 0) {
      const threshold = machine.expectedDailyHours * 0.7; // 30% tolerance
      if (usage < threshold) {
        const deficit = machine.expectedDailyHours - usage;
        const severity =
          deficit > machine.expectedDailyHours * 0.5
            ? "high"
            : deficit > machine.expectedDailyHours * 0.3
            ? "medium"
            : "low";
        warnings.push({
          type: "IDLE_MACHINE",
          message: `💤 Low usage: ${usage.toFixed(1)} ${
            machine.machineType === "KM/l" ? "km" : "hrs"
          } vs expected ${machine.expectedDailyHours.toFixed(
            1
          )} hrs (-${deficit.toFixed(1)})`,
          severity,
        });
      }
    }

    // Extreme values check
    if (machine.machineType === "L/hr" && rate > 20) {
      warnings.push({
        type: "EXTREME_CONSUMPTION",
        message: `🚨 Extremely high consumption: ${rate.toFixed(
          2
        )} L/hr - please verify readings`,
        severity: "high",
      });
    }

    if (machine.machineType === "KM/l" && rate < 0.5) {
      warnings.push({
        type: "EXTREME_INEFFICIENCY",
        message: `🚨 Extremely low efficiency: ${rate.toFixed(
          2
        )} KM/l - please verify readings`,
        severity: "high",
      });
    }

    return warnings;
  }

  // Store mismatch data locally and send to backend
  private async storeMismatchData(
    entry: DieselEntry,
    machine: Machine
  ): Promise<void> {
    try {
      const mismatchRecord: MismatchData = {
        id: `mismatch_${entry.id}_${Date.now()}`,
        machineName: entry.machineName,
        plate: machine.plate || "",
        machineType: machine.machineType || "L/hr",
        timestamp: entry.timestamp || new Date().toISOString(),
        consumptionMismatch: entry.consumptionMismatch || 0,
        hoursMismatch: entry.hoursMismatch || 0,
        standardConsumption: machine.standardAvgDiesel || 0,
        actualConsumption: entry.rate || 0,
        standardHours: machine.expectedDailyHours || 0,
        actualHours: entry.usage || 0,
        severity: this.calculateMismatchSeverity(
          entry.consumptionMismatch || 0,
          entry.hoursMismatch || 0,
          machine.machineType
        ),
        warningTypes: entry.warningTypes || [],
      };

      // Store locally
      const existingMismatch =
        (await this.getCachedData<MismatchData[]>(
          STORAGE_KEYS.MISMATCH_DATA
        )) || [];
      existingMismatch.unshift(mismatchRecord);
      await this.cacheData(
        STORAGE_KEYS.MISMATCH_DATA,
        existingMismatch.slice(0, 1000)
      ); // Keep last 1000

      // Try to send to backend if connected and stable
      if (
        this.connectionStatus.isConnected &&
        this.connectionStatus.isInternetReachable &&
        this.connectionStatus.connectionStable
      ) {
        try {
          await this.makeRequest(CONFIG.APPS_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({
              action: "storeMismatchData",
              mismatchData: mismatchRecord,
              timestamp: Date.now(),
            }),
          });
          console.log("✅ Mismatch data sent to backend successfully");
        } catch (error) {
          console.log(
            "⚠️ Failed to send mismatch data to backend, stored locally"
          );
        }
      }

      console.log(`📊 Mismatch data stored: ${mismatchRecord.id}`);
    } catch (error) {
      console.error("❌ Error storing mismatch data:", error);
    }
  }

  async addInventory(inventory: InventoryEntry): Promise<ApiResponse> {
    this.setLoadingState(true, "addInventory", "Adding inventory...");
    console.log("📦 Adding inventory...");

    try {
      this.setLoadingState(
        true,
        "addInventory",
        "Processing inventory data...",
        20
      );

      const inventoryWithMeta = {
        ...inventory,
        id:
          inventory.id ||
          `inventory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: "IN" as const,
        timestamp: inventory.timestamp || new Date().toISOString(),
        createdAt: inventory.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.setLoadingState(
        true,
        "addInventory",
        "Updating local inventory...",
        40
      );

      // Update local cache immediately
      const currentInventory = await this.getInventory();
      const existingIndex = currentInventory.transactions.findIndex(
        (t) => t.id === inventoryWithMeta.id
      );
      if (existingIndex === -1) {
        currentInventory.transactions.unshift(inventoryWithMeta);
        currentInventory.currentStock += inventory.litersReceived;
        await this.cacheData(STORAGE_KEYS.INVENTORY, currentInventory);
      }

      if (
        this.connectionStatus.isConnected &&
        this.connectionStatus.isInternetReachable &&
        this.connectionStatus.connectionStable
      ) {
        // Try to submit immediately
        try {
          console.log("📡 Attempting immediate inventory submission...");
          this.setLoadingState(
            true,
            "addInventory",
            "Submitting to server...",
            70
          );

          const params = new URLSearchParams({
            action: "addInventory",
            litersReceived: inventory.litersReceived.toString(),
            receiptNumber: inventory.receiptNumber || "",
            remarks: inventory.remarks || "",
            receiptImage: inventory.receiptImage || "",
            phoneNumber: inventory.phoneNumber,
            timestamp: Date.now().toString(),
          });

          const response = await this.makeRequest(
            `${CONFIG.APPS_SCRIPT_URL}?${params}`
          );

          if (response.success) {
            console.log("✅ Inventory added successfully!");
            this.setLoadingState(
              false,
              "addInventory",
              "Inventory added successfully!"
            );
            return {
              success: true,
              message: "Inventory added successfully!",
            };
          } else {
            throw new Error(response.message || "Submission failed");
          }
        } catch (error) {
          console.log(
            "⚠️ Immediate inventory submission failed, queuing for later:",
            error
          );
          this.setLoadingState(
            true,
            "addInventory",
            "Server unavailable, queuing...",
            85
          );
          // Fall through to queue the entry
        }
      } else {
        this.setLoadingState(
          true,
          "addInventory",
          "Connection not stable, queuing for later...",
          80
        );
      }

      // Queue for later submission
      const queueId = await this.addToOfflineQueue(
        "inventory",
        inventoryWithMeta,
        4
      ); // High priority
      console.log(`📦 Inventory queued with ID: ${queueId}`);

      this.setLoadingState(
        false,
        "addInventory",
        "Inventory saved locally and queued"
      );

      const connectionMessage = !this.connectionStatus.isInternetReachable
        ? "Inventory saved locally and queued for submission when online."
        : !this.connectionStatus.isConnected
        ? "Inventory saved locally and will be submitted when backend connection is restored."
        : "Inventory saved locally and will be submitted when connection stabilizes.";

      return {
        success: true,
        message: connectionMessage,
      };
    } catch (error) {
      console.error("💥 Error adding inventory:", error);
      this.setLoadingState(false, "addInventory", "Failed to add inventory");
      return {
        success: false,
        message: `Failed to add inventory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  async addMachine(
    machine: Omit<Machine, "lastReading" | "id">
  ): Promise<ApiResponse> {
    this.setLoadingState(true, "addMachine", "Adding new machine...");
    console.log("🏗️ Adding machine...");

    try {
      this.setLoadingState(
        true,
        "addMachine",
        "Validating machine data...",
        10
      );

      // Validation with progress updates
      if (!machine.name?.trim()) {
        this.setLoadingState(false, "addMachine", "Validation failed");
        return { success: false, message: "Machine name is required" };
      }

      if (!machine.plate?.trim()) {
        this.setLoadingState(false, "addMachine", "Validation failed");
        return { success: false, message: "Plate number is required" };
      }

      this.setLoadingState(
        true,
        "addMachine",
        "Checking for duplicates...",
        25
      );

      // Check for duplicates in local cache
      const existingMachines = await this.getMachines();
      const duplicateName = existingMachines.find(
        (m) => m.name.toLowerCase() === machine.name.trim().toLowerCase()
      );
      const duplicatePlate = existingMachines.find(
        (m) => m.plate?.toLowerCase() === machine.plate.trim().toLowerCase()
      );

      if (duplicateName) {
        this.setLoadingState(false, "addMachine", "Duplicate name found");
        return {
          success: false,
          message: `Machine with name "${machine.name}" already exists`,
        };
      }

      if (duplicatePlate) {
        this.setLoadingState(false, "addMachine", "Duplicate plate found");
        return {
          success: false,
          message: `Machine with plate "${machine.plate}" already exists`,
        };
      }

      this.setLoadingState(
        true,
        "addMachine",
        "Creating machine record...",
        50
      );

      // Create machine with metadata
      const machineWithMeta: Machine = {
        ...machine,
        name: machine.name.trim(),
        plate: machine.plate.trim(),
        machineType: machine.machineType || "L/hr",
        ownershipType: machine.ownershipType || "Own",
        doorNo: machine.doorNo?.trim() || "",
        remarks: machine.remarks?.trim() || "",
        dateAdded: machine.dateAdded || new Date().toISOString().split("T")[0],
        id: `machine_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastReading: machine.initialReading || 0,
      };

      this.setLoadingState(true, "addMachine", "Updating local cache...", 60);

      // Update local cache immediately for better UX
      const machines = [...existingMachines, machineWithMeta];
      await this.cacheData(STORAGE_KEYS.MACHINES, machines);

      console.log(`📱 Machine added to local cache: ${machineWithMeta.name}`);

      if (
        this.connectionStatus.isConnected &&
        this.connectionStatus.isInternetReachable &&
        this.connectionStatus.connectionStable
      ) {
        // Try to submit immediately
        try {
          console.log("📡 Attempting immediate machine submission...");
          this.setLoadingState(
            true,
            "addMachine",
            "Submitting to server...",
            80
          );

          const params = new URLSearchParams({
            action: "addMachineEnhanced",
            machineName: machineWithMeta.name,
            machinePlate: machineWithMeta.plate,
            machineType: machineWithMeta.machineType,
            ownershipType: machineWithMeta.ownershipType,
            initialReading: machineWithMeta.initialReading!.toString(),
            standardAvgDiesel: machineWithMeta.standardAvgDiesel!.toString(),
            expectedDailyHours: machineWithMeta.expectedDailyHours!.toString(),
            doorNo: machineWithMeta.doorNo || "",
            remarks: machineWithMeta.remarks || "",
            dateAdded: machineWithMeta.dateAdded!,
            timestamp: Date.now().toString(),
          });

          const response = await this.makeRequest(
            `${CONFIG.APPS_SCRIPT_URL}?${params}`
          );

          if (response.success) {
            console.log("✅ Machine added successfully to backend!");
            this.setLoadingState(
              false,
              "addMachine",
              "Machine added successfully!"
            );
            return {
              success: true,
              message: "Machine added successfully!",
              machineId: `${machineWithMeta.name}-${machineWithMeta.plate}`,
              machineName: machineWithMeta.name,
              machinePlate: machineWithMeta.plate,
            };
          } else {
            throw new Error(response.message || "Backend submission failed");
          }
        } catch (error) {
          console.log(
            "⚠️ Immediate machine submission failed, queuing for later:",
            error
          );
          this.setLoadingState(
            true,
            "addMachine",
            "Server unavailable, queuing...",
            90
          );
          // Fall through to queue the entry
        }
      } else {
        this.setLoadingState(
          true,
          "addMachine",
          "Connection not stable, queuing for later...",
          85
        );
      }

      // Queue for later submission
      const queueId = await this.addToOfflineQueue("machine", machine, 3); // Medium priority
      console.log(`📦 Machine queued with ID: ${queueId}`);

      this.setLoadingState(
        false,
        "addMachine",
        "Machine saved locally and queued"
      );

      const connectionMessage = !this.connectionStatus.isInternetReachable
        ? "Machine saved locally and queued for submission when online."
        : !this.connectionStatus.isConnected
        ? "Machine saved locally and will be submitted when backend connection is restored."
        : "Machine saved locally and will be submitted when connection stabilizes.";

      return {
        success: true,
        message: connectionMessage,
        machineId: `${machineWithMeta.name}-${machineWithMeta.plate}`,
        machineName: machineWithMeta.name,
        machinePlate: machineWithMeta.plate,
      };
    } catch (error) {
      console.error("💥 Error adding machine:", error);
      this.setLoadingState(false, "addMachine", "Failed to add machine");
      return {
        success: false,
        message: `Failed to add machine: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  // Updated updateMachine method with stability checks
  async updateMachine(
    machineName: string,
    updates: Partial<Machine>
  ): Promise<ApiResponse> {
    try {
      console.log(`✏️ Updating machine: ${machineName}`, updates);

      // Validate machine exists
      const machines = await this.getMachines();
      const machineIndex = machines.findIndex((m) => m.name === machineName);

      if (machineIndex === -1) {
        return {
          success: false,
          message: `Machine "${machineName}" not found`,
        };
      }

      const existingMachine = machines[machineIndex];

      // Validate updates
      if (updates.name && updates.name !== machineName) {
        const duplicateName = machines.find(
          (m) =>
            m.name !== machineName &&
            m.name.toLowerCase() === updates.name!.trim().toLowerCase()
        );
        if (duplicateName) {
          return {
            success: false,
            message: `Machine with name "${updates.name}" already exists`,
          };
        }
      }

      if (updates.plate && updates.plate !== existingMachine.plate) {
        const duplicatePlate = machines.find(
          (m) =>
            m.name !== machineName &&
            m.plate?.toLowerCase() === updates.plate!.trim().toLowerCase()
        );
        if (duplicatePlate) {
          return {
            success: false,
            message: `Machine with plate "${updates.plate}" already exists`,
          };
        }
      }

      // Validate numeric fields
      if (
        updates.standardAvgDiesel !== undefined &&
        updates.standardAvgDiesel <= 0
      ) {
        return {
          success: false,
          message: "Standard average diesel must be greater than 0",
        };
      }

      if (
        updates.expectedDailyHours !== undefined &&
        updates.expectedDailyHours <= 0
      ) {
        return {
          success: false,
          message: "Expected daily hours must be greater than 0",
        };
      }

      if (updates.lastReading !== undefined && updates.lastReading < 0) {
        return {
          success: false,
          message: "Last reading cannot be negative",
        };
      }

      // Apply updates to local cache immediately
      const updatedMachine = {
        ...existingMachine,
        ...updates,
        name: updates.name?.trim() || existingMachine.name,
        plate: updates.plate?.trim() || existingMachine.plate,
        doorNo: updates.doorNo?.trim() || existingMachine.doorNo,
        remarks: updates.remarks?.trim() || existingMachine.remarks,
        updatedAt: new Date().toISOString(),
      };

      machines[machineIndex] = updatedMachine;
      await this.cacheData(STORAGE_KEYS.MACHINES, machines);

      console.log(`📱 Machine updated in local cache: ${updatedMachine.name}`);

      if (
        this.connectionStatus.isConnected &&
        this.connectionStatus.isInternetReachable &&
        this.connectionStatus.connectionStable
      ) {
        try {
          console.log("📡 Attempting immediate machine update...");

          const response = await this.makeRequest(CONFIG.APPS_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({
              action: "editMachine",
              oldName: machineName,
              machineName: updates.name || machineName,
              machinePlate: updates.plate || existingMachine.plate,
              machineType: updates.machineType || existingMachine.machineType,
              ownershipType:
                updates.ownershipType || existingMachine.ownershipType,
              lastReading:
                updates.lastReading !== undefined
                  ? updates.lastReading
                  : existingMachine.lastReading,
              standardAvgDiesel:
                updates.standardAvgDiesel !== undefined
                  ? updates.standardAvgDiesel
                  : existingMachine.standardAvgDiesel,
              expectedDailyHours:
                updates.expectedDailyHours !== undefined
                  ? updates.expectedDailyHours
                  : existingMachine.expectedDailyHours,
              doorNo:
                updates.doorNo !== undefined
                  ? updates.doorNo
                  : existingMachine.doorNo,
              remarks:
                updates.remarks !== undefined
                  ? updates.remarks
                  : existingMachine.remarks,
              dateAdded: updates.dateAdded || existingMachine.dateAdded,
              updatedAt: new Date().toISOString(),
              timestamp: Date.now(),
            }),
          });

          if (response.success) {
            console.log("✅ Machine updated successfully in backend!");
            return {
              success: true,
              message: "Machine updated successfully!",
              updatedMachine: {
                name: updatedMachine.name,
                plate: updatedMachine.plate,
                machineType: updatedMachine.machineType,
                ownershipType: updatedMachine.ownershipType,
              },
            };
          } else {
            throw new Error(response.message || "Backend update failed");
          }
        } catch (error) {
          console.log(
            "⚠️ Immediate machine update failed, queuing for later:",
            error
          );
          // Fall through to queue the update
        }
      }

      // Queue for later submission
      const queueId = await this.addToOfflineQueue(
        "machineUpdate",
        { machineName, updates },
        2 // Medium priority
      );
      console.log(`📦 Machine update queued with ID: ${queueId}`);

      const connectionMessage = !this.connectionStatus.isInternetReachable
        ? "Machine updated locally and queued for sync when online."
        : !this.connectionStatus.isConnected
        ? "Machine updated locally and will be synced when backend connection is restored."
        : "Machine updated locally and will be synced when connection stabilizes.";

      return {
        success: true,
        message: connectionMessage,
        updatedMachine: {
          name: updatedMachine.name,
          plate: updatedMachine.plate,
          machineType: updatedMachine.machineType,
          ownershipType: updatedMachine.ownershipType,
        },
      };
    } catch (error) {
      console.error("❌ Error updating machine:", error);
      return {
        success: false,
        message: `Failed to update machine: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  async deleteMachine(
    machineName: string,
    options?: {
      forceDelete?: boolean;
      deletionReason?: string;
      deletedBy?: string;
    }
  ): Promise<ApiResponse> {
    try {
      console.log(`🗑️ Deleting machine: ${machineName}`, options);

      // Validate machine exists
      const machines = await this.getMachines();
      const machineIndex = machines.findIndex((m) => m.name === machineName);

      if (machineIndex === -1) {
        return {
          success: false,
          message: `Machine "${machineName}" not found`,
        };
      }

      const machineToDelete = machines[machineIndex];

      // Check if machine has logs locally (safety check)
      const logs =
        (await this.getCachedData<DieselEntry[]>(STORAGE_KEYS.LOGS)) || [];
      const hasLogs = logs.some((log) => log.machineName === machineName);

      if (hasLogs && !options?.forceDelete) {
        return {
          success: false,
          message:
            "Cannot delete machine with existing diesel entries. Use force delete if you want to proceed.",
          hasLogs: true,
          requiresConfirmation: true,
          machineData: {
            name: machineToDelete.name,
            plate: machineToDelete.plate,
            totalEntries: logs.filter((log) => log.machineName === machineName)
              .length,
          },
        };
      }

      // Create backup of machine data for audit trail
      const deletionRecord = {
        deletedAt: new Date().toISOString(),
        deletedBy: options?.deletedBy || "User",
        deletionReason: options?.deletionReason || "No reason provided",
        machineData: { ...machineToDelete },
        hadLogs: hasLogs,
        forceDeleted: options?.forceDelete || false,
      };

      // Store deletion record in cache for audit
      const deletionHistory =
        (await this.getCachedData<any[]>("@diesel_tracker:deletion_history")) ||
        [];
      deletionHistory.unshift(deletionRecord);
      await this.cacheData(
        "@diesel_tracker:deletion_history",
        deletionHistory.slice(0, 100)
      ); // Keep last 100

      // Remove from local cache
      machines.splice(machineIndex, 1);
      await this.cacheData(STORAGE_KEYS.MACHINES, machines);

      console.log(
        `📱 Machine removed from local cache: ${machineToDelete.name}`
      );

      if (
        this.connectionStatus.isConnected &&
        this.connectionStatus.isInternetReachable &&
        this.connectionStatus.connectionStable
      ) {
        try {
          console.log("📡 Attempting immediate machine deletion...");

          const params = new URLSearchParams({
            action: "deleteMachine",
            machineName: machineName,
            forceDelete: options?.forceDelete ? "true" : "false",
            deletionReason: options?.deletionReason || "",
            deletedBy: options?.deletedBy || "User",
            timestamp: Date.now().toString(),
          });

          const response = await this.makeRequest(
            `${CONFIG.APPS_SCRIPT_URL}?${params}`
          );

          if (response.success) {
            console.log("✅ Machine deleted successfully from backend!");
            return {
              success: true,
              message: "Machine deleted successfully!",
              deletedMachine: {
                name: machineToDelete.name,
                plate: machineToDelete.plate,
              },
              deletionRecord: deletionRecord,
            };
          } else {
            if (response.requiresConfirmation) {
              // Backend found logs, restore machine to cache
              machines.splice(machineIndex, 0, machineToDelete);
              await this.cacheData(STORAGE_KEYS.MACHINES, machines);

              return {
                success: false,
                message: response.message,
                hasLogs: true,
                requiresConfirmation: true,
                machineData: response.deletedMachine,
              };
            }
            throw new Error(response.message || "Backend deletion failed");
          }
        } catch (error) {
          console.log(
            "⚠️ Immediate machine deletion failed, queuing for later:",
            error
          );
          // Fall through to queue the deletion
        }
      }

      // Queue for later submission
      const queueId = await this.addToOfflineQueue(
        "machineDelete",
        {
          machineName,
          machineData: machineToDelete,
          options,
        },
        1 // Low priority since it's destructive
      );
      console.log(`📦 Machine deletion queued with ID: ${queueId}`);

      const connectionMessage = !this.connectionStatus.isInternetReachable
        ? "Machine deleted locally and queued for sync when online."
        : !this.connectionStatus.isConnected
        ? "Machine deleted locally and will be synced when backend connection is restored."
        : "Machine deleted locally and will be synced when connection stabilizes.";

      return {
        success: true,
        message: connectionMessage,
        deletedMachine: {
          name: machineToDelete.name,
          plate: machineToDelete.plate,
        },
        deletionRecord: deletionRecord,
      };
    } catch (error) {
      console.error("❌ Error deleting machine:", error);
      return {
        success: false,
        message: `Failed to delete machine: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  async getMachineDetails(
    machineName: string
  ): Promise<ApiResponse & { machine?: Machine }> {
    try {
      const machines = await this.getMachines();
      const machine = machines.find((m) => m.name === machineName);

      if (!machine) {
        return {
          success: false,
          message: `Machine "${machineName}" not found`,
        };
      }

      return {
        success: true,
        message: "Machine details retrieved successfully",
        machine: machine,
      };
    } catch (error) {
      console.error("❌ Error getting machine details:", error);
      return {
        success: false,
        message: `Failed to get machine details: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  // Image upload
  async uploadImage(imageUri: string, fileName: string): Promise<string> {
    try {
      if (
        !this.connectionStatus.isConnected ||
        !this.connectionStatus.connectionStable
      ) {
        console.warn("⚠️ Cannot upload image without stable connection");
        return "";
      }

      // Convert image to base64
      const response = await fetch(imageUri);
      const blob = await response.blob();

      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const uploadResponse = await this.makeRequest<{ imageURL: string }>(
        CONFIG.APPS_SCRIPT_URL,
        {
          method: "POST",
          body: JSON.stringify({
            action: "uploadImage",
            fileName: fileName,
            mimeType: blob.type,
            data: base64Data,
            timestamp: Date.now(),
          }),
        }
      );

      if (uploadResponse.success && uploadResponse.imageURL) {
        return uploadResponse.imageURL;
      } else {
        throw new Error(uploadResponse.message || "Upload failed");
      }
    } catch (error) {
      console.error("❌ Error uploading image:", error);
      return "";
    }
  }

  // Cache Management
  async cacheData(key: string, data: any): Promise<void> {
    try {
      const cacheEntry = {
        data,
        timestamp: Date.now(),
        expires: Date.now() + CONFIG.CACHE_DURATION,
      };
      await AsyncStorage.setItem(key, JSON.stringify(cacheEntry));
    } catch (error) {
      console.error("❌ Error caching data:", error);
    }
  }

  async getCachedData<T>(key: string): Promise<T | null> {
    try {
      const cached = await AsyncStorage.getItem(key);
      if (!cached) return null;

      const cacheEntry = JSON.parse(cached);

      // Check if cache is still valid
      if (cacheEntry.expires && Date.now() > cacheEntry.expires) {
        await AsyncStorage.removeItem(key);
        return null;
      }

      return cacheEntry.data;
    } catch (error) {
      console.error("❌ Error getting cached data:", error);
      return null;
    }
  }

  // Mock data methods
  private getMockMachines(): Machine[] {
    return [
      {
        id: "machine_1",
        name: "JCB-12",
        plate: "AP09AB1234",
        lastReading: 1250.5,
        machineType: "L/hr",
        ownershipType: "Rental",
        standardAvgDiesel: 4.0,
        expectedDailyHours: 8.0,
        doorNo: "A-01",
        remarks: "Primary excavator",
        dateAdded: "2024-01-15",
        initialReading: 1000.0,
        createdAt: "2024-01-15T08:00:00Z",
        updatedAt: new Date().toISOString(),
      },
      {
        id: "machine_2",
        name: "CAT-09",
        plate: "TN10CD5678",
        lastReading: 890.2,
        machineType: "L/hr",
        ownershipType: "Own",
        standardAvgDiesel: 3.5,
        expectedDailyHours: 6.0,
        doorNo: "B-02",
        remarks: "Secondary excavator",
        dateAdded: "2024-02-01",
        initialReading: 500.0,
        createdAt: "2024-02-01T09:00:00Z",
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  private getMockLogs(): DieselEntry[] {
    return [
      {
        id: "log_1",
        machineName: "JCB-12",
        startReading: 1200.0,
        endReading: 1250.5,
        dieselFilled: 45.0,
        remarks: "Full day operation",
        phoneNumber: "9876543210",
        timestamp: new Date().toISOString(),
        usage: 50.5,
        rate: 0.89,
        machineType: "L/hr",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "log_2",
        machineName: "CAT-09",
        startReading: 850.0,
        endReading: 890.2,
        dieselFilled: 35.0,
        remarks: "Half day operation",
        phoneNumber: "9876543210",
        timestamp: new Date().toISOString(),
        usage: 40.2,
        rate: 0.87,
        machineType: "L/hr",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  // Cleanup on app close
  destroy(): void {
    console.log("🧹 Cleaning up Enhanced DieselService...");

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }
    if (this.backendCheckInterval) {
      clearInterval(this.backendCheckInterval);
    }
    if (this.realTimeCheckInterval) {
      clearInterval(this.realTimeCheckInterval);
    }
    if (this.connectionStabilityTimeout) {
      clearTimeout(this.connectionStabilityTimeout);
    }
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
    }
  }
}

// Export singleton instance
export const DieselService = new EnhancedDieselServiceClass();
