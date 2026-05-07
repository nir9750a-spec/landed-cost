import { createClient } from '@supabase/supabase-js';

// Anon/publishable key — safe to embed in client code.
// These are the same values every user of this shared app needs.
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://eginihtpqahpejnkqznn.supabase.co';
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY || 'sb_publishable_dxvkjrqH1c0SULImna9L2A_qe9AkGTL';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
