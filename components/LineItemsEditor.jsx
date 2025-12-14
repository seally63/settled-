import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable } from 'react-native'
import ThemedText from './ThemedText'
import Spacer from './Spacer'

export default function LineItemsEditor({ value = [], onChange }) {
  const [items, setItems] = useState(Array.isArray(value) ? value : [])

  useEffect(() => { onChange?.(items) }, [items])

  const addItem = () => {
    setItems(prev => [...prev, { description: '', qty: 1, unit: '', unit_price: 0 }])
  }

  const update = (i, key, val) => {
    setItems(prev => {
      const copy = [...prev]
      copy[i] = { ...copy[i], [key]: val }
      return copy
    })
  }

  const remove = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))

  return (
    <View style={{ marginHorizontal: 40 }}>
      <ThemedText style={{ fontWeight: '700', marginBottom: 8 }}>Line items</ThemedText>

      {items.map((it, i) => {
        const qty = Number(it.qty || 0)
        const price = Number(it.unit_price || 0)
        const line = Math.round(qty * price * 100) / 100

        return (
          <View key={i} style={{ borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <TextInput
              placeholder="Description"
              value={it.description}
              onChangeText={(t) => update(i, 'description', t)}
              style={{ marginBottom: 8 }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                placeholder="Qty"
                keyboardType="numeric"
                value={String(it.qty ?? '')}
                onChangeText={(t) => update(i, 'qty', Number(t) || 0)}
                style={{ flex: 1 }}
              />
              <TextInput
                placeholder="Unit (e.g. pcs, m²)"
                value={it.unit}
                onChangeText={(t) => update(i, 'unit', t)}
                style={{ flex: 1 }}
              />
              <TextInput
                placeholder="Unit price"
                keyboardType="numeric"
                value={String(it.unit_price ?? '')}
                onChangeText={(t) => update(i, 'unit_price', Number(t) || 0)}
                style={{ flex: 1 }}
              />
            </View>

            {/* Optional per-line measurement summary */}
            {/* If you want per-line measurements, uncomment below:
            <Spacer size={8} />
            <TextInput
              placeholder="Measurements note (e.g. 2.4m x 1.6m)"
              value={it.measurements?.notes || ''}
              onChangeText={(t) => update(i, 'measurements', { ...(it.measurements || {}), notes: t })}
            />
            */}

            <Spacer size={8} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>Line total</Text>
              <Text style={{ fontWeight: '700' }}>{line.toFixed(2)}</Text>
            </View>

            <Spacer size={8} />
            <Pressable onPress={() => remove(i)}>
              <Text style={{ color: 'red' }}>Remove</Text>
            </Pressable>
          </View>
        )
      })}

      <Pressable onPress={addItem}>
        <Text style={{ color: '#007AFF' }}>+ Add line item</Text>
      </Pressable>
    </View>
  )
}

