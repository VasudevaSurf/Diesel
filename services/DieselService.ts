import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import NetInfo from "@react-native-community/netinfo";

// Configuration
const CONFIG = {
  APPS_SCRIPT_URL:
    "https://script.google.com/macros/s/AKfycbxtBrJY5SPUFtZv5cXu65SUSy7wyAIVHx6zYEtGG7pWu82JwrRegUWvw8LGBeSAo7DY/exec",
  ADMIN_PASSWORD: "admin123",
  INVENTORY_PASSWORD: "inventory456",
  TIMEOUT: 10000, // 10 seconds
  RETRY_ATTEMPTS: 3,
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
  SYNC_INTERVAL: 30000, // 30 seconds
  CONNECTION_CHECK_INTERVAL: 3000, // 3 seconds
  PING_CHECK_INTERVAL: 1000, // 1 second for very fast detection
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
};

const DEBUG_MODE = __DEV__;

// Global event listeners for real-time updates
const connectionListeners: ((status: ConnectionStatus) => void)[] = [];

// Types
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
}

export interface OverConsumptionAlert {
  machine: string;
  standardAvg: number;
  actualAvg: number;
  mismatch: number;
  timestamp: string;
  severity: "low" | "medium" | "high";
}

export interface IdleMachineAlert {
  machine: string;
  expectedHours: number;
  actualHours: number;
  mismatch: number;
  timestamp: string;
  severity: "low" | "medium" | "high";
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

class DieselServiceClass {
  private connectionStatus: ConnectionStatus = {
    isConnected: false,
    isInternetReachable: false,
    lastChecked: new Date().toISOString(),
    hasRealData: false,
  };

  private offlineQueue: QueuedItem[] = [];
  private isProcessingQueue: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private realTimeCheckInterval: NodeJS.Timeout | null = null;
  private netInfoUnsubscribe: (() => void) | null = null;
  private lastNetworkState: any = null;
  private isInitialized: boolean = false;

  constructor() {
    this.initializeService();
  }

  // Add connection listener for real-time updates
  addConnectionListener(
    callback: (status: ConnectionStatus) => void
  ): () => void {
    connectionListeners.push(callback);
    // Immediately call with current status
    callback(this.connectionStatus);

    // Return unsubscribe function
    return () => {
      const index = connectionListeners.indexOf(callback);
      if (index > -1) {
        connectionListeners.splice(index, 1);
      }
    };
  }

  // Notify all listeners of status changes
  private notifyConnectionListeners(): void {
    connectionListeners.forEach((listener) => {
      try {
        listener(this.connectionStatus);
      } catch (error) {
        console.error("Error in connection listener:", error);
      }
    });
  }

  // Enhanced initialization with immediate real-time monitoring
  private async initializeService(): Promise<void> {
    try {
      console.log("🚀 Initializing DieselService with real-time monitoring...");

      // Load cached data first
      await this.loadCachedData();

      // Start IMMEDIATE real-time network monitoring
      this.startAggressiveNetworkMonitoring();

      // Start connection checking
      this.startConnectionChecking();

      // Start auto-sync
      this.startAutoSync();

      // Initial connection check (non-blocking)
      this.performInitialConnectionCheck();

      this.isInitialized = true;
      console.log("✅ DieselService initialized with real-time monitoring");
    } catch (error) {
      console.error("❌ Failed to initialize service:", error);
      this.isInitialized = true;
    }
  }

  private async loadCachedData(): Promise<void> {
    try {
      // Load connection status but always start as disconnected
      const cachedStatus = await this.getCachedData<ConnectionStatus>(
        STORAGE_KEYS.CONNECTION_STATUS
      );
      if (cachedStatus) {
        this.connectionStatus = {
          ...cachedStatus,
          isConnected: false, // Always start as disconnected until verified
          isInternetReachable: false, // Will be updated by network monitoring
          lastChecked: new Date().toISOString(),
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

      console.log(
        `💾 Loaded cache - Has real data: ${this.connectionStatus.hasRealData}, Queue: ${this.offlineQueue.length} items`
      );
    } catch (error) {
      console.error("❌ Failed to load cached data:", error);
    }
  }

  // AGGRESSIVE real-time network monitoring with immediate updates
  private startAggressiveNetworkMonitoring(): void {
    console.log("🔥 Starting AGGRESSIVE real-time network monitoring...");

    try {
      // Primary monitoring with NetInfo (most reliable)
      this.netInfoUnsubscribe = NetInfo.addEventListener((state) => {
        console.log("🔄 IMMEDIATE Network change detected:", {
          type: state.type,
          isConnected: state.isConnected,
          isInternetReachable: state.isInternetReachable,
          timestamp: new Date().toISOString(),
        });

        this.handleNetworkStateChange(state);
      });

      // Also get immediate current state
      NetInfo.fetch()
        .then((state) => {
          console.log("📡 Initial network state:", state);
          this.handleNetworkStateChange(state);
        })
        .catch((error) => {
          console.error("❌ Failed to get initial NetInfo state:", error);
          this.fallbackToExpoNetworking();
        });
    } catch (error) {
      console.error("❌ NetInfo setup failed, using fallback:", error);
      this.fallbackToExpoNetworking();
    }

    // Ultra-fast backup monitoring for instant detection
    this.realTimeCheckInterval = setInterval(async () => {
      try {
        // Quick network check with expo-network as backup
        const expoState = await Network.getNetworkStateAsync();

        if (
          expoState.isInternetReachable !==
          this.connectionStatus.isInternetReachable
        ) {
          console.log(
            "⚡ BACKUP: Network state mismatch detected, updating..."
          );
          this.handleNetworkStateChange(expoState);
        }
      } catch (error) {
        // Silent error - this is just backup monitoring
      }
    }, CONFIG.PING_CHECK_INTERVAL);
  }

  // Fallback method when NetInfo fails
  private fallbackToExpoNetworking(): void {
    console.log("🔄 Using Expo Network as primary monitoring...");

    this.realTimeCheckInterval = setInterval(async () => {
      try {
        const networkState = await Network.getNetworkStateAsync();

        const currentStateKey = `${networkState.type}_${networkState.isConnected}_${networkState.isInternetReachable}`;
        const lastStateKey = this.lastNetworkState
          ? `${this.lastNetworkState.type}_${this.lastNetworkState.isConnected}_${this.lastNetworkState.isInternetReachable}`
          : null;

        if (currentStateKey !== lastStateKey) {
          console.log("🔄 Network state changed (Expo):", {
            from: this.lastNetworkState,
            to: networkState,
            timestamp: new Date().toISOString(),
          });

          this.handleNetworkStateChange(networkState);
          this.lastNetworkState = networkState;
        }
      } catch (error) {
        console.error("❌ Error in Expo network monitoring:", error);
      }
    }, CONFIG.PING_CHECK_INTERVAL);
  }

  // Unified network state change handler
  private handleNetworkStateChange(state: any): void {
    const wasInternetReachable = this.connectionStatus.isInternetReachable;

    // Update status IMMEDIATELY
    this.connectionStatus = {
      ...this.connectionStatus,
      isInternetReachable: state.isInternetReachable ?? false,
      networkType: state.type,
      networkState: `${state.type}_${state.isConnected}_${state.isInternetReachable}`,
      lastChecked: new Date().toISOString(),
    };

    // If internet connection changed
    if (wasInternetReachable !== state.isInternetReachable) {
      if (state.isInternetReachable) {
        console.log("🌟 INTERNET RESTORED! Checking backend...");
        // Remove any previous error
        this.connectionStatus.error = undefined;

        // Check backend connection IMMEDIATELY
        setTimeout(() => {
          this.checkBackendConnection().then((isBackendConnected) => {
            if (isBackendConnected && this.offlineQueue.length > 0) {
              console.log("⚡ Backend connected! Processing offline queue...");
              this.processOfflineQueue();
            }
          });
        }, 500); // Very short delay
      } else {
        console.log("❌ INTERNET LOST! Going offline...");
        this.connectionStatus.isConnected = false;
        this.connectionStatus.error = "No internet connection";
      }
    }

    // IMMEDIATELY cache and notify listeners
    this.cacheData(STORAGE_KEYS.CONNECTION_STATUS, this.connectionStatus);
    this.notifyConnectionListeners();
  }

  private startConnectionChecking(): void {
    this.connectionCheckInterval = setInterval(async () => {
      // Only check backend if we have internet
      if (this.connectionStatus.isInternetReachable) {
        const wasConnected = this.connectionStatus.isConnected;
        const isConnected = await this.checkBackendConnection();

        // Notify listeners if connection status changed
        if (wasConnected !== isConnected) {
          this.notifyConnectionListeners();
        }
      } else {
        // If no internet, ensure backend is marked as disconnected
        if (this.connectionStatus.isConnected) {
          this.connectionStatus.isConnected = false;
          this.connectionStatus.error = "No internet connection";
          this.cacheData(STORAGE_KEYS.CONNECTION_STATUS, this.connectionStatus);
          this.notifyConnectionListeners();
        }
      }
    }, CONFIG.CONNECTION_CHECK_INTERVAL);
  }

  private startAutoSync(): void {
    this.syncInterval = setInterval(async () => {
      if (
        this.connectionStatus.isConnected &&
        this.connectionStatus.isInternetReachable &&
        this.offlineQueue.length > 0
      ) {
        console.log("🔄 Auto-sync: Processing offline queue...");
        await this.processOfflineQueue();
      }
    }, CONFIG.SYNC_INTERVAL);
  }

  // Non-blocking initial connection check
  private async performInitialConnectionCheck(): Promise<void> {
    console.log("🔍 Performing initial connection check...");

    try {
      // Get current network state
      let networkState;
      try {
        networkState = await NetInfo.fetch();
      } catch (error) {
        console.log("⚠️ NetInfo fetch failed, using Expo Network...");
        networkState = await Network.getNetworkStateAsync();
      }

      console.log("📶 Initial network state:", networkState);

      // Update status based on network state
      this.connectionStatus = {
        ...this.connectionStatus,
        isInternetReachable: networkState.isInternetReachable ?? false,
        networkType: networkState.type,
        lastChecked: new Date().toISOString(),
      };

      if (networkState.isInternetReachable) {
        // Check backend connection
        const isBackendConnected = await this.checkBackendConnection();
        console.log(
          `🔗 Initial backend check: ${
            isBackendConnected ? "✅ Connected" : "❌ Failed"
          }`
        );
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
    console.log("🔍 Manual connection check requested...");

    try {
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
        this.connectionStatus = {
          ...this.connectionStatus,
          isConnected: false,
          isInternetReachable: false,
          lastChecked: new Date().toISOString(),
          error: "No internet connection",
          networkType: netInfoState.type,
        };
        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );
        this.notifyConnectionListeners();
        console.log("❌ No internet connection");
        return false;
      }

      // Update internet status
      this.connectionStatus.isInternetReachable = true;
      this.connectionStatus.networkType = netInfoState.type;
      this.connectionStatus.error = undefined;

      // Check backend connection
      const isConnected = await this.checkBackendConnection();
      this.notifyConnectionListeners();
      return isConnected;
    } catch (error) {
      console.error("❌ Connection check failed:", error);
      this.connectionStatus = {
        ...this.connectionStatus,
        isConnected: false,
        isInternetReachable: false,
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      };
      await this.cacheData(
        STORAGE_KEYS.CONNECTION_STATUS,
        this.connectionStatus
      );
      this.notifyConnectionListeners();
      return false;
    }
  }

  private async checkBackendConnection(): Promise<boolean> {
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
          console.log(`✅ Backend connected (${latency}ms)`);

          const wasConnected = this.connectionStatus.isConnected;

          this.connectionStatus = {
            ...this.connectionStatus,
            isConnected: true,
            lastChecked: new Date().toISOString(),
            latency,
            error: undefined,
          };

          await this.cacheData(
            STORAGE_KEYS.CONNECTION_STATUS,
            this.connectionStatus
          );

          // If we just connected and have items in queue, process them
          if (!wasConnected && this.offlineQueue.length > 0) {
            console.log("🚀 Backend connection restored, processing queue...");
            setTimeout(() => this.processOfflineQueue(), 500);
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

      this.connectionStatus = {
        ...this.connectionStatus,
        isConnected: false,
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

  // Enhanced data retrieval with real-time status
  async getMachines(): Promise<Machine[]> {
    try {
      console.log(
        `📋 Getting machines... (Connected: ${this.connectionStatus.isConnected}, Internet: ${this.connectionStatus.isInternetReachable})`
      );

      if (
        !this.connectionStatus.isConnected ||
        !this.connectionStatus.isInternetReachable
      ) {
        console.log("📱 Using cached/offline data for machines");
        const cached = await this.getCachedData<Machine[]>(
          STORAGE_KEYS.MACHINES
        );

        if (cached && cached.length > 0) {
          console.log(`✅ Returning ${cached.length} cached machines`);
          return cached;
        } else if (this.connectionStatus.hasRealData) {
          console.log("⚠️ No cached machines but should have real data");
          return [];
        } else {
          console.log("🎭 No cached data, returning demo machines");
          return this.getMockMachines();
        }
      }

      // Try to fetch from backend
      console.log("📡 Fetching machines from backend...");
      const response = await this.makeRequest<{ machines: Machine[] }>(
        `${CONFIG.APPS_SCRIPT_URL}?action=getMachines&timestamp=${Date.now()}`
      );

      if (response.success && response.machines) {
        console.log(
          `✅ Fetched ${response.machines.length} machines from backend`
        );

        // Cache the data
        await this.cacheData(STORAGE_KEYS.MACHINES, response.machines);

        // Mark that we have real data
        this.connectionStatus.hasRealData = true;
        await this.cacheData(STORAGE_KEYS.HAS_REAL_DATA, true);
        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );

        return response.machines;
      } else {
        throw new Error(response.message || "Failed to fetch machines");
      }
    } catch (error) {
      console.error("❌ Error fetching machines:", error);

      // Try to return cached data
      const cached = await this.getCachedData<Machine[]>(STORAGE_KEYS.MACHINES);
      if (cached && cached.length > 0) {
        console.log(`📱 Fallback to ${cached.length} cached machines`);
        return cached;
      }

      // Only return mock data if we've never had real data
      if (!this.connectionStatus.hasRealData) {
        console.log("🎭 Fallback to demo machines (no real data ever fetched)");
        return this.getMockMachines();
      }

      console.log("📭 No machines available");
      return [];
    }
  }

  async getInventory(): Promise<{
    currentStock: number;
    transactions: InventoryEntry[];
  }> {
    try {
      console.log(
        `📦 Getting inventory... (Connected: ${this.connectionStatus.isConnected}, Internet: ${this.connectionStatus.isInternetReachable})`
      );

      if (
        !this.connectionStatus.isConnected ||
        !this.connectionStatus.isInternetReachable
      ) {
        console.log("📱 Using cached/offline inventory data");
        const cached = await this.getCachedData<{
          currentStock: number;
          transactions: InventoryEntry[];
        }>(STORAGE_KEYS.INVENTORY);

        if (cached) {
          console.log(
            `✅ Returning cached inventory: ${cached.currentStock}L, ${cached.transactions.length} transactions`
          );
          return cached;
        } else if (this.connectionStatus.hasRealData) {
          console.log("⚠️ No cached inventory but should have real data");
          return { currentStock: 0, transactions: [] };
        } else {
          console.log("🎭 No cached data, returning demo inventory");
          return { currentStock: 475, transactions: [] };
        }
      }

      console.log("📡 Fetching inventory from backend...");
      const response = await this.makeRequest<{
        currentStock: number;
        transactions: InventoryEntry[];
      }>(
        `${CONFIG.APPS_SCRIPT_URL}?action=getInventory&timestamp=${Date.now()}`
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
        await this.cacheData(STORAGE_KEYS.HAS_REAL_DATA, true);
        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );

        return inventoryData;
      } else {
        throw new Error(response.message || "Failed to fetch inventory");
      }
    } catch (error) {
      console.error("❌ Error fetching inventory:", error);

      // Return cached data
      const cached = await this.getCachedData<{
        currentStock: number;
        transactions: InventoryEntry[];
      }>(STORAGE_KEYS.INVENTORY);

      if (cached) {
        console.log(`📱 Fallback to cached inventory: ${cached.currentStock}L`);
        return cached;
      }

      // Only return mock data if we've never had real data
      if (!this.connectionStatus.hasRealData) {
        console.log(
          "🎭 Fallback to demo inventory (no real data ever fetched)"
        );
        return { currentStock: 475, transactions: [] };
      }

      console.log("📭 No inventory data available");
      return { currentStock: 0, transactions: [] };
    }
  }

  async getLogs(filters?: {
    dateFrom?: string;
    dateTo?: string;
    machineName?: string;
    ownership?: string;
  }): Promise<{ logs: DieselEntry[]; success: boolean }> {
    try {
      console.log(
        `📊 Getting logs... (Connected: ${this.connectionStatus.isConnected}, Internet: ${this.connectionStatus.isInternetReachable})`
      );

      if (
        !this.connectionStatus.isConnected ||
        !this.connectionStatus.isInternetReachable
      ) {
        console.log("📱 Using cached/offline logs data");
        const cached = await this.getCachedData<DieselEntry[]>(
          STORAGE_KEYS.LOGS
        );

        if (cached && cached.length > 0) {
          console.log(`✅ Returning ${cached.length} cached logs`);
          return { logs: cached, success: true };
        } else if (this.connectionStatus.hasRealData) {
          console.log("⚠️ No cached logs but should have real data");
          return { logs: [], success: true };
        } else {
          console.log("🎭 No cached data, returning demo logs");
          return { logs: this.getMockLogs(), success: true };
        }
      }

      console.log("📡 Fetching logs from backend...");
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

      const response = await this.makeRequest<{ logs: DieselEntry[] }>(url);

      if (response.success && response.logs) {
        console.log(`✅ Fetched ${response.logs.length} logs from backend`);

        // Cache the data
        await this.cacheData(STORAGE_KEYS.LOGS, response.logs);

        // Mark that we have real data
        this.connectionStatus.hasRealData = true;
        await this.cacheData(STORAGE_KEYS.HAS_REAL_DATA, true);
        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );

        return { logs: response.logs, success: true };
      } else {
        throw new Error(response.message || "Failed to fetch logs");
      }
    } catch (error) {
      console.error("❌ Error fetching logs:", error);

      // Return cached data
      const cached = await this.getCachedData<DieselEntry[]>(STORAGE_KEYS.LOGS);
      if (cached && cached.length > 0) {
        console.log(`📱 Fallback to ${cached.length} cached logs`);
        return { logs: cached, success: false };
      }

      // Only return mock data if we've never had real data
      if (!this.connectionStatus.hasRealData) {
        console.log("🎭 Fallback to demo logs (no real data ever fetched)");
        return { logs: this.getMockLogs(), success: false };
      }

      console.log("📭 No logs available");
      return { logs: [], success: false };
    }
  }

  async getAlertsData(): Promise<{ alerts: AlertData; success: boolean }> {
    try {
      console.log(
        `🚨 Getting alerts... (Connected: ${this.connectionStatus.isConnected}, Internet: ${this.connectionStatus.isInternetReachable})`
      );

      if (
        !this.connectionStatus.isConnected ||
        !this.connectionStatus.isInternetReachable
      ) {
        console.log("📱 Using cached/offline alerts data");
        const cached = await this.getCachedData<AlertData>(
          "@diesel_tracker:alerts"
        );

        if (cached) {
          console.log(`✅ Returning cached alerts`);
          return { alerts: cached, success: true };
        } else if (this.connectionStatus.hasRealData) {
          console.log("⚠️ No cached alerts but should have real data");
          return {
            alerts: { overConsumption: [], idleMachines: [] },
            success: true,
          };
        } else {
          console.log("🎭 No cached data, returning demo alerts");
          return {
            alerts: { overConsumption: [], idleMachines: [] },
            success: true,
          };
        }
      }

      console.log("📡 Fetching alerts from backend...");
      const response = await this.makeRequest<{ alerts: AlertData }>(
        `${CONFIG.APPS_SCRIPT_URL}?action=getAlertsData&timestamp=${Date.now()}`
      );

      if (response.success) {
        const alertsData = response.alerts || {
          overConsumption: [],
          idleMachines: [],
        };

        // Cache the data
        await this.cacheData("@diesel_tracker:alerts", alertsData);

        // Mark that we have real data
        this.connectionStatus.hasRealData = true;
        await this.cacheData(STORAGE_KEYS.HAS_REAL_DATA, true);
        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );

        return { alerts: alertsData, success: true };
      } else {
        throw new Error(response.message || "Failed to fetch alerts data");
      }
    } catch (error) {
      console.error("❌ Error fetching alerts:", error);

      // Return cached data
      const cached = await this.getCachedData<AlertData>(
        "@diesel_tracker:alerts"
      );
      if (cached) {
        return { alerts: cached, success: false };
      }

      return {
        alerts: { overConsumption: [], idleMachines: [] },
        success: false,
      };
    }
  }

  // Enhanced offline queue management
  private async addToOfflineQueue(
    type: QueuedItem["type"],
    data: any,
    priority: number = 1,
    maxRetries: number = 5
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

    // Try to process immediately if connected
    if (
      this.connectionStatus.isConnected &&
      this.connectionStatus.isInternetReachable
    ) {
      console.log("⚡ Attempting immediate processing...");
      setTimeout(() => this.processOfflineQueue(), 100);
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
      this.connectionStatus.isInternetReachable
    ) {
      await this.processOfflineQueue();
    } else {
      console.log("⚠️ Cannot retry: no connection");
    }
  }

  // Enhanced offline queue processing
  private async processOfflineQueue(): Promise<void> {
    if (this.isProcessingQueue || this.offlineQueue.length === 0) {
      return;
    }

    if (
      !this.connectionStatus.isConnected ||
      !this.connectionStatus.isInternetReachable
    ) {
      console.log("⏸️ Cannot process queue: no connection");
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

          if (success) {
            processedItems.push(item.id);
            successCount++;
            console.log(`✅ Successfully processed ${item.type} ${item.id}`);
          } else {
            item.retryCount++;
            if (item.retryCount >= item.maxRetries) {
              console.error(
                `🚫 Max retries reached for ${item.type} ${item.id}, removing from queue`
              );
              processedItems.push(item.id);
            } else {
              failedItems.push(item);
              console.warn(
                `⚠️ Failed to process ${item.type} ${item.id}, will retry later (${item.retryCount}/${item.maxRetries})`
              );
            }
          }

          // Small delay between items
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`❌ Error processing queue item ${item.id}:`, error);
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
          `Remaining: ${this.offlineQueue.length}`
      );
    } catch (error) {
      console.error("💥 Error processing offline queue:", error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async processQueuedEntry(entryData: DieselEntry): Promise<boolean> {
    try {
      const response = await this.makeRequest(CONFIG.APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "submitEntryEnhanced",
          ...entryData,
          timestamp: Date.now(),
        }),
      });

      if (response.success) {
        // Update machine's last reading
        const machines = await this.getMachines();
        const machine = machines.find((m) => m.name === entryData.machineName);
        if (machine) {
          machine.lastReading = entryData.endReading;
          machine.updatedAt = new Date().toISOString();
          await this.cacheData(STORAGE_KEYS.MACHINES, machines);
        }

        // Update local logs cache
        const logs =
          (await this.getCachedData<DieselEntry[]>(STORAGE_KEYS.LOGS)) || [];
        const existingIndex = logs.findIndex((log) => log.id === entryData.id);
        if (existingIndex === -1) {
          logs.unshift(entryData);
          await this.cacheData(STORAGE_KEYS.LOGS, logs.slice(0, 1000));
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error("❌ Error processing queued entry:", error);
      return false;
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

  // API request method
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

      // Update connection status on successful request
      if (!this.connectionStatus.isConnected) {
        this.connectionStatus.isConnected = true;
        this.connectionStatus.lastChecked = new Date().toISOString();
        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );
        this.notifyConnectionListeners();
      }

      return data;
    } catch (error) {
      console.error(`💥 Request failed:`, error);

      // Update connection status on failed request
      const wasConnected = this.connectionStatus.isConnected;
      this.connectionStatus.isConnected = false;
      this.connectionStatus.error =
        error instanceof Error ? error.message : "Request failed";
      this.connectionStatus.lastChecked = new Date().toISOString();

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

  // Enhanced submission methods with immediate local updates and queue management
  async submitEntry(entry: DieselEntry): Promise<ApiResponse> {
    console.log("📝 Submitting diesel entry...");

    try {
      // Calculate additional fields
      const usage = entry.endReading - entry.startReading;
      const machine = (await this.getMachines()).find(
        (m) => m.name === entry.machineName
      );

      let rate = 0;
      if (machine?.machineType === "KM/l") {
        rate = entry.dieselFilled > 0 ? usage / entry.dieselFilled : 0;
      } else {
        rate = usage > 0 ? entry.dieselFilled / usage : 0;
      }

      const entryWithCalculations = {
        ...entry,
        id:
          entry.id ||
          `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        usage,
        rate,
        machineType: machine?.machineType || "L/hr",
        timestamp: entry.timestamp || new Date().toISOString(),
        createdAt: entry.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

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
      if (machine) {
        const machines = await this.getMachines();
        const index = machines.findIndex((m) => m.name === entry.machineName);
        if (index !== -1) {
          machines[index].lastReading = entry.endReading;
          machines[index].updatedAt = new Date().toISOString();
          await this.cacheData(STORAGE_KEYS.MACHINES, machines);
        }
      }

      if (
        this.connectionStatus.isConnected &&
        this.connectionStatus.isInternetReachable
      ) {
        // Try to submit immediately
        try {
          console.log("📡 Attempting immediate submission...");

          const response = await this.makeRequest(CONFIG.APPS_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({
              action: "submitEntryEnhanced",
              ...entryWithCalculations,
              timestamp: Date.now(),
            }),
          });

          if (response.success) {
            console.log("✅ Entry submitted successfully!");
            return {
              success: true,
              message: "Entry submitted successfully!",
            };
          } else {
            throw new Error(response.message || "Submission failed");
          }
        } catch (error) {
          console.log(
            "⚠️ Immediate submission failed, queuing for later:",
            error
          );
          // Fall through to queue the entry
        }
      }

      // Queue for later submission
      const queueId = await this.addToOfflineQueue(
        "entry",
        entryWithCalculations,
        5
      ); // High priority
      console.log(`📦 Entry queued with ID: ${queueId}`);

      return {
        success: true,
        message: this.connectionStatus.isInternetReachable
          ? "Entry saved locally and will be submitted when backend connection is restored."
          : "Entry saved locally and queued for submission when online.",
      };
    } catch (error) {
      console.error("💥 Error submitting entry:", error);
      return {
        success: false,
        message: `Failed to submit entry: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  async addInventory(inventory: InventoryEntry): Promise<ApiResponse> {
    console.log("📦 Adding inventory...");

    try {
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
        this.connectionStatus.isInternetReachable
      ) {
        // Try to submit immediately
        try {
          console.log("📡 Attempting immediate inventory submission...");

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
          // Fall through to queue the entry
        }
      }

      // Queue for later submission
      const queueId = await this.addToOfflineQueue(
        "inventory",
        inventoryWithMeta,
        4
      ); // High priority
      console.log(`📦 Inventory queued with ID: ${queueId}`);

      return {
        success: true,
        message: this.connectionStatus.isInternetReachable
          ? "Inventory saved locally and will be submitted when backend connection is restored."
          : "Inventory saved locally and queued for submission when online.",
      };
    } catch (error) {
      console.error("💥 Error adding inventory:", error);
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
    console.log("🏗️ Adding machine...");

    try {
      // Validate required fields
      if (!machine.name?.trim()) {
        return {
          success: false,
          message: "Machine name is required",
        };
      }

      if (!machine.plate?.trim()) {
        return {
          success: false,
          message: "Plate number is required",
        };
      }

      if (!machine.initialReading || machine.initialReading < 0) {
        return {
          success: false,
          message: "Valid initial reading is required",
        };
      }

      if (!machine.standardAvgDiesel || machine.standardAvgDiesel <= 0) {
        return {
          success: false,
          message: "Valid standard average diesel consumption is required",
        };
      }

      if (!machine.expectedDailyHours || machine.expectedDailyHours <= 0) {
        return {
          success: false,
          message: "Valid expected daily hours is required",
        };
      }

      // Check for duplicates in local cache
      const existingMachines = await this.getMachines();
      const duplicateName = existingMachines.find(
        (m) => m.name.toLowerCase() === machine.name.trim().toLowerCase()
      );
      const duplicatePlate = existingMachines.find(
        (m) => m.plate?.toLowerCase() === machine.plate.trim().toLowerCase()
      );

      if (duplicateName) {
        return {
          success: false,
          message: `Machine with name "${machine.name}" already exists`,
        };
      }

      if (duplicatePlate) {
        return {
          success: false,
          message: `Machine with plate "${machine.plate}" already exists`,
        };
      }

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

      // Update local cache immediately for better UX
      const machines = [...existingMachines, machineWithMeta];
      await this.cacheData(STORAGE_KEYS.MACHINES, machines);

      console.log(`📱 Machine added to local cache: ${machineWithMeta.name}`);

      if (
        this.connectionStatus.isConnected &&
        this.connectionStatus.isInternetReachable
      ) {
        // Try to submit immediately
        try {
          console.log("📡 Attempting immediate machine submission...");

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
          // Fall through to queue the entry
        }
      }

      // Queue for later submission
      const queueId = await this.addToOfflineQueue("machine", machine, 3); // Medium priority
      console.log(`📦 Machine queued with ID: ${queueId}`);

      return {
        success: true,
        message: this.connectionStatus.isInternetReachable
          ? "Machine saved locally and will be submitted when backend connection is restored."
          : "Machine saved locally and queued for submission when online.",
        machineId: `${machineWithMeta.name}-${machineWithMeta.plate}`,
        machineName: machineWithMeta.name,
        machinePlate: machineWithMeta.plate,
      };
    } catch (error) {
      console.error("💥 Error adding machine:", error);
      return {
        success: false,
        message: `Failed to add machine: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  // FIXED: updateMachine method in DieselService
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
        this.connectionStatus.isInternetReachable
      ) {
        try {
          console.log("📡 Attempting immediate machine update...");

          // FIXED: Use POST request with proper data structure
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

      return {
        success: true,
        message: this.connectionStatus.isInternetReachable
          ? "Machine updated locally and will be synced when backend connection is restored."
          : "Machine updated locally and queued for sync when online.",
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
        this.connectionStatus.isInternetReachable
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

      return {
        success: true,
        message: this.connectionStatus.isInternetReachable
          ? "Machine deleted locally and will be synced when backend connection is restored."
          : "Machine deleted locally and queued for sync when online.",
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

  /**
   * Get deletion history (audit trail)
   */
  async getDeletionHistory(): Promise<ApiResponse & { deletions?: any[] }> {
    try {
      const deletionHistory =
        (await this.getCachedData<any[]>("@diesel_tracker:deletion_history")) ||
        [];

      return {
        success: true,
        message: `Retrieved ${deletionHistory.length} deletion records`,
        deletions: deletionHistory,
      };
    } catch (error) {
      console.error("❌ Error getting deletion history:", error);
      return {
        success: false,
        message: `Failed to get deletion history: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  async restoreDeletedMachine(deletionRecordId: string): Promise<ApiResponse> {
    try {
      const deletionHistory =
        (await this.getCachedData<any[]>("@diesel_tracker:deletion_history")) ||
        [];
      const recordIndex = deletionHistory.findIndex(
        (record) => record.id === deletionRecordId
      );

      if (recordIndex === -1) {
        return {
          success: false,
          message: "Deletion record not found",
        };
      }

      const deletionRecord = deletionHistory[recordIndex];
      const machineToRestore = deletionRecord.machineData;

      // Check if machine name/plate conflicts with existing machines
      const existingMachines = await this.getMachines();
      const nameConflict = existingMachines.find(
        (m) => m.name === machineToRestore.name
      );
      const plateConflict = existingMachines.find(
        (m) => m.plate === machineToRestore.plate
      );

      if (nameConflict || plateConflict) {
        return {
          success: false,
          message:
            "Cannot restore: Machine name or plate number already exists",
        };
      }

      // Restore machine to cache
      const restoredMachine = {
        ...machineToRestore,
        id: `restored_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        updatedAt: new Date().toISOString(),
        restoredAt: new Date().toISOString(),
        restoredFrom: deletionRecordId,
      };

      existingMachines.push(restoredMachine);
      await this.cacheData(STORAGE_KEYS.MACHINES, existingMachines);

      // Remove from deletion history
      deletionHistory.splice(recordIndex, 1);
      await this.cacheData("@diesel_tracker:deletion_history", deletionHistory);

      // Queue restore operation for backend sync
      await this.addToOfflineQueue("machine", restoredMachine, 4); // High priority

      return {
        success: true,
        message: "Machine restored successfully",
        restoredMachine: {
          name: restoredMachine.name,
          plate: restoredMachine.plate,
        },
      };
    } catch (error) {
      console.error("❌ Error restoring machine:", error);
      return {
        success: false,
        message: `Failed to restore machine: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  // Image upload
  async uploadImage(imageUri: string, fileName: string): Promise<string> {
    try {
      if (!this.connectionStatus.isConnected) {
        console.warn("⚠️ Cannot upload image in demo mode");
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
    console.log("🧹 Cleaning up DieselService...");

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }
    if (this.realTimeCheckInterval) {
      clearInterval(this.realTimeCheckInterval);
    }
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
    }
  }
}

// Export singleton instance
export const DieselService = new DieselServiceClass();
