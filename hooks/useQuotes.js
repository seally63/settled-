//app/hooks/useQuotes.js

import { useContext } from 'react'
import { QuotesContext } from '../contexts/QuotesContext'

export function useQuotes() {
    const context = useContext(QuotesContext)

    if (!context) {
    throw new Error("useUser must be used within a QuotesProvider")
    }

    return context
}
