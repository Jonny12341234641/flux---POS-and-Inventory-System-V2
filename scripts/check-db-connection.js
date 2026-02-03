const { createClient } = require('@supabase/supabase-js');

// Config from your .env.local
const SUPABASE_URL = "https://jgwmsfsmcjynadmshpau.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impnd21zZnNtY2p5bmFkbXNocGF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5MTc3NTUsImV4cCI6MjA4NTQ5Mzc1NX0.hQSYPJc_aUhtHP3x8jyMNhlQpIU1iBV3tDD8JQHng1o";

// ►► EDIT THESE TWO LINES ◄◄
const EMAIL = "YOUR_EMAIL";
const PASSWORD = "YOUR_PASSWORD";

async function checkDatabase() {
    console.log("1. Initializing Supabase Client...");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    console.log(`2. Attempting login for: ${EMAIL}...`);
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: EMAIL,
        password: PASSWORD,
    });

    if (authError) {
        console.error("❌ Login Failed:", authError.message);
        return;
    }

    console.log("✅ Login Successful!");
    console.log("   User ID:", authData.user.id);
    console.log("   Email:", authData.user.email);

    console.log("\n3. Testing Database Access (Table: user_profiles)...");
    // Try to read user_profiles (common table in Phase 0)
    const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .single();

    if (profileError) {
        console.error("❌ Database Read Failed:", profileError.message);
        console.log("   (This might be due to RLS policies or the table missing)");
    } else {
        console.log("✅ Database Read Successful!");
        console.log("   Profile Data:", profileData);
    }
}

checkDatabase();
