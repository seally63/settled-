# Registration Flow Redesign - Implementation Guide

## Overview
This document outlines the new registration flow that separates client and trade registration paths with role-specific data collection.

## What's Changed

### Before:
- Single registration screen for all users
- Only collected email and password
- No role selection during registration
- No business details captured for trades

### After:
- Role selection landing page
- Separate registration forms for clients vs trades
- Role-specific data collection
- Business details captured during trade registration
- Professional, modern UI with better UX

## Files Created

### 1. `/app/(auth)/role-select.jsx`
**Purpose**: Landing page where users choose between "Homeowner" or "Tradesperson"

**Features**:
- Two large, tappable cards with icons
- Clear descriptions for each role
- Link to login for existing users
- Modern, centered design

### 2. `/app/(auth)/register-client.jsx`
**Purpose**: Registration form for homeowners/clients

**Collects**:
- Full name
- Email address
- Postcode
- Password
- Password confirmation

**Features**:
- Form validation
- Back button to role selection
- Password strength check (6+ characters)
- Postcode auto-uppercase
- Loading states

### 3. `/app/(auth)/register-trade.jsx`
**Purpose**: Registration form for tradespeople

**Collects**:
- Full name
- Business name
- Trade type (e.g., Plumber, Electrician)
- Email address
- Phone number
- Business postcode
- Password
- Password confirmation

**Features**:
- Extended form for business details
- Form validation
- Back button to role selection
- ScrollView for long form
- Loading states

## Files Modified

### 1. `/app/(auth)/register.jsx`
**Change**: Now redirects to `/role-select`

**Why**: Ensures any existing links to `/register` automatically use the new flow

### 2. `/contexts/UserContext.jsx`
**Change**: Updated `register()` function signature

**Before**:
```javascript
async function register(email, password) { ... }
```

**After**:
```javascript
async function register(email, password, metadata = {}) {
  // Passes metadata to Supabase signup
  await auth.signUp({
    email,
    password,
    options: {
      data: { ...metadata }
    }
  });
}
```

**Metadata structure for client**:
```javascript
{
  role: 'client',
  full_name: 'John Smith',
  postcode: 'SW1A 1AA'
}
```

**Metadata structure for trade**:
```javascript
{
  role: 'trades',
  full_name: 'John Smith',
  business_name: 'ABC Plumbing Ltd',
  phone: '07123456789',
  trade_type: 'Plumber',
  postcode: 'SW1A 1AA'
}
```

## Database Changes

### SQL Migration Required
**File**: `.claude/sql-migrations/registration-redesign.sql`

**Run this in Supabase SQL Editor before testing!**

**Changes**:
1. Adds new columns to `profiles` table:
   - `business_name` (TEXT)
   - `phone` (TEXT)
   - `trade_type` (TEXT)
   - `postcode` (TEXT)

2. Updates `handle_new_user()` trigger function to:
   - Read metadata from `raw_user_meta_data`
   - Populate new profile fields during signup
   - Default to 'client' role if none specified

3. Recreates trigger `on_auth_user_created` to use new function

## User Flow

### Client Registration Flow:
```
User opens app
  ↓
Taps "Register"
  ↓
Sees role-select.jsx
  ↓
Taps "I'm a Homeowner" card
  ↓
Sees register-client.jsx
  ↓
Fills out: name, email, postcode, password
  ↓
Taps "Create Account"
  ↓
UserContext.register() called with metadata
  ↓
Supabase creates auth user with metadata
  ↓
Trigger creates profile row with role='client'
  ↓
Auto-login
  ↓
Redirected to dashboard (client view)
```

### Trade Registration Flow:
```
User opens app
  ↓
Taps "Register"
  ↓
Sees role-select.jsx
  ↓
Taps "I'm a Tradesperson" card
  ↓
Sees register-trade.jsx
  ↓
Fills out: name, business, trade type, email, phone, postcode, password
  ↓
Taps "Create Account"
  ↓
UserContext.register() called with metadata
  ↓
Supabase creates auth user with metadata
  ↓
Trigger creates profile row with role='trades' and business details
  ↓
Auto-login
  ↓
Redirected to dashboard (trade view)
```

## Testing Checklist

### Before Testing:
- [ ] Run the SQL migration in Supabase SQL Editor
- [ ] Verify new columns exist in `profiles` table
- [ ] Verify trigger function was created

### Test Client Registration:
- [ ] Navigate to role selection screen
- [ ] Tap "I'm a Homeowner" card
- [ ] Fill out registration form
- [ ] Submit with valid data
- [ ] Verify auto-login works
- [ ] Check Supabase dashboard - new profile row created with:
  - `role = 'client'`
  - `full_name` populated
  - `postcode` populated

### Test Trade Registration:
- [ ] Navigate to role selection screen
- [ ] Tap "I'm a Tradesperson" card
- [ ] Fill out registration form
- [ ] Submit with valid data
- [ ] Verify auto-login works
- [ ] Check Supabase dashboard - new profile row created with:
  - `role = 'trades'`
  - `full_name` populated
  - `business_name` populated
  - `phone` populated
  - `trade_type` populated
  - `postcode` populated

### Test Validation:
- [ ] Try submitting empty forms (should show errors)
- [ ] Try invalid email format (should show error)
- [ ] Try password < 6 characters (should show error)
- [ ] Try mismatched passwords (should show error)
- [ ] Verify back button works
- [ ] Verify "Login instead" link works

## Next Steps (After This Works)

### Phase 2: Document Upload & Verification
1. Create document upload UI for trades
2. Build admin verification panel
3. Implement verification badges

### Phase 3: Enhanced Onboarding
1. Add multi-step wizard for trades
2. Add profile photo upload
3. Add service area selection for trades
4. Add email verification

### Phase 4: Login Improvements
1. Add "Forgot Password" flow
2. Better error messaging
3. Remember me functionality

## Design Decisions

### Why Separate Registration Screens?
- **Better UX**: Users only see fields relevant to their role
- **Clearer value proposition**: Each screen can speak directly to that user type
- **Easier validation**: Different validation rules for different roles
- **Professional appearance**: Shows you understand your user types

### Why Not a Toggle or Dropdown in One Form?
- **Too crowded**: One form with all fields would be overwhelming
- **Conditional logic complexity**: Showing/hiding fields is confusing
- **Mobile-first**: Separate screens work better on small screens
- **Conversion rate**: Clear, focused forms convert better

### Why Collect Business Details Now (Not Later)?
- **Better matching**: Trade type helps with search/matching immediately
- **Complete profiles**: Reduces friction of incomplete profiles
- **Trust signals**: Shows trades we take them seriously from day one
- **Data quality**: Higher completion rate during motivated signup moment

## Troubleshooting

### Issue: "Error: raw_user_meta_data is null"
**Solution**: Make sure you're calling `register(email, password, metadata)` with the third parameter

### Issue: "Profiles row not created"
**Solution**: Check that the trigger exists and the function has correct permissions

### Issue: "Role is null in profiles table"
**Solution**: Verify metadata includes `role: 'client'` or `role: 'trades'`

### Issue: "Back button doesn't work"
**Solution**: Make sure you're using `router.back()` from expo-router

## Visual Design Notes

**Color Scheme**:
- Client icon circle: `#EEF2FF` (light blue)
- Client icon: `#6366F1` (indigo - TINT color)
- Trade icon circle: `#FEF3C7` (light amber)
- Trade icon: `#D97706` (amber)

**Typography**:
- Titles: 28-32px, weight 700
- Subtitles: 15-16px, weight 400
- Labels: 14px, weight 600
- Body: 14px, weight 400

**Spacing**:
- Consistent use of `Spacer` component
- 24px horizontal padding
- 16-32px vertical spacing between sections

## Summary

This registration redesign provides:
✅ Professional, role-based registration
✅ Business detail capture for trades
✅ Better data quality from day one
✅ Foundation for verification system
✅ Modern, clean UI
✅ Mobile-optimized layouts
✅ Proper validation and error handling

**Next**: Run the SQL migration and test both registration flows!
