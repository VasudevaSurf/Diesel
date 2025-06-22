import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";

// Configuration
const CONFIG = {
  APPS_SCRIPT_URL:
    "https://script.google.com/macros/s/AKfycbzFd_MZl7qDolMdw5GVtC7cenn4DKAWQnX0NTuq0MP727-DRvq5RFT-nUxt9A7mFyj3/exec",
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

      for (const item of this.offlineQueue) {
        try {
          console.log(
            `⚙️ Processing queued ${item.type} (attempt ${
              item.retryCount + 1
            }/${item.maxRetries})`
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

      await this.cacheData(STORAGE_KEYS.OFFLINE_QUEUE, this.offlineQueue);

      console.log(
        `✨ Queue processing complete. Processed: ${successCount}, Failed: ${failedItems.length}, Remaining: ${this.offlineQueue.length}`
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
        return true;
      }

      return false;
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
        return true;
      }

      return false;
    } catch (error) {
      console.error("❌ Error processing queued machine update:", error);
      return false;
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
      // Update local cache immediately
      const machines = await this.getMachines();
      const machineWithMeta = {
        ...machine,
        id: `machine_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastReading: machine.initialReading || 0,
      };

      const existingIndex = machines.findIndex(
        (m) => m.name === machine.name && m.plate === machine.plate
      );
      if (existingIndex === -1) {
        machines.push(machineWithMeta);
        await this.cacheData(STORAGE_KEYS.MACHINES, machines);
      }

      if (
        this.connectionStatus.isConnected &&
        this.connectionStatus.isInternetReachable
      ) {
        // Try to submit immediately
        try {
          console.log("📡 Attempting immediate machine submission...");

          const params = new URLSearchParams({
            action: "addMachineEnhanced",
            machineName: machine.name,
            machinePlate: machine.plate,
            machineType: machine.machineType || "L/hr",
            ownershipType: machine.ownershipType || "Own",
            initialReading: (machine.initialReading || 0).toString(),
            standardAvgDiesel: (machine.standardAvgDiesel || 0).toString(),
            expectedDailyHours: (machine.expectedDailyHours || 0).toString(),
            doorNo: machine.doorNo || "",
            remarks: machine.remarks || "",
            dateAdded:
              machine.dateAdded || new Date().toISOString().split("T")[0],
            timestamp: Date.now().toString(),
          });

          const response = await this.makeRequest(
            `${CONFIG.APPS_SCRIPT_URL}?${params}`
          );

          if (response.success) {
            console.log("✅ Machine added successfully!");
            return {
              success: true,
              message: "Machine added successfully!",
            };
          } else {
            throw new Error(response.message || "Submission failed");
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
      console.log(`🏗️ Machine queued with ID: ${queueId}`);

      return {
        success: true,
        message: this.connectionStatus.isInternetReachable
          ? "Machine saved locally and will be submitted when backend connection is restored."
          : "Machine saved locally and queued for submission when online.",
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

  async updateMachine(
    machineName: string,
    updates: Partial<Machine>
  ): Promise<ApiResponse> {
    try {
      // Update local cache immediately
      const machines = await this.getMachines();
      const index = machines.findIndex((m) => m.name === machineName);
      if (index !== -1) {
        machines[index] = {
          ...machines[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        await this.cacheData(STORAGE_KEYS.MACHINES, machines);
      }

      if (
        this.connectionStatus.isConnected &&
        this.connectionStatus.isInternetReachable
      ) {
        try {
          const params = new URLSearchParams({
            action: "editMachine",
            oldName: machineName,
            ...Object.entries(updates).reduce((acc, [key, value]) => {
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
            return { success: true, message: "Machine updated successfully!" };
          } else {
            throw new Error(response.message || "Update failed");
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
      await this.addToOfflineQueue(
        "machineUpdate",
        { machineName, updates },
        2
      ); // Medium priority

      return {
        success: true,
        message: this.connectionStatus.isInternetReachable
          ? "Machine updated locally and will be synced when backend connection is restored."
          : "Machine updated locally and queued for sync when online.",
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
