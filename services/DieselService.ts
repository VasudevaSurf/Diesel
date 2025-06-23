import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";

// Configuration
const CONFIG = {
  APPS_SCRIPT_URL:
    "https://script.google.com/macros/s/AKfycbxtBrJY5SPUFtZv5cXu65SUSy7wyAIVHx6zYEtGG7pWu82JwrRegUWvw8LGBeSAo7DY/exec",
  ADMIN_PASSWORD: "admin123",
  INVENTORY_PASSWORD: "inventory456",
  TIMEOUT: 15000, // Reduced to 15 seconds for better UX
  RETRY_ATTEMPTS: 3,
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
  SYNC_INTERVAL: 30000, // 30 seconds
  CONNECTION_CHECK_INTERVAL: 10000, // 10 seconds
  PING_CHECK_INTERVAL: 5000, // 5 seconds for quick ping checks
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
};

const DEBUG_MODE = __DEV__;

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
  type: "entry" | "inventory" | "machine" | "machineUpdate";
  data: any;
  timestamp: string;
  retryCount: number;
  maxRetries: number;
  priority: number; // Higher = more priority
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
}

export interface ConnectionStatus {
  isConnected: boolean;
  isInternetReachable: boolean;
  lastChecked: string;
  latency?: number;
  error?: string;
  networkType?: string;
  networkState?: string;
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
  };

  private offlineQueue: QueuedItem[] = [];
  private isProcessingQueue: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private quickPingInterval: NodeJS.Timeout | null = null;
  private lastNetworkState: any = null;

  constructor() {
    this.initializeService();
  }

  // Initialize service with enhanced connection monitoring
  private async initializeService(): Promise<void> {
    try {
      console.log("🚀 Initializing DieselService...");

      // Load cached data
      await this.loadCachedData();

      // Start network monitoring
      this.startNetworkMonitoring();

      // Start connection checking
      this.startConnectionChecking();

      // Start auto-sync
      this.startAutoSync();

      // Initial connection check
      this.checkConnection();

      console.log("✅ DieselService initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize service:", error);
    }
  }

  private async loadCachedData(): Promise<void> {
    try {
      // Load connection status
      const cachedStatus = await this.getCachedData<ConnectionStatus>(
        STORAGE_KEYS.CONNECTION_STATUS
      );
      if (cachedStatus) {
        this.connectionStatus = cachedStatus;
        console.log(
          "📱 Loaded cached connection status:",
          this.connectionStatus
        );
      }

      // Load offline queue
      const cachedQueue = await this.getCachedData<QueuedItem[]>(
        STORAGE_KEYS.OFFLINE_QUEUE
      );
      if (cachedQueue) {
        this.offlineQueue = cachedQueue;
        console.log(
          `📦 Loaded offline queue with ${this.offlineQueue.length} items`
        );
      }
    } catch (error) {
      console.error("❌ Failed to load cached data:", error);
    }
  }

  // Enhanced network monitoring using Expo Network
  private startNetworkMonitoring(): void {
    console.log("🌐 Starting network monitoring...");

    // Check network state periodically using a more aggressive approach
    this.quickPingInterval = setInterval(async () => {
      try {
        const networkState = await Network.getNetworkStateAsync();

        // Check if network state changed
        const currentStateKey = `${networkState.type}_${networkState.isConnected}_${networkState.isInternetReachable}`;
        const lastStateKey = this.lastNetworkState
          ? `${this.lastNetworkState.type}_${this.lastNetworkState.isConnected}_${this.lastNetworkState.isInternetReachable}`
          : null;

        if (currentStateKey !== lastStateKey) {
          console.log("🔄 Network state changed:", {
            from: this.lastNetworkState,
            to: networkState,
          });

          const wasInternetReachable =
            this.connectionStatus.isInternetReachable;

          this.connectionStatus = {
            ...this.connectionStatus,
            isInternetReachable: networkState.isInternetReachable ?? false,
            networkType: networkState.type,
            networkState: currentStateKey,
            lastChecked: new Date().toISOString(),
          };

          // If internet was restored, check backend and process queue
          if (!wasInternetReachable && networkState.isInternetReachable) {
            console.log("🌟 Internet connection restored!");

            // Check backend connection
            setTimeout(() => {
              this.checkBackendConnection().then((isBackendConnected) => {
                if (isBackendConnected && this.offlineQueue.length > 0) {
                  console.log(
                    "⚡ Processing offline queue after connection restored..."
                  );
                  this.processOfflineQueue();
                }
              });
            }, 1000); // Small delay to ensure connection is stable
          }

          // Cache the updated status
          this.cacheData(STORAGE_KEYS.CONNECTION_STATUS, this.connectionStatus);
          this.lastNetworkState = networkState;
        }
      } catch (error) {
        console.error("❌ Error checking network state:", error);
      }
    }, CONFIG.PING_CHECK_INTERVAL);
  }

  private startConnectionChecking(): void {
    this.connectionCheckInterval = setInterval(async () => {
      if (this.connectionStatus.isInternetReachable) {
        await this.checkBackendConnection();
      }
    }, CONFIG.CONNECTION_CHECK_INTERVAL);
  }

  private startAutoSync(): void {
    this.syncInterval = setInterval(async () => {
      if (this.connectionStatus.isConnected && this.offlineQueue.length > 0) {
        console.log("🔄 Auto-sync: Processing offline queue...");
        await this.processOfflineQueue();
      }
    }, CONFIG.SYNC_INTERVAL);
  }

  async getEnhancedAlertsData(): Promise<{
    alerts: EnhancedAlertData;
    success: boolean;
  }> {
    try {
      if (!this.connectionStatus.isConnected) {
        // Return mock data for offline mode
        const mockAlerts = this.getMockEnhancedAlerts();
        return { alerts: mockAlerts, success: true };
      }

      const response = await this.makeRequest<{ alerts: EnhancedAlertData }>(
        `${CONFIG.APPS_SCRIPT_URL}?action=getAlertsData&timestamp=${Date.now()}`
      );

      if (response.success && response.alerts) {
        // Cache alerts data
        await this.cacheData(
          "@diesel_tracker:enhanced_alerts",
          response.alerts
        );
        return { alerts: response.alerts, success: true };
      } else {
        throw new Error(response.message || "Failed to fetch enhanced alerts");
      }
    } catch (error) {
      console.error("❌ Error fetching enhanced alerts:", error);

      // Try to return cached data
      const cached = await this.getCachedData<EnhancedAlertData>(
        "@diesel_tracker:enhanced_alerts"
      );
      if (cached) {
        return { alerts: cached, success: false };
      }

      // Return mock data as fallback
      return { alerts: this.getMockEnhancedAlerts(), success: false };
    }
  }

  async getMachinePerformanceAnalytics(): Promise<{
    analytics: MachinePerformanceAnalytics[];
    summary: any;
    success: boolean;
  }> {
    try {
      if (!this.connectionStatus.isConnected) {
        return {
          analytics: this.getMockPerformanceAnalytics(),
          summary: this.getMockPerformanceSummary(),
          success: true,
        };
      }

      const response = await this.makeRequest<{
        analytics: MachinePerformanceAnalytics[];
        summary: any;
      }>(
        `${
          CONFIG.APPS_SCRIPT_URL
        }?action=getMachinePerformanceAnalytics&timestamp=${Date.now()}`
      );

      if (response.success) {
        await this.cacheData("@diesel_tracker:performance_analytics", {
          analytics: response.analytics,
          summary: response.summary,
        });

        return {
          analytics: response.analytics || [],
          summary: response.summary || {},
          success: true,
        };
      } else {
        throw new Error(
          response.message || "Failed to fetch performance analytics"
        );
      }
    } catch (error) {
      console.error("❌ Error fetching performance analytics:", error);

      // Try cached data
      const cached = await this.getCachedData<{
        analytics: MachinePerformanceAnalytics[];
        summary: any;
      }>("@diesel_tracker:performance_analytics");

      if (cached) {
        return { ...cached, success: false };
      }

      return {
        analytics: this.getMockPerformanceAnalytics(),
        summary: this.getMockPerformanceSummary(),
        success: false,
      };
    }
  }

  async updateAlertStatus(
    alertId: string,
    status: "acknowledged" | "resolved",
    resolvedBy?: string,
    comments?: string
  ): Promise<ApiResponse> {
    try {
      if (!this.connectionStatus.isConnected) {
        // For offline mode, just update local cache
        const cached = await this.getCachedData<EnhancedAlertData>(
          "@diesel_tracker:enhanced_alerts"
        );
        if (cached) {
          // Update status in all relevant arrays
          const updateAlertInArray = (alerts: AlertItem[]) => {
            const alert = alerts.find((a) => a.id === alertId);
            if (alert) {
              alert.status = status;
            }
          };

          updateAlertInArray(cached.recent);
          updateAlertInArray(cached.weekly);
          updateAlertInArray(cached.monthly);
          updateAlertInArray(cached.overConsumption);
          updateAlertInArray(cached.lowEfficiency);
          updateAlertInArray(cached.idleMachines);
          updateAlertInArray(cached.underWorked);
          updateAlertInArray(cached.maintenanceDue);
          updateAlertInArray(cached.unusualPatterns);

          await this.cacheData("@diesel_tracker:enhanced_alerts", cached);
        }

        // Queue for later sync
        await this.addToOfflineQueue(
          "alertUpdate",
          {
            alertId,
            status,
            resolvedBy,
            comments,
          },
          2
        );

        return {
          success: true,
          message: `Alert ${status} locally. Will sync when online.`,
        };
      }

      const response = await this.makeRequest(CONFIG.APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "updateAlertStatus",
          alertId,
          status,
          resolvedBy,
          comments,
          timestamp: Date.now(),
        }),
      });

      if (response.success) {
        // Update local cache
        const cached = await this.getCachedData<EnhancedAlertData>(
          "@diesel_tracker:enhanced_alerts"
        );
        if (cached) {
          // Update the alert status in cached data
          const updateAlertInArray = (alerts: AlertItem[]) => {
            const alert = alerts.find((a) => a.id === alertId);
            if (alert) {
              alert.status = status;
            }
          };

          updateAlertInArray(cached.recent);
          updateAlertInArray(cached.weekly);
          updateAlertInArray(cached.monthly);
          updateAlertInArray(cached.overConsumption);
          updateAlertInArray(cached.lowEfficiency);
          updateAlertInArray(cached.idleMachines);
          updateAlertInArray(cached.underWorked);
          updateAlertInArray(cached.maintenanceDue);
          updateAlertInArray(cached.unusualPatterns);

          await this.cacheData("@diesel_tracker:enhanced_alerts", cached);
        }

        return {
          success: true,
          message: `Alert ${status} successfully!`,
        };
      } else {
        throw new Error(response.message || "Failed to update alert status");
      }
    } catch (error) {
      console.error("❌ Error updating alert status:", error);
      return {
        success: false,
        message: `Failed to update alert status: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Export alerts data
   */
  async exportAlertsData(): Promise<{ data: any; success: boolean }> {
    try {
      if (!this.connectionStatus.isConnected) {
        // Generate export from cached data
        const alerts = await this.getCachedData<EnhancedAlertData>(
          "@diesel_tracker:enhanced_alerts"
        );
        const analytics = await this.getCachedData<{
          analytics: MachinePerformanceAnalytics[];
          summary: any;
        }>("@diesel_tracker:performance_analytics");

        return {
          data: {
            timestamp: new Date().toISOString(),
            alerts: alerts || this.getMockEnhancedAlerts(),
            analytics:
              analytics?.analytics || this.getMockPerformanceAnalytics(),
            summary: {
              alerts: alerts?.summary || {
                total: 0,
                high: 0,
                medium: 0,
                low: 0,
                critical: 0,
              },
              performance: analytics?.summary || {
                totalMachines: 0,
                highRisk: 0,
                mediumRisk: 0,
                lowRisk: 0,
              },
            },
            metadata: {
              version: "3.1",
              exportedBy: "Diesel Tracker Pro (Offline)",
              source: "cached-data",
            },
          },
          success: true,
        };
      }

      const response = await this.makeRequest<{ data: any }>(
        `${
          CONFIG.APPS_SCRIPT_URL
        }?action=exportAlertsData&timestamp=${Date.now()}`
      );

      if (response.success && response.data) {
        return { data: response.data, success: true };
      } else {
        throw new Error(response.message || "Failed to export alerts data");
      }
    } catch (error) {
      console.error("❌ Error exporting alerts data:", error);
      return {
        data: null,
        success: false,
      };
    }
  }

  /**
   * Generate mock enhanced alerts data for demo/offline mode
   */
  private getMockEnhancedAlerts(): EnhancedAlertData {
    const now = new Date();
    const mockAlerts: AlertItem[] = [
      {
        id: "alert_1",
        timestamp: now.toISOString(),
        machine: "JCB-12",
        plate: "AP09AB1234",
        alertType: "OVER_CONSUMPTION",
        severity: "high",
        standardValue: 4.0,
        actualValue: 6.5,
        mismatch: 2.5,
        unit: "L/hr",
        description: "Exceeded standard consumption by 2.5 L/hr",
        machineType: "L/hr",
        ownershipType: "Rental",
        status: "active",
        expectedHours: 8,
        actualHours: 7.5,
      },
      {
        id: "alert_2",
        timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        machine: "CAT-09",
        plate: "TN10CD5678",
        alertType: "IDLE_MACHINE",
        severity: "medium",
        standardValue: 8.0,
        actualValue: 5.5,
        mismatch: -2.5,
        unit: "hours",
        description: "Machine was idle for 2.5 hours below expected",
        machineType: "L/hr",
        ownershipType: "Own",
        status: "active",
        expectedHours: 8,
        actualHours: 5.5,
      },
      {
        id: "alert_3",
        timestamp: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
        machine: "TRUCK-01",
        plate: "KA20EF9012",
        alertType: "UNDER_WORKED",
        severity: "low",
        standardValue: 10.0,
        actualValue: 7.2,
        mismatch: -2.8,
        unit: "hours/day",
        description:
          "Machine under-utilized: averaging 7.2 hrs/day vs expected 10 hrs/day",
        machineType: "KM/l",
        ownershipType: "Own",
        status: "active",
        expectedHours: 10,
        actualHours: 7.2,
      },
    ];

    return {
      recent: [mockAlerts[0]],
      weekly: mockAlerts,
      monthly: mockAlerts,
      overConsumption: [mockAlerts[0]],
      lowEfficiency: [],
      idleMachines: [mockAlerts[1]],
      underWorked: [mockAlerts[2]],
      maintenanceDue: [],
      unusualPatterns: [],
      summary: {
        total: 3,
        high: 1,
        medium: 1,
        low: 1,
        critical: 0,
      },
    };
  }

  /**
   * Generate mock performance analytics
   */
  private getMockPerformanceAnalytics(): MachinePerformanceAnalytics[] {
    return [
      {
        machine: "JCB-12",
        plate: "AP09AB1234",
        machineType: "L/hr",
        ownershipType: "Rental",
        totalEntries: 15,
        avgDailyUsage: 7.5,
        avgConsumptionRate: 6.2,
        totalUsage: 112.5,
        totalDiesel: 697.5,
        efficiencyTrend: "declining",
        alertRisk: "high",
        recommendations: [
          "Monitor closely for consumption anomalies",
          "Check for fuel system issues",
          "Schedule maintenance inspection",
        ],
        standardValues: {
          expectedDaily: 8.0,
          standardConsumption: 4.0,
        },
      },
      {
        machine: "CAT-09",
        plate: "TN10CD5678",
        machineType: "L/hr",
        ownershipType: "Own",
        totalEntries: 12,
        avgDailyUsage: 6.8,
        avgConsumptionRate: 3.2,
        totalUsage: 81.6,
        totalDiesel: 261.12,
        efficiencyTrend: "stable",
        alertRisk: "medium",
        recommendations: [
          "Machine appears under-utilized",
          "Consider maintenance check",
        ],
        standardValues: {
          expectedDaily: 8.0,
          standardConsumption: 3.5,
        },
      },
    ];
  }

  /**
   * Generate mock performance summary
   */
  private getMockPerformanceSummary() {
    return {
      totalMachines: 2,
      highRisk: 1,
      mediumRisk: 1,
      lowRisk: 0,
      improving: 0,
      declining: 1,
      stable: 1,
    };
  }

  // Enhanced connection checking
  async checkConnection(): Promise<boolean> {
    console.log("🔍 Checking connection...");

    try {
      // First check internet connectivity using Expo Network
      const networkState = await Network.getNetworkStateAsync();

      console.log("📶 Network state:", networkState);

      if (!networkState.isInternetReachable) {
        this.connectionStatus = {
          ...this.connectionStatus,
          isConnected: false,
          isInternetReachable: false,
          lastChecked: new Date().toISOString(),
          error: "No internet connection",
          networkType: networkState.type,
        };
        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );
        console.log("❌ No internet connection");
        return false;
      }

      // Update internet status
      this.connectionStatus.isInternetReachable = true;
      this.connectionStatus.networkType = networkState.type;

      // Now check backend connection
      return await this.checkBackendConnection();
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
      return false;
    }
  }

  private async checkBackendConnection(): Promise<boolean> {
    const startTime = Date.now();

    try {
      console.log("🔗 Checking backend connection...");

      // Use a simple GET request first to test connectivity
      const testUrl = `${
        CONFIG.APPS_SCRIPT_URL
      }?action=testBackend&timestamp=${Date.now()}`;

      if (DEBUG_MODE) {
        console.log(`🔍 Testing connection with URL: ${testUrl}`);
      }

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

      if (DEBUG_MODE) {
        console.log(`📊 Response details:`, {
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get("content-type"),
          latency: `${latency}ms`,
        });
      }

      if (response.ok) {
        // Check if we got JSON response
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
            `Backend returned HTML instead of JSON. Content-Type: ${contentType}. This means the script URL is incorrect or not deployed properly.`
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

  async validateScriptDeployment(): Promise<{
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check URL format
    if (!CONFIG.APPS_SCRIPT_URL.includes("/macros/s/")) {
      issues.push("URL doesn't appear to be a deployed Google Apps Script URL");
      suggestions.push(
        "Make sure you're using the deployed web app URL, not the editor URL"
      );
    }

    if (!CONFIG.APPS_SCRIPT_URL.endsWith("/exec")) {
      issues.push("URL doesn't end with '/exec'");
      suggestions.push("The deployed web app URL should end with '/exec'");
    }

    if (CONFIG.APPS_SCRIPT_URL.includes("YOUR_ACTUAL_SCRIPT_ID")) {
      issues.push("Script ID placeholder hasn't been replaced");
      suggestions.push(
        "Replace 'YOUR_ACTUAL_SCRIPT_ID' with your actual script ID from deployment"
      );
    }

    // Try to access the URL
    try {
      const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const contentType = response.headers.get("content-type");

      if (!contentType || !contentType.includes("application/json")) {
        issues.push(`Script returns ${contentType} instead of JSON`);
        suggestions.push(
          "Check if the script is deployed properly as a web app"
        );
        suggestions.push(
          "Verify 'Execute as: Me' and 'Who has access: Anyone' settings"
        );
      }

      if (response.status === 403) {
        issues.push("Access forbidden");
        suggestions.push(
          "Check script permissions - set 'Who has access' to 'Anyone'"
        );
      }
    } catch (error) {
      issues.push(`Network error: ${error}`);
      suggestions.push("Check your internet connection and script URL");
    }

    return {
      isValid: issues.length === 0,
      issues,
      suggestions,
    };
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
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

  getQueueStatistics(): {
    totalItems: number;
    itemsByType: Record<string, number>;
    itemsByPriority: Record<number, number>;
    retryStatistics: {
      fresh: number;
      retried: number;
      nearMaxRetries: number;
    };
  } {
    const stats = {
      totalItems: this.offlineQueue.length,
      itemsByType: {} as Record<string, number>,
      itemsByPriority: {} as Record<number, number>,
      retryStatistics: {
        fresh: 0,
        retried: 0,
        nearMaxRetries: 0,
      },
    };

    this.offlineQueue.forEach((item) => {
      // Count by type
      stats.itemsByType[item.type] = (stats.itemsByType[item.type] || 0) + 1;

      // Count by priority
      stats.itemsByPriority[item.priority] =
        (stats.itemsByPriority[item.priority] || 0) + 1;

      // Count retry statistics
      if (item.retryCount === 0) {
        stats.retryStatistics.fresh++;
      } else if (item.retryCount >= item.maxRetries - 1) {
        stats.retryStatistics.nearMaxRetries++;
      } else {
        stats.retryStatistics.retried++;
      }
    });

    return stats;
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

      if (response.success) {
        return true;
      }

      return false;
    } catch (error) {
      console.error("❌ Error processing queued inventory:", error);
      return false;
    }
  }

  private async processQueuedMachine(
    machineData: Omit<Machine, "lastReading" | "id">
  ): Promise<boolean> {
    try {
      console.log(`🏗️ Processing queued machine: ${machineData.name}`);

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

      if (response.success) {
        console.log(
          `✅ Queued machine processed successfully: ${machineData.name}`
        );
        return true;
      } else {
        console.error(
          `❌ Failed to process queued machine: ${response.message}`
        );
        return false;
      }
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
      console.log(
        `✏️ Processing queued machine update: ${updateData.machineName}`
      );

      const params = new URLSearchParams({
        action: "editMachine",
        oldName: updateData.machineName,
        ...Object.entries(updateData.updates).reduce((acc, [key, value]) => {
          if (value !== undefined && value !== null) {
            acc[key] = value.toString();
          }
          return acc;
        }, {} as Record<string, string>),
        updatedAt: new Date().toISOString(),
        timestamp: Date.now().toString(),
      });

      const response = await this.makeRequest(
        `${CONFIG.APPS_SCRIPT_URL}?${params}`
      );

      if (response.success) {
        console.log(
          `✅ Queued machine update processed successfully: ${updateData.machineName}`
        );
        return true;
      } else {
        console.error(
          `❌ Failed to process queued machine update: ${response.message}`
        );
        return false;
      }
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
      console.log(
        `🗑️ Processing queued machine deletion: ${deleteData.machineName}`
      );

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

      if (response.success) {
        console.log(
          `✅ Queued machine deletion processed successfully: ${deleteData.machineName}`
        );
        return true;
      } else {
        console.error(
          `❌ Failed to process queued machine deletion: ${response.message}`
        );

        // If backend says machine has logs and we need confirmation,
        // we should restore the machine locally and notify user
        if (response.requiresConfirmation && response.hasLogs) {
          console.log(
            `⚠️ Machine ${deleteData.machineName} has logs in backend, restoration may be needed`
          );

          // Add restoration logic here if needed
          const machines = await this.getMachines();
          const existingMachine = machines.find(
            (m) => m.name === deleteData.machineName
          );

          if (!existingMachine) {
            // Restore machine to local cache since backend rejected deletion
            machines.push(deleteData.machineData);
            await this.cacheData(STORAGE_KEYS.MACHINES, machines);
            console.log(
              `🔄 Restored ${deleteData.machineName} to local cache due to backend logs`
            );
          }
        }

        return false;
      }
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
      console.log(`🚨 Processing queued alert update: ${alertData.alertId}`);

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

      if (response.success) {
        console.log(
          `✅ Queued alert update processed successfully: ${alertData.alertId}`
        );
        return true;
      } else {
        console.error(
          `❌ Failed to process queued alert update: ${response.message}`
        );
        return false;
      }
    } catch (error) {
      console.error("❌ Error processing queued alert update:", error);
      return false;
    }
  }

  /**
   * Enhanced offline queue processing with support for all machine operations
   */
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

              // Log failed items for debugging
              console.error(`💀 Failed item details:`, {
                id: item.id,
                type: item.type,
                data: item.data,
                retryCount: item.retryCount,
                maxRetries: item.maxRetries,
              });
            } else {
              failedItems.push(item);
              console.warn(
                `⚠️ Failed to process ${item.type} ${item.id}, will retry later (${item.retryCount}/${item.maxRetries})`
              );
            }
          }

          // Small delay between items to avoid overwhelming the backend
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`❌ Error processing queue item ${item.id}:`, error);
          item.retryCount++;
          if (item.retryCount < item.maxRetries) {
            failedItems.push(item);
          } else {
            processedItems.push(item.id);
            console.error(`💀 Item ${item.id} failed permanently:`, error);
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
      const removedCount = processedItems.length - successCount; // Items that failed permanently

      console.log(
        `✨ Queue processing complete. ` +
          `Processed: ${successCount}, ` +
          `Failed (will retry): ${failedCount}, ` +
          `Removed permanently: ${removedCount}, ` +
          `Remaining: ${this.offlineQueue.length}`
      );

      // If we have items that need retry, schedule next processing
      if (failedItems.length > 0) {
        console.log(
          `⏰ Scheduling retry for ${failedItems.length} failed items in 30 seconds`
        );
        setTimeout(() => {
          if (
            this.connectionStatus.isConnected &&
            this.connectionStatus.isInternetReachable
          ) {
            this.processOfflineQueue();
          }
        }, 30000); // Retry in 30 seconds
      }
    } catch (error) {
      console.error("💥 Error processing offline queue:", error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  // Enhanced API request with better error handling
  private async makeRequest<T>(
    url: string,
    options: RequestInit = {},
    retryCount: number = 0
  ): Promise<ApiResponse<T>> {
    try {
      if (DEBUG_MODE) {
        console.log(`🔍 Making request to: ${url}`);
        console.log(`📤 Request options:`, {
          method: options.method || "GET",
          headers: options.headers,
          body: options.body ? "Present" : "None",
        });
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

      if (DEBUG_MODE) {
        console.log(
          `📥 Response status: ${response.status} ${response.statusText}`
        );
        console.log(
          `📥 Response headers:`,
          Object.fromEntries(response.headers.entries())
        );
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content type
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error(`❌ Invalid content type: ${contentType}`);

        // Get the response text for debugging
        const responseText = await response.text();
        console.error(
          `📄 Response body (first 500 chars):`,
          responseText.substring(0, 500)
        );

        throw new Error(
          `Expected JSON response but got: ${contentType}. This usually means the script URL is incorrect or the script is not deployed properly.`
        );
      }

      const data: ApiResponse<T> = await response.json();

      if (DEBUG_MODE) {
        console.log(`✅ Parsed JSON response:`, data);
      }

      // Update connection status on successful request
      if (!this.connectionStatus.isConnected) {
        this.connectionStatus.isConnected = true;
        this.connectionStatus.lastChecked = new Date().toISOString();
        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );
      }

      return data;
    } catch (error) {
      console.error(`💥 Request failed (attempt ${retryCount + 1}):`, error);

      // Enhanced error logging
      if (error instanceof TypeError && error.message.includes("JSON")) {
        console.error(`🚨 JSON Parse Error - This usually means:
1. Wrong URL (using editor URL instead of deployed web app URL)
2. Script not deployed as web app
3. Script permissions not set correctly
4. CORS issues

Current URL: ${url}
Make sure you're using the deployed web app URL ending with '/exec'`);
      }

      // Update connection status on failed request
      this.connectionStatus.isConnected = false;
      this.connectionStatus.error =
        error instanceof Error ? error.message : "Request failed";
      this.connectionStatus.lastChecked = new Date().toISOString();

      // Retry logic
      if (retryCount < CONFIG.RETRY_ATTEMPTS - 1) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.makeRequest<T>(url, options, retryCount + 1);
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
            initialReading: machineWithMeta.initialReading.toString(),
            standardAvgDiesel: machineWithMeta.standardAvgDiesel.toString(),
            expectedDailyHours: machineWithMeta.expectedDailyHours.toString(),
            doorNo: machineWithMeta.doorNo || "",
            remarks: machineWithMeta.remarks || "",
            dateAdded: machineWithMeta.dateAdded,
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

  // Cleanup and status methods
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

  // Cleanup on app close
  destroy(): void {
    console.log("🧹 Cleaning up DieselService...");

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }
    if (this.quickPingInterval) {
      clearInterval(this.quickPingInterval);
    }
  }

  // Keep existing methods for getting data
  async getMachines(): Promise<Machine[]> {
    try {
      if (!this.connectionStatus.isConnected) {
        const cached = await this.getCachedData<Machine[]>(
          STORAGE_KEYS.MACHINES
        );
        return cached || this.getMockMachines();
      }

      const response = await this.makeRequest<{ machines: Machine[] }>(
        `${CONFIG.APPS_SCRIPT_URL}?action=getMachines&timestamp=${Date.now()}`
      );

      if (response.success && response.machines) {
        await this.cacheData(STORAGE_KEYS.MACHINES, response.machines);
        return response.machines;
      } else {
        throw new Error(response.message || "Failed to fetch machines");
      }
    } catch (error) {
      console.error("❌ Error fetching machines:", error);

      // Try to return cached data
      const cached = await this.getCachedData<Machine[]>(STORAGE_KEYS.MACHINES);
      if (cached && cached.length > 0) {
        return cached;
      }

      return this.getMockMachines();
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
            m.name.toLowerCase() === updates.name.trim().toLowerCase()
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
            m.plate?.toLowerCase() === updates.plate.trim().toLowerCase()
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

  // Keep existing methods for inventory, logs, alerts, etc.
  async getInventory(): Promise<{
    currentStock: number;
    transactions: InventoryEntry[];
  }> {
    try {
      if (!this.connectionStatus.isConnected) {
        const cached = await this.getCachedData<{
          currentStock: number;
          transactions: InventoryEntry[];
        }>(STORAGE_KEYS.INVENTORY);
        return cached || { currentStock: 475, transactions: [] };
      }

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

        await this.cacheData(STORAGE_KEYS.INVENTORY, inventoryData);
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
      return cached || { currentStock: 0, transactions: [] };
    }
  }

  async getLogs(filters?: {
    dateFrom?: string;
    dateTo?: string;
    machineName?: string;
    ownership?: string;
  }): Promise<{ logs: DieselEntry[]; success: boolean }> {
    try {
      if (!this.connectionStatus.isConnected) {
        const cached = await this.getCachedData<DieselEntry[]>(
          STORAGE_KEYS.LOGS
        );
        return { logs: cached || [], success: true };
      }

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
        await this.cacheData(STORAGE_KEYS.LOGS, response.logs);
        return { logs: response.logs, success: true };
      } else {
        throw new Error(response.message || "Failed to fetch logs");
      }
    } catch (error) {
      console.error("❌ Error fetching logs:", error);

      // Return cached data
      const cached = await this.getCachedData<DieselEntry[]>(STORAGE_KEYS.LOGS);
      return { logs: cached || [], success: false };
    }
  }

  async getAlertsData(): Promise<{ alerts: AlertData; success: boolean }> {
    try {
      if (!this.connectionStatus.isConnected) {
        return {
          alerts: { overConsumption: [], idleMachines: [] },
          success: true,
        };
      }

      const response = await this.makeRequest<{ alerts: AlertData }>(
        `${CONFIG.APPS_SCRIPT_URL}?action=getAlertsData&timestamp=${Date.now()}`
      );

      if (response.success) {
        return {
          alerts: response.alerts || { overConsumption: [], idleMachines: [] },
          success: true,
        };
      } else {
        throw new Error(response.message || "Failed to fetch alerts data");
      }
    } catch (error) {
      console.error("❌ Error fetching alerts:", error);
      return {
        alerts: { overConsumption: [], idleMachines: [] },
        success: false,
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
}

// Export singleton instance
export const DieselService = new DieselServiceClass();
