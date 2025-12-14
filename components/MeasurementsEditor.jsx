import { useState, useEffect } from 'react'
import { View, TextInput, Pressable, Text } from 'react-native'
import ThemedText from './ThemedText'
import Spacer from './Spacer'

export default function MeasurementsEditor({ value = [], onChange }) {
  const [rows, setRows] = useState(Array.isArray(value) ? value : [])

  useEffect(() => { onChange?.(rows) }, [rows])

  const add = () => setRows(prev => [...prev, { area: '', L: null, W: null, H: null, unit: 'm', notes: '' }])
  const remove = (i) => setRows(prev => prev.filter((_, idx) => idx !== i))
  const update = (i, key, val) => {
    setRows(prev => {
      const copy = [...prev]
      copy[i] = { ...copy[i], [key]: val }
      return copy
    })
  }

  return (
    <View style={{ marginHorizontal: 40 }}>
      <ThemedText style={{ fontWeight: '700', marginBottom: 8 }}>Measurements</ThemedText>

      {rows.map((r, i) => (
        <View key={i} style={{ borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <TextInput placeholder="Area (e.g. Bathroom)" value={r.area} onChangeText={(t) => update(i, 'area', t)} style={{ marginBottom: 8 }} />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <TextInput placeholder="L" keyboardType="numeric" value={r.L?.toString() || ''} onChangeText={(t) => update(i, 'L', Number(t) || null)} style={{ flex: 1 }} />
            <TextInput placeholder="W" keyboardType="numeric" value={r.W?.toString() || ''} onChangeText={(t) => update(i, 'W', Number(t) || null)} style={{ flex: 1 }} />
            <TextInput placeholder="H" keyboardType="numeric" value={r.H?.toString() || ''} onChangeText={(t) => update(i, 'H', Number(t) || null)} style={{ flex: 1 }} />
            <TextInput placeholder="Unit" value={r.unit || ''} onChangeText={(t) => update(i, 'unit', t)} style={{ flex: 1 }} />
          </View>
          <TextInput placeholder="Notes (optional)" value={r.notes} onChangeText={(t) => update(i, 'notes', t)} />
          <Spacer size={8} />
          <Pressable onPress={() => remove(i)}><Text style={{ color: 'red' }}>Remove</Text></Pressable>
        </View>
      ))}

      <Pressable onPress={add}><Text style={{ color: '#007AFF' }}>+ Add measurement</Text></Pressable>
    </View>
  )
}
