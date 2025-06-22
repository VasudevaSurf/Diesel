import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Alert,
  FlatList,
  RefreshControl,
  Dimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { DieselService, Machine } from "@/services/DieselService";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";

const { width } = Dimensions.get("window");

interface AlertItem {
  id: string;
  machine: string;
  plate?: string;
  alertType:
    | "OVER_CONSUMPTION"
    | "LOW_EFFICIENCY"
    | "IDLE_MACHINE"
    | "UNDER_WORKED";
  severity: "low" | "medium" | "high";
  timestamp: string;
  standardValue: number;
  actualValue: number;
  mismatch: number;
  unit: string;
  description: string;
  machineType: string;
  ownershipType: string;
  status: "active" | "resolved" | "acknowledged";
}

interface AlertSummary {
  totalAlerts: number;
  highSeverity: number;
  mediumSeverity: number;
  lowSeverity: number;
  overConsumption: number;
  lowEfficiency: number;
  idleMachines: number;
  underWorked: number;
}

export default function AlertsScreen() {
  const colorScheme = useColorScheme();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [alertSummary, setAlertSummary] = useState<AlertSummary>({
    totalAlerts: 0,
    highSeverity: 0,
    mediumSeverity: 0,
    lowSeverity: 0,
    overConsumption: 0,
    lowEfficiency: 0,
    idleMachines: 0,
    underWorked: 0,
  });
  const [selectedFilter, setSelectedFilter] = useState<
    "all" | "high" | "medium" | "low"
  >("all");
  const [selectedType, setSelectedType] = useState<
    "all" | "consumption" | "efficiency" | "idle" | "underworked"
  >("all");

  useEffect(() => {
    loadAlertsData();
  }, []);

  const loadAlertsData = async () => {
    try {
      setLoading(true);

      const [alertsData, machinesData] = await Promise.all([
        DieselService.getAlertsData(),
        DieselService.getMachines(),
      ]);

      setMachines(machinesData);

      // Process alerts data and add additional analysis
      const processedAlerts = await processAlertsData(
        alertsData.alerts,
        machinesData
      );
      setAlerts(processedAlerts);

      // Calculate summary
      calculateAlertSummary(processedAlerts);
    } catch (error) {
      console.error("Error loading alerts:", error);
      // Load mock data for demonstration
      const mockAlerts = generateMockAlerts();
      setAlerts(mockAlerts);
      calculateAlertSummary(mockAlerts);
    } finally {
      setLoading(false);
    }
  };

  const processAlertsData = async (
    alertsData: any,
    machinesData: Machine[]
  ): Promise<AlertItem[]> => {
    const processedAlerts: AlertItem[] = [];

    // Process over consumption alerts
    if (alertsData.overConsumption) {
      alertsData.overConsumption.forEach((alert: any, index: number) => {
        const machine = machinesData.find((m) => m.name === alert.machine);
        processedAlerts.push({
          id: `over_${index}`,
          machine: alert.machine,
          plate: machine?.plate || "Unknown",
          alertType: "OVER_CONSUMPTION",
          severity: calculateSeverity(alert.mismatch, "consumption"),
          timestamp: alert.timestamp || new Date().toISOString(),
          standardValue: alert.standardAvg || 0,
          actualValue: alert.actualAvg || 0,
          mismatch: alert.mismatch || 0,
          unit: machine?.machineType === "KM/l" ? "KM/l" : "L/hr",
          description: `Exceeded standard consumption by ${Math.abs(
            alert.mismatch || 0
          ).toFixed(2)} ${machine?.machineType === "KM/l" ? "KM/l" : "L/hr"}`,
          machineType: machine?.machineType || "L/hr",
          ownershipType: machine?.ownershipType || "Own",
          status: "active",
        });
      });
    }

    // Process idle machine alerts
    if (alertsData.idleMachines) {
      alertsData.idleMachines.forEach((alert: any, index: number) => {
        const machine = machinesData.find((m) => m.name === alert.machine);
        processedAlerts.push({
          id: `idle_${index}`,
          machine: alert.machine,
          plate: machine?.plate || "Unknown",
          alertType: "IDLE_MACHINE",
          severity: calculateSeverity(Math.abs(alert.mismatch), "idle"),
          timestamp: alert.timestamp || new Date().toISOString(),
          standardValue: alert.expectedHours || 0,
          actualValue: alert.actualHours || 0,
          mismatch: alert.mismatch || 0,
          unit: "hours",
          description: `Machine was idle for ${Math.abs(
            alert.mismatch || 0
          ).toFixed(1)} hours below expected`,
          machineType: machine?.machineType || "L/hr",
          ownershipType: machine?.ownershipType || "Own",
          status: "active",
        });
      });
    }

    // Analyze for under-worked machines (new feature)
    const underWorkedAlerts = await analyzeUnderWorkedMachines(machinesData);
    processedAlerts.push(...underWorkedAlerts);

    // Sort by timestamp (newest first) and severity
    return processedAlerts.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[b.severity] - severityOrder[a.severity];
      }
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  };

  const analyzeUnderWorkedMachines = async (
    machinesData: Machine[]
  ): Promise<AlertItem[]> => {
    const underWorkedAlerts: AlertItem[] = [];

    try {
      // Get recent logs to analyze machine usage patterns
      const logsData = await DieselService.getLogs({
        dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0], // Last 7 days
      });

      machinesData.forEach((machine, index) => {
        const machineLogs = logsData.logs.filter(
          (log) => log.machineName === machine.name
        );

        if (machineLogs.length > 0 && machine.expectedDailyHours) {
          const avgDailyHours =
            machineLogs.reduce((sum, log) => sum + (log.usage || 0), 0) /
            machineLogs.length;
          const expectedHours = machine.expectedDailyHours;

          // If average daily hours is less than 60% of expected
          if (avgDailyHours < expectedHours * 0.6) {
            const mismatch = avgDailyHours - expectedHours;
            underWorkedAlerts.push({
              id: `underworked_${index}`,
              machine: machine.name,
              plate: machine.plate,
              alertType: "UNDER_WORKED",
              severity: calculateSeverity(Math.abs(mismatch), "underworked"),
              timestamp: new Date().toISOString(),
              standardValue: expectedHours,
              actualValue: avgDailyHours,
              mismatch: mismatch,
              unit: "hours/day",
              description: `Machine under-utilized: averaging ${avgDailyHours.toFixed(
                1
              )} hrs/day vs expected ${expectedHours} hrs/day`,
              machineType: machine.machineType || "L/hr",
              ownershipType: machine.ownershipType || "Own",
              status: "active",
            });
          }
        }
      });
    } catch (error) {
      console.error("Error analyzing under-worked machines:", error);
    }

    return underWorkedAlerts;
  };

  const calculateSeverity = (
    mismatch: number,
    type: string
  ): "low" | "medium" | "high" => {
    const absMismatch = Math.abs(mismatch);

    switch (type) {
      case "consumption":
        if (absMismatch > 2) return "high";
        if (absMismatch > 1) return "medium";
        return "low";

      case "idle":
      case "underworked":
        if (absMismatch > 4) return "high";
        if (absMismatch > 2) return "medium";
        return "low";

      default:
        return "medium";
    }
  };

  const calculateAlertSummary = (alertsData: AlertItem[]) => {
    const summary: AlertSummary = {
      totalAlerts: alertsData.length,
      highSeverity: alertsData.filter((a) => a.severity === "high").length,
      mediumSeverity: alertsData.filter((a) => a.severity === "medium").length,
      lowSeverity: alertsData.filter((a) => a.severity === "low").length,
      overConsumption: alertsData.filter(
        (a) => a.alertType === "OVER_CONSUMPTION"
      ).length,
      lowEfficiency: alertsData.filter((a) => a.alertType === "LOW_EFFICIENCY")
        .length,
      idleMachines: alertsData.filter((a) => a.alertType === "IDLE_MACHINE")
        .length,
      underWorked: alertsData.filter((a) => a.alertType === "UNDER_WORKED")
        .length,
    };

    setAlertSummary(summary);
  };

  const generateMockAlerts = (): AlertItem[] => {
    return [
      {
        id: "mock_1",
        machine: "JCB-12",
        plate: "AP09AB1234",
        alertType: "OVER_CONSUMPTION",
        severity: "high",
        timestamp: new Date().toISOString(),
        standardValue: 4.0,
        actualValue: 6.5,
        mismatch: 2.5,
        unit: "L/hr",
        description: "Exceeded standard consumption by 2.5 L/hr",
        machineType: "L/hr",
        ownershipType: "Rental",
        status: "active",
      },
      {
        id: "mock_2",
        machine: "CAT-09",
        plate: "TN10CD5678",
        alertType: "IDLE_MACHINE",
        severity: "medium",
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        standardValue: 8.0,
        actualValue: 5.5,
        mismatch: -2.5,
        unit: "hours",
        description: "Machine was idle for 2.5 hours below expected",
        machineType: "L/hr",
        ownershipType: "Own",
        status: "active",
      },
    ];
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadAlertsData().finally(() => setRefreshing(false));
  }, []);

  const getFilteredAlerts = (): AlertItem[] => {
    let filtered = alerts;

    // Filter by severity
    if (selectedFilter !== "all") {
      filtered = filtered.filter((alert) => alert.severity === selectedFilter);
    }

    // Filter by type
    if (selectedType !== "all") {
      switch (selectedType) {
        case "consumption":
          filtered = filtered.filter(
            (alert) => alert.alertType === "OVER_CONSUMPTION"
          );
          break;
        case "efficiency":
          filtered = filtered.filter(
            (alert) => alert.alertType === "LOW_EFFICIENCY"
          );
          break;
        case "idle":
          filtered = filtered.filter(
            (alert) => alert.alertType === "IDLE_MACHINE"
          );
          break;
        case "underworked":
          filtered = filtered.filter(
            (alert) => alert.alertType === "UNDER_WORKED"
          );
          break;
      }
    }

    return filtered;
  };

  const getSeverityColor = (severity: "low" | "medium" | "high"): string => {
    switch (severity) {
      case "high":
        return "#dc3545";
      case "medium":
        return "#fd7e14";
      case "low":
        return "#ffc107";
      default:
        return "#6c757d";
    }
  };

  const getAlertTypeIcon = (type: AlertItem["alertType"]): string => {
    switch (type) {
      case "OVER_CONSUMPTION":
        return "warning";
      case "LOW_EFFICIENCY":
        return "trending-down";
      case "IDLE_MACHINE":
        return "pause-circle";
      case "UNDER_WORKED":
        return "clock";
      default:
        return "warning";
    }
  };

  const getAlertTypeColor = (type: AlertItem["alertType"]): string => {
    switch (type) {
      case "OVER_CONSUMPTION":
        return "#dc3545";
      case "LOW_EFFICIENCY":
        return "#fd7e14";
      case "IDLE_MACHINE":
        return "#6f42c1";
      case "UNDER_WORKED":
        return "#20c997";
      default:
        return "#6c757d";
    }
  };

  const exportToPDF = async () => {
    try {
      const filteredAlerts = getFilteredAlerts();
      const currentDate = new Date().toLocaleDateString();

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Diesel Tracker - Alerts Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #007bff; padding-bottom: 15px; }
            .summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
            .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
            .summary-item { text-align: center; }
            .summary-number { font-size: 24px; font-weight: bold; color: #007bff; }
            .summary-label { font-size: 12px; color: #666; margin-top: 5px; }
            .alert-item { border: 1px solid #dee2e6; border-radius: 8px; padding: 15px; margin-bottom: 15px; page-break-inside: avoid; }
            .alert-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
            .machine-id { font-weight: bold; font-size: 16px; }
            .severity-badge { padding: 4px 8px; border-radius: 4px; color: white; font-size: 12px; font-weight: bold; }
            .severity-high { background-color: #dc3545; }
            .severity-medium { background-color: #fd7e14; }
            .severity-low { background-color: #ffc107; color: #000; }
            .alert-details { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 10px 0; }
            .detail-item { text-align: center; }
            .detail-label { font-size: 12px; color: #666; }
            .detail-value { font-weight: bold; }
            .description { background: #f8f9fa; padding: 10px; border-radius: 4px; font-style: italic; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #dee2e6; padding-top: 15px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🚨 Diesel Tracker - Alerts Report</h1>
            <p>Generated on ${currentDate}</p>
          </div>
          
          <div class="summary">
            <h2>Alert Summary</h2>
            <div class="summary-grid">
              <div class="summary-item">
                <div class="summary-number">${alertSummary.totalAlerts}</div>
                <div class="summary-label">Total Alerts</div>
              </div>
              <div class="summary-item">
                <div class="summary-number" style="color: #dc3545;">${
                  alertSummary.highSeverity
                }</div>
                <div class="summary-label">High Severity</div>
              </div>
              <div class="summary-item">
                <div class="summary-number" style="color: #fd7e14;">${
                  alertSummary.mediumSeverity
                }</div>
                <div class="summary-label">Medium Severity</div>
              </div>
              <div class="summary-item">
                <div class="summary-number" style="color: #ffc107;">${
                  alertSummary.lowSeverity
                }</div>
                <div class="summary-label">Low Severity</div>
              </div>
            </div>
          </div>

          <h2>Alert Details (${filteredAlerts.length} alerts)</h2>
          
          ${filteredAlerts
            .map(
              (alert) => `
            <div class="alert-item">
              <div class="alert-header">
                <div class="machine-id">${alert.machine} - ${alert.plate}</div>
                <span class="severity-badge severity-${
                  alert.severity
                }">${alert.severity.toUpperCase()}</span>
              </div>
              
              <div class="alert-details">
                <div class="detail-item">
                  <div class="detail-label">Standard Value</div>
                  <div class="detail-value">${alert.standardValue.toFixed(2)} ${
                alert.unit
              }</div>
                </div>
                <div class="detail-item">
                  <div class="detail-label">Actual Value</div>
                  <div class="detail-value">${alert.actualValue.toFixed(2)} ${
                alert.unit
              }</div>
                </div>
                <div class="detail-item">
                  <div class="detail-label">Mismatch</div>
                  <div class="detail-value">${
                    alert.mismatch > 0 ? "+" : ""
                  }${alert.mismatch.toFixed(2)} ${alert.unit}</div>
                </div>
              </div>
              
              <div class="description">${alert.description}</div>
              
              <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 12px; color: #666;">
                <span>Type: ${alert.alertType.replace("_", " ")}</span>
                <span>Machine Type: ${alert.machineType}</span>
                <span>Ownership: ${alert.ownershipType}</span>
                <span>Time: ${new Date(alert.timestamp).toLocaleString()}</span>
              </div>
            </div>
          `
            )
            .join("")}
          
          <div class="footer">
            <p>This report was generated automatically by Diesel Tracker Pro</p>
            <p>For more information, contact your system administrator</p>
          </div>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          UTI: ".pdf",
          mimeType: "application/pdf",
        });
      } else {
        Alert.alert("Success", `PDF saved to: ${uri}`);
      }
    } catch (error) {
      console.error("Error exporting PDF:", error);
      Alert.alert("Error", "Failed to export PDF file");
    }
  };

  const exportToExcel = async () => {
    try {
      const filteredAlerts = getFilteredAlerts();
      const currentDate = new Date().toISOString().split("T")[0];

      // Create CSV content
      const headers = [
        "Machine Name",
        "Plate Number",
        "Alert Type",
        "Severity",
        "Timestamp",
        "Standard Value",
        "Actual Value",
        "Mismatch",
        "Unit",
        "Machine Type",
        "Ownership",
        "Description",
        "Status",
      ];

      const csvData = [
        headers.join(","),
        ...filteredAlerts.map((alert) =>
          [
            `"${alert.machine}"`,
            `"${alert.plate}"`,
            `"${alert.alertType.replace("_", " ")}"`,
            `"${alert.severity}"`,
            `"${new Date(alert.timestamp).toLocaleString()}"`,
            alert.standardValue.toFixed(2),
            alert.actualValue.toFixed(2),
            alert.mismatch.toFixed(2),
            `"${alert.unit}"`,
            `"${alert.machineType}"`,
            `"${alert.ownershipType}"`,
            `"${alert.description}"`,
            `"${alert.status}"`,
          ].join(",")
        ),
      ].join("\n");

      // Add summary data
      const summaryData = [
        "",
        "ALERT SUMMARY",
        `Total Alerts,${alertSummary.totalAlerts}`,
        `High Severity,${alertSummary.highSeverity}`,
        `Medium Severity,${alertSummary.mediumSeverity}`,
        `Low Severity,${alertSummary.lowSeverity}`,
        `Over Consumption,${alertSummary.overConsumption}`,
        `Low Efficiency,${alertSummary.lowEfficiency}`,
        `Idle Machines,${alertSummary.idleMachines}`,
        `Under Worked,${alertSummary.underWorked}`,
        `Generated On,"${new Date().toLocaleString()}"`,
      ].join("\n");

      const finalCsvData = csvData + "\n" + summaryData;

      const fileName = `alerts_report_${currentDate}.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, finalCsvData, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert("Success", `Report saved to: ${fileName}`);
      }
    } catch (error) {
      console.error("Error exporting CSV:", error);
      Alert.alert("Error", "Failed to export CSV file");
    }
  };

  const renderAlertItem = ({ item }: { item: AlertItem }) => (
    <View style={styles.alertItem}>
      <View style={styles.alertHeader}>
        <View style={styles.alertHeaderLeft}>
          <Text style={styles.machineId}>
            {item.machine} - {item.plate}
          </Text>
          <View style={styles.alertBadges}>
            <View
              style={[
                styles.severityBadge,
                { backgroundColor: getSeverityColor(item.severity) },
              ]}
            >
              <Text style={styles.severityText}>
                {item.severity.toUpperCase()}
              </Text>
            </View>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: getAlertTypeColor(item.alertType) },
              ]}
            >
              <Text style={styles.typeText}>
                {item.alertType.replace("_", " ")}
              </Text>
            </View>
          </View>
        </View>
        <Text style={styles.timestamp}>
          {new Date(item.timestamp).toLocaleString()}
        </Text>
      </View>

      <View style={styles.alertContent}>
        <View style={styles.alertValues}>
          <View style={styles.valueItem}>
            <Text style={styles.valueLabel}>Standard</Text>
            <Text style={styles.valueNumber}>
              {item.standardValue.toFixed(2)} {item.unit}
            </Text>
          </View>
          <View style={styles.valueItem}>
            <Text style={styles.valueLabel}>Actual</Text>
            <Text style={styles.valueNumber}>
              {item.actualValue.toFixed(2)} {item.unit}
            </Text>
          </View>
          <View style={styles.valueItem}>
            <Text style={styles.valueLabel}>Mismatch</Text>
            <Text
              style={[
                styles.valueNumber,
                { color: item.mismatch > 0 ? "#dc3545" : "#28a745" },
              ]}
            >
              {item.mismatch > 0 ? "+" : ""}
              {item.mismatch.toFixed(2)} {item.unit}
            </Text>
          </View>
        </View>

        <View style={styles.description}>
          <Text style={styles.descriptionText}>{item.description}</Text>
        </View>

        <View style={styles.alertFooter}>
          <Text style={styles.footerText}>
            Machine Type: {item.machineType}
          </Text>
          <Text style={styles.footerText}>Ownership: {item.ownershipType}</Text>
        </View>
      </View>
    </View>
  );

  const renderFilterButton = (filter: typeof selectedFilter, label: string) => (
    <TouchableOpacity
      style={[
        styles.filterButton,
        {
          backgroundColor:
            selectedFilter === filter
              ? Colors[colorScheme ?? "light"].tint
              : "#f8f9fa",
        },
      ]}
      onPress={() => setSelectedFilter(filter)}
    >
      <Text
        style={[
          styles.filterButtonText,
          { color: selectedFilter === filter ? "white" : "#666" },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderTypeButton = (type: typeof selectedType, label: string) => (
    <TouchableOpacity
      style={[
        styles.typeButton,
        {
          backgroundColor:
            selectedType === type
              ? Colors[colorScheme ?? "light"].tint
              : "#f8f9fa",
        },
      ]}
      onPress={() => setSelectedType(type)}
    >
      <Text
        style={[
          styles.typeButtonText,
          { color: selectedType === type ? "white" : "#666" },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const filteredAlerts = getFilteredAlerts();

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: Colors[colorScheme ?? "light"].tint },
        ]}
      >
        <ThemedText style={styles.headerTitle}>
          🚨 Smart Alerts Dashboard
        </ThemedText>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        <View style={[styles.summaryCard, { backgroundColor: "#dc3545" }]}>
          <Text style={styles.summaryNumber}>{alertSummary.totalAlerts}</Text>
          <Text style={styles.summaryLabel}>Total Alerts</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: "#fd7e14" }]}>
          <Text style={styles.summaryNumber}>{alertSummary.highSeverity}</Text>
          <Text style={styles.summaryLabel}>High Priority</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: "#ffc107" }]}>
          <Text style={styles.summaryNumber}>
            {alertSummary.mediumSeverity}
          </Text>
          <Text style={styles.summaryLabel}>Medium Priority</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: "#28a745" }]}>
          <Text style={styles.summaryNumber}>{alertSummary.lowSeverity}</Text>
          <Text style={styles.summaryLabel}>Low Priority</Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Export Buttons */}
        <View style={styles.exportSection}>
          <TouchableOpacity
            style={[styles.exportButton, { backgroundColor: "#dc3545" }]}
            onPress={exportToPDF}
          >
            <IconSymbol name="doc.text" size={20} color="white" />
            <Text style={styles.exportButtonText}>Export PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.exportButton, { backgroundColor: "#28a745" }]}
            onPress={exportToExcel}
          >
            <IconSymbol name="doc.text" size={20} color="white" />
            <Text style={styles.exportButtonText}>Export Excel</Text>
          </TouchableOpacity>
        </View>

        {/* Filters */}
        <View style={styles.filtersSection}>
          <Text style={styles.filterTitle}>Filter by Severity</Text>
          <View style={styles.filterRow}>
            {renderFilterButton("all", "All")}
            {renderFilterButton("high", "High")}
            {renderFilterButton("medium", "Medium")}
            {renderFilterButton("low", "Low")}
          </View>

          <Text style={styles.filterTitle}>Filter by Type</Text>
          <View style={styles.typeRow}>
            {renderTypeButton("all", "All")}
            {renderTypeButton("consumption", "Over Use")}
            {renderTypeButton("idle", "Idle")}
            {renderTypeButton("underworked", "Under Worked")}
          </View>
        </View>

        {/* Type Summary */}
        <View style={styles.typeSummarySection}>
          <Text style={styles.sectionTitle}>Alert Types Breakdown</Text>
          <View style={styles.typeSummaryCards}>
            <View style={[styles.typeSummaryCard, { borderColor: "#dc3545" }]}>
              <Text style={[styles.typeSummaryNumber, { color: "#dc3545" }]}>
                {alertSummary.overConsumption}
              </Text>
              <Text style={styles.typeSummaryLabel}>Over Consumption</Text>
            </View>
            <View style={[styles.typeSummaryCard, { borderColor: "#6f42c1" }]}>
              <Text style={[styles.typeSummaryNumber, { color: "#6f42c1" }]}>
                {alertSummary.idleMachines}
              </Text>
              <Text style={styles.typeSummaryLabel}>Idle Machines</Text>
            </View>
            <View style={[styles.typeSummaryCard, { borderColor: "#20c997" }]}>
              <Text style={[styles.typeSummaryNumber, { color: "#20c997" }]}>
                {alertSummary.underWorked}
              </Text>
              <Text style={styles.typeSummaryLabel}>Under Worked</Text>
            </View>
          </View>
        </View>

        {/* Alerts List */}
        <View style={styles.alertsSection}>
          <Text style={styles.sectionTitle}>
            Active Alerts ({filteredAlerts.length})
          </Text>

          {filteredAlerts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol name="checkmark.circle" size={48} color="#28a745" />
              <Text style={styles.emptyText}>
                No alerts found for selected criteria
              </Text>
              <Text style={styles.emptySubtext}>
                All machines are operating within normal parameters
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredAlerts}
              renderItem={renderAlertItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: 15 }} />}
            />
          )}
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
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
  },
  summaryContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 15,
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  summaryNumber: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
  },
  summaryLabel: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.9)",
    marginTop: 5,
    textAlign: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  exportSection: {
    flexDirection: "row",
    gap: 10,
    marginVertical: 15,
  },
  exportButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  exportButtonText: {
    color: "white",
    fontWeight: "600",
  },
  filtersSection: {
    marginBottom: 20,
  },
  filterTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
    color: "#333",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 15,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  typeRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  typeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  typeButtonText: {
    fontSize: 11,
    fontWeight: "600",
  },
  typeSummarySection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 15,
    color: "#333",
  },
  typeSummaryCards: {
    flexDirection: "row",
    gap: 10,
  },
  typeSummaryCard: {
    flex: 1,
    backgroundColor: "white",
    borderWidth: 2,
    borderRadius: 8,
    padding: 15,
    alignItems: "center",
  },
  typeSummaryNumber: {
    fontSize: 20,
    fontWeight: "bold",
  },
  typeSummaryLabel: {
    fontSize: 10,
    color: "#666",
    marginTop: 5,
    textAlign: "center",
  },
  alertsSection: {
    marginBottom: 20,
  },
  alertItem: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  alertHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  alertHeaderLeft: {
    flex: 1,
  },
  machineId: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  alertBadges: {
    flexDirection: "row",
    gap: 8,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  severityText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  typeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
  timestamp: {
    fontSize: 11,
    color: "#666",
  },
  alertContent: {
    gap: 12,
  },
  alertValues: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  valueItem: {
    alignItems: "center",
    flex: 1,
  },
  valueLabel: {
    fontSize: 11,
    color: "#666",
    marginBottom: 4,
  },
  valueNumber: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
  },
  description: {
    backgroundColor: "#f8f9fa",
    padding: 12,
    borderRadius: 6,
  },
  descriptionText: {
    fontSize: 13,
    color: "#333",
    fontStyle: "italic",
  },
  alertFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 11,
    color: "#666",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    marginTop: 10,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 5,
    textAlign: "center",
  },
});
