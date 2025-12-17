// components/CustomDateTimePicker.jsx
import { useState, useEffect } from 'react';
import { View, Modal, Pressable, StyleSheet, ScrollView } from 'react-native';
import ThemedText from './ThemedText';
import { Ionicons } from '@expo/vector-icons';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = ['00', '15', '30', '45'];

export default function CustomDateTimePicker({
  visible,
  mode = 'date', // 'date' | 'time'
  value = new Date(),
  onConfirm,
  onCancel,
  minimumDate = new Date(),
}) {
  const [selectedDate, setSelectedDate] = useState(value || new Date());
  const [currentMonth, setCurrentMonth] = useState(value?.getMonth() || new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(value?.getFullYear() || new Date().getFullYear());
  const [selectedHour, setSelectedHour] = useState(value?.getHours() || 9);
  const [selectedMinute, setSelectedMinute] = useState('00');

  useEffect(() => {
    if (value) {
      setSelectedDate(value);
      setCurrentMonth(value.getMonth());
      setCurrentYear(value.getFullYear());
      setSelectedHour(value.getHours());
      const mins = value.getMinutes();
      setSelectedMinute(mins < 15 ? '00' : mins < 30 ? '15' : mins < 45 ? '30' : '45');
    }
  }, [value]);

  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month, year) => {
    return new Date(year, month, 1).getDay();
  };

  const handleDayPress = (day) => {
    const newDate = new Date(currentYear, currentMonth, day);
    setSelectedDate(newDate);
  };

  const handleConfirm = () => {
    if (mode === 'date') {
      const result = new Date(selectedDate);
      result.setFullYear(currentYear);
      result.setMonth(currentMonth);
      onConfirm(result);
    } else {
      const result = new Date(selectedDate);
      result.setHours(selectedHour);
      result.setMinutes(parseInt(selectedMinute));
      onConfirm(result);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const prevMonth = () => {
    const minDate = minimumDate || new Date();
    const newMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const newYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    // Don't allow going before minimum date
    if (new Date(newYear, newMonth) >= new Date(minDate.getFullYear(), minDate.getMonth())) {
      setCurrentMonth(newMonth);
      setCurrentYear(newYear);
    }
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
    const days = [];
    const today = new Date();
    const minDate = minimumDate || today;

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const isSelected = selectedDate?.getDate() === day &&
                        selectedDate?.getMonth() === currentMonth &&
                        selectedDate?.getFullYear() === currentYear;
      const isToday = date.toDateString() === today.toDateString();
      const isPast = date < minDate && !isToday;

      days.push(
        <Pressable
          key={day}
          style={[
            styles.dayCell,
            isSelected && styles.selectedDay,
            isPast && styles.disabledDay,
          ]}
          onPress={() => !isPast && handleDayPress(day)}
          disabled={isPast}
        >
          <ThemedText
            style={[
              styles.dayText,
              isSelected && styles.selectedDayText,
              isToday && !isSelected && styles.todayText,
              isPast && styles.disabledDayText,
            ]}
          >
            {day}
          </ThemedText>
        </Pressable>
      );
    }

    return days;
  };

  const renderTimePicker = () => {
    return (
      <View style={styles.timePickerContainer}>
        {/* Hours */}
        <View style={styles.timeColumn}>
          <ThemedText style={styles.timeLabel}>Hour</ThemedText>
          <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false}>
            {HOURS.map((hour) => (
              <Pressable
                key={hour}
                style={[
                  styles.timeItem,
                  selectedHour === hour && styles.selectedTimeItem,
                ]}
                onPress={() => setSelectedHour(hour)}
              >
                <ThemedText
                  style={[
                    styles.timeItemText,
                    selectedHour === hour && styles.selectedTimeItemText,
                  ]}
                >
                  {String(hour).padStart(2, '0')}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Separator */}
        <ThemedText style={styles.timeSeparator}>:</ThemedText>

        {/* Minutes */}
        <View style={styles.timeColumn}>
          <ThemedText style={styles.timeLabel}>Minute</ThemedText>
          <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false}>
            {MINUTES.map((minute) => (
              <Pressable
                key={minute}
                style={[
                  styles.timeItem,
                  selectedMinute === minute && styles.selectedTimeItem,
                ]}
                onPress={() => setSelectedMinute(minute)}
              >
                <ThemedText
                  style={[
                    styles.timeItemText,
                    selectedMinute === minute && styles.selectedTimeItemText,
                  ]}
                >
                  {minute}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} />

        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onCancel} hitSlop={8}>
              <ThemedText style={styles.cancelText}>Cancel</ThemedText>
            </Pressable>
            <ThemedText style={styles.title}>
              {mode === 'date' ? 'Select Date' : 'Select Time'}
            </ThemedText>
            <Pressable onPress={handleConfirm} hitSlop={8}>
              <ThemedText style={styles.doneText}>Done</ThemedText>
            </Pressable>
          </View>

          {mode === 'date' ? (
            <>
              {/* Month/Year Navigator */}
              <View style={styles.monthNav}>
                <Pressable onPress={prevMonth} hitSlop={8} style={styles.navBtn}>
                  <Ionicons name="chevron-back" size={24} color="#684477" />
                </Pressable>
                <ThemedText style={styles.monthYearText}>
                  {MONTHS[currentMonth]} {currentYear}
                </ThemedText>
                <Pressable onPress={nextMonth} hitSlop={8} style={styles.navBtn}>
                  <Ionicons name="chevron-forward" size={24} color="#684477" />
                </Pressable>
              </View>

              {/* Weekday headers */}
              <View style={styles.weekdayRow}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <View key={day} style={styles.weekdayCell}>
                    <ThemedText style={styles.weekdayText}>{day}</ThemedText>
                  </View>
                ))}
              </View>

              {/* Calendar grid */}
              <View style={styles.calendarGrid}>{renderCalendar()}</View>
            </>
          ) : (
            renderTimePicker()
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  cancelText: {
    fontSize: 16,
    color: '#6B7280',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  doneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#684477',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  navBtn: {
    padding: 4,
  },
  monthYearText: {
    fontSize: 17,
    fontWeight: '700',
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
  },
  dayCell: {
    width: '14.28%', // 100% / 7 days
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  dayText: {
    fontSize: 16,
    fontWeight: '500',
  },
  selectedDay: {
    backgroundColor: '#684477',
    borderRadius: 999,
  },
  selectedDayText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  todayText: {
    color: '#684477',
    fontWeight: '700',
  },
  disabledDay: {
    opacity: 0.3,
  },
  disabledDayText: {
    color: '#9CA3AF',
  },

  // Time picker styles
  timePickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 40,
    minHeight: 280,
  },
  timeColumn: {
    flex: 1,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  timeScroll: {
    maxHeight: 200,
  },
  timeItem: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginVertical: 4,
  },
  selectedTimeItem: {
    backgroundColor: '#684477',
  },
  timeItemText: {
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  selectedTimeItemText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  timeSeparator: {
    fontSize: 28,
    fontWeight: '700',
    marginHorizontal: 8,
    marginTop: 24,
  },
});
