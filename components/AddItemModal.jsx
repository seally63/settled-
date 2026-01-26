// components/AddItemModal.jsx
import { useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useColorScheme,
} from 'react-native';
import ThemedView from './ThemedView';
import ThemedText from './ThemedText';
import ThemedTextInput from './ThemedTextInput';
import ThemedButton from './ThemedButton';
import Spacer from './Spacer';
import { KeyboardDoneButton, KEYBOARD_DONE_ID } from './KeyboardDoneButton';
import { Colors } from '../constants/Colors';

export default function AddItemModal({ visible, onClose, onSave, initial }) {
  const scheme = useColorScheme();
  const theme = Colors[scheme] ?? Colors.light;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  const [focus, setFocus] = useState({
    name: false,
    description: false,
    qty: false,
    unitPrice: false,
  });

  useEffect(() => {
    if (visible) {
      setName(initial?.name || '');
      setDescription(initial?.description || '');
      setQty(String(initial?.qty ?? ''));
      setUnitPrice(String(initial?.unit_price ?? ''));
      setFocus({ name: false, description: false, qty: false, unitPrice: false });
    }
  }, [visible, initial]);

  function save() {
    const obj = {
      name: name?.trim() || '',
      description: description?.trim() || '',
      qty: Number(qty || 0),
      unit_price: Number(unitPrice || 0),
    };
    onSave?.(obj);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Tap backdrop to dismiss keyboard (not the modal) */}
      <Pressable style={styles.backdrop} onPress={Keyboard.dismiss}>
        {/* Stop propagation when tapping inside the sheet */}
        <Pressable style={{ width: '100%' }} onPress={() => {}}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <ThemedView style={[styles.sheet, { backgroundColor: theme.uiBackground }]}>
              <ScrollView
                contentContainerStyle={{ paddingBottom: 20, paddingRight: 8 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}  // ⬅️ hide indicator
                overScrollMode="never"                 // ⬅️ no glow / indicator on Android
                indicatorStyle="black"                 // ⬅️ iOS fallback (hidden anyway)
              >
                <ThemedText title style={styles.title}>Add item</ThemedText>
                <ThemedText variant="muted" style={styles.subtitle}>Fill in the details below</ThemedText>
                <Spacer size={12} />

                {/* Item name */}
                <View style={styles.fieldBlock}>
                  <ThemedText style={styles.label}>Item name</ThemedText>
                  <ThemedTextInput
                    style={[
                      styles.input,
                      {
                        borderColor: focus.name ? Colors.primary : theme.iconColor,
                        backgroundColor: theme.background,
                      },
                    ]}
                    placeholder="e.g., Shower installation"
                    placeholderTextColor={theme.iconColor}
                    value={name}
                    onChangeText={setName}
                    onFocus={() => setFocus((f) => ({ ...f, name: true }))}
                    onBlur={() => setFocus((f) => ({ ...f, name: false }))}
                  />
                </View>

                {/* Description */}
                <View style={styles.fieldBlock}>
                  <ThemedText style={styles.label}>Description</ThemedText>
                  <ThemedTextInput
                    style={[
                      styles.input,
                      styles.inputMultiline,
                      {
                        borderColor: focus.description ? Colors.primary : theme.iconColor,
                        backgroundColor: theme.background,
                      },
                    ]}
                    placeholder="Add notes or scope of work"
                    placeholderTextColor={theme.iconColor}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    onFocus={() => setFocus((f) => ({ ...f, description: true }))}
                    onBlur={() => setFocus((f) => ({ ...f, description: false }))}
                    inputAccessoryViewID={Platform.OS === "ios" ? KEYBOARD_DONE_ID : undefined}
                  />
                </View>

                {/* Quantity */}
                <View style={styles.fieldBlock}>
                  <ThemedText style={styles.label}>Quantity</ThemedText>
                  <ThemedTextInput
                    style={[
                      styles.input,
                      {
                        borderColor: focus.qty ? Colors.primary : theme.iconColor,
                        backgroundColor: theme.background,
                      },
                    ]}
                    placeholder="e.g., 2"
                    placeholderTextColor={theme.iconColor}
                    keyboardType="numeric"
                    value={qty}
                    onChangeText={setQty}
                    onFocus={() => setFocus((f) => ({ ...f, qty: true }))}
                    onBlur={() => setFocus((f) => ({ ...f, qty: false }))}
                  />
                </View>

                {/* Unit price */}
                <View style={styles.fieldBlock}>
                  <ThemedText style={styles.label}>Unit price</ThemedText>
                  <ThemedTextInput
                    style={[
                      styles.input,
                      {
                        borderColor: focus.unitPrice ? Colors.primary : theme.iconColor,
                        backgroundColor: theme.background,
                      },
                    ]}
                    placeholder="e.g., 120.00"
                    placeholderTextColor={theme.iconColor}
                    keyboardType="numeric"
                    value={unitPrice}
                    onChangeText={setUnitPrice}
                    onFocus={() => setFocus((f) => ({ ...f, unitPrice: true }))}
                    onBlur={() => setFocus((f) => ({ ...f, unitPrice: false }))}
                  />
                </View>

                <Spacer size={12} />

                <View style={styles.row}>
                  <ThemedButton onPress={onClose} style={[styles.btn, styles.cancel]}>
                    <View style={styles.btnRow}>
                      <ThemedText style={styles.btnText}>Cancel</ThemedText>
                    </View>
                  </ThemedButton>

                  <ThemedButton onPress={save} style={[styles.btn, styles.add]}>
                    <View style={styles.btnRow}>
                      <ThemedText style={styles.btnText}>Add</ThemedText>
                    </View>
                  </ThemedButton>
                </View>
              </ScrollView>
            </ThemedView>
          </KeyboardAvoidingView>
          <KeyboardDoneButton />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '90%',
  },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  subtitle: { textAlign: 'center' },

  fieldBlock: { marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  input: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  inputMultiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },

  row: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginTop: 8 },
  btn: { flex: 1, borderRadius: 28, paddingVertical: 12 },
  btnRow: { width: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16, textAlign: 'center' },
  cancel: {},
  add: {},
});






