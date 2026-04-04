// ==========================================
// BSITHUB Supabase Connection Test
// ==========================================

async function testSupabaseConnection() {
    console.log('=== Supabase Connection Test ===');
    
    // Check if Supabase library is loaded
    if (typeof window.supabase === 'undefined') {
        console.error('❌ Supabase library NOT loaded');
        return false;
    }
    console.log('✅ Supabase library loaded');
    
    // Check if config is set
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
        console.error('❌ Supabase config NOT set');
        return false;
    }
    console.log('✅ Supabase config set');
    console.log('   URL:', window.SUPABASE_URL);
    
    // Check if client is initialized
    if (!window.sb) {
        console.error('❌ Supabase client NOT initialized');
        return false;
    }
    console.log('✅ Supabase client initialized');
    
    // Test connection with a simple query
    try {
        const { data, error } = await window.sb
            .from('users')
            .select('count')
            .limit(1);
        
        if (error) {
            console.error('❌ Database query failed:', error.message);
            return false;
        }
        console.log('✅ Database connected - query successful');
        console.log('=== Connection Test PASSED ===');
        return true;
    } catch (err) {
        console.error('❌ Connection error:', err.message);
        return false;
    }
}

// Show connection status in console on load
setTimeout(async () => {
    const connected = await testSupabaseConnection();
    if (connected) {
        console.log('%c🟢 BSITHUB connected to Supabase', 'color: green; font-weight: bold; font-size: 14px');
    } else {
        console.log('%c🔴 BSITHUB NOT connected to Supabase - using localStorage', 'color: red; font-weight: bold; font-size: 14px');
    }
}, 2000);

// Make it available globally
window.testSupabase = testSupabaseConnection;
