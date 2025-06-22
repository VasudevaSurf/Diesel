import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  FlatList,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { DieselService, DieselEntry, Machine } from "@/services/DieselService";
import { Picker } from "@react-native-picker/picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

interface SummaryStats {
  totalMachines: number;
  totalDiesel: number;
  totalUsage: number;
  avgRate: string;
  totalEntries: number;
}

export default function ReportsScreen() {
  const colorScheme = useColorScheme();
  const [loading, setLoading] = useState(false);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [logs, setLogs] = useState<DieselEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<DieselEntry[]>([]);
  const [summaryStats, setSummaryStats] = useState<SummaryStats>({
    totalMachines: 0,
    totalDiesel: 0,
    totalUsage: 0,
    avgRate: "0",
    totalEntries: 0,
  });

  // Filter state
  const [filterOwnership, setFilterOwnership] = useState<string>("");
  const [filterMachine, setFilterMachine] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [availableMachines, setAvailableMachines] = useState<Machine[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    updateMachineFilter();
  }, [filterOwnership, machines]);

  useEffect(() => {
    calculateSummaryStats();
  }, [filteredLogs, machines]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [machinesData, logsData] = await Promise.all([
        DieselService.getMachines(),
        DieselService.getLogs(),
      ]);

      setMachines(machinesData);
      setLogs(logsData.logs);
      setFilteredLogs(logsData.logs);
    } catch (error) {
      console.error("Error loading reports data:", error);
      // Load mock data
      const mockMachines = [
        {
          name: "JCB-12",
          plate: "AP09AB1234",
          ownershipType: "Rental",
          machineType: "L/hr",
        },
        {
          name: "CAT-09",
          plate: "TN10CD5678",
          ownershipType: "Own",
          machineType: "L/hr",
        },
      ];

      const mockLogs = [
        {
          timestamp: new Date().toLocaleString(),
          machineName: "JCB-12",
          startReading: 1245.0,
          endReading: 1250.5,
          usage: 5.5,
          dieselFilled: 25.0,
          rate: 4.55,
          remarks: "CH 1+500",
          phoneNumber: "9876543210",
          machineType: "L/hr",
        },
      ];

      setMachines(mockMachines);
      setLogs(mockLogs);
      setFilteredLogs(mockLogs);
    } finally {
      setLoading(false);
    }
  };

  const updateMachineFilter = () => {
    const filtered = filterOwnership
      ? machines.filter((m) => m.ownershipType === filterOwnership)
      : machines;

    setAvailableMachines(filtered);

    // Reset machine filter if current selection is not in filtered list
    if (filterMachine && !filtered.find((m) => m.name === filterMachine)) {
      setFilterMachine("");
    }
  };

  const calculateSummaryStats = () => {
    const totalDiesel = filteredLogs.reduce(
      (sum, log) => sum + (log.dieselFilled || 0),
      0
    );
    const totalUsage = filteredLogs.reduce(
      (sum, log) => sum + (log.usage || 0),
      0
    );
    const uniqueMachines = new Set(filteredLogs.map((log) => log.machineName))
      .size;

    // Calculate separate averages for different machine types
    let totalLHR = 0,
      countLHR = 0;
    let totalKML = 0,
      countKML = 0;

    filteredLogs.forEach((log) => {
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

    // Create efficiency label based on what types are present
    let efficiencyLabel;
    const avgLHR = countLHR > 0 ? (totalLHR / countLHR).toFixed(2) : null;
    const avgKML = countKML > 0 ? (totalKML / countKML).toFixed(2) : null;

    if (avgLHR && avgKML) {
      efficiencyLabel = `L/hr: ${avgLHR} | KM/l: ${avgKML}`;
    } else if (avgLHR) {
      efficiencyLabel = `${avgLHR} L/hr`;
    } else if (avgKML) {
      efficiencyLabel = `${avgKML} KM/l`;
    } else {
      efficiencyLabel = "--";
    }

    setSummaryStats({
      totalMachines: uniqueMachines,
      totalDiesel: totalDiesel,
      totalUsage: totalUsage,
      avgRate: efficiencyLabel,
      totalEntries: filteredLogs.length,
    });
  };

  const applyFilters = async () => {
    try {
      setLoading(true);

      const filters = {
        dateFrom: filterDateFrom,
        dateTo: filterDateTo,
        machineName: filterMachine,
        ownership: filterOwnership,
      };

      const result = await DieselService.getLogs(filters);

      if (result.success) {
        setFilteredLogs(result.logs);
      } else {
        Alert.alert("Error", "Failed to apply filters");
      }
    } catch (error) {
      console.error("Error applying filters:", error);
      Alert.alert("Error", "Failed to apply filters");
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilterOwnership("");
    setFilterMachine("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilteredLogs(logs);
  };

  const generateMachineId = (machineName: string) => {
    const machine = machines.find((m) => m.name === machineName);
    return machine ? `${machine.name}-${machine.plate}` : machineName;
  };

  const getMismatchIndicator = (log: DieselEntry) => {
    const machine = machines.find((m) => m.name === log.machineName);
    if (!machine || !machine.standardAvgDiesel) return "🟢 0.0";

    const standardAvg = machine.standardAvgDiesel;
    const actualRate = parseFloat(log.rate?.toString() || "0");
    const mismatch = actualRate - standardAvg;

    if (Math.abs(mismatch) < 0.5) {
      return `🟢 ${mismatch.toFixed(2)}`;
    } else {
      return mismatch > 0
        ? `🔴 +${mismatch.toFixed(2)}`
        : `🟢 ${mismatch.toFixed(2)}`;
    }
  };

  const exportToCSV = async () => {
    try {
      const headers = [
        "Date & Time",
        "Machine ID",
        "Ownership",
        "Type",
        "Last Reading",
        "Current Reading",
        "Usage",
        "Diesel (L)",
        "Rate",
        "Mismatch",
        "Phone",
        "Remarks",
      ];

      const csvData = [
        headers.join(","),
        ...filteredLogs.map((log) => {
          const machine = machines.find((m) => m.name === log.machineName);
          return [
            `"${log.timestamp}"`,
            `"${generateMachineId(log.machineName)}"`,
            `"${machine?.ownershipType || "Unknown"}"`,
            `"${log.machineType || "L/hr"}"`,
            log.startReading || 0,
            log.endReading || 0,
            log.usage || 0,
            log.dieselFilled || 0,
            log.rate || 0,
            `"${getMismatchIndicator(log)}"`,
            log.phoneNumber || "",
            `"${log.remarks || ""}"`,
          ].join(",");
        }),
      ].join("\n");

      const fileName = `diesel_report_${
        new Date().toISOString().split("T")[0]
      }.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, csvData, {
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

  const renderLogItem = ({ item }: { item: DieselEntry }) => {
    const machine = machines.find((m) => m.name === item.machineName);
    const machineId = generateMachineId(item.machineName);

    return (
      <View style={styles.logItem}>
        <View style={styles.logHeader}>
          <Text style={styles.machineId}>{machineId}</Text>
          <Text style={styles.logDate}>{item.timestamp}</Text>
        </View>

        <View style={styles.logDetails}>
          <View style={styles.badgeContainer}>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor:
                    machine?.ownershipType === "Rental" ? "#ffeaa7" : "#81ecec",
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  {
                    color:
                      machine?.ownershipType === "Rental"
                        ? "#d63031"
                        : "#00b894",
                  },
                ]}
              >
                {machine?.ownershipType || "Own"}
              </Text>
            </View>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor:
                    item.machineType === "KM/l" ? "#fd79a8" : "#74b9ff",
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  {
                    color: item.machineType === "KM/l" ? "#e84393" : "#0984e3",
                  },
                ]}
              >
                {item.machineType || "L/hr"}
              </Text>
            </View>
          </View>

          <View style={styles.logStats}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Reading</Text>
              <Text style={styles.statValue}>
                {item.startReading} → {item.endReading}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Usage</Text>
              <Text style={styles.statValue}>
                {item.usage} {item.machineType === "KM/l" ? "km" : "hrs"}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Diesel</Text>
              <Text style={styles.statValue}>{item.dieselFilled}L</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Rate</Text>
              <Text style={styles.statValue}>
                {item.rate} {item.machineType || "L/hr"}
              </Text>
            </View>
          </View>

          <View style={styles.logFooter}>
            <Text style={styles.mismatchText}>
              Mismatch: {getMismatchIndicator(item)}
            </Text>
            <Text style={styles.remarksText}>"{item.remarks}"</Text>
          </View>
        </View>
      </View>
    );
  };

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
          📊 Smart Reports & Analytics
        </ThemedText>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Summary Cards */}
        <View style={styles.summarySection}>
          <ThemedText style={styles.sectionTitle}>
            📈 Summary Statistics
          </ThemedText>

          <View style={styles.summaryCards}>
            <View style={[styles.summaryCard, { backgroundColor: "#4CAF50" }]}>
              <Text style={styles.summaryNumber}>
                {summaryStats.totalMachines}
              </Text>
              <Text style={styles.summaryLabel}>Machines</Text>
            </View>

            <View style={[styles.summaryCard, { backgroundColor: "#2196F3" }]}>
              <Text style={styles.summaryNumber}>
                {summaryStats.totalDiesel.toFixed(1)}L
              </Text>
              <Text style={styles.summaryLabel}>Total Diesel</Text>
            </View>

            <View style={[styles.summaryCard, { backgroundColor: "#FF9800" }]}>
              <Text style={styles.summaryNumber}>
                {summaryStats.totalUsage.toFixed(1)}
              </Text>
              <Text style={styles.summaryLabel}>Total Usage</Text>
            </View>

            <View style={[styles.summaryCard, { backgroundColor: "#9C27B0" }]}>
              <Text style={styles.summaryNumber}>
                {summaryStats.totalEntries}
              </Text>
              <Text style={styles.summaryLabel}>Entries</Text>
            </View>
          </View>

          <View style={styles.efficiencyCard}>
            <Text style={styles.efficiencyLabel}>Average Efficiency</Text>
            <Text style={styles.efficiencyValue}>{summaryStats.avgRate}</Text>
          </View>
        </View>

        {/* Filters Section */}
        <View style={styles.filtersSection}>
          <ThemedText style={styles.sectionTitle}>🔍 Filters</ThemedText>

          {/* Ownership Filter */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Ownership Type</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={filterOwnership}
                onValueChange={setFilterOwnership}
                style={styles.picker}
              >
                <Picker.Item label="-- All Ownership Types --" value="" />
                <Picker.Item label="Own" value="Own" />
                <Picker.Item label="Rental" value="Rental" />
              </Picker>
            </View>
          </View>

          {/* Machine Filter */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Machine</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={filterMachine}
                onValueChange={setFilterMachine}
                style={styles.picker}
              >
                <Picker.Item label="-- All Machines --" value="" />
                {availableMachines.map((machine, index) => (
                  <Picker.Item
                    key={index}
                    label={`${generateMachineId(machine.name)} (${
                      machine.ownershipType || "Own"
                    })`}
                    value={machine.name}
                  />
                ))}
              </Picker>
            </View>
          </View>

          {/* Date Filters */}
          <View style={styles.dateFilters}>
            <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
              <Text style={styles.label}>From Date</Text>
              <TextInput
                style={styles.input}
                value={filterDateFrom}
                onChangeText={setFilterDateFrom}
                placeholder="YYYY-MM-DD"
              />
            </View>

            <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
              <Text style={styles.label}>To Date</Text>
              <TextInput
                style={styles.input}
                value={filterDateTo}
                onChangeText={setFilterDateTo}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>

          {/* Filter Buttons */}
          <View style={styles.filterButtons}>
            <TouchableOpacity
              style={[
                styles.filterButton,
                { backgroundColor: Colors[colorScheme ?? "light"].tint },
              ]}
              onPress={applyFilters}
              disabled={loading}
            >
              <IconSymbol name="magnifyingglass" size={20} color="white" />
              <Text style={styles.filterButtonText}>
                {loading ? "Filtering..." : "Apply Filters"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterButton, { backgroundColor: "#6c757d" }]}
              onPress={clearFilters}
            >
              <IconSymbol name="xmark" size={20} color="white" />
              <Text style={styles.filterButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Export Section */}
        <View style={styles.exportSection}>
          <TouchableOpacity
            style={[styles.exportButton, { backgroundColor: "#28a745" }]}
            onPress={exportToCSV}
          >
            <IconSymbol name="square.and.arrow.up" size={20} color="white" />
            <Text style={styles.exportButtonText}>Export to CSV</Text>
          </TouchableOpacity>
        </View>

        {/* Logs List */}
        <View style={styles.logsSection}>
          <ThemedText style={styles.sectionTitle}>📋 Diesel Logs</ThemedText>

          {filteredLogs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol name="tray" size={48} color="#ccc" />
              <Text style={styles.emptyText}>
                No logs found for selected criteria
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredLogs}
              renderItem={renderLogItem}
              keyExtractor={(item, index) => `log-${index}`}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  summarySection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },
  summaryCards: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  summaryCard: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    marginHorizontal: 3,
    alignItems: "center",
  },
  summaryNumber: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
  },
  summaryLabel: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.9)",
    marginTop: 5,
    textAlign: "center",
  },
  efficiencyCard: {
    backgroundColor: "#667eea",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  efficiencyLabel: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
  },
  efficiencyValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "white",
    marginTop: 5,
  },
  filtersSection: {
    marginTop: 30,
  },
  formGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#e1e5e9",
    borderRadius: 8,
    backgroundColor: "white",
  },
  picker: {
    height: 50,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e1e5e9",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "white",
  },
  dateFilters: {
    flexDirection: "row",
  },
  filterButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  filterButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  filterButtonText: {
    color: "white",
    fontWeight: "600",
  },
  exportSection: {
    marginTop: 20,
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 15,
    borderRadius: 8,
    gap: 10,
  },
  exportButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  logsSection: {
    marginTop: 30,
    marginBottom: 20,
  },
  logItem: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  machineId: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  logDate: {
    fontSize: 12,
    color: "#666",
  },
  logDetails: {
    gap: 10,
  },
  badgeContainer: {
    flexDirection: "row",
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  logStats: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statItem: {
    alignItems: "center",
  },
  statLabel: {
    fontSize: 10,
    color: "#666",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#333",
  },
  logFooter: {
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    paddingTop: 10,
    gap: 5,
  },
  mismatchText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  remarksText: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    marginTop: 10,
  },
});
