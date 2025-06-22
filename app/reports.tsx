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
  avgEfficiency: {
    lhr: {
      average: number;
      count: number;
      display: string;
    };
    kml: {
      average: number;
      count: number;
      display: string;
    };
    combined: string;
  };
  totalEntries: number;
  machineBreakdown: {
    lhrMachines: number;
    kmlMachines: number;
  };
}

interface MachineTypeStats {
  type: string;
  count: number;
  totalDiesel: number;
  totalUsage: number;
  avgEfficiency: number;
  entries: number;
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
    avgEfficiency: {
      lhr: { average: 0, count: 0, display: "--" },
      kml: { average: 0, count: 0, display: "--" },
      combined: "--",
    },
    totalEntries: 0,
    machineBreakdown: {
      lhrMachines: 0,
      kmlMachines: 0,
    },
  });

  // Filter state
  const [filterOwnership, setFilterOwnership] = useState<string>("");
  const [filterMachine, setFilterMachine] = useState<string>("");
  const [filterMachineType, setFilterMachineType] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [availableMachines, setAvailableMachines] = useState<Machine[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    updateMachineFilter();
  }, [filterOwnership, filterMachineType, machines]);

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
        {
          name: "TRUCK-01",
          plate: "KA20EF9012",
          ownershipType: "Own",
          machineType: "KM/l",
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
        {
          timestamp: new Date().toLocaleString(),
          machineName: "TRUCK-01",
          startReading: 45000,
          endReading: 45150,
          usage: 150,
          dieselFilled: 30.0,
          rate: 5.0,
          remarks: "Material transport",
          phoneNumber: "9876543210",
          machineType: "KM/l",
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
    let filtered = machines;

    // Filter by ownership
    if (filterOwnership) {
      filtered = filtered.filter((m) => m.ownershipType === filterOwnership);
    }

    // Filter by machine type
    if (filterMachineType) {
      filtered = filtered.filter(
        (m) => (m.machineType || "L/hr") === filterMachineType
      );
    }

    setAvailableMachines(filtered);

    // Reset machine filter if current selection is not in filtered list
    if (filterMachine && !filtered.find((m) => m.name === filterMachine)) {
      setFilterMachine("");
    }
  };

  const calculateSummaryStats = () => {
    // Calculate basic totals
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

    // Separate efficiency calculations by machine type
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
      } else if (type === "KM/l" || type === "L/km") {
        totalKML += rate;
        countKML++;
      }
    });

    // Calculate averages
    const avgLHR = countLHR > 0 ? totalLHR / countLHR : 0;
    const avgKML = countKML > 0 ? totalKML / countKML : 0;

    // Create display strings
    const lhrDisplay = countLHR > 0 ? `${avgLHR.toFixed(2)} L/hr` : "--";
    const kmlDisplay = countKML > 0 ? `${avgKML.toFixed(2)} KM/l` : "--";

    // Create combined efficiency label based on what types are present
    let combinedEfficiency: string;
    if (countLHR > 0 && countKML > 0) {
      combinedEfficiency = `L/hr: ${avgLHR.toFixed(2)} | KM/l: ${avgKML.toFixed(
        2
      )}`;
    } else if (countLHR > 0) {
      combinedEfficiency = `${avgLHR.toFixed(2)} L/hr`;
    } else if (countKML > 0) {
      combinedEfficiency = `${avgKML.toFixed(2)} KM/l`;
    } else {
      combinedEfficiency = "--";
    }

    // Count machine types from the filtered machines
    const machinesInLogs = new Set(filteredLogs.map((log) => log.machineName));
    const relevantMachines = machines.filter((m) => machinesInLogs.has(m.name));

    const lhrMachines = relevantMachines.filter(
      (m) => (m.machineType || "L/hr") === "L/hr"
    ).length;
    const kmlMachines = relevantMachines.filter(
      (m) => (m.machineType || "L/hr") === "KM/l"
    ).length;

    setSummaryStats({
      totalMachines: uniqueMachines,
      totalDiesel,
      totalUsage,
      avgEfficiency: {
        lhr: {
          average: avgLHR,
          count: countLHR,
          display: lhrDisplay,
        },
        kml: {
          average: avgKML,
          count: countKML,
          display: kmlDisplay,
        },
        combined: combinedEfficiency,
      },
      totalEntries: filteredLogs.length,
      machineBreakdown: {
        lhrMachines,
        kmlMachines,
      },
    });
  };

  const getMachineTypeStats = (): MachineTypeStats[] => {
    const stats: { [key: string]: MachineTypeStats } = {};

    filteredLogs.forEach((log) => {
      const type = log.machineType || "L/hr";

      if (!stats[type]) {
        stats[type] = {
          type,
          count: 0,
          totalDiesel: 0,
          totalUsage: 0,
          avgEfficiency: 0,
          entries: 0,
        };
      }

      stats[type].totalDiesel += log.dieselFilled || 0;
      stats[type].totalUsage += log.usage || 0;
      stats[type].avgEfficiency += parseFloat(log.rate?.toString() || "0");
      stats[type].entries += 1;
    });

    // Calculate averages and unique machine counts
    Object.keys(stats).forEach((type) => {
      const typeStats = stats[type];
      typeStats.avgEfficiency =
        typeStats.entries > 0 ? typeStats.avgEfficiency / typeStats.entries : 0;

      // Count unique machines of this type
      const uniqueMachines = new Set(
        filteredLogs
          .filter((log) => (log.machineType || "L/hr") === type)
          .map((log) => log.machineName)
      );
      typeStats.count = uniqueMachines.size;
    });

    return Object.values(stats);
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
        let filtered = result.logs;

        // Apply machine type filter locally if needed
        if (filterMachineType) {
          filtered = filtered.filter(
            (log) => (log.machineType || "L/hr") === filterMachineType
          );
        }

        setFilteredLogs(filtered);
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
    setFilterMachineType("");
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

      // Add summary statistics to CSV
      const summaryData = [
        "",
        "SUMMARY STATISTICS",
        `Total Machines,${summaryStats.totalMachines}`,
        `Total Diesel,${summaryStats.totalDiesel.toFixed(1)}L`,
        `Total Usage,${summaryStats.totalUsage.toFixed(1)}`,
        `L/hr Machines,${summaryStats.machineBreakdown.lhrMachines}`,
        `KM/l Machines,${summaryStats.machineBreakdown.kmlMachines}`,
        `L/hr Efficiency,${summaryStats.avgEfficiency.lhr.display}`,
        `KM/l Efficiency,${summaryStats.avgEfficiency.kml.display}`,
        `Combined Efficiency,"${summaryStats.avgEfficiency.combined}"`,
        `Total Entries,${summaryStats.totalEntries}`,
      ].join("\n");

      const finalCsvData = csvData + "\n" + summaryData;

      const fileName = `diesel_report_${
        new Date().toISOString().split("T")[0]
      }.csv`;
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

  const renderMachineTypeCard = (typeStats: MachineTypeStats) => (
    <View key={typeStats.type} style={styles.typeStatsCard}>
      <View style={styles.typeStatsHeader}>
        <Text style={styles.typeStatsTitle}>{typeStats.type} Machines</Text>
        <View
          style={[
            styles.typeStatsBadge,
            {
              backgroundColor:
                typeStats.type === "KM/l" ? "#fd79a8" : "#74b9ff",
            },
          ]}
        >
          <Text style={styles.typeStatsBadgeText}>{typeStats.count}</Text>
        </View>
      </View>

      <View style={styles.typeStatsContent}>
        <View style={styles.typeStatRow}>
          <Text style={styles.typeStatLabel}>Total Diesel:</Text>
          <Text style={styles.typeStatValue}>
            {typeStats.totalDiesel.toFixed(1)}L
          </Text>
        </View>
        <View style={styles.typeStatRow}>
          <Text style={styles.typeStatLabel}>Total Usage:</Text>
          <Text style={styles.typeStatValue}>
            {typeStats.totalUsage.toFixed(1)}{" "}
            {typeStats.type === "KM/l" ? "km" : "hrs"}
          </Text>
        </View>
        <View style={styles.typeStatRow}>
          <Text style={styles.typeStatLabel}>Avg Efficiency:</Text>
          <Text style={[styles.typeStatValue, styles.efficiencyValue]}>
            {typeStats.avgEfficiency.toFixed(2)} {typeStats.type}
          </Text>
        </View>
        <View style={styles.typeStatRow}>
          <Text style={styles.typeStatLabel}>Entries:</Text>
          <Text style={styles.typeStatValue}>{typeStats.entries}</Text>
        </View>
      </View>
    </View>
  );

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

          {/* Enhanced Efficiency Card */}
          <View style={styles.efficiencyCard}>
            <Text style={styles.efficiencyLabel}>Average Efficiency</Text>
            <Text style={styles.efficiencyValue}>
              {summaryStats.avgEfficiency.combined}
            </Text>

            {/* Breakdown when both types exist */}
            {summaryStats.avgEfficiency.lhr.count > 0 &&
              summaryStats.avgEfficiency.kml.count > 0 && (
                <View style={styles.efficiencyBreakdown}>
                  <View style={styles.efficiencyBreakdownItem}>
                    <Text style={styles.efficiencyBreakdownLabel}>
                      L/hr machines:
                    </Text>
                    <Text style={styles.efficiencyBreakdownValue}>
                      {summaryStats.avgEfficiency.lhr.display}
                    </Text>
                  </View>
                  <View style={styles.efficiencyBreakdownItem}>
                    <Text style={styles.efficiencyBreakdownLabel}>
                      KM/l machines:
                    </Text>
                    <Text style={styles.efficiencyBreakdownValue}>
                      {summaryStats.avgEfficiency.kml.display}
                    </Text>
                  </View>
                </View>
              )}
          </View>

          {/* Machine Type Breakdown */}
          <View style={styles.machineTypeSection}>
            <Text style={styles.sectionSubtitle}>Machine Type Breakdown</Text>
            <View style={styles.machineTypeCards}>
              {getMachineTypeStats().map(renderMachineTypeCard)}
            </View>
          </View>
        </View>

        {/* Filters Section */}
        <View style={styles.filtersSection}>
          <ThemedText style={styles.sectionTitle}>🔍 Filters</ThemedText>

          {/* Ownership and Machine Type Filter */}
          <View style={styles.filterRow}>
            <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
              <Text style={styles.label}>Ownership Type</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={filterOwnership}
                  onValueChange={setFilterOwnership}
                  style={styles.picker}
                >
                  <Picker.Item label="-- All Ownership --" value="" />
                  <Picker.Item label="Own" value="Own" />
                  <Picker.Item label="Rental" value="Rental" />
                </Picker>
              </View>
            </View>

            <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
              <Text style={styles.label}>Machine Type</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={filterMachineType}
                  onValueChange={setFilterMachineType}
                  style={styles.picker}
                >
                  <Picker.Item label="-- All Types --" value="" />
                  <Picker.Item label="L/hr (Engine Hours)" value="L/hr" />
                  <Picker.Item label="KM/l (Kilometers)" value="KM/l" />
                </Picker>
              </View>
            </View>
          </View>

          {/* Machine Filter */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Specific Machine</Text>
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
                    }) - ${machine.machineType || "L/hr"}`}
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
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 15,
    color: "#333",
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
    marginBottom: 20,
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
    textAlign: "center",
  },
  efficiencyBreakdown: {
    marginTop: 15,
    width: "100%",
    gap: 8,
  },
  efficiencyBreakdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  efficiencyBreakdownLabel: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.8)",
  },
  efficiencyBreakdownValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "white",
  },
  machineTypeSection: {
    marginBottom: 20,
  },
  machineTypeCards: {
    gap: 15,
  },
  typeStatsCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  typeStatsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  typeStatsTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  typeStatsBadge: {
    backgroundColor: "#74b9ff",
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  typeStatsBadgeText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  typeStatsContent: {
    gap: 8,
  },
  typeStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  typeStatLabel: {
    fontSize: 14,
    color: "#666",
  },
  typeStatValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  filtersSection: {
    marginTop: 30,
  },
  filterRow: {
    flexDirection: "row",
    marginBottom: 15,
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
