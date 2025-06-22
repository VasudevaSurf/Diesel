import AsyncStorage from "@react-native-async-storage/async-storage";

// Configuration
const CONFIG = {
  APPS_SCRIPT_URL:
    "https://script.google.com/macros/s/AKfycbxTxoF5X74IzzAG_tX_00A7EKURPPzrbYBuLOX45eg_WNNXXOKZJ7vl9gQ8mgN8kmAo/exec",
  ADMIN_PASSWORD: "admin123",
  INVENTORY_PASSWORD: "inventory456",
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
};

// Storage Keys
const STORAGE_KEYS = {
  MACHINES: "@diesel_tracker:machines",
  LOGS: "@diesel_tracker:logs",
  INVENTORY: "@diesel_tracker:inventory",
  CONNECTION_STATUS: "@diesel_tracker:connection_status",
  LAST_SYNC: "@diesel_tracker:last_sync",
  USER_SETTINGS: "@diesel_tracker:user_settings",
};

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

export interface MismatchData {
  machine: string;
  standardAvg: number;
  actualAvg: number;
  consumptionMismatch: number;
  status: string;
  expectedHours: number;
  actualHours: number;
  hoursMismatch: number;
  machineType: string;
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
  mismatchData?: MismatchData[];
  imageURL?: string;
  error?: string;
  timestamp?: string;
}

export interface SummaryStats {
  totalMachines: number;
  totalDiesel: number;
  totalUsage: number;
  avgEfficiency: {
    lhr?: number;
    kml?: number;
    combined?: string;
  };
  totalEntries: number;
  activeAlerts: number;
  lastUpdated: string;
}

export interface ConnectionStatus {
  isConnected: boolean;
  lastChecked: string;
  latency?: number;
  error?: string;
}

class DieselServiceClass {
  private connectionStatus: ConnectionStatus = {
    isConnected: false,
    lastChecked: new Date().toISOString(),
  };
  private retryQueue: Array<() => Promise<any>> = [];
  private isRetrying: boolean = false;

  constructor() {
    this.initializeService();
  }

  // Initialize service
  private async initializeService(): Promise<void> {
    try {
      // Load cached connection status
      const cachedStatus = await this.getCachedData<ConnectionStatus>(
        STORAGE_KEYS.CONNECTION_STATUS
      );
      if (cachedStatus) {
        this.connectionStatus = cachedStatus;
      }

      // Check connection in background
      this.checkConnection().catch((error) => {
        console.warn("Initial connection check failed:", error);
      });
    } catch (error) {
      console.error("Failed to initialize service:", error);
    }
  }

  // Connection Management
  async checkConnection(): Promise<boolean> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

      const response = await fetch(
        `${CONFIG.APPS_SCRIPT_URL}?action=ping&timestamp=${Date.now()}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Cache-Control": "no-cache",
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;

      if (response.ok) {
        let isValid = true;
        try {
          const data: ApiResponse = await response.json();
          isValid = data.success !== false;
        } catch {
          // If response is not JSON, still consider it connected if status is OK
          isValid = true;
        }

        this.connectionStatus = {
          isConnected: isValid,
          lastChecked: new Date().toISOString(),
          latency,
        };

        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );
        return isValid;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      this.connectionStatus = {
        isConnected: false,
        lastChecked: new Date().toISOString(),
        error: errorMessage,
      };

      await this.cacheData(
        STORAGE_KEYS.CONNECTION_STATUS,
        this.connectionStatus
      );
      console.warn("Connection check failed:", errorMessage);
      return false;
    }
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  // API Request with retry logic
  private async makeRequest<T>(
    url: string,
    options: RequestInit = {},
    retryCount: number = 0
  ): Promise<ApiResponse<T>> {
    try {
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

      const data: ApiResponse<T> = await response.json();

      // Update connection status on successful request
      if (this.connectionStatus.isConnected === false) {
        this.connectionStatus.isConnected = true;
        this.connectionStatus.lastChecked = new Date().toISOString();
        await this.cacheData(
          STORAGE_KEYS.CONNECTION_STATUS,
          this.connectionStatus
        );
      }

      return data;
    } catch (error) {
      console.error(`Request failed (attempt ${retryCount + 1}):`, error);

      // Update connection status on failed request
      this.connectionStatus.isConnected = false;
      this.connectionStatus.error =
        error instanceof Error ? error.message : "Request failed";
      this.connectionStatus.lastChecked = new Date().toISOString();

      // Retry logic
      if (retryCount < CONFIG.RETRY_ATTEMPTS - 1) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.makeRequest<T>(url, options, retryCount + 1);
      }

      throw error;
    }
  }

  // Machine Management
  async getMachines(): Promise<Machine[]> {
    try {
      if (!this.connectionStatus.isConnected) {
        return this.getMockMachines();
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
      console.error("Error fetching machines:", error);

      // Try to return cached data
      const cached = await this.getCachedData<Machine[]>(STORAGE_KEYS.MACHINES);
      if (cached && cached.length > 0) {
        return cached;
      }

      return this.getMockMachines();
    }
  }

  async addMachine(
    machine: Omit<Machine, "lastReading" | "id">
  ): Promise<ApiResponse> {
    try {
      if (!this.connectionStatus.isConnected) {
        return {
          success: false,
          message:
            "Demo mode - machine not saved to backend. Please check your internet connection.",
        };
      }

      // Add timestamp and generate ID
      const machineWithMeta = {
        ...machine,
        id: `machine_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastReading: machine.initialReading || 0,
      };

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
        dateAdded: machine.dateAdded || new Date().toISOString().split("T")[0],
        timestamp: Date.now().toString(),
      });

      const response = await this.makeRequest<Machine>(
        `${CONFIG.APPS_SCRIPT_URL}?${params}`
      );

      if (response.success) {
        // Update local cache
        const machines = await this.getMachines();
        machines.push(machineWithMeta);
        await this.cacheData(STORAGE_KEYS.MACHINES, machines);
      }

      return response;
    } catch (error) {
      console.error("Error adding machine:", error);
      return {
        success: false,
        message: `Failed to add machine: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  async updateMachine(
    machineName: string,
    updates: Partial<Machine>
  ): Promise<ApiResponse> {
    try {
      if (!this.connectionStatus.isConnected) {
        return {
          success: false,
          message: "Demo mode - machine update not saved to backend",
        };
      }

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
        // Update local cache
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
      }

      return response;
    } catch (error) {
      console.error("Error updating machine:", error);
      return {
        success: false,
        message: `Failed to update machine: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  async deleteMachine(machineName: string): Promise<ApiResponse> {
    try {
      if (!this.connectionStatus.isConnected) {
        return {
          success: false,
          message: "Demo mode - machine deletion not saved to backend",
        };
      }

      const response = await this.makeRequest(
        `${
          CONFIG.APPS_SCRIPT_URL
        }?action=deleteMachine&machineName=${encodeURIComponent(
          machineName
        )}&timestamp=${Date.now()}`
      );

      if (response.success) {
        // Update local cache
        const machines = await this.getMachines();
        const filteredMachines = machines.filter((m) => m.name !== machineName);
        await this.cacheData(STORAGE_KEYS.MACHINES, filteredMachines);
      }

      return response;
    } catch (error) {
      console.error("Error deleting machine:", error);
      return {
        success: false,
        message: `Failed to delete machine: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  // Diesel Entry Management
  async submitEntry(entry: DieselEntry): Promise<ApiResponse> {
    try {
      if (!this.connectionStatus.isConnected) {
        return {
          success: false,
          message:
            "Demo mode - entry not saved to backend. Data will be saved when connection is restored.",
        };
      }

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

      const consumptionMismatch = machine?.standardAvgDiesel
        ? rate - machine.standardAvgDiesel
        : 0;
      const hoursMismatch = machine?.expectedDailyHours
        ? usage - machine.expectedDailyHours
        : 0;

      const entryWithCalculations = {
        ...entry,
        id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        usage,
        rate,
        consumptionMismatch,
        hoursMismatch,
        standardAvg: machine?.standardAvgDiesel || 0,
        expectedDaily: machine?.expectedDailyHours || 0,
        machineType: machine?.machineType || "L/hr",
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const response = await this.makeRequest(CONFIG.APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "submitEntryEnhanced",
          ...entryWithCalculations,
          timestamp: Date.now(),
        }),
      });

      if (response.success) {
        // Update machine's last reading
        if (machine) {
          await this.updateMachine(entry.machineName, {
            lastReading: entry.endReading,
            updatedAt: new Date().toISOString(),
          });
        }

        // Update local logs cache
        const logs =
          (await this.getCachedData<DieselEntry[]>(STORAGE_KEYS.LOGS)) || [];
        logs.unshift(entryWithCalculations);
        await this.cacheData(STORAGE_KEYS.LOGS, logs.slice(0, 1000)); // Keep last 1000 entries
      }

      return response;
    } catch (error) {
      console.error("Error submitting entry:", error);
      return {
        success: false,
        message: `Failed to submit entry: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  async submitBackLogEntry(
    entry: DieselEntry & { entryDate: string }
  ): Promise<ApiResponse> {
    try {
      if (!this.connectionStatus.isConnected) {
        return {
          success: false,
          message: "Demo mode - back-dated entry not saved to backend",
        };
      }

      const response = await this.makeRequest(CONFIG.APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "submitBackLog",
          ...entry,
          timestamp: Date.now(),
        }),
      });

      return response;
    } catch (error) {
      console.error("Error submitting back-dated entry:", error);
      return {
        success: false,
        message: `Failed to submit back-dated entry: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  // Inventory Management
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
        return (
          cached || {
            currentStock: 475,
            transactions: this.getMockInventoryTransactions(),
          }
        );
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
      console.error("Error fetching inventory:", error);

      // Return cached data or mock data
      const cached = await this.getCachedData<{
        currentStock: number;
        transactions: InventoryEntry[];
      }>(STORAGE_KEYS.INVENTORY);
      return cached || { currentStock: 0, transactions: [] };
    }
  }

  async addInventory(inventory: InventoryEntry): Promise<ApiResponse> {
    try {
      if (!this.connectionStatus.isConnected) {
        return {
          success: false,
          message: "Demo mode - inventory not saved to backend",
        };
      }

      const inventoryWithMeta = {
        ...inventory,
        id: `inventory_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
        type: "IN" as const,
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

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
        // Update local cache
        const currentInventory = await this.getInventory();
        currentInventory.transactions.unshift(inventoryWithMeta);
        currentInventory.currentStock += inventory.litersReceived;
        await this.cacheData(STORAGE_KEYS.INVENTORY, currentInventory);
      }

      return response;
    } catch (error) {
      console.error("Error adding inventory:", error);
      return {
        success: false,
        message: `Failed to add inventory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  // Logs and Reports
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
        return { logs: cached || this.getMockLogs(), success: true };
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
        // Cache the results
        await this.cacheData(STORAGE_KEYS.LOGS, response.logs);
        return { logs: response.logs, success: true };
      } else {
        throw new Error(response.message || "Failed to fetch logs");
      }
    } catch (error) {
      console.error("Error fetching logs:", error);

      // Return cached data
      const cached = await this.getCachedData<DieselEntry[]>(STORAGE_KEYS.LOGS);
      return { logs: cached || [], success: false };
    }
  }

  // Alerts and Analytics
  async getAlertsData(): Promise<{
    alerts: AlertData;
    mismatchData: MismatchData[];
    success: boolean;
  }> {
    try {
      if (!this.connectionStatus.isConnected) {
        return {
          alerts: this.getMockAlerts(),
          mismatchData: this.getMockMismatchData(),
          success: true,
        };
      }

      const response = await this.makeRequest<{
        alerts: AlertData;
        mismatchData: MismatchData[];
      }>(
        `${CONFIG.APPS_SCRIPT_URL}?action=getAlertsData&timestamp=${Date.now()}`
      );

      if (response.success) {
        return {
          alerts: response.alerts || { overConsumption: [], idleMachines: [] },
          mismatchData: response.mismatchData || [],
          success: true,
        };
      } else {
        throw new Error(response.message || "Failed to fetch alerts data");
      }
    } catch (error) {
      console.error("Error fetching alerts:", error);
      return {
        alerts: { overConsumption: [], idleMachines: [] },
        mismatchData: [],
        success: false,
      };
    }
  }

  async getSummaryStats(
    logs?: DieselEntry[],
    machines?: Machine[]
  ): Promise<SummaryStats> {
    try {
      const logsData = logs || (await this.getLogs()).logs;
      const machinesData = machines || (await this.getMachines());

      const totalDiesel = logsData.reduce(
        (sum, log) => sum + (log.dieselFilled || 0),
        0
      );
      const totalUsage = logsData.reduce(
        (sum, log) => sum + (log.usage || 0),
        0
      );
      const uniqueMachines = new Set(logsData.map((log) => log.machineName))
        .size;

      // Calculate separate averages for different machine types
      let totalLHR = 0,
        countLHR = 0;
      let totalKML = 0,
        countKML = 0;

      logsData.forEach((log) => {
        const type = log.machineType || "L/hr";
        const rate = parseFloat(log.rate?.toString() || "0");

        if (type === "L/hr") {
          totalLHR += rate;
          countLHR++;
        } else if (type === "L/km" || type === "KM/l") {
          totalKML += rate;
          countKML++;
        }
      });

      const avgLHR = countLHR > 0 ? totalLHR / countLHR : 0;
      const avgKML = countKML > 0 ? totalKML / countKML : 0;

      let combinedEfficiency = "";
      if (avgLHR > 0 && avgKML > 0) {
        combinedEfficiency = `L/hr: ${avgLHR.toFixed(
          2
        )} | KM/l: ${avgKML.toFixed(2)}`;
      } else if (avgLHR > 0) {
        combinedEfficiency = `${avgLHR.toFixed(2)} L/hr`;
      } else if (avgKML > 0) {
        combinedEfficiency = `${avgKML.toFixed(2)} KM/l`;
      } else {
        combinedEfficiency = "--";
      }

      // Get alerts count
      const alertsData = await this.getAlertsData();
      const activeAlerts =
        alertsData.alerts.overConsumption.length +
        alertsData.alerts.idleMachines.length;

      return {
        totalMachines: uniqueMachines,
        totalDiesel,
        totalUsage,
        avgEfficiency: {
          lhr: avgLHR,
          kml: avgKML,
          combined: combinedEfficiency,
        },
        totalEntries: logsData.length,
        activeAlerts,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error calculating summary stats:", error);
      return {
        totalMachines: 0,
        totalDiesel: 0,
        totalUsage: 0,
        avgEfficiency: { combined: "--" },
        totalEntries: 0,
        activeAlerts: 0,
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  // Image Upload
  async uploadImage(imageUri: string, fileName: string): Promise<string> {
    try {
      if (!this.connectionStatus.isConnected) {
        console.warn("Cannot upload image in demo mode");
        return ""; // Return empty string for demo mode
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
      console.error("Error uploading image:", error);
      return "";
    }
  }

  // Utility Functions
  generateMachineId(machine: Machine): string {
    return `${machine.name}-${machine.plate}`;
  }

  generateQRData(machine: Machine, baseUrl?: string): string {
    const machineId = this.generateMachineId(machine);
    const url = baseUrl || "dieselpro://entry";
    return `${url}?machineId=${encodeURIComponent(machineId)}`;
  }

  calculateMismatch(
    actualRate: number,
    standardRate: number,
    machineType: string = "L/hr"
  ): { mismatch: number; severity: "low" | "medium" | "high"; status: string } {
    const mismatch = actualRate - standardRate;
    const percentageDiff = Math.abs(mismatch / standardRate) * 100;

    let severity: "low" | "medium" | "high" = "low";
    let status = "Normal";

    if (machineType === "KM/l") {
      // For KM/l, lower values are worse
      if (actualRate < standardRate * 0.7) {
        severity = "high";
        status = "Poor Efficiency";
      } else if (actualRate < standardRate * 0.85) {
        severity = "medium";
        status = "Below Average";
      } else {
        status = "Good Efficiency";
      }
    } else {
      // For L/hr, higher values are worse
      if (percentageDiff > 30) {
        severity = "high";
        status =
          actualRate > standardRate ? "High Consumption" : "Very Efficient";
      } else if (percentageDiff > 15) {
        severity = "medium";
        status = actualRate > standardRate ? "Above Average" : "Efficient";
      } else {
        status = "Normal";
      }
    }

    return { mismatch, severity, status };
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
      console.error("Error caching data:", error);
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
      console.error("Error getting cached data:", error);
      return null;
    }
  }

  async clearCache(): Promise<void> {
    try {
      const keys = Object.values(STORAGE_KEYS);
      await AsyncStorage.multiRemove(keys);
    } catch (error) {
      console.error("Error clearing cache:", error);
    }
  }

  async clearExpiredCache(): Promise<void> {
    try {
      const keys = Object.values(STORAGE_KEYS);
      for (const key of keys) {
        const cached = await AsyncStorage.getItem(key);
        if (cached) {
          const cacheEntry = JSON.parse(cached);
          if (cacheEntry.expires && Date.now() > cacheEntry.expires) {
            await AsyncStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.error("Error clearing expired cache:", error);
    }
  }

  // Settings Management
  async saveUserSettings(settings: Record<string, any>): Promise<void> {
    try {
      await this.cacheData(STORAGE_KEYS.USER_SETTINGS, settings);
    } catch (error) {
      console.error("Error saving user settings:", error);
    }
  }

  async getUserSettings(): Promise<Record<string, any>> {
    try {
      const settings = await this.getCachedData<Record<string, any>>(
        STORAGE_KEYS.USER_SETTINGS
      );
      return settings || {};
    } catch (error) {
      console.error("Error getting user settings:", error);
      return {};
    }
  }

  // Mock Data Methods
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
      {
        id: "machine_3",
        name: "TRUCK-01",
        plate: "KA20EF9012",
        lastReading: 45000.8,
        machineType: "KM/l",
        ownershipType: "Own",
        standardAvgDiesel: 4.2,
        expectedDailyHours: 10.0,
        doorNo: "C-03",
        remarks: "Material transport truck",
        dateAdded: "2024-01-20",
        initialReading: 40000.0,
        createdAt: "2024-01-20T07:30:00Z",
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  private getMockLogs(): DieselEntry[] {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return [
      {
        id: "entry_1",
        timestamp: now.toISOString(),
        machineName: "JCB-12",
        startReading: 1245.0,
        endReading: 1250.5,
        usage: 5.5,
        dieselFilled: 25.0,
        rate: 4.55,
        remarks: "CH 1+500 to 1+800",
        phoneNumber: "9876543210",
        imageURL: "",
        machineType: "L/hr",
        consumptionMismatch: 0.55,
        hoursMismatch: -2.5,
        standardAvg: 4.0,
        expectedDaily: 8.0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      {
        id: "entry_2",
        timestamp: yesterday.toISOString(),
        machineName: "CAT-09",
        startReading: 885.0,
        endReading: 890.2,
        usage: 5.2,
        dieselFilled: 18.0,
        rate: 3.46,
        remarks: "Site clearing work",
        phoneNumber: "9876543210",
        imageURL: "",
        machineType: "L/hr",
        consumptionMismatch: -0.04,
        hoursMismatch: -0.8,
        standardAvg: 3.5,
        expectedDaily: 6.0,
        createdAt: yesterday.toISOString(),
        updatedAt: yesterday.toISOString(),
      },
    ];
  }

  private getMockInventoryTransactions(): InventoryEntry[] {
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return [
      {
        id: "inventory_1",
        type: "IN",
        litersReceived: 500,
        receiptNumber: "RCP001",
        remarks: "Weekly fuel delivery",
        phoneNumber: "9876543210",
        timestamp: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      {
        id: "inventory_2",
        type: "IN",
        litersReceived: 300,
        receiptNumber: "RCP002",
        remarks: "Emergency refill",
        phoneNumber: "9876543210",
        timestamp: lastWeek.toISOString(),
        createdAt: lastWeek.toISOString(),
        updatedAt: lastWeek.toISOString(),
      },
    ];
  }

  private getMockAlerts(): AlertData {
    return {
      overConsumption: [
        {
          machine: "JCB-12",
          standardAvg: 4.0,
          actualAvg: 5.2,
          mismatch: 1.2,
          timestamp: new Date().toISOString(),
          severity: "medium",
        },
      ],
      idleMachines: [
        {
          machine: "CAT-09",
          expectedHours: 8,
          actualHours: 5,
          mismatch: -3,
          timestamp: new Date().toISOString(),
          severity: "high",
        },
      ],
    };
  }

  private getMockMismatchData(): MismatchData[] {
    return [
      {
        machine: "JCB-12",
        standardAvg: 4.0,
        actualAvg: 4.55,
        consumptionMismatch: 0.55,
        status: "Above Average",
        expectedHours: 8.0,
        actualHours: 5.5,
        hoursMismatch: -2.5,
        machineType: "L/hr",
      },
      {
        machine: "CAT-09",
        standardAvg: 3.5,
        actualAvg: 3.46,
        consumptionMismatch: -0.04,
        status: "Normal",
        expectedHours: 6.0,
        actualHours: 5.2,
        hoursMismatch: -0.8,
        machineType: "L/hr",
      },
    ];
  }

  // Background sync (for future implementation)
  async syncWithBackend(): Promise<boolean> {
    try {
      if (!this.connectionStatus.isConnected) {
        return false;
      }

      // This would implement background synchronization
      // of cached data when connection is restored

      await this.cacheData(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
      return true;
    } catch (error) {
      console.error("Background sync failed:", error);
      return false;
    }
  }

  // Health check
  async getServiceHealth(): Promise<{
    status: "healthy" | "degraded" | "down";
    checks: Record<string, boolean>;
    lastSync?: string;
  }> {
    try {
      const checks = {
        connection: this.connectionStatus.isConnected,
        cache: true, // Always available
        storage: true, // Always available
      };

      // Test storage
      try {
        await AsyncStorage.setItem("@health_check", "test");
        await AsyncStorage.removeItem("@health_check");
      } catch {
        checks.storage = false;
      }

      const lastSync = await this.getCachedData<string>(STORAGE_KEYS.LAST_SYNC);
      const healthyChecks = Object.values(checks).filter(Boolean).length;

      let status: "healthy" | "degraded" | "down" = "healthy";
      if (healthyChecks === 0) {
        status = "down";
      } else if (healthyChecks < Object.keys(checks).length) {
        status = "degraded";
      }

      return {
        status,
        checks,
        lastSync: lastSync || undefined,
      };
    } catch (error) {
      console.error("Health check failed:", error);
      return {
        status: "down",
        checks: {
          connection: false,
          cache: false,
          storage: false,
        },
      };
    }
  }
}

// Export singleton instance
export const DieselService = new DieselServiceClass();
