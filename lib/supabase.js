// lib/supabase.js
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto'

const supabaseUrl = 'https://ncwbkoriohrkvulvzzuw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jd2Jrb3Jpb2hya3Z1bHZ6enV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzNjkxMDIsImV4cCI6MjA2ODk0NTEwMn0.LgtWyYKBUWEdxDoTCOaZfyFtWc4gpNLU6FSrvn-DMuU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const auth = supabase.auth
export const database = supabase.from
