require("dotenv").config();
const WebSocket = require("ws");
global.WebSocket = WebSocket;
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "⚠️  SUPABASE_URL or SUPABASE_ANON_KEY not set. Database operations will fail."
  );
}

const supabase = createClient(supabaseUrl || "", supabaseKey || "");

module.exports = { supabase };
